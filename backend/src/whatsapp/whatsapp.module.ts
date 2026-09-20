import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DisabledWhatsAppProvider } from './providers/disabled.provider';
import { EvolutionWhatsAppProvider } from './providers/evolution.provider';
import { HttpGatewayWhatsAppProvider } from './providers/http-gateway.provider';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from './whatsapp.types';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [ConfigModule],
  providers: [
    EvolutionWhatsAppProvider,
    HttpGatewayWhatsAppProvider,
    DisabledWhatsAppProvider,
    {
      provide: WHATSAPP_PROVIDER,
      inject: [
        ConfigService,
        EvolutionWhatsAppProvider,
        HttpGatewayWhatsAppProvider,
        DisabledWhatsAppProvider,
      ],
      useFactory: (
        config: ConfigService,
        evolution: EvolutionWhatsAppProvider,
        http: HttpGatewayWhatsAppProvider,
        disabled: DisabledWhatsAppProvider,
      ): WhatsAppProvider => {
        const enabled =
          (config.get<string>('WHATSAPP_ENABLED') || 'false').toLowerCase() === 'true';
        if (!enabled) return disabled;

        const provider = (config.get<string>('WHATSAPP_PROVIDER') || 'evolution')
          .trim()
          .toLowerCase();

        if (provider === 'evolution') {
          return evolution.isConfigured() ? evolution : disabled;
        }
        if (provider === 'http-gateway') {
          return http.isEnabled() ? http : disabled;
        }
        return disabled;
      },
    },
    WhatsAppService,
  ],
  exports: [WhatsAppService, WHATSAPP_PROVIDER],
})
export class WhatsAppModule {}
