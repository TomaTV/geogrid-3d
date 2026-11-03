import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import earcut from 'earcut';

const C = 40075016.686;
const RASTER = 512;

const ROADS = {
  motorway: [15, 7], trunk: [13, 6], primary: [12, 5], secondary: [10, 4], tertiary: [8.5, 3],
  minor: [6.5, 2], service: [3.6, 1], path: [2.2, 0], pedestrian: [3.5, 1],
};
const STREET_TREES = { primary: 0.8, secondary: 0.7, tertiary: 0.5, minor: 0.16 };
const GREEN = {
  park: [0.1, 0.2, 0.075], wood: [0.05, 0.12, 0.05], forest: [0.05, 0.12, 0.05], grass: [0.13, 0.23, 0.085],
  garden: [0.11, 0.21, 0.08], cemetery: [0.1, 0.17, 0.09], pitch: [0.12, 0.26, 0.1], recreation_ground: [0.12, 0.22, 0.08], farmland: [0.2, 0.22, 0.1],
};

function hash(a, b = 0) {
  let t = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  t = Math.imul(t ^ (t >>> 13), 1274126177);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}

function clipRing(ring, E) {
  const planes = [
    (p) => p[0] >= 0, (p) => p[0] <= E, (p) => p[1] >= 0, (p) => p[1] <= E,
  ];
  const cut = [
    (a, b) => { const t = -a[0] / (b[0] - a[0]); return [0, a[1] + (b[1] - a[1]) * t]; },
    (a, b) => { const t = (E - a[0]) / (b[0] - a[0]); return [E, a[1] + (b[1] - a[1]) * t]; },
    (a, b) => { const t = -a[1] / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, 0]; },
    (a, b) => { const t = (E - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, E]; },
  ];
  let out = ring;
  for (let k = 0; k < 4 && out.length; k++) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i];
      const b = input[(i + 1) % input.length];
      const ia = planes[k](a);
      const ib = planes[k](b);
      if (ia) out.push(a);
      if (ia !== ib) out.push(cut[k](a, b));
    }
  }
  return out;
}

function polygonsOf(feature, E) {
  const rings = feature
    .loadGeometry()
    .map((r) => {
      const pts = r.map((p) => [p.x, p.y]);
      const f = pts[0];
      const l = pts[pts.length - 1];
      if (pts.length > 1 && f[0] === l[0] && f[1] === l[1]) pts.pop();
      return pts;
    })
    .filter((r) => r.length >= 3);
  if (!rings.length) return [];
  const s0 = Math.sign(ringArea(rings[0]));
  const polys = [];
  let cur = null;
  for (const r of rings) {
    const a = ringArea(r);
    if (a === 0) continue;
    const oriented = s0 > 0 ? r.slice().reverse() : r;
    const clipped = clipRing(oriented, E);
    if (Math.sign(a) === s0) {
      cur = clipped.length >= 3 ? [clipped] : null;
      if (cur) polys.push(cur);
    } else if (cur && clipped.length >= 3) {
      cur.push(clipped);
    }
  }
  return polys;
}

function triangulate(poly) {
  const flat = [];
  const holes = [];
  for (let i = 0; i < poly.length; i++) {
    if (i) holes.push(flat.length / 2);
    for (const p of poly[i]) flat.push(p[0], p[1]);
  }
  return { flat, tris: earcut(flat, holes) };
}

function insetRing(ring, d) {
  const n = ring.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = ring[(i + n - 1) % n];
    const c = ring[i];
    const q = ring[(i + 1) % n];
    let ax = c[0] - p[0];
    let az = c[1] - p[1];
    let bx = q[0] - c[0];
    let bz = q[1] - c[1];
    const la = Math.hypot(ax, az) || 1;
    const lb = Math.hypot(bx, bz) || 1;
    ax /= la; az /= la; bx /= lb; bz /= lb;
    // Exterior rings have negative shoelace area here: (dz, -dx) points inside.
    const nx = az + bz;
    const nz = -ax - bx;
    const nl = Math.hypot(nx, nz) || 1;
    const cos = (nx / nl) * az + (nz / nl) * -ax;
    const m = Math.min(d / Math.max(cos, 0.35), d * 2.4);
    out.push([c[0] + (nx / nl) * m * -1, c[1] + (nz / nl) * m * -1]);
  }
  return out;
}

function validInset(ring, inset) {
  const a0 = ringArea(ring);
  const a1 = ringArea(inset);
  if (Math.sign(a0) !== Math.sign(a1) || Math.abs(a1) < Math.abs(a0) * 0.3 || Math.abs(a1) > Math.abs(a0)) return false;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dot = (ring[j][0] - ring[i][0]) * (inset[j][0] - inset[i][0]) + (ring[j][1] - ring[i][1]) * (inset[j][1] - inset[i][1]);
    if (dot <= 0) return false;
  }
  return true;
}

class Raster {
  constructor(E) {
    this.cells = new Uint8Array(RASTER * RASTER);
    this.s = RASTER / E;
  }
  fill(ring, bit) {
    const { cells, s } = this;
    let minY = RASTER;
    let maxY = 0;
    for (const p of ring) {
      minY = Math.min(minY, p[1] * s);
      maxY = Math.max(maxY, p[1] * s);
    }
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(RASTER - 1, Math.ceil(maxY)); y++) {
      const yy = (y + 0.5) / s;
      const xs = [];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[j];
        const b = ring[i];
        if (a[1] > yy !== b[1] > yy) xs.push(a[0] + ((yy - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, Math.floor(xs[k] * s));
        const x1 = Math.min(RASTER - 1, Math.ceil(xs[k + 1] * s));
        for (let x = x0; x <= x1; x++) cells[y * RASTER + x] |= bit;
      }
    }
  }
  line(a, b, radius, bit) {
    const { cells, s } = this;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * s;
    const steps = Math.max(1, Math.ceil(len));
    const r = Math.ceil(radius * s);
    for (let t = 0; t <= steps; t++) {
      const cx = Math.round((a[0] + ((b[0] - a[0]) * t) / steps) * s);
      const cy = Math.round((a[1] + ((b[1] - a[1]) * t) / steps) * s);
      for (let y = Math.max(0, cy - r); y <= Math.min(RASTER - 1, cy + r); y++) {
        for (let x = Math.max(0, cx - r); x <= Math.min(RASTER - 1, cx + r); x++) cells[y * RASTER + x] |= bit;
      }
    }
  }
  at(x, y) {
    const cx = Math.floor(x * this.s);
    const cy = Math.floor(y * this.s);
    if (cx < 0 || cy < 0 || cx >= RASTER || cy >= RASTER) return 255;
    return this.cells[cy * RASTER + cx];
  }
}

function buildBuildings(layer, E, unit, ox, oz, job, raster) {
  const pos = [];
  const nor = [];
  const wall = [];
  const meta = [];
  const idx = [];
  const starts = [];
  const idxStarts = [];
  const heights = [];
  const center = [];
  const feats = [];
  const known = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.type !== 3 || f.properties.hide_3d === true) continue;
    const h = Number(f.properties.render_height ?? 0);
    if (h > 6) known.push(h);
    feats.push(f);
  }
  known.sort((a, b) => a - b);
  const median = known.length > 12 ? known[known.length >> 1] : 0;

  for (let fi = 0; fi < feats.length; fi++) {
    const f = feats[fi];
    let top = Number(f.properties.render_height ?? 5);
    const base = Number(f.properties.render_min_height ?? 0);
    for (const poly of polygonsOf(f, E)) {
      const outer = poly[0];
      const area = Math.abs(ringArea(outer)) * unit * unit;
      if (area < 18) continue;
      let h = top;
      const r0 = hash(Math.round(outer[0][0]), Math.round(outer[0][1]));
      if (h <= 6 && base === 0 && median >= 11 && area > 55) h = median * (0.82 + r0 * 0.3);
      if (h <= base) continue;
      raster.fill(outer, 1);

      const cx = outer.reduce((s, p) => s + p[0], 0) / outer.length;
      const cz = outer.reduce((s, p) => s + p[1], 0) / outer.length;
      const wx = ox + cx * unit;
      const wz = oz + cz * unit;
      const delay = job.radial ? Math.hypot(wx, wz) * 0.00032 + r0 * 0.45 : r0 * 0.7;
      const seed = hash(Math.round(h * 10), Math.round(base * 10));

      starts.push(pos.length / 3);
      idxStarts.push(idx.length);
      heights.push(h);

      const touchesBorder = poly.some((r) => r.some((p) => p[0] <= 0 || p[1] <= 0 || p[0] >= E || p[1] >= E));
      const roofDepth = 3.2;
      let eave = h;
      let inset = null;
      if (!touchesBorder && poly.length === 1 && base === 0 && h >= 9 && area >= 160 && area <= 7000 && outer.length <= 80) {
        const candidate = insetRing(outer, 2.3 / unit);
        if (validInset(outer, candidate)) {
          inset = candidate;
          eave = h - roofDepth;
        }
      }

      for (const ring of poly) {
        let along = 0;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          const onEdge =
            (a[0] <= 0 && b[0] <= 0) || (a[1] <= 0 && b[1] <= 0) || (a[0] >= E && b[0] >= E) || (a[1] >= E && b[1] >= E);
          const dx = (b[0] - a[0]) * unit;
          const dz = (b[1] - a[1]) * unit;
          const len = Math.hypot(dx, dz);
          if (onEdge || len < 0.01) {
            along += len;
            continue;
          }
          const nx = -dz / len;
          const nz = dx / len;
          const v = pos.length / 3;
          const ax = a[0] * unit;
          const az = a[1] * unit;
          const bx = b[0] * unit;
          const bz = b[1] * unit;
          pos.push(ax, base, az, bx, base, bz, bx, eave, bz, ax, eave, az);
          for (let k = 0; k < 4; k++) {
            nor.push(nx, 0, nz);
            meta.push(0, seed, h, delay);
          }
          wall.push(along, base, along + len, base, along + len, eave, along, eave);
          idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
          along += len;
        }
      }

      if (inset) {
        const n = outer.length;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const a = outer[i];
          const b = outer[j];
          const c = inset[j];
          const d = inset[i];
          const p = [
            [a[0] * unit, eave, a[1] * unit],
            [b[0] * unit, eave, b[1] * unit],
            [c[0] * unit, h, c[1] * unit],
            [d[0] * unit, h, d[1] * unit],
          ];
          const ux = p[1][0] - p[0][0];
          const uz = p[1][2] - p[0][2];
          const vx = p[3][0] - p[0][0];
          const vy = p[3][1] - p[0][1];
          const vz = p[3][2] - p[0][2];
          let nx = -uz * vy;
          let ny = uz * vx - ux * vz;
          let nz = ux * vy;
          const nl = Math.hypot(nx, ny, nz) || 1;
          nx /= nl; ny /= nl; nz /= nl;
          const v = pos.length / 3;
          for (const q of p) {
            pos.push(q[0], q[1], q[2]);
            nor.push(nx, ny, nz);
            wall.push(q[0], q[2]);
            meta.push(1, seed, h, delay);
          }
          if (ny >= 0) idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
          else idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
        }
      }

      const { flat, tris } = triangulate(inset ? [inset] : poly);
      const v0 = pos.length / 3;
      for (let i = 0; i < flat.length; i += 2) {
        const x = flat[i] * unit;
        const z = flat[i + 1] * unit;
        pos.push(x, h, z);
        nor.push(0, 1, 0);
        wall.push(x, z);
        meta.push(1, seed, h, delay);
      }
      for (let i = 0; i < tris.length; i += 3) {
        const a = tris[i];
        const b = tris[i + 1];
        const c = tris[i + 2];
        const cross = (flat[b * 2 + 1] - flat[a * 2 + 1]) * (flat[c * 2] - flat[a * 2]) - (flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1]);
        if (cross >= 0) idx.push(v0 + a, v0 + b, v0 + c);
        else idx.push(v0 + a, v0 + c, v0 + b);
      }
      while (center.length / 2 < pos.length / 3) center.push(cx * unit, cz * unit);
    }
  }
  if (!starts.length) return null;
  starts.push(pos.length / 3);
  idxStarts.push(idx.length);
  return {
    pos: new Float32Array(pos), nor: new Float32Array(nor), wall: new Float32Array(wall), meta: new Float32Array(meta), center: new Float32Array(center),
    idx: new Uint32Array(idx), starts: new Uint32Array(starts), idxStarts: new Uint32Array(idxStarts), heights: new Float32Array(heights),
  };
}

function fillMesh(polys, unit, color) {
  const pos = [];
  const col = [];
  const idx = [];
  for (const { poly, rgb } of polys) {
    const { flat, tris } = triangulate(poly);
    const v0 = pos.length / 3;
    for (let i = 0; i < flat.length; i += 2) {
      pos.push(flat[i] * unit, 0, flat[i + 1] * unit);
      if (color) col.push(rgb[0], rgb[1], rgb[2]);
    }
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i];
      const b = tris[i + 1];
      const c = tris[i + 2];
      const cross = (flat[b * 2 + 1] - flat[a * 2 + 1]) * (flat[c * 2] - flat[a * 2]) - (flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1]);
      if (cross >= 0) idx.push(v0 + a, v0 + b, v0 + c);
      else idx.push(v0 + a, v0 + c, v0 + b);
    }
  }
  if (!idx.length) return null;
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  return { pos: new Float32Array(pos), nor, col: color ? new Float32Array(col) : null, idx: new Uint32Array(idx) };
}

function buildRoads(layer, E, unit, raster) {
  const lines = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.type !== 2 || f.properties.brunnel === 'tunnel') continue;
    const def = ROADS[f.properties.class];
    if (!def) continue;
    const width = f.properties.ramp ? def[0] * 0.6 : def[0];
    for (const line of f.loadGeometry()) {
      lines.push({ pts: line.map((p) => [p.x, p.y]), width, order: def[1], cls: f.properties.class });
    }
  }
  lines.sort((a, b) => a.order - b.order);
  const pos = [];
  const road = [];
  const idx = [];
  for (const l of lines) {
    const hw = l.width / 2 / unit;
    const pts = l.pts;
    if (pts.length < 2) continue;
    let along = 0;
    const v0 = pos.length / 3;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[Math.max(0, i - 1)];
      const c = pts[i];
      const q = pts[Math.min(pts.length - 1, i + 1)];
      let ax = c[0] - p[0];
      let az = c[1] - p[1];
      let bx = q[0] - c[0];
      let bz = q[1] - c[1];
      const la = Math.hypot(ax, az) || 1;
      const lb = Math.hypot(bx, bz) || 1;
      ax /= la; az /= la; bx /= lb; bz /= lb;
      if (i === 0) { ax = bx; az = bz; }
      if (i === pts.length - 1) { bx = ax; bz = az; }
      let nx = -(az + bz);
      let nz = ax + bx;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl; nz /= nl;
      const miter = Math.min(1 / Math.max(nx * -az + nz * ax, 0.5), 2);
      const lx = nx * hw * miter;
      const lz = nz * hw * miter;
      if (i > 0) along += Math.hypot(c[0] - p[0], c[1] - p[1]) * unit;
      pos.push((c[0] + lx) * unit, 0, (c[1] + lz) * unit, (c[0] - lx) * unit, 0, (c[1] - lz) * unit);
      road.push(-1, along, l.width, 1, along, l.width);
      if (i > 0) {
        const v = v0 + (i - 1) * 2;
        idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
      if (i > 0 && raster) raster.line(p, c, Math.max(hw, 3 / unit), 4);
    }
  }
  if (!idx.length) return { mesh: null, lines };
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  return { mesh: { pos: new Float32Array(pos), nor, road: new Float32Array(road), idx: new Uint32Array(idx) }, lines };
}

function noise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function plantTrees(greens, lines, E, unit, ox, oz, raster, job) {
  const inst = [];
  const tree = [];
  const max = 3000;
  const add = (ex, ez, big, tone) => {
    if (inst.length / 4 >= max) return;
    const n = hash(Math.round(ex * 3), Math.round(ez * 3));
    const r = (big ? 4.4 : 3.2) + n * 2.4;
    const h = r * (1.9 + hash(Math.round(ez), Math.round(ex)) * 0.8);
    const wx = ox + ex * unit;
    const wz = oz + ez * unit;
    inst.push(ex * unit, ez * unit, r, h);
    tree.push(tone, (job.radial ? Math.hypot(wx, wz) * 0.00032 : 0) + n * 0.6);
  };
  for (const { poly, dense } of greens) {
    const ring = poly[0];
    let x0 = E;
    let x1 = 0;
    let y0 = E;
    let y1 = 0;
    for (const p of ring) {
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    }
    const step = (dense ? 11 : 16) / unit;
    for (let x = x0; x < x1; x += step) {
      for (let y = y0; y < y1; y += step) {
        const j1 = hash(Math.round(x), Math.round(y));
        const j2 = hash(Math.round(y), Math.round(x));
        const ex = x + (j1 - 0.5) * step * 0.9;
        const ez = y + (j2 - 0.5) * step * 0.9;
        if (raster.at(ex, ez) !== 2) continue;
        if (!dense && noise((ox + ex * unit) / 70, (oz + ez * unit) / 70) < 0.46) continue;
        add(ex, ez, true, j1);
      }
    }
  }
  for (const l of lines) {
    const p = STREET_TREES[l.cls];
    if (!p) continue;
    const first = l.pts[0];
    if (hash(first[0], first[1]) > p) continue;
    const off = (l.width / 2 + 2.8) / unit;
    const step = 15 / unit;
    for (let i = 1; i < l.pts.length; i++) {
      const a = l.pts[i - 1];
      const b = l.pts[i];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!len) continue;
      const tx = (b[0] - a[0]) / len;
      const tz = (b[1] - a[1]) / len;
      for (let d = step / 2; d < len; d += step) {
        for (const side of [-1, 1]) {
          const ex = a[0] + tx * d - tz * off * side;
          const ez = a[1] + tz * d + tx * off * side;
          const occ = raster.at(ex, ez);
          if (occ & 1 || occ === 255) continue;
          add(ex, ez, false, hash(Math.round(ex), Math.round(ez)));
        }
      }
    }
  }
  if (!inst.length) return null;
  return { inst: new Float32Array(inst), tree: new Float32Array(tree) };
}

async function build(job) {
  const url = job.template.replace('{z}', job.z).replace('{x}', job.x).replace('{y}', job.y);
  const res = await fetch(url);
  if (!res.ok) throw new Error('tile ' + res.status);
  const tile = new VectorTile(new PbfReader(await res.arrayBuffer()));
  const n = 2 ** job.z;
  const tileMeters = (C * job.k) / n;
  const ox = (job.x / n - job.mx0) * C * job.k;
  const oz = (job.y / n - job.my0) * C * job.k;
  const E = tile.layers.transportation?.extent ?? tile.layers.water?.extent ?? 4096;
  const unit = tileMeters / E;
  const raster = new Raster(E);

  const water = [];
  if (tile.layers.water) {
    const l = tile.layers.water;
    for (let i = 0; i < l.length; i++) {
      const f = l.feature(i);
      if (f.type !== 3 || f.properties.brunnel === 'tunnel') continue;
      for (const poly of polygonsOf(f, E)) {
        water.push({ poly });
        raster.fill(poly[0], 8);
      }
    }
  }

  const greens = [];
  const greensDraw = [];
  const addGreen = (layer, classOf) => {
    if (!layer) return;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.type !== 3) continue;
      const cls = classOf(f.properties);
      const rgb = GREEN[cls];
      if (!rgb) continue;
      for (const poly of polygonsOf(f, E)) {
        greensDraw.push({ poly, rgb });
        if (cls !== 'farmland' && cls !== 'pitch' && cls !== 'cemetery') {
          greens.push({ poly, dense: cls === 'wood' || cls === 'forest' });
        }
      }
    }
  };
  addGreen(tile.layers.landcover, (p) => (p.class === 'wood' || p.class === 'grass' || p.class === 'farmland' ? p.class : p.subclass));
  addGreen(tile.layers.landuse, (p) => p.class);
  addGreen(tile.layers.park, () => 'park');

  const near = job.z >= 14;
  if (near) for (const g of greens) raster.fill(g.poly[0], 2);

  const roadData = tile.layers.transportation ? buildRoads(tile.layers.transportation, E, unit, near ? raster : null) : { mesh: null, lines: [] };
  const buildings = near && tile.layers.building ? buildBuildings(tile.layers.building, E, unit, ox, oz, job, raster) : null;
  const trees = near ? plantTrees(greens, roadData.lines, E, unit, ox, oz, raster, job) : null;

  return {
    origin: [ox, oz],
    size: tileMeters,
    water: fillMesh(water, unit, false),
    green: fillMesh(greensDraw, unit, true),
    roads: roadData.mesh,
    buildings,
    trees,
  };
}

function transferables(result) {
  const out = [];
  for (const part of [result.water, result.green, result.roads, result.buildings, result.trees]) {
    if (!part) continue;
    for (const v of Object.values(part)) if (v && v.buffer) out.push(v.buffer);
  }
  return out;
}

self.onmessage = async ({ data }) => {
  try {
    const result = await build(data);
    self.postMessage({ id: data.id, result }, transferables(result));
  } catch (e) {
    self.postMessage({ id: data.id, error: String(e.message || e) });
  }
};
