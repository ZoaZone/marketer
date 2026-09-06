/**
 * Unit tests for src/lib/whatsapp/payload.js.
 * Run with: npm run test:whatsapp
 */
import {
  SERVICE_WINDOW_MS, toE164, toWaId, formatPhone, toIso, normalizeInbound,
  previewOf, withinServiceWindow, serviceWindowRemaining, formatWindowRemaining,
  fillTemplate, countTemplateVariables, templateComponents, sortMessages,
  mergeMessages, groupByDay, formatDayLabel, relativeTime,
} from '../../src/lib/whatsapp/payload.js';

describe('phone number normalisation', () => {
  test('wa_id gains the + Meta omits', () => {
    expect(toE164('12566998899')).toBe('+12566998899');
  });

  test('anything a human types is reduced to digits for Graph', () => {
    expect(toWaId('+1 (256) 699-8899')).toBe('12566998899');
    expect(toWaId('')).toBe('');
  });

  test('empty input stays empty rather than becoming a bare +', () => {
    expect(toE164('')).toBe('');
    expect(toE164(null)).toBe('');
  });

  test('US numbers are grouped, unknown plans are passed through as E.164', () => {
    expect(formatPhone('12566998899')).toBe('+1 (256) 699-8899');
    expect(formatPhone('2566998899')).toBe('(256) 699-8899');
    // A 12-digit number is not something we can group correctly, so we do not try.
    expect(formatPhone('919876543210')).toBe('+919876543210');
  });
});

describe('timestamp conversion', () => {
  test('Meta Unix seconds become ISO', () => {
    expect(toIso('1717171717')).toBe(new Date(1717171717000).toISOString());
  });

  test('a missing or junk timestamp falls back to now, never to 1970', () => {
    const before = Date.now();
    const iso = toIso(undefined);
    expect(Date.parse(iso)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(toIso('not-a-number'))).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(toIso('0'))).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('normalizeInbound', () => {
  test('text message', () => {
    const result = normalizeInbound({
      id: 'wamid.ABC', type: 'text', timestamp: '1717171717',
      text: { body: 'Hi there' },
    });
    expect(result).toMatchObject({
      wamid: 'wamid.ABC', message_type: 'text', body: 'Hi there', media_id: '',
    });
  });

  test('captioned media keeps both the caption and the media id', () => {
    const result = normalizeInbound({
      id: 'wamid.IMG', type: 'image', timestamp: '1717171717',
      image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'the invoice' },
    });
    expect(result).toMatchObject({
      message_type: 'image', body: 'the invoice',
      media_id: 'media-1', media_mime: 'image/jpeg',
    });
  });

  test('documents carry their filename through', () => {
    const result = normalizeInbound({
      id: 'wamid.DOC', type: 'document', timestamp: '1717171717',
      document: { id: 'media-2', mime_type: 'application/pdf', filename: 'quote.pdf' },
    });
    expect(result.media_filename).toBe('quote.pdf');
  });

  test('a button reply reads as the text the contact tapped', () => {
    expect(normalizeInbound({
      id: 'w1', type: 'button', timestamp: '1', button: { text: 'Yes, book it' },
    }).body).toBe('Yes, book it');
  });

  test('an interactive list reply reads as the chosen row title', () => {
    expect(normalizeInbound({
      id: 'w2', type: 'interactive', timestamp: '1',
      interactive: { type: 'list_reply', list_reply: { id: 'r1', title: '10:30 AM' } },
    }).body).toBe('10:30 AM');
  });

  test('location flattens to name, address and coordinates', () => {
    expect(normalizeInbound({
      id: 'w3', type: 'location', timestamp: '1',
      location: { latitude: 34.7, longitude: -86.5, name: 'Clinic', address: '1 Main St' },
    }).body).toBe('Clinic · 1 Main St · 34.7,-86.5');
  });

  test('an unknown type survives as unsupported instead of vanishing', () => {
    const result = normalizeInbound({ id: 'w4', type: 'order', timestamp: '1' });
    expect(result.message_type).toBe('order');
    expect(result.body).toBe('');
    expect(result.wamid).toBe('w4');
  });
});

describe('previewOf', () => {
  test('prefers the body text', () => {
    expect(previewOf({ message_type: 'image', body: 'caption here' })).toBe('caption here');
  });

  test('falls back to a readable label for bodyless media', () => {
    expect(previewOf({ message_type: 'audio', body: '' })).toBe('🎙 Voice message');
    expect(previewOf({ message_type: 'order', body: '' })).toBe('[order]');
  });

  test('long bodies are truncated so the list row cannot be blown out', () => {
    expect(previewOf({ message_type: 'text', body: 'x'.repeat(500) })).toHaveLength(140);
  });
});

describe('24-hour customer service window', () => {
  const now = Date.parse('2026-09-06T12:00:00Z');

  test('open just inside 24 hours', () => {
    const lastInbound = new Date(now - SERVICE_WINDOW_MS + 60000).toISOString();
    expect(withinServiceWindow(lastInbound, now)).toBe(true);
  });

  test('closed just outside 24 hours', () => {
    const lastInbound = new Date(now - SERVICE_WINDOW_MS - 1000).toISOString();
    expect(withinServiceWindow(lastInbound, now)).toBe(false);
  });

  test('a contact who has never written in has no open window', () => {
    expect(withinServiceWindow('', now)).toBe(false);
    expect(withinServiceWindow(undefined, now)).toBe(false);
    expect(serviceWindowRemaining(undefined, now)).toBe(0);
  });

  test('remaining time never goes negative', () => {
    const old = new Date(now - 48 * 3600 * 1000).toISOString();
    expect(serviceWindowRemaining(old, now)).toBe(0);
    expect(formatWindowRemaining(old, now)).toBe('closed');
  });

  test('remaining time reads in hours and minutes', () => {
    const lastInbound = new Date(now - 30 * 60000).toISOString();
    expect(formatWindowRemaining(lastInbound, now)).toBe('23h 30m');
  });

  test('under an hour drops the hours part', () => {
    const lastInbound = new Date(now - (SERVICE_WINDOW_MS - 45 * 60000)).toISOString();
    expect(formatWindowRemaining(lastInbound, now)).toBe('45m');
  });
});

describe('templates', () => {
  test('counts the highest placeholder, not the number of them', () => {
    expect(countTemplateVariables('Hi {{1}}, your order {{2}} ships {{2}}')).toBe(2);
    expect(countTemplateVariables('No variables here')).toBe(0);
  });

  test('fills supplied values and leaves the rest as placeholders', () => {
    expect(fillTemplate('Hi {{1}}, see you {{2}}', ['Sam'])).toBe('Hi Sam, see you {{2}}');
    expect(fillTemplate('Hi {{1}}', ['Sam'])).toBe('Hi Sam');
  });

  test('whitespace inside the braces still matches', () => {
    expect(fillTemplate('Hi {{ 1 }}', ['Sam'])).toBe('Hi Sam');
  });

  test('a template with no variables sends no components at all', () => {
    // Meta rejects components: [{type:'body', parameters: []}] — the key has to
    // be absent, not present-and-empty.
    expect(templateComponents([])).toEqual([]);
    expect(templateComponents(['', undefined])).toEqual([]);
  });

  test('supplied values become body parameters in order', () => {
    expect(templateComponents(['Sam', '10:30'])).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'Sam' }, { type: 'text', text: '10:30' }] },
    ]);
  });
});

describe('thread assembly', () => {
  const a = { id: '1', wamid: 'wamid.A', body: 'first', wa_timestamp: '2026-09-06T10:00:00Z' };
  const b = { id: '2', wamid: 'wamid.B', body: 'second', wa_timestamp: '2026-09-06T11:00:00Z' };

  test('messages read oldest first', () => {
    expect(sortMessages([b, a]).map((m) => m.id)).toEqual(['1', '2']);
  });

  test('merging is idempotent', () => {
    expect(mergeMessages([a, b], [a, b])).toHaveLength(2);
  });

  test('an optimistic bubble is replaced by the real row, not doubled', () => {
    const optimistic = { id: 'pending-1', wamid: 'wamid.C', body: 'hello', status: 'queued', wa_timestamp: '2026-09-06T12:00:00Z' };
    const confirmed = { id: 'real-1', wamid: 'wamid.C', body: 'hello', status: 'sent', wa_timestamp: '2026-09-06T12:00:00Z' };
    const merged = mergeMessages([optimistic], [confirmed]);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('sent');
  });

  test('a later status update patches the existing bubble', () => {
    const merged = mergeMessages([a], [{ ...a, status: 'read' }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('read');
    expect(merged[0].body).toBe('first');
  });

  test('rows with neither id nor wamid are dropped rather than rendered blank', () => {
    expect(mergeMessages([], [{ body: 'orphan' }, null])).toEqual([]);
  });

  test('grouping splits on calendar day', () => {
    const groups = groupByDay([a, b, { id: '3', wa_timestamp: '2026-09-07T09:00:00Z' }]);
    expect(groups.map((g) => g.day)).toEqual(['2026-09-06', '2026-09-07']);
    expect(groups[0].messages).toHaveLength(2);
  });
});

describe('date and time labels', () => {
  const now = new Date('2026-09-06T12:00:00Z');

  test('today and yesterday are named', () => {
    expect(formatDayLabel('2026-09-06', now)).toBe('Today');
    expect(formatDayLabel('2026-09-05', now)).toBe('Yesterday');
  });

  test('an older day gets a written date', () => {
    expect(formatDayLabel('2026-09-01', now)).toMatch(/Sep/);
  });

  test('relative time compresses as it ages', () => {
    const t = now.getTime();
    expect(relativeTime(new Date(t - 30000).toISOString(), t)).toBe('now');
    expect(relativeTime(new Date(t - 5 * 60000).toISOString(), t)).toBe('5m');
    expect(relativeTime(new Date(t - 3 * 3600000).toISOString(), t)).toBe('3h');
    expect(relativeTime(new Date(t - 2 * 86400000).toISOString(), t)).toBe('2d');
  });

  test('a missing timestamp renders as nothing, not "NaN"', () => {
    expect(relativeTime('', now.getTime())).toBe('');
    expect(formatDayLabel('', now)).toBe('');
  });
});
