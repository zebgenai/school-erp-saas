/**
 * Translates Evolution API v2.3.7 webhook payloads into Clever Campus internal
 * WhatsApp delivery status updates. Evolution types must not leak past this adapter.
 *
 * Verified (EvolutionAPI/evolution-api @ 2.3.7):
 * - Event name: messages.update (Events.MESSAGES_UPDATE)
 * - Envelope fields from WebhookController.emit: { event, instance, data, ... }
 * - Message update payload from Baileys channel:
 *     { keyId, remoteJid, fromMe, participant?, status, ... }
 * - StatusMessage union:
 *     'ERROR' | 'PENDING' | 'SERVER_ACK' | 'DELIVERY_ACK' | 'READ' | 'DELETED' | 'PLAYED'
 *
 * Maintainer confirmation (issue #1440): SERVER_ACK ≈ single-tick / sent to WA servers.
 */

export type InternalWhatsAppDeliveryStatus = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export type EvolutionStatusTranslation = {
  providerMessageId: string;
  status: InternalWhatsAppDeliveryStatus;
  errorCode?: string;
  errorMessage?: string;
};

/** Evolution StatusMessage values we understand (from wa.types.ts). */
export type EvolutionStatusMessage =
  | 'ERROR'
  | 'PENDING'
  | 'SERVER_ACK'
  | 'DELIVERY_ACK'
  | 'READ'
  | 'DELETED'
  | 'PLAYED';

const STATUS_MAP: Record<
  EvolutionStatusMessage,
  InternalWhatsAppDeliveryStatus | null
> = {
  // PENDING is pre-ack; our send path already marks SENT on successful API response.
  PENDING: null,
  SERVER_ACK: 'SENT',
  DELIVERY_ACK: 'DELIVERED',
  READ: 'READ',
  PLAYED: 'READ',
  ERROR: 'FAILED',
  // DELETED is not a delivery failure of our outbound absence notice in all cases;
  // ignore rather than invent a FAILED transition.
  DELETED: null,
};

export function mapEvolutionStatus(
  raw: string | undefined | null,
): InternalWhatsAppDeliveryStatus | null {
  if (!raw) return null;
  const key = String(raw).toUpperCase() as EvolutionStatusMessage;
  if (!(key in STATUS_MAP)) return null;
  return STATUS_MAP[key];
}

type EvolutionUpdateData = {
  keyId?: string;
  status?: string;
  key?: { id?: string };
  error?: string;
  errorMessage?: string;
};

function extractUpdateItems(data: unknown): EvolutionUpdateData[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data.filter((item): item is EvolutionUpdateData => !!item && typeof item === 'object');
  }
  if (typeof data === 'object') {
    return [data as EvolutionUpdateData];
  }
  return [];
}

function messageIdFromUpdate(item: EvolutionUpdateData): string | undefined {
  if (typeof item.keyId === 'string' && item.keyId.trim()) return item.keyId.trim();
  if (typeof item.key?.id === 'string' && item.key.id.trim()) return item.key.id.trim();
  return undefined;
}

/**
 * Parse an Evolution webhook body and return zero or more internal status updates.
 * Ignores non-MESSAGES_UPDATE events and unknown / non-actionable statuses.
 */
export function translateEvolutionWebhook(
  body: unknown,
): EvolutionStatusTranslation[] {
  if (!body || typeof body !== 'object') return [];

  const envelope = body as {
    event?: string;
    data?: unknown;
  };

  const event = String(envelope.event || '')
    .replace(/[.-]/g, '_')
    .toUpperCase();

  // Accept messages.update / MESSAGES_UPDATE / messages-update style names.
  const isMessagesUpdate =
    event === 'MESSAGES_UPDATE' ||
    event === 'MESSAGESUPDATE' ||
    String(envelope.event || '').toLowerCase() === 'messages.update';

  if (!isMessagesUpdate) return [];

  const results: EvolutionStatusTranslation[] = [];
  for (const item of extractUpdateItems(envelope.data)) {
    const providerMessageId = messageIdFromUpdate(item);
    const status = mapEvolutionStatus(item.status);
    if (!providerMessageId || !status) continue;

    const translation: EvolutionStatusTranslation = {
      providerMessageId,
      status,
    };
    if (status === 'FAILED') {
      translation.errorCode = 'EVOLUTION_ERROR';
      translation.errorMessage =
        (typeof item.errorMessage === 'string' && item.errorMessage) ||
        (typeof item.error === 'string' && item.error) ||
        'Evolution reported ERROR status';
    }
    results.push(translation);
  }
  return results;
}
