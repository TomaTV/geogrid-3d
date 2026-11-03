import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { TILES_URL } from './map-style.js';

const Z = 14;
const N = 2 ** Z;
let templatePromise = null;

function template() {
  templatePromise ??= fetch(TILES_URL)
    .then((r) => r.json())
    .then((m) => m.tiles[0]);
  return templatePromise;
}

function lng2x(lng) {
  return ((lng + 180) / 360) * N;
}

function lat2y(lat) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * N;
}

function x2lng(x) {
  return (x / N) * 360 - 180;
}

function y2lat(y) {
  const n = Math.PI - (2 * Math.PI * y) / N;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function tileKey(x, y) {
  return x + '-' + y;
}

export function tilesNear(lng, lat, radiusMeters) {
  const cx = lng2x(lng);
  const cy = lat2y(lat);
  const tileMeters = (40075016 * Math.cos((lat * Math.PI) / 180)) / N;
  const r = Math.ceil(radiusMeters / tileMeters);
  const out = [];
  for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++) {
    for (let y = Math.floor(cy) - r; y <= Math.floor(cy) + r; y++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) * tileMeters;
      if (d <= radiusMeters) out.push({ x, y, d });
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

function collect(tile, name, x, y, keep) {
  const layer = tile.layers[name];
  const out = [];
  if (!layer) return out;
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    if (keep && !keep(f.properties)) continue;
    out.push(f.toGeoJSON(x, y, Z));
  }
  return out;
}

export async function loadTile(x, y) {
  const url = (await template()).replace('{z}', Z).replace('{x}', x).replace('{y}', y);
  const r = await fetch(url);
  if (!r.ok) throw new Error('tile ' + r.status);
  const tile = new VectorTile(new PbfReader(await r.arrayBuffer()));
  return {
    bbox: { west: x2lng(x), east: x2lng(x + 1), north: y2lat(y), south: y2lat(y + 1) },
    buildings: collect(tile, 'building', x, y),
    green: [
      ...collect(tile, 'park', x, y),
      ...collect(tile, 'landcover', x, y, (p) => p.class === 'wood' || p.class === 'forest'),
      ...collect(tile, 'landuse', x, y, (p) => ['park', 'garden', 'cemetery', 'grass', 'recreation_ground'].includes(p.class)),
    ],
  };
}
