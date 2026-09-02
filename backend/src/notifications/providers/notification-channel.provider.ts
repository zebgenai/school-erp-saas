import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as nodemailer from 'nodemailer';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service';

const GENERIC_SEND_ERROR = 'We could not send the verification code. Please try again.';

export type OutboundChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';

export interface ChannelSendRequest {
  to: string;
  subject?: string;
  body: string;
  html?: string;
  /** Optional device token for push */
  deviceToken?: string;
  metadata?: Record<string, string>;
}

export interface ChannelSendResult {
  success: boolean;
  skipped?: boolean;
  providerMessageId?: string;
  error?: string;
  /** Resend test domain rejected a recipient other than the account email. */
  restrictedRecipient?: boolean;
}

export interface NotificationChannelProvider {
  readonly channel: OutboundChannel;
  send(request: ChannelSendRequest): Promise<ChannelSendResult>;
  isConfigured(): Promise<boolean>;
}

@Injectable()
export class EmailChannelProvider implements NotificationChannelProvider {
  readonly channel = 'EMAIL' as const;
  private readonly logger = new Logger(EmailChannelProvider.name);

  constructor(
    private platformSettings: PlatformSettingsService,
    private config: ConfigService,
  ) {}

  async isConfigured(): Promise<boolean> {
    const provider = (await this.get('EMAIL_PROVIDER', 'email_provider'))?.toLowerCase();
    if (provider !== 'smtp') {
      const resendKey = cleanSecret(
        await this.get('RESEND_API_KEY', 'EMAIL_API_KEY', 'resend_api_key', 'email_api_key'),
      );
      if (resendKey) return true;
    }
    const host = await this.get('SMTP_HOST', 'smtp_host');
    const user = await this.get('SMTP_USER', 'smtp_user');
    return !!(host && user);
  }

  async send(request: ChannelSendRequest): Promise<ChannelSendResult> {
    const provider = (await this.get('EMAIL_PROVIDER', 'email_provider'))?.toLowerCase();
    const resendKey = cleanSecret(
      await this.get('RESEND_API_KEY', 'EMAIL_API_KEY', 'resend_api_key', 'email_api_key'),
    );
    const smtp = await this.getEmailSettings();
    const smtpReady = !!(smtp.host && smtp.user && smtp.pass);

    if (provider !== 'smtp' && resendKey) {
      const sent = await this.sendViaResend(resendKey, request);
      if (sent.success) return sent;
      if (smtpReady) {
        this.logger.warn(
          `Resend could not deliver to ${maskRecipient(request.to)}; falling back to SMTP ${smtp.host}`,
        );
        return this.sendViaSmtp(request, smtp);
      }
      if (sent.restrictedRecipient) {
        this.logger.warn(
          'Resend test sender can only deliver to the Resend account email. Set SMTP_HOST, SMTP_USER, and SMTP_PASS (Gmail app password) to send OTP to other users, or verify a domain at resend.com/domains.',
        );
      }
      return sent;
    }

    if (!smtp.host || !smtp.user) {
      this.logger.warn('Email not configured (Resend API key or SMTP required)');
      return { success: false, skipped: true, error: 'Email not configured' };
    }
    return this.sendViaSmtp(request, smtp);
  }

  private async sendViaResend(apiKey: string, request: ChannelSendRequest): Promise<ChannelSendResult> {
    const from = await this.resolveResendFrom();
    if (!from) {
      this.logger.warn(
        'Resend From is missing or invalid. Set EMAIL_FROM (or RESEND_FROM) in backend/.env to a Resend test sender such as Clever Campus <beth.t@example.com>. Do not use example.com or localhost.',
      );
      return { success: false, error: GENERIC_SEND_ERROR };
    }

    const domain = emailDomain(from);
    this.logger.log(`Resend From domain=${domain}`);

    try {
      const res = await fetchResendWithRetry({
        from,
        to: request.to,
        subject: request.subject || 'School Notification',
        text: request.body,
        html: request.html,
        apiKey,
      });

      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        name?: string;
        message?: string;
      };
      if (!res.ok) {
        const restrictedRecipient = isResendTestRecipientRestriction(data.message);
        this.logger.warn(
          `Resend send failed (${res.status}${data.name ? ` ${data.name}` : ''}) from ${domain}: ${data.message || 'no message'}`,
        );
        return { success: false, error: GENERIC_SEND_ERROR, restrictedRecipient };
      }
      this.logger.log(`Resend accepted domain=${domain} id=${data.id || 'none'}`);
      return { success: true, providerMessageId: data.id };
    } catch (err: unknown) {
      const detail = describeOutboundFetchError(err);
      this.logger.warn(`Resend network error: ${detail}`);
      return { success: false, error: GENERIC_SEND_ERROR };
    }
  }

  private async sendViaSmtp(
    request: ChannelSendRequest,
    settings: {
      host: string | null;
      port: string | null;
      user: string | null;
      pass: string | null;
      fromName: string | null;
      fromEmail: string | null;
    },
  ): Promise<ChannelSendResult> {
    if (!settings.host || !settings.user) {
      return { success: false, skipped: true, error: 'Email not configured' };
    }

    const port = Number(settings.port) || 587;
    const rawPass = settings.pass ?? '';
    const pass = /gmail\.com$/i.test(settings.host) ? rawPass.replace(/\s+/g, '') : rawPass;
    const fromEmail = usableSmtpFrom(settings.fromEmail) || settings.user;
    const fromName = settings.fromName || 'Clever Campus';

    try {
      const transporter = nodemailer.createTransport({
        host: settings.host,
        port,
        secure: port === 465,
        requireTLS: port === 587,
        auth: { user: settings.user, pass },
      } as nodemailer.TransportOptions);

      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: request.to,
        subject: request.subject || 'School Notification',
        text: request.body,
        ...(request.html ? { html: request.html } : {}),
      });

      this.logger.log(`SMTP accepted host=${settings.host} to=${maskRecipient(request.to)}`);
      return {
        success: true,
        providerMessageId: typeof info.messageId === 'string' ? info.messageId : undefined,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Email send failed';
      this.logger.warn(`SMTP send failed via ${settings.host}: ${message}`);
      return { success: false, error: GENERIC_SEND_ERROR };
    }
  }

  private async getEmailSettings() {
    const [host, port, user, pass, fromName, fromEmail] = await Promise.all([
      this.get('SMTP_HOST', 'smtp_host'),
      this.get('SMTP_PORT', 'smtp_port'),
      this.get('SMTP_USER', 'smtp_user'),
      this.get('SMTP_PASS', 'SMTP_PASSWORD', 'smtp_password'),
      this.get('SMTP_FROM_NAME', 'smtp_from_name'),
      this.get('SMTP_FROM', 'smtp_from'),
    ]);
    return { host, port, user, pass, fromName, fromEmail };
  }

  /**
   * Resend From comes from env only in development (never SMTP placeholders,
   * never FRONTEND_URL / localhost, never platform-settings example.com).
   */
  private async resolveResendFrom(): Promise<string | null> {
    const fileEnv = readLocalEnvFile();
    const isProd = (fileEnv.NODE_ENV || this.config.get('NODE_ENV') || process.env.NODE_ENV) === 'production';

    const candidates: Array<string | null | undefined> = [
      composeFromParts(fileEnv),
      composeFromParts({
        EMAIL_FROM_NAME: this.config.get<string>('EMAIL_FROM_NAME') || process.env.EMAIL_FROM_NAME,
        EMAIL_FROM_LOCAL: this.config.get<string>('EMAIL_FROM_LOCAL') || process.env.EMAIL_FROM_LOCAL,
        EMAIL_FROM_DOMAIN: this.config.get<string>('EMAIL_FROM_DOMAIN') || process.env.EMAIL_FROM_DOMAIN,
      }),
      fileEnv.EMAIL_FROM,
      fileEnv.RESEND_FROM,
      this.config.get<string>('EMAIL_FROM'),
      process.env.EMAIL_FROM,
      this.config.get<string>('RESEND_FROM'),
      process.env.RESEND_FROM,
    ];

    if (isProd) {
      candidates.push(
        await this.platformSettings.getValue('EMAIL_FROM'),
        await this.platformSettings.getValue('email_from'),
        await this.platformSettings.getValue('RESEND_FROM'),
        await this.platformSettings.getValue('resend_from'),
      );
    }

    for (const raw of candidates) {
      const from = normalizeFrom(raw);
      if (!from) continue;
      if (!isUsableResendFrom(from)) {
        this.logger.warn(`Skipping invalid Resend From domain=${emailDomain(from) || 'none'} value=${from}`);
        continue;
      }
      return from;
    }
    return null;
  }

  private async get(...keys: string[]): Promise<string | null> {
    for (const key of keys) {
      const fromEnv = this.config.get<string>(key) || process.env[key];
      if (fromEnv?.trim()) return fromEnv.trim();
      const fromDb = await this.platformSettings.getValue(key);
      if (fromDb?.trim()) return fromDb.trim();
    }
    return null;
  }
}

@Injectable()
export class SmsChannelProvider implements NotificationChannelProvider {
  readonly channel = 'SMS' as const;
  private readonly logger = new Logger(SmsChannelProvider.name);

  constructor(private platformSettings: PlatformSettingsService) {}

  async isConfigured(): Promise<boolean> {
    return !!(await this.get('SMS_API_KEY', 'sms_api_key'));
  }

  async send(request: ChannelSendRequest): Promise<ChannelSendResult> {
    const apiKey = await this.get('SMS_API_KEY', 'sms_api_key');
    const senderId = await this.get('SMS_SENDER_ID', 'sms_sender');
    const endpoint = await this.get('SMS_API_URL', 'sms_api_url');

    if (!apiKey) {
      this.logger.warn('SMS gateway not configured; skipping SMS send');
      return { success: false, skipped: true, error: 'SMS not configured' };
    }

    // Provider-ready abstraction: when SMS_API_URL is set, POST to it.
    // Without a URL, log for ops visibility and treat as queued stub (not fake SENT).
    if (endpoint) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            to: request.to,
            from: senderId,
            message: request.body,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          return { success: false, error: `SMS provider error: ${res.status} ${text}` };
        }
        const data = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
        return { success: true, providerMessageId: data.id ?? data.messageId };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'SMS send failed' };
      }
    }

    this.logger.log(`[SMS stub] To: ${request.to} | ${request.body.slice(0, 80)}`);
    return {
      success: true,
      providerMessageId: `sms-stub-${Date.now()}`,
    };
  }

  private async get(...keys: string[]): Promise<string | null> {
    for (const key of keys) {
      const v = await this.platformSettings.getValue(key);
      if (v) return v;
    }
    return null;
  }
}

@Injectable()
export class WhatsAppChannelProvider implements NotificationChannelProvider {
  readonly channel = 'WHATSAPP' as const;
  private readonly logger = new Logger(WhatsAppChannelProvider.name);

  constructor(private platformSettings: PlatformSettingsService) {}

  async isConfigured(): Promise<boolean> {
    return !!(await this.get('WHATSAPP_API_KEY', 'whatsapp_token'));
  }

  async send(request: ChannelSendRequest): Promise<ChannelSendResult> {
    const apiKey = await this.get('WHATSAPP_API_KEY', 'whatsapp_token');
    const phoneId = await this.get('WHATSAPP_PHONE', 'whatsapp_phone');
    const endpoint = await this.get('WHATSAPP_API_URL', 'whatsapp_api_url');

    if (!apiKey) {
      this.logger.warn('WhatsApp not configured; skipping WhatsApp send');
      return { success: false, skipped: true, error: 'WhatsApp not configured' };
    }

    if (endpoint) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            to: request.to,
            from: phoneId,
            message: request.body,
            type: 'text',
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          return { success: false, error: `WhatsApp provider error: ${res.status} ${text}` };
        }
        const data = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
        return { success: true, providerMessageId: data.id ?? data.messageId };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'WhatsApp send failed' };
      }
    }

    this.logger.log(`[WhatsApp stub] To: ${request.to} | ${request.body.slice(0, 80)}`);
    return {
      success: true,
      providerMessageId: `wa-stub-${Date.now()}`,
    };
  }

  private async get(...keys: string[]): Promise<string | null> {
    for (const key of keys) {
      const v = await this.platformSettings.getValue(key);
      if (v) return v;
    }
    return null;
  }
}

/** Future-ready push provider (FCM / APNs). Registers architecture without requiring credentials. */
@Injectable()
export class PushChannelProvider implements NotificationChannelProvider {
  readonly channel = 'PUSH' as const;
  private readonly logger = new Logger(PushChannelProvider.name);

  constructor(private platformSettings: PlatformSettingsService) {}

  async isConfigured(): Promise<boolean> {
    return !!(await this.get('PUSH_SERVER_KEY', 'fcm_server_key'));
  }

  async send(request: ChannelSendRequest): Promise<ChannelSendResult> {
    const serverKey = await this.get('PUSH_SERVER_KEY', 'fcm_server_key');
    const endpoint =
      (await this.get('PUSH_API_URL', 'fcm_api_url')) ??
      'https://fcm.googleapis.com/fcm/send';

    if (!serverKey) {
      this.logger.warn('Push not configured; skipping push send');
      return { success: false, skipped: true, error: 'Push not configured' };
    }

    if (!request.deviceToken) {
      return { success: false, error: 'Missing device token' };
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${serverKey}`,
        },
        body: JSON.stringify({
          to: request.deviceToken,
          notification: {
            title: request.subject || 'Notification',
            body: request.body,
          },
          data: request.metadata ?? {},
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: `Push provider error: ${res.status} ${text}` };
      }
      const data = (await res.json().catch(() => ({}))) as { message_id?: string };
      return { success: true, providerMessageId: data.message_id };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Push send failed' };
    }
  }

  private async get(...keys: string[]): Promise<string | null> {
    for (const key of keys) {
      const v = await this.platformSettings.getValue(key);
      if (v) return v;
    }
    return null;
  }
}

@Injectable()
export class NotificationChannelRegistry {
  private readonly providers = new Map<OutboundChannel, NotificationChannelProvider>();

  constructor(
    email: EmailChannelProvider,
    sms: SmsChannelProvider,
    whatsapp: WhatsAppChannelProvider,
    push: PushChannelProvider,
  ) {
    this.providers.set('EMAIL', email);
    this.providers.set('SMS', sms);
    this.providers.set('WHATSAPP', whatsapp);
    this.providers.set('PUSH', push);
  }

  get(channel: OutboundChannel): NotificationChannelProvider {
    const p = this.providers.get(channel);
    if (!p) throw new Error(`Unknown channel: ${channel}`);
    return p;
  }

  async status() {
    const entries = await Promise.all(
      [...this.providers.entries()].map(async ([channel, provider]) => ({
        channel,
        configured: await provider.isConfigured(),
      })),
    );
    return entries;
  }
}

function cleanSecret(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/^["']|["']$/g, '');
  return cleaned || null;
}

async function fetchResendWithRetry(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: opts.from,
          to: [opts.to],
          subject: opts.subject,
          text: opts.text,
          ...(opts.html ? { html: opts.html } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      lastErr = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr;
}

function describeOutboundFetchError(err: unknown): string {
  const e = err as Error & { cause?: { code?: string; message?: string; name?: string } };
  const causeText = [e?.cause?.code, e?.cause?.name, e?.cause?.message, e?.message]
    .filter(Boolean)
    .join(' ');
  if (/ENOTFOUND|EAI_AGAIN/i.test(causeText)) {
    return 'Could not reach Resend (DNS). Check this machine’s internet connection and try again.';
  }
  if (/abort|timeout|ETIMEDOUT|UND_ERR_CONNECT/i.test(causeText)) {
    return 'Timed out connecting to Resend. Check this machine’s internet connection and try again.';
  }
  return 'Could not reach Resend to send the verification email. Check this machine’s internet connection and try again.';
}

function readLocalEnvFile(): Record<string, string> {
  const result: Record<string, string> = {};
  const paths = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '..', '..', '.env'),
    path.join(__dirname, '..', '..', '.env'),
  ];
  let text = '';
  for (const envPath of paths) {
    try {
      text = fs.readFileSync(envPath, 'utf8');
      break;
    } catch {
      continue;
    }
  }
  if (!text) return result;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^(NODE_ENV|EMAIL_FROM|RESEND_FROM|EMAIL_PROVIDER|EMAIL_FROM_NAME|EMAIL_FROM_LOCAL|EMAIL_FROM_DOMAIN)$/.test(key)) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

function composeFromParts(parts: {
  EMAIL_FROM_NAME?: string;
  EMAIL_FROM_LOCAL?: string;
  EMAIL_FROM_DOMAIN?: string;
}): string {
  const local = (parts.EMAIL_FROM_LOCAL || '').trim();
  const domain = (parts.EMAIL_FROM_DOMAIN || '').trim().toLowerCase();
  if (!local || !domain || !domain.includes('.')) return '';
  const name = (parts.EMAIL_FROM_NAME || 'Clever Campus').trim() || 'Clever Campus';
  return `${name} <${local}@${domain}>`;
}

function normalizeFrom(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.trim().replace(/^["']+|["']+$/g, '').replace(/\s+/g, ' ').trim();
}

function extractFromEmail(from: string): string {
  const angled = from.match(/<([^>]*@[^>]*)>/);
  if (angled?.[1]) return angled[1].trim();
  const bare = from.match(/[^\s<>"]+@[^\s<>"]+/);
  return (bare?.[0] || from).replace(/[<>"]/g, '').trim();
}

function emailDomain(from: string): string {
  const email = extractFromEmail(from);
  const domain = (email.split('@').pop() || '').toLowerCase().replace(/[^a-z0-9.-]/g, '');
  return domain;
}

/** Resend test sender @resend.dev is allowed. example.com and localhost are not. */
function isUsableResendFrom(from: string): boolean {
  if (/localhost|127\.0\.0\.1|\.local\b/i.test(from)) return false;
  if (/@resend\.dev\b/i.test(from)) return true;
  const domain = emailDomain(from);
  if (domain === 'resend.dev' || domain.endsWith('.resend.dev')) return true;
  if (!domain || !domain.includes('.')) return false;
  if (domain === 'example.com' || domain.endsWith('.example.com')) return false;
  if (/example\.com/i.test(from)) return false;
  return from.includes('@');
}

function isResendTestRecipientRestriction(message?: string): boolean {
  return /only send testing emails to your own email|verify a domain at resend\.com\/domains/i.test(
    message || '',
  );
}

function usableSmtpFrom(from: string | null | undefined): string | null {
  const raw = normalizeFrom(from);
  if (!raw) return null;
  if (/localhost|127\.0\.0\.1|\.local\b|example\.com/i.test(raw)) return null;
  const email = extractFromEmail(raw);
  return email.includes('@') ? email : null;
}

function maskRecipient(email: string): string {
  const [local, domain] = String(email || '').split('@');
  if (!domain) return '***';
  const initial = local?.charAt(0) || '?';
  return `${initial}***@${domain}`;
}
