import * as THREE from 'three';
import { rankRgb } from '../rank-colors.js';

const C = 40075016.686;
const UNRANKED_RGB = [85, 85, 85];

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function warp(x, z) {
  const p = x / 420;
  const q = z / 420;
  return [
    x + (noise2(p, q) * 0.65 + noise2(p * 2.13 + 11, q * 2.13 + 11) * 0.35 - 0.5) * 240,
    z + (noise2(p + 17.3, q + 17.3) * 0.65 + noise2(p * 2.13 + 28, q * 2.13 + 28) * 0.35 - 0.5) * 240,
  ];
}
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
    toLngLat(x, z) {
      const lng = (x / (C * k) + mx0) * 360 - 180;
      const y = z / (C * k) + my0;
      const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
      return [lng, lat];
    },
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
  // Comme les cases estimées de Geogrid : toute la zone du scan reçoit une estimation, seul le bord s'estompe.
  const reach = Math.max(...pts.map((p) => Math.hypot(p[0], p[1]))) + 150;
  const sigma = Math.max(step * 1.6, 520);

  // Source unique : la couleur affichée sur la ville et le rang du panneau sortent de ce calcul.
  function estimate(x, z) {
    const [wx, wz] = warp(x, z);
    let measured = [Infinity, -1];
    let nearest = [Infinity, 0];
    let ranked = 0;
    let unranked = 0;
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      const real = Math.hypot(pts[i][0] - x, pts[i][1] - z);
      if (real < nearest[0]) nearest = [real, i];
      if (nodes[i].rank == null) continue;
      if (real < measured[0]) measured = [real, i];
      const d = Math.max(Math.hypot(pts[i][0] - wx, pts[i][1] - wz), 60);
      const wi = 1 / d ** 3;
      if (nodes[i].rank > 20) {
        unranked += wi * 0.45;
      } else {
        ranked += wi;
        sum += wi * nodes[i].rank;
      }
    }
    const ref = measured[1] >= 0 ? measured : nearest;
    const w = ranked + unranked;
    if (w === 0) return { node: ref[1], dist: ref[0], rank: null, outOfTop: false, rgb: null, conf: 0 };
    const outOfTop = unranked > ranked;
    const rank = ranked > 0 ? sum / ranked : null;
    const t = Math.min(1, Math.max(0, (reach + 350 - Math.hypot(wx, wz)) / 700));
    return { node: ref[1], dist: ref[0], rank, outOfTop, rgb: outOfTop || rank == null ? UNRANKED_RGB : rankRgb(rank), conf: t * t * (3 - 2 * t) };
  }

  const pad = Math.max(sigma * 2, 1800);
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
