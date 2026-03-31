import { describe, it, expect, vi, afterEach } from 'vitest';
import { relTime, eventId, stripCitations, cleanItems, parseAIResponse } from './format';

// ── relTime ──────────────────────────────────────────────

describe('relTime', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('returns empty string for null', () => {
    expect(relTime(null)).toBe('');
  });

  it('returns "just now" for < 60 seconds ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T12:00:30Z'));
    expect(relTime(new Date('2026-03-29T12:00:00Z'))).toBe('just now');
  });

  it('returns minutes ago for 60-3599 seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T12:05:00Z'));
    expect(relTime(new Date('2026-03-29T12:00:00Z'))).toBe('5m ago');
  });

  it('returns hours ago for 3600-86399 seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T15:00:00Z'));
    expect(relTime(new Date('2026-03-29T12:00:00Z'))).toBe('3h ago');
  });

  it('returns days ago for >= 86400 seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
    expect(relTime(new Date('2026-03-29T12:00:00Z'))).toBe('3d ago');
  });

  it('returns "just now" for 0 seconds difference', () => {
    vi.useFakeTimers();
    const now = new Date('2026-03-29T12:00:00Z');
    vi.setSystemTime(now);
    expect(relTime(new Date('2026-03-29T12:00:00Z'))).toBe('just now');
  });

  it('floors minutes (does not round up)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T12:01:59Z'));
    expect(relTime(new Date('2026-03-29T12:00:00Z'))).toBe('1m ago');
  });
});

// ── eventId ──────────────────────────────────────────────

describe('eventId', () => {
  it('generates consistent ID for same input', () => {
    const input = { event: 'Earthquake', region: 'Japan' };
    expect(eventId(input)).toBe(eventId(input));
  });

  it('uses event field for name', () => {
    expect(eventId({ event: 'Flood', region: 'EU' })).toBe('Flood||EU');
  });

  it('falls back to risk field when event is missing', () => {
    expect(eventId({ risk: 'Tariff War', region: 'China' })).toBe('Tariff War||China');
  });

  it('handles missing fields gracefully', () => {
    expect(eventId({})).toBe('||');
  });

  it('handles undefined region', () => {
    expect(eventId({ event: 'Strike' })).toBe('Strike||');
  });

  it('replaces pipe characters in event name', () => {
    expect(eventId({ event: 'A|B|C', region: 'EU' })).toBe('A-B-C||EU');
  });

  it('replaces pipe characters in region', () => {
    expect(eventId({ event: 'Flood', region: 'EU|APAC' })).toBe('Flood||EU-APAC');
  });

  it('uses double-pipe delimiter between name and region', () => {
    const id = eventId({ event: 'Strike', region: 'Europe' });
    expect(id).toContain('||');
    expect(id.split('||')).toHaveLength(2);
  });
});

// ── stripCitations ───────────────────────────────────────

describe('stripCitations', () => {
  it('strips cite tags', () => {
    expect(stripCitations('hello <cite>1</cite> world')).toBe('hello 1 world');
  });

  it('handles non-string input', () => {
    expect(stripCitations(42)).toBe('42');
    expect(stripCitations(null)).toBe('');
    expect(stripCitations(undefined)).toBe('');
  });
});

// ── parseAIResponse ─────────────────────────────────────

describe('parseAIResponse', () => {
  it('parses valid JSON array in text block', () => {
    const data = {
      content: [{ type: 'text', text: '```json\n[{"event":"Flood","region":"EU"}]\n```' }],
    };
    const result = parseAIResponse(data);
    expect(result).toEqual([{ event: 'Flood', region: 'EU' }]);
  });

  it('returns null for unparseable content', () => {
    const data = { content: [{ type: 'text', text: 'no json here' }] };
    expect(parseAIResponse(data)).toBeNull();
  });
});
