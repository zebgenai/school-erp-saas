import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WHATSAPP_PROVIDER,
  WhatsAppAttendanceAbsentInput,
  WhatsAppProvider,
  WhatsAppSendResult,
} from './whatsapp.types';

@Injectable()
export class WhatsAppService {
  constructor(
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
    private readonly config: ConfigService,
  ) {}

  isGloballyEnabled(): boolean {
    return (this.config.get<string>('WHATSAPP_ENABLED') || 'false').toLowerCase() === 'true';
  }

  getProviderName(): string {
    return this.provider.name;
  }

  async sendAttendanceAbsent(
    input: WhatsAppAttendanceAbsentInput,
  ): Promise<WhatsAppSendResult> {
    if (!this.isGloballyEnabled() || !this.provider.isEnabled()) {
      return {
        success: false,
        skipped: true,
        errorCode: 'WHATSAPP_DISABLED',
        errorMessage: 'WhatsApp is disabled',
        retryable: false,
      };
    }
    return this.provider.sendAttendanceAbsentMessage(input);
  }
}
