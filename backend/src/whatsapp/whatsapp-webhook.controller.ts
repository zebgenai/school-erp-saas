import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { SkipForcePassword } from '../common/decorators/skip-force-password.decorator';
import { AttendanceWhatsAppService } from '../notifications/attendance-whatsapp.service';
import { translateEvolutionWebhook } from './evolution-webhook.adapter';

class WhatsAppStatusWebhookDto {
  @IsString()
  messageId!: string;

  @IsIn(['SENT', 'DELIVERED', 'READ', 'FAILED'])
  status!: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

  @IsOptional()
  @IsString()
  errorCode?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}

/**
 * Provider delivery webhooks. Authenticated via shared secret header — no JWT.
 * Status is applied by providerMessageId only (never trusts client schoolId).
 */
@ApiTags('whatsapp')
@SkipForcePassword()
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly attendanceWhatsApp: AttendanceWhatsAppService,
  ) {}

  @ApiOperation({ summary: 'Internal WhatsApp delivery status webhook' })
  @Post('status')
  @HttpCode(200)
  async status(
    @Headers('x-whatsapp-webhook-secret') secret: string | undefined,
    @Body() body: WhatsAppStatusWebhookDto,
  ) {
    const expected =
      this.config.get<string>('WHATSAPP_WEBHOOK_SECRET') ||
      this.config.get<string>('EVOLUTION_WEBHOOK_SECRET') ||
      '';
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    const updated = await this.attendanceWhatsApp.applyProviderStatusUpdate({
      providerMessageId: body.messageId,
      status: body.status,
      errorCode: body.errorCode,
      errorMessage: body.errorMessage,
    });

    return { ok: true, updated: Boolean(updated) };
  }

  /**
   * Evolution API → Clever Campus adapter.
   * Configure Evolution instance webhook URL to this path and set custom header
   * `x-evolution-webhook-secret` (or `x-whatsapp-webhook-secret`) to EVOLUTION_WEBHOOK_SECRET.
   * Listen for event: MESSAGES_UPDATE / messages.update.
   */
  @ApiOperation({ summary: 'Evolution API messages.update webhook adapter' })
  @Post('evolution')
  @HttpCode(200)
  async evolution(
    @Headers('x-evolution-webhook-secret') evolutionSecret: string | undefined,
    @Headers('x-whatsapp-webhook-secret') whatsappSecret: string | undefined,
    @Body() body: unknown,
  ) {
    const expected =
      this.config.get<string>('EVOLUTION_WEBHOOK_SECRET') ||
      this.config.get<string>('WHATSAPP_WEBHOOK_SECRET') ||
      '';
    const provided = evolutionSecret || whatsappSecret;
    if (!expected || provided !== expected) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    const translations = translateEvolutionWebhook(body);
    let applied = 0;
    for (const item of translations) {
      const updated = await this.attendanceWhatsApp.applyProviderStatusUpdate({
        providerMessageId: item.providerMessageId,
        status: item.status,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage,
      });
      if (updated) applied += 1;
    }

    return { ok: true, received: translations.length, updated: applied };
  }
}
