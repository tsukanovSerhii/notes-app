/**
 * A small fuzzy matcher for the command palette: every character of the
 * query must appear in order. Consecutive runs, word starts and an early
 * first match score higher. Returns null when there is no match.
 */
export function fuzzyScore(text: string, query: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct !== -1) return 1000 - direct * 2 - (t.length - q.length) * 0.1 + (isWordStart(t, direct) ? 50 : 0);

  let score = 0;
  let from = 0;
  let prev = -2;
  for (const ch of q) {
    const at = t.indexOf(ch, from);
    if (at === -1) return null;
    score += at === prev + 1 ? 15 : isWordStart(t, at) ? 10 : 1;
    prev = at;
    from = at + 1;
  }
  return score - (t.length - q.length) * 0.1;
}

const isWordStart = (t: string, i: number) => i === 0 || /[\s\-_/.]/.test(t[i - 1]);

/** Items that match, best first. */
export function fuzzyFilter<T>(items: readonly T[], query: string, text: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, score: fuzzyScore(text(item), query) }))
    .filter((x): x is { item: T; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}
