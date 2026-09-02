import { BadRequestException } from '@nestjs/common';
import { MeetingProvider } from '@prisma/client';
import {
  MeetingCredentials,
  MeetingProviderAdapter,
} from './meeting-provider.interface';

function requireLinkOrId(input: Partial<MeetingCredentials>, provider: MeetingProvider) {
  if (!input.meetingLink && !input.meetingId) {
    throw new BadRequestException(`${provider} requires a meeting link or meeting ID`);
  }
}

export class ZoomProvider implements MeetingProviderAdapter {
  readonly provider = MeetingProvider.ZOOM;

  validate(input: Partial<MeetingCredentials>): MeetingCredentials {
    requireLinkOrId(input, this.provider);
    const meetingId = input.meetingId?.replace(/\s/g, '') || extractZoomId(input.meetingLink);
    const meetingLink =
      input.meetingLink ||
      (meetingId ? this.buildJoinUrl(meetingId, input.passcode) : '');
    return {
      provider: this.provider,
      meetingLink,
      meetingId: meetingId ?? null,
      passcode: input.passcode ?? null,
    };
  }

  buildJoinUrl(meetingId: string, passcode?: string | null): string {
    const base = `https://zoom.us/j/${meetingId}`;
    return passcode ? `${base}?pwd=${encodeURIComponent(passcode)}` : base;
  }
}

export class GoogleMeetProvider implements MeetingProviderAdapter {
  readonly provider = MeetingProvider.GOOGLE_MEET;

  validate(input: Partial<MeetingCredentials>): MeetingCredentials {
    requireLinkOrId(input, this.provider);
    const meetingLink =
      input.meetingLink ||
      (input.meetingId ? this.buildJoinUrl(input.meetingId) : '');
    if (meetingLink && !/meet\.google\.com/i.test(meetingLink) && !input.meetingId) {
      throw new BadRequestException('Google Meet link must be a meet.google.com URL');
    }
    return {
      provider: this.provider,
      meetingLink,
      meetingId: input.meetingId ?? extractMeetCode(meetingLink),
      passcode: input.passcode ?? null,
    };
  }

  buildJoinUrl(meetingId: string): string {
    return `https://meet.google.com/${meetingId}`;
  }
}

export class MicrosoftTeamsProvider implements MeetingProviderAdapter {
  readonly provider = MeetingProvider.MICROSOFT_TEAMS;

  validate(input: Partial<MeetingCredentials>): MeetingCredentials {
    requireLinkOrId(input, this.provider);
    const meetingLink =
      input.meetingLink ||
      (input.meetingId ? this.buildJoinUrl(input.meetingId) : '');
    return {
      provider: this.provider,
      meetingLink,
      meetingId: input.meetingId ?? null,
      passcode: input.passcode ?? null,
    };
  }

  buildJoinUrl(meetingId: string): string {
    return `https://teams.microsoft.com/l/meetup-join/${encodeURIComponent(meetingId)}`;
  }
}

export class CustomMeetingProvider implements MeetingProviderAdapter {
  readonly provider = MeetingProvider.CUSTOM;

  validate(input: Partial<MeetingCredentials>): MeetingCredentials {
    if (!input.meetingLink) {
      throw new BadRequestException('Custom provider requires a meeting link');
    }
    return {
      provider: this.provider,
      meetingLink: input.meetingLink,
      meetingId: input.meetingId ?? null,
      passcode: input.passcode ?? null,
    };
  }

  buildJoinUrl(meetingId: string): string {
    return meetingId;
  }
}

function extractZoomId(link?: string | null): string | null {
  if (!link) return null;
  const m = link.match(/\/j\/(\d+)/);
  return m?.[1] ?? null;
}

function extractMeetCode(link?: string | null): string | null {
  if (!link) return null;
  const m = link.match(/meet\.google\.com\/([a-z0-9-]+)/i);
  return m?.[1] ?? null;
}
