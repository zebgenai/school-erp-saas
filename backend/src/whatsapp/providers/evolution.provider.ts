import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WhatsAppAttendanceAbsentInput,
  WhatsAppProvider,
  WhatsAppSendResult,
  buildAttendanceAbsentMessage,
} from '../whatsapp.types';

/**
 * Evolution API v2.3.7 (Baileys channel) WhatsApp provider.
 *
 * Verified contract (EvolutionAPI/evolution-api @ 2.3.7):
 * - POST /message/sendText/{instanceName}
 * - Header: apikey
 * - Body: { number: string, text: string }  (SendTextDto / textMessageSchema)
 * - Success: HTTP 201 with message object containing key.id
 *
 * Foundation OpenAPI examples that nest `textMessage.text` do NOT match the
 * runtime DTO/schema in this tag — we follow the source DTO.
 */
@Injectable()
export class EvolutionWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'evolution';
  private readonly logger = new Logger(EvolutionWhatsAppProvider.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const enabled =
      (this.config.get<string>('WHATSAPP_ENABLED') || 'false').toLowerCase() === 'true';
    if (!enabled) return false;
    return this.isConfigured();
  }

  isConfigured(): boolean {
    return !!(
      this.config.get<string>('EVOLUTION_API_URL')?.trim() &&
      this.config.get<string>('EVOLUTION_API_KEY')?.trim() &&
      this.config.get<string>('EVOLUTION_INSTANCE_ID')?.trim()
    );
  }

  async sendAttendanceAbsentMessage(
    input: WhatsAppAttendanceAbsentInput,
  ): Promise<WhatsAppSendResult> {
    if (!this.isEnabled()) {
      return {
        success: false,
        skipped: true,
        errorCode: 'WHATSAPP_DISABLED',
        errorMessage: 'WhatsApp Evolution provider is disabled or not configured',
        retryable: false,
      };
    }

    const apiUrl = this.config.get<string>('EVOLUTION_API_URL')!.replace(/\/$/, '');
    const apiKey = this.config.get<string>('EVOLUTION_API_KEY')!;
    const instance = encodeURIComponent(
      this.config.get<string>('EVOLUTION_INSTANCE_ID')!.trim(),
    );
    const number = toEvolutionNumber(input.recipient);
    if (!number) {
      return {
        success: false,
        errorCode: 'INVALID_RECIPIENT',
        errorMessage: 'Recipient is not a valid E.164 number for Evolution sendText',
        retryable: false,
      };
    }

    const text = buildAttendanceAbsentMessage(input);
    const url = `${apiUrl}/message/sendText/${instance}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({ number, text }),
        signal: AbortSignal.timeout(20_000),
      });

      const data = (await res.json().catch(() => null)) as EvolutionSendTextResponse | null;

      if (!res.ok) {
        const code =
          (data && typeof data === 'object' && 'error' in data && (data as any).error?.code) ||
          `HTTP_${res.status}`;
        const msg =
          (data && typeof data === 'object' && 'error' in data && (data as any).error?.message) ||
          (data && typeof data === 'object' && 'message' in data && String((data as any).message)) ||
          `Evolution API error ${res.status}`;
        return {
          success: false,
          errorCode: String(code),
          errorMessage: String(msg),
          retryable: isRetryableStatus(res.status),
        };
      }

      const providerMessageId = extractMessageId(data);
      if (!providerMessageId) {
        this.logger.warn('Evolution sendText succeeded but message id (key.id) was missing');
        return {
          success: false,
          errorCode: 'MISSING_MESSAGE_ID',
          errorMessage: 'Evolution response missing key.id',
          retryable: true,
        };
      }

      return { success: true, providerMessageId };
    } catch (err: unknown) {
      const messageText = err instanceof Error ? err.message : 'Evolution network error';
      this.logger.warn(`Evolution network failure: ${messageText}`);
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: messageText,
        retryable: true,
      };
    }
  }
}

type EvolutionSendTextResponse = {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
  message?: unknown;
  status?: string;
  messageTimestamp?: number;
  error?: { code?: string; message?: string };
};

/** Evolution expects digits (country code + national), not E.164 with '+'. */
export function toEvolutionNumber(e164: string): string | null {
  const digits = String(e164 || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function extractMessageId(data: EvolutionSendTextResponse | null): string | undefined {
  const id = data?.key?.id;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}
