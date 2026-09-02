import { BadRequestException, Injectable } from '@nestjs/common';
import { MeetingProvider } from '@prisma/client';
import { MeetingCredentials, MeetingProviderAdapter } from './meeting-provider.interface';
import {
  CustomMeetingProvider,
  GoogleMeetProvider,
  MicrosoftTeamsProvider,
  ZoomProvider,
} from './providers';

@Injectable()
export class MeetingProviderRegistry {
  private readonly adapters = new Map<MeetingProvider, MeetingProviderAdapter>();

  constructor() {
    this.register(new ZoomProvider());
    this.register(new GoogleMeetProvider());
    this.register(new MicrosoftTeamsProvider());
    this.register(new CustomMeetingProvider());
  }

  register(adapter: MeetingProviderAdapter) {
    this.adapters.set(adapter.provider, adapter);
  }

  get(provider: MeetingProvider): MeetingProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new BadRequestException(`Unsupported meeting provider: ${provider}`);
    }
    return adapter;
  }

  normalize(provider: MeetingProvider, input: Partial<MeetingCredentials>): MeetingCredentials {
    return this.get(provider).validate({ ...input, provider });
  }

  list(): MeetingProvider[] {
    return [...this.adapters.keys()];
  }
}
