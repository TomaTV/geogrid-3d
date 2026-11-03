import { nodeRgb, rgbHex } from './rank-colors.js';

const R = 6371000;
const OUTSIDE = [43, 50, 60];
const RANK_CAP = 25;

function project(lat, lng, lat0) {
  return [((lng * Math.PI) / 180) * R * Math.cos((lat0 * Math.PI) / 180), ((lat * Math.PI) / 180) * R];
}

export function gridStep(nodes) {
  const lat0 = nodes[0].lat;
  const pts = nodes.map((n) => project(n.lat, n.lng, lat0));
  const nn = pts.map((p, i) => {
    let best = Infinity;
    for (let j = 0; j < pts.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(p[0] - pts[j][0], p[1] - pts[j][1]);
      if (d < best) best = d;
    }
    return best;
  });
  nn.sort((a, b) => a - b);
  return nn[Math.floor(nn.length / 2)] || 500;
}

export function scanBounds(nodes, padMeters) {
  const lat0 = nodes[0].lat;
  const dLat = (padMeters / R) * (180 / Math.PI);
  const dLng = dLat / Math.cos((lat0 * Math.PI) / 180);
  return {
    south: Math.min(...nodes.map((n) => n.lat)) - dLat,
    north: Math.max(...nodes.map((n) => n.lat)) + dLat,
    west: Math.min(...nodes.map((n) => n.lng)) - dLng,
    east: Math.max(...nodes.map((n) => n.lng)) + dLng,
  };
}

function centroid(ring) {
  let x = 0;
  let y = 0;
  for (const [lng, lat] of ring) {
    x += lng;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

export function makeEstimator(nodes, step) {
  const lat0 = nodes[0].lat;
  const pts = nodes.map((n) => project(n.lat, n.lng, lat0));
  const sigma = step * 0.75;
  return function estimate(lat, lng) {
    const [px, py] = project(lat, lng, lat0);
    let nearest = [Infinity, 0];
    let w = 0;
    let rank = 0;
    const acc = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - px, pts[i][1] - py);
      if (d < nearest[0]) nearest = [d, i];
      if (nodes[i].rank == null || d > sigma * 3.2) continue;
      const wi = Math.exp(-((d / sigma) ** 2));
      w += wi;
      rank += wi * Math.min(nodes[i].rank, RANK_CAP);
      nodeRgb(nodes[i].rank).forEach((v, k) => (acc[k] += wi * v));
    }
    if (w < 1e-4) return { node: nearest[1], dist: nearest[0], rank: null, rgb: null, conf: 0 };
    const x = Math.min(1, w / 0.7);
    return { node: nearest[1], dist: nearest[0], rank: rank / w, rgb: acc.map((v) => v / w), conf: x * x * (3 - 2 * x) };
  };
}

export function rankBuildings(features, estimate) {
  const seen = new Set();
  const out = [];
  for (const f of features) {
    const g = f.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0];
    const key = ring[0][0].toFixed(6) + ',' + ring[0][1].toFixed(6) + ',' + ring.length;
    if (seen.has(key)) continue;
    seen.add(key);
    const [lng, lat] = centroid(ring);
    const e = estimate(lat, lng);
    const props = f.properties || {};
    const t = e.rank == null ? 0 : e.conf;
    const base = e.rgb ?? OUTSIDE;
    const rgb = OUTSIDE.map((o, k) => o + (base[k] - o) * t);
    out.push({
      type: 'Feature',
      geometry: g,
      properties: {
        height: props.render_height ?? 8,
        base: props.render_min_height ?? 0,
        node: e.node,
        dist: Math.round(e.dist),
        est: e.rank == null || t < 0.5 ? -1 : Math.round(e.rank * 10) / 10,
        color: rgbHex(rgb),
      },
    });
  }
  return out;
}
