// Line identity for voice acting. Pure (no DOM, no imports) so the game (src/audio/voice.js) and
// the extraction script (scripts/voice/extract.mjs) compute exactly the same key.
//
//   canonSpeaker(id)          -> the id a clip is filed under ('player' -> 'vesna', ...)
//   normalizeText(text)       -> the text as it is identified: quotes and dashes straightened,
//                                italic markers (*...*) dropped, whitespace collapsed
//   lineHash(speaker, text)   -> 10 hex characters of a 40 bit hash of "speaker|normalized text"
//
// A line whose speaker or normalized text changes gets a new hash, so it simply becomes unvoiced
// (and shows up in `node scripts/voice/extract.mjs --report`). Case and punctuation are kept on
// purpose: both change how a line is acted.

// Speaker ids the story uses that are filed under another voice.
export const SPEAKER_ALIASES = {
  player: 'vesna',
  wiesia_ghost: 'wiesia',
  ghost: 'wiesia',
};

export function canonSpeaker(id) {
  const s = String(id ?? '').trim().toLowerCase();
  return SPEAKER_ALIASES[s] || s;
}

export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/[\u2018\u2019\u201b\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Two 32 bit lanes (FNV-1a and a murmur-style mix) over UTF-16 code units, 40 bits kept.
export function lineHash(speaker, text) {
  const s = `${canonSpeaker(speaker)}|${normalizeText(text)}`;
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
    b ^= b >>> 15;
  }
  a = Math.imul(a ^ (a >>> 16), 0x85ebca6b) >>> 0;
  b = Math.imul(b ^ (b >>> 13), 0xc2b2ae35) >>> 0;
  const hi = (b & 0xff).toString(16).padStart(2, '0');
  return hi + a.toString(16).padStart(8, '0');
}
