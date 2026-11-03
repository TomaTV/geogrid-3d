export const UNRANKED = '#555555';

export function rankColor(rank) {
  if (rank == null || rank > 20) return UNRANKED;
  if (rank === 1) return '#22c55e';
  if (rank <= 3) return '#34d399';
  if (rank <= 5) return '#86efac';
  if (rank <= 10) return '#fbbf24';
  if (rank <= 15) return '#f97316';
  return '#ef4444';
}

export function formatRank(rank) {
  if (rank == null) return 'No data';
  if (rank > 20) return '20+';
  return '#' + rank;
}

const STOPS = [
  [1, [34, 197, 94]],
  [3, [52, 211, 153]],
  [5, [134, 239, 172]],
  [10, [251, 191, 36]],
  [15, [249, 115, 22]],
  [20, [239, 68, 68]],
  [25, [85, 85, 85]],
];

export function rankRgb(rank) {
  const r = Math.max(1, Math.min(25, rank));
  for (let i = 1; i < STOPS.length; i++) {
    const [b, cb] = STOPS[i];
    if (r <= b) {
      const [a, ca] = STOPS[i - 1];
      const t = (r - a) / (b - a);
      return ca.map((v, k) => v + (cb[k] - v) * t);
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export function rgbHex(rgb) {
  return '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

export function nodeRgb(rank) {
  const h = rankColor(rank).slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
