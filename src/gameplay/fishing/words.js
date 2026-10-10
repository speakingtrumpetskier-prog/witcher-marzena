// How people here say a catch: "Three perch, a roach and a pike." / "Twenty-one and a half kilos." Pure text, used by the
// reeve's dialogue and the tests.
const ONES = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function numberWord(n) {
  n = Math.max(0, Math.round(n));
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  return String(n);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// [{ id }] with a name for each id -> "Three perch, a roach and a pike."
export function fishList(items, nameOf) {
  const counts = new Map();
  for (const it of items) counts.set(it.id, (counts.get(it.id) || 0) + 1);
  const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => (n === 1 ? `a ${nameOf(id)}` : `${numberWord(n)} ${nameOf(id)}`));
  if (!parts.length) return '';
  const s = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${cap(s)}.`;
}

// 21.5 -> "Twenty-one and a half kilos", 22 -> "Twenty-two kilos", 0.4 -> "Less than a kilo"
export function spokenKg(w) {
  const half = Math.round(w * 2) / 2;
  const whole = Math.floor(half);
  if (half < 1) return 'Less than a kilo';
  const base = cap(numberWord(whole));
  if (half === whole) return `${base} kilo${whole === 1 ? '' : 's'}`;
  return `${base} and a half kilos`;
}
