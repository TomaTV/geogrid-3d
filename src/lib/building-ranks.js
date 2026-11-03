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
  return function estimate(lat, lng) {
    const [px, py] = project(lat, lng, lat0);
    const ds = [];
    for (let i = 0; i < pts.length; i++) ds.push([Math.hypot(pts[i][0] - px, pts[i][1] - py), i]);
    ds.sort((a, b) => a[0] - b[0]);
    const nearest = ds[0];
    const measured = ds.filter(([, i]) => nodes[i].rank != null).slice(0, 4);
    let rank = null;
    let rgb = null;
    if (measured.length && measured[0][0] < step * 2) {
      let w = 0;
      let s = 0;
      const acc = [0, 0, 0];
      for (const [d, i] of measured) {
        const wi = 1 / Math.max(d, step * 0.15) ** 2;
        w += wi;
        s += wi * Math.min(nodes[i].rank, RANK_CAP);
        nodeRgb(nodes[i].rank).forEach((v, k) => (acc[k] += wi * v));
      }
      rank = s / w;
      rgb = acc.map((v) => v / w);
    }
    const conf = Math.max(0, Math.min(1, 1 - (nearest[0] - step * 0.9) / (step * 1.3)));
    return { node: nearest[1], dist: nearest[0], rank, rgb, conf };
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
        est: e.rank == null || t < 0.35 ? -1 : Math.round(e.rank * 10) / 10,
        color: rgbHex(rgb),
      },
    });
  }
  return out;
}
