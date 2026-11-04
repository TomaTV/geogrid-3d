// Génère le scan de démonstration : des données simulées, pas une mesure de Geogrid.
// Le commerce et les concurrents sont fictifs pour ne prêter aucun classement à un vrai établissement.
// Sortie stable d'une exécution à l'autre : node scripts/demo-scan.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const CENTER = { lat: 48.86, lng: 2.34 };
const BUSINESS = { lat: 48.8585, lng: 2.3525 };
const RADIUS = 6000;
const GRID = 21;
const NAMES = 'ABCDEFGHIJKL'.split('').map((c) => 'Pizzeria Exemple ' + c);

const hash = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (x, y) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

const mLat = 111320;
const mLng = 111320 * Math.cos((CENTER.lat * Math.PI) / 180);
const grid_data = [];
for (let row = 0; row < GRID; row++) {
  for (let col = 0; col < GRID; col++) {
    const x = ((col / (GRID - 1)) * 2 - 1) * RADIUS;
    const y = ((row / (GRID - 1)) * 2 - 1) * RADIUS;
    const lat = CENTER.lat + y / mLat;
    const lng = CENTER.lng + x / mLng;
    const km = Math.hypot((lng - BUSINESS.lng) * mLng, (lat - BUSINESS.lat) * mLat) / 1000;
    // Le rang se dégrade avec la distance, avec de larges variations par quartier.
    const quarter = smooth(x / 1500 + 5, y / 1500 + 9) * 2 - 1;
    const local = smooth(x / 800 + 2, y / 800 + 4) * 2 - 1;
    const score = 2 + km * 3 + quarter * 8 + local * 1.5;
    const rank = score > 21 ? 101 : Math.max(1, Math.round(score));
    const competitors = [];
    for (let i = 0; competitors.length < 5; i++) {
      const name = NAMES[Math.floor(hash(col + i * 3, row + i * 7) * NAMES.length)];
      if (competitors.some((c) => c.name === name)) continue;
      const position = competitors.length + 1 >= rank ? competitors.length + 2 : competitors.length + 1;
      competitors.push({
        cid: 'demo-' + name.slice(-1),
        name,
        rank: position,
        lat: CENTER.lat + (hash(name.charCodeAt(17), 1) - 0.5) * 0.08,
        lng: CENTER.lng + (hash(name.charCodeAt(17), 2) - 0.5) * 0.12,
        rating: 3.8 + hash(name.charCodeAt(17), 3),
        reviews: 40 + Math.floor(hash(name.charCodeAt(17), 4) * 800),
      });
    }
    const node = { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), rank, competitors };
    if (rank <= 20) node.self = { lat: BUSINESS.lat, lng: BUSINESS.lng };
    grid_data.push(node);
  }
}

const measured = grid_data.filter((n) => n.rank <= 20).length;
const scan = {
  id: 'demo-simulated',
  simulated: true,
  keyword: 'pizzeria',
  target_cid: null,
  target_name: 'Pizzeria Exemple',
  latitude: CENTER.lat,
  longitude: CENTER.lng,
  radius_meters: RADIUS,
  grid_size: GRID,
  status: 'completed',
  nodes_sampled: grid_data.length,
  credits_consumed: 0,
  visibility_score: Number((measured / grid_data.length).toFixed(4)),
  grid_data,
  tags: ['simulated'],
  notes: null,
  error_message: null,
  created_at: '2026-11-04T12:00:00.000Z',
  completed_at: '2026-11-04T12:00:00.000Z',
};
writeFileSync('public/mock/scan-demo-21.json', JSON.stringify({ data: scan }));

const entry = { ...scan, id: 'demo', note: 'Scan de démonstration simulé', tag: 'simulated', saved_at: scan.completed_at };
const seed = JSON.parse(readFileSync('db.seed.json', 'utf8'));
seed.scans[0] = entry;
writeFileSync('db.seed.json', JSON.stringify(seed));

const counts = { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 };
for (const n of grid_data) counts[n.rank <= 3 ? '1-3' : n.rank <= 10 ? '4-10' : n.rank <= 20 ? '11-20' : '21+']++;
console.log(counts);
