import { Injectable, Logger } from '@nestjs/common';
import {
  WhatsAppAttendanceAbsentInput,
  WhatsAppProvider,
  WhatsAppSendResult,
  buildAttendanceAbsentMessage,
} from '../whatsapp.types';

@Injectable()
export class DisabledWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'disabled';
  private readonly logger = new Logger(DisabledWhatsAppProvider.name);

  isEnabled(): boolean {
    return false;
  }

  async sendAttendanceAbsentMessage(
    input: WhatsAppAttendanceAbsentInput,
  ): Promise<WhatsAppSendResult> {
    this.logger.debug(
      `WhatsApp disabled — skip absence message for ${input.studentName} → ${input.recipient}`,
    );
    void buildAttendanceAbsentMessage(input);
    return {
      success: false,
      skipped: true,
      errorCode: 'WHATSAPP_DISABLED',
      errorMessage: 'WhatsApp is disabled',
      retryable: false,
    };
  }
}
