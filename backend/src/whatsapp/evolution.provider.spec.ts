import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { ConfigService } from '@nestjs/config';
import {
  mapEvolutionStatus,
  translateEvolutionWebhook,
} from './evolution-webhook.adapter';
import {
  EvolutionWhatsAppProvider,
  extractMessageId,
  isRetryableStatus,
  toEvolutionNumber,
} from './providers/evolution.provider';
import type { WhatsAppAttendanceAbsentInput } from './whatsapp.types';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

const sampleInput: WhatsAppAttendanceAbsentInput = {
  recipient: '+923001234567',
  parentName: 'Ali Parent',
  studentName: 'Sara Student',
  className: 'Class 5 A',
  date: '2026-09-20',
  schoolName: 'Demo School',
};

const enabledConfig = {
  WHATSAPP_ENABLED: 'true',
  EVOLUTION_API_URL: 'http://evolution.test',
  EVOLUTION_API_KEY: 'secret-key',
  EVOLUTION_INSTANCE_ID: 'school-main',
};

describe('toEvolutionNumber', () => {
  it('strips + from E.164', () => {
    assert.equal(toEvolutionNumber('+923001234567'), '923001234567');
  });

  it('rejects invalid lengths', () => {
    assert.equal(toEvolutionNumber('+123'), null);
    assert.equal(toEvolutionNumber(''), null);
  });
});

describe('extractMessageId / isRetryableStatus', () => {
  it('reads key.id from Evolution sendText response', () => {
    assert.equal(extractMessageId({ key: { id: 'ABCD123' } }), 'ABCD123');
    assert.equal(extractMessageId({ key: {} }), undefined);
    assert.equal(extractMessageId(null), undefined);
  });

  it('classifies HTTP statuses', () => {
    assert.equal(isRetryableStatus(429), true);
    assert.equal(isRetryableStatus(500), true);
    assert.equal(isRetryableStatus(400), false);
    assert.equal(isRetryableStatus(401), false);
    assert.equal(isRetryableStatus(403), false);
  });
});

describe('mapEvolutionStatus', () => {
  it('maps verified Evolution StatusMessage values only', () => {
    assert.equal(mapEvolutionStatus('SERVER_ACK'), 'SENT');
    assert.equal(mapEvolutionStatus('DELIVERY_ACK'), 'DELIVERED');
    assert.equal(mapEvolutionStatus('READ'), 'READ');
    assert.equal(mapEvolutionStatus('PLAYED'), 'READ');
    assert.equal(mapEvolutionStatus('ERROR'), 'FAILED');
    assert.equal(mapEvolutionStatus('PENDING'), null);
    assert.equal(mapEvolutionStatus('DELETED'), null);
    assert.equal(mapEvolutionStatus('UNKNOWN'), null);
  });
});

describe('translateEvolutionWebhook', () => {
  it('translates messages.update SERVER_ACK via keyId', () => {
    const out = translateEvolutionWebhook({
      event: 'messages.update',
      instance: 'school-main',
      data: { keyId: 'MSG1', status: 'SERVER_ACK' },
    });
    assert.deepEqual(out, [{ providerMessageId: 'MSG1', status: 'SENT' }]);
  });

  it('translates DELIVERY_ACK, READ, ERROR', () => {
    assert.equal(
      translateEvolutionWebhook({
        event: 'MESSAGES_UPDATE',
        data: { keyId: 'M2', status: 'DELIVERY_ACK' },
      })[0]?.status,
      'DELIVERED',
    );
    assert.equal(
      translateEvolutionWebhook({
        event: 'messages.update',
        data: { key: { id: 'M3' }, status: 'READ' },
      })[0]?.status,
      'READ',
    );
    const failed = translateEvolutionWebhook({
      event: 'messages.update',
      data: { keyId: 'M4', status: 'ERROR', error: 'boom' },
    })[0];
    assert.equal(failed?.status, 'FAILED');
    assert.equal(failed?.errorCode, 'EVOLUTION_ERROR');
  });

  it('ignores non-update events and non-actionable statuses', () => {
    assert.deepEqual(
      translateEvolutionWebhook({
        event: 'messages.upsert',
        data: { keyId: 'X', status: 'SERVER_ACK' },
      }),
      [],
    );
    assert.deepEqual(
      translateEvolutionWebhook({
        event: 'messages.update',
        data: { keyId: 'X', status: 'PENDING' },
      }),
      [],
    );
  });

  it('handles array data payloads', () => {
    const out = translateEvolutionWebhook({
      event: 'messages.update',
      data: [
        { keyId: 'A', status: 'SERVER_ACK' },
        { keyId: 'A', status: 'DELIVERY_ACK' },
      ],
    });
    assert.equal(out.length, 2);
    assert.equal(out[0].status, 'SENT');
    assert.equal(out[1].status, 'DELIVERED');
  });
});

describe('EvolutionWhatsAppProvider', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('is disabled when WHATSAPP_ENABLED is false', () => {
    const provider = new EvolutionWhatsAppProvider(
      configWith({
        WHATSAPP_ENABLED: 'false',
        EVOLUTION_API_URL: 'http://localhost:8080',
        EVOLUTION_API_KEY: 'key',
        EVOLUTION_INSTANCE_ID: 'school',
      }),
    );
    assert.equal(provider.isEnabled(), false);
  });

  it('is not configured when Evolution env is incomplete', () => {
    const provider = new EvolutionWhatsAppProvider(
      configWith({
        WHATSAPP_ENABLED: 'true',
        EVOLUTION_API_URL: 'http://localhost:8080',
      }),
    );
    assert.equal(provider.isConfigured(), false);
    assert.equal(provider.isEnabled(), false);
  });

  it('successful sendText persists key.id as providerMessageId', async () => {
    const provider = new EvolutionWhatsAppProvider(configWith(enabledConfig));

    mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.match(String(input), /\/message\/sendText\/school-main$/);
      assert.equal(init?.method, 'POST');
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers.apikey, 'secret-key');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.number, '923001234567');
      assert.equal(typeof body.text, 'string');
      assert.match(body.text, /Sara Student/);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          key: {
            id: 'WA_MSG_99',
            remoteJid: '923001234567@s.whatsapp.net',
            fromMe: true,
          },
        }),
      } as Response;
    });

    const result = await provider.sendAttendanceAbsentMessage(sampleInput);
    assert.equal(result.success, true);
    assert.equal(result.providerMessageId, 'WA_MSG_99');
  });

  it('treats API 4xx as non-retryable', async () => {
    const provider = new EvolutionWhatsAppProvider(configWith(enabledConfig));
    mock.method(globalThis, 'fetch', async () =>
      ({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'BAD_REQUEST', message: 'bad number' } }),
      }) as Response,
    );
    const result = await provider.sendAttendanceAbsentMessage(sampleInput);
    assert.equal(result.success, false);
    assert.equal(result.retryable, false);
    assert.equal(result.errorCode, 'BAD_REQUEST');
  });

  it('treats 401/403 as non-retryable', async () => {
    const provider = new EvolutionWhatsAppProvider(configWith(enabledConfig));
    for (const status of [401, 403]) {
      mock.restoreAll();
      mock.method(globalThis, 'fetch', async () =>
        ({
          ok: false,
          status,
          json: async () => ({}),
        }) as Response,
      );
      const result = await provider.sendAttendanceAbsentMessage(sampleInput);
      assert.equal(result.retryable, false);
      assert.equal(result.errorCode, `HTTP_${status}`);
    }
  });

  it('treats 429 and 5xx as retryable', async () => {
    const provider = new EvolutionWhatsAppProvider(configWith(enabledConfig));
    for (const status of [429, 500, 502]) {
      mock.restoreAll();
      mock.method(globalThis, 'fetch', async () =>
        ({
          ok: false,
          status,
          json: async () => ({}),
        }) as Response,
      );
      const result = await provider.sendAttendanceAbsentMessage(sampleInput);
      assert.equal(result.retryable, true);
    }
  });

  it('treats network/timeout errors as retryable', async () => {
    const provider = new EvolutionWhatsAppProvider(configWith(enabledConfig));
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('AbortError: timeout');
    });
    const result = await provider.sendAttendanceAbsentMessage(sampleInput);
    assert.equal(result.success, false);
    assert.equal(result.retryable, true);
    assert.equal(result.errorCode, 'NETWORK_ERROR');
  });

  it('fails retryably when key.id is missing', async () => {
    const provider = new EvolutionWhatsAppProvider(configWith(enabledConfig));
    mock.method(globalThis, 'fetch', async () =>
      ({
        ok: true,
        status: 201,
        json: async () => ({ status: 'PENDING' }),
      }) as Response,
    );
    const result = await provider.sendAttendanceAbsentMessage(sampleInput);
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'MISSING_MESSAGE_ID');
    assert.equal(result.retryable, true);
  });

  it('rejects invalid recipient without calling Evolution', async () => {
    const provider = new EvolutionWhatsAppProvider(configWith(enabledConfig));
    let called = false;
    mock.method(globalThis, 'fetch', async () => {
      called = true;
      return { ok: true, status: 201, json: async () => ({}) } as Response;
    });
    const result = await provider.sendAttendanceAbsentMessage({
      ...sampleInput,
      recipient: 'bad',
    });
    assert.equal(called, false);
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'INVALID_RECIPIENT');
    assert.equal(result.retryable, false);
  });
});
