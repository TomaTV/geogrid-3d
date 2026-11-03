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

export function growTrees(greens, bounds, { spacing = 11, max = 4500 } = {}) {
  const lat0 = (bounds.south + bounds.north) / 2;
  const dLat = (1 / R) * (180 / Math.PI);
  const dLng = dLat / Math.cos((lat0 * Math.PI) / 180);
  const points = [];
  for (let gi = 0; gi < greens.length && points.length < max; gi++) {
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
        points.push({ position: [px, py], radius: 3 + rand() * 2.8, height: 7 + rand() * 6, tone: rand() });
        count++;
        if (points.length >= max) break;
      }
    }
  }
  return { points };
}
