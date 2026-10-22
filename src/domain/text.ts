const STOP_WORDS = new Set([
  'a',
  'about',
  'am',
  'an',
  'and',
  'are',
  'at',
  'did',
  'do',
  'does',
  'for',
  'have',
  'i',
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'the',
  'to',
  'was',
  'what',
  'when',
  'where',
  'which',
  'who',
  'will',
  'with',
]);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();
}

export function keywords(text: string): string[] {
  return [...new Set(normalize(text).split(' '))].filter(
    (word) => word.length > 1 && !STOP_WORDS.has(word),
  );
}

export function similarity(left: string, right: string): number {
  const a = new Set(keywords(left));
  const b = new Set(keywords(right));
  if (a.size === 0 || b.size === 0) return 0;
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / (a.size + b.size - shared);
}
