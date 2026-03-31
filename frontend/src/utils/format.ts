// Strip citation tags from AI responses
export function stripCitations(s: unknown): string {
  if (typeof s !== 'string') return String(s ?? '');
  return s.replace(/<\/?(?:cite|antml:cite)[^>]*>/gi, '').replace(/\s{2,}/g, ' ').trim();
}

// Clean array of objects by stripping citations from all string values
export function cleanItems<T extends Record<string, unknown>>(a: unknown): T[] {
  if (!Array.isArray(a)) return a as T[];
  return a.map(o => {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) r[k] = stripCitations(v);
    return r as T;
  });
}

// Parse AI response text into structured data
export function parseAIResponse(data: { content?: { type: string; text?: string }[] }): unknown[] | null {
  const txt = data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "";
  const c = txt.replace(/```json|```/g, "").trim();

  try { return cleanItems(JSON.parse(c)); } catch { /* continue */ }

  const f = c.indexOf('['), l = c.lastIndexOf(']');
  if (f !== -1 && l > f) {
    try { return cleanItems(JSON.parse(c.substring(f, l + 1))); } catch { /* continue */ }
  }

  const objs: Record<string, unknown>[] = [];
  const re = /\{[^{}]*"(?:event|risk)"[^{}]*\}/g;
  let m;
  while ((m = re.exec(c)) !== null) {
    try { objs.push(JSON.parse(m[0])); } catch { /* skip */ }
  }
  if (objs.length) return cleanItems(objs);

  return null;
}

// Relative time display
export function relTime(d: Date | null): string {
  if (!d) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

// Generate stable event ID from event name + region
// Uses double-pipe delimiter to avoid collisions with single pipes in data values
export function eventId(d: { event?: string; risk?: string; region?: string }): string {
  const name = (d.event || d.risk || '').replace(/\|/g, '-');
  const region = (d.region || '').replace(/\|/g, '-');
  return name + '||' + region;
}
