const R = 6371000;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function disc(lng, lat, rMeters, sides, dLat, dLng) {
  const ring = [];
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    ring.push([lng + Math.cos(a) * rMeters * dLng, lat + Math.sin(a) * rMeters * dLat]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

export function growTrees(greens, bounds, { spacing = 12, max = 4500 } = {}) {
  const lat0 = (bounds.south + bounds.north) / 2;
  const dLat = (1 / R) * (180 / Math.PI);
  const dLng = dLat / Math.cos((lat0 * Math.PI) / 180);
  const canopy = [];
  const trunks = [];
  let n = 0;
  for (let gi = 0; gi < greens.length && n < max; gi++) {
    const g = greens[gi].geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0];
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    const rand = rng(gi * 977 + ring.length);
    const stepLng = spacing * dLng;
    const stepLat = spacing * dLat;
    let count = 0;
    for (let x = Math.min(...xs); x < Math.max(...xs) && count < 500; x += stepLng) {
      for (let y = Math.min(...ys); y < Math.max(...ys) && count < 500; y += stepLat) {
        const px = x + (rand() - 0.5) * stepLng * 0.9;
        const py = y + (rand() - 0.5) * stepLat * 0.9;
        if (px < bounds.west || px > bounds.east || py < bounds.south || py > bounds.north) continue;
        if (!inRing(px, py, ring)) continue;
        const r = 3.4 + rand() * 3;
        const h = 5 + rand() * 5;
        const tone = rand();
        canopy.push({ type: 'Feature', geometry: disc(px, py, r, 8, dLat, dLng), properties: { top: h + 2.4, base: 2.4, tone } });
        canopy.push({ type: 'Feature', geometry: disc(px, py, r * 0.62, 7, dLat, dLng), properties: { top: h * 1.15 + 2.4, base: h * 0.6 + 2.4, tone } });
        trunks.push({ type: 'Feature', geometry: disc(px, py, 0.45, 5, dLat, dLng), properties: { top: 3.4, base: 0, tone } });
        count++;
        if (++n >= max) break;
      }
    }
  }
  return { canopy: { type: 'FeatureCollection', features: canopy }, trunks: { type: 'FeatureCollection', features: trunks } };
}
