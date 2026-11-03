import * as THREE from 'three';
import { nodeRgb } from '../rank-colors.js';

const C = 40075016.686;
const RANK_CAP = 25;
const SIZE = 256;

export function createProjection(lng0, lat0) {
  const k = Math.cos((lat0 * Math.PI) / 180);
  const mx = (lng) => (lng + 180) / 360;
  const my = (lat) => {
    const r = (lat * Math.PI) / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
  };
  const mx0 = mx(lng0);
  const my0 = my(lat0);
  return {
    k,
    mx0,
    my0,
    toWorld: (lng, lat) => [(mx(lng) - mx0) * C * k, (my(lat) - my0) * C * k],
    tileAt(x, z, zoom) {
      const n = 2 ** zoom;
      return [Math.floor((x / (C * k) + mx0) * n), Math.floor((z / (C * k) + my0) * n)];
    },
    tileMeters: (zoom) => (C * k) / 2 ** zoom,
    tileOrigin(tx, ty, zoom) {
      const n = 2 ** zoom;
      return [(tx / n - mx0) * C * k, (ty / n - my0) * C * k];
    },
  };
}

function medianSpacing(pts) {
  if (pts.length < 2) return 500;
  const nn = pts.map((p, i) => {
    let best = Infinity;
    for (let j = 0; j < pts.length; j++) {
      if (i !== j) best = Math.min(best, Math.hypot(p[0] - pts[j][0], p[1] - pts[j][1]));
    }
    return best;
  });
  nn.sort((a, b) => a - b);
  return nn[nn.length >> 1] || 500;
}

export function createField(nodes, proj) {
  const pts = nodes.map((n) => proj.toWorld(n.lng, n.lat));
  const step = medianSpacing(pts);
  // Comme Geogrid : les points classés se diffusent aux cases voisines, un point hors top 20 reste local.
  const sigma = Math.max(step * 1.6, 520);

  function estimate(x, z) {
    let nearest = [Infinity, 0];
    let measured = [Infinity, -1];
    let w = 0;
    let rank = 0;
    const acc = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - x, pts[i][1] - z);
      if (d < nearest[0]) nearest = [d, i];
      if (nodes[i].rank == null) continue;
      if (d < measured[0]) measured = [d, i];
      if (d > sigma * 3.2) continue;
      const reach = nodes[i].rank > 20 ? sigma * 0.42 : sigma;
      const wi = Math.exp(-((d / reach) ** 2));
      w += wi;
      rank += wi * Math.min(nodes[i].rank, RANK_CAP);
      const c = nodeRgb(nodes[i].rank);
      acc[0] += wi * c[0];
      acc[1] += wi * c[1];
      acc[2] += wi * c[2];
    }
    const ref = measured[1] >= 0 ? measured : nearest;
    if (w < 1e-4) return { node: ref[1], dist: ref[0], rank: null, rgb: null, conf: 0 };
    const t = Math.min(1, w / 0.3);
    return { node: ref[1], dist: ref[0], rank: rank / w, rgb: acc.map((v) => v / w), conf: t * t * (3 - 2 * t) };
  }

  const pad = sigma * 2;
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const min = [Math.min(...xs) - pad, Math.min(...zs) - pad];
  const span = [Math.max(...xs) + pad - min[0], Math.max(...zs) + pad - min[1]];
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let j = 0; j < SIZE; j++) {
    const z = min[1] + ((j + 0.5) / SIZE) * span[1];
    for (let i = 0; i < SIZE; i++) {
      const x = min[0] + ((i + 0.5) / SIZE) * span[0];
      const e = estimate(x, z);
      if (!e.rgb) continue;
      const k = (j * SIZE + i) * 4;
      data[k] = e.rgb[0];
      data[k + 1] = e.rgb[1];
      data[k + 2] = e.rgb[2];
      const edge = Math.min(i, j, SIZE - 1 - i, SIZE - 1 - j) / 8;
      data[k + 3] = 255 * e.conf * Math.min(1, edge);
    }
  }
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return { texture, min, span, estimate, pts };
}
