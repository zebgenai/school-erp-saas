import { MeetingProvider } from '@prisma/client';

export interface MeetingCredentials {
  provider: MeetingProvider;
  meetingLink: string;
  meetingId?: string | null;
  passcode?: string | null;
}

export interface MeetingProviderAdapter {
  readonly provider: MeetingProvider;
  /** Normalize / validate meeting credentials without calling external APIs. */
  validate(input: Partial<MeetingCredentials>): MeetingCredentials;
  /** Build a canonical join URL when only an ID is provided. */
  buildJoinUrl(meetingId: string, passcode?: string | null): string;
}
