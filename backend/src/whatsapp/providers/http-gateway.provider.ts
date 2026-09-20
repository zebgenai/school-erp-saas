import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WhatsAppAttendanceAbsentInput,
  WhatsAppProvider,
  WhatsAppSendResult,
  buildAttendanceAbsentMessage,
} from '../whatsapp.types';

@Injectable()
export class HttpGatewayWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'http-gateway';
  private readonly logger = new Logger(HttpGatewayWhatsAppProvider.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const enabled =
      (this.config.get<string>('WHATSAPP_ENABLED') || 'false').toLowerCase() === 'true';
    if (!enabled) return false;
    return !!(
      this.config.get<string>('WHATSAPP_API_URL') && this.config.get<string>('WHATSAPP_API_TOKEN')
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
        errorMessage: 'WhatsApp provider is disabled or not configured',
        retryable: false,
      };
    }

    const apiUrl = this.config.get<string>('WHATSAPP_API_URL')!.replace(/\/$/, '');
    const token = this.config.get<string>('WHATSAPP_API_TOKEN')!;
    const instanceId = this.config.get<string>('WHATSAPP_INSTANCE_ID') || undefined;
    const templateName =
      this.config.get<string>('WHATSAPP_ATTENDANCE_TEMPLATE') || 'attendance_absent';
    const message = buildAttendanceAbsentMessage(input);

    try {
      const res = await fetch(`${apiUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: input.recipient,
          type: 'template',
          template: templateName,
          instanceId,
          text: message,
          variables: {
            parentName: input.parentName,
            studentName: input.studentName,
            className: input.className,
            date: input.date,
            schoolName: input.schoolName,
          },
        }),
        signal: AbortSignal.timeout(20000),
      });

      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        messageId?: string;
        error?: { code?: string; message?: string };
        message?: string;
      };

      if (!res.ok) {
        const code = data.error?.code || `HTTP_${res.status}`;
        const msg =
          data.error?.message || data.message || `WhatsApp provider error ${res.status}`;
        return {
          success: false,
          errorCode: code,
          errorMessage: msg,
          retryable: res.status >= 500 || res.status === 429,
        };
      }

      return {
        success: true,
        providerMessageId: data.id || data.messageId,
      };
    } catch (err: unknown) {
      const messageText = err instanceof Error ? err.message : 'WhatsApp network error';
      this.logger.warn(`WhatsApp network failure: ${messageText}`);
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: messageText,
        retryable: true,
      };
    }
  }
}
