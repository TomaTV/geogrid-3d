import * as maplibregl from 'maplibre-gl';
import { buildStyle, overlayLayers, tileLayers, IDS } from './map-style.js';
import { gridStep, makeEstimator, rankBuildings, scanBounds } from './building-ranks.js';
import { loadTile, tileAt, tileDistance, tileKey } from './buildings.js';
import { growTrees } from './trees.js';
import { rankColor } from './rank-colors.js';

maplibregl.setWorkerUrl(new URL('maplibre/maplibre-gl-worker.mjs', document.baseURI).href);

const EMPTY = { type: 'FeatureCollection', features: [] };
const MAX_TILES = 56;
const MAX_VIEW_METERS = 12000;
const MIN_BUILDING_ZOOM = 12.6;
const NEAR = 2500;
const MID = 5000;

function pin(className, html) {
  const el = document.createElement('div');
  el.className = className;
  el.innerHTML = html;
  return el;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function haversine(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(a));
}

function ringCenter(g) {
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0];
  let x = 0;
  let y = 0;
  for (const [lng, lat] of ring) {
    x += lng;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

export function createScanMap(container, scan, { onNodeSelect, onReady, onError } = {}) {
  const nodes = scan.grid_data;
  const step = gridStep(nodes);
  const estimate = makeEstimator(nodes, step);
  const view = scanBounds(nodes, step * 0.8);
  const center = [scan.longitude, scan.latitude];
  const selfNode = nodes.find((n) => n.self)?.self;

  const map = new maplibregl.Map({
    container,
    style: buildStyle(),
    bounds: [[view.west, view.south], [view.east, view.north]],
    fitBoundsOptions: { padding: 40 },
    pitch: 0,
    maxPitch: 85,
    minZoom: 10.5,
    attributionControl: { compact: true },
    canvasContextAttributes: { antialias: true },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

  const tiles = new Map();
  const pending = new Set();
  let orbit = null;
  let hovered = null;
  let selected = null;
  let firstReady = false;
  let destroyed = false;
  let refreshTimer = null;

  const stopOrbit = () => {
    if (orbit) cancelAnimationFrame(orbit);
    orbit = null;
  };
  const startOrbit = () => {
    let last = performance.now();
    const tick = (now) => {
      map.setBearing(map.getBearing() + (now - last) * 0.004);
      last = now;
      orbit = requestAnimationFrame(tick);
    };
    orbit = requestAnimationFrame(tick);
  };

  function bucketFor(distance) {
    const k = map.getZoom() >= 15.5 ? 2 : 1;
    return distance > MID * k ? 2 : distance > NEAR * k ? 1 : 0;
  }

  function build(data, bucket) {
    const { west, east, north, south } = data.bbox;
    const minHeight = [0, 8, 20][bucket];
    const own = data.buildings.filter((f) => {
      const [lng, lat] = ringCenter(f.geometry);
      return lng >= west && lng < east && lat <= north && lat > south && (f.properties.render_height ?? 8) >= minHeight;
    });
    const trees = bucket > 0 ? { trunks: { features: [] }, canopy: { features: [] } } : growTrees(data.green, data.bbox);
    return {
      buildings: { type: 'FeatureCollection', features: rankBuildings(own, estimate) },
      trees: { type: 'FeatureCollection', features: [...trees.trunks.features, ...trees.canopy.features] },
    };
  }

  function addTile(x, y, data, distance) {
    const key = tileKey(x, y);
    if (destroyed || tiles.has(key)) return;
    const bucket = bucketFor(distance);
    const built = build(data, bucket);
    map.addSource('buildings-' + key, { type: 'geojson', data: built.buildings });
    map.addSource('trees-' + key, { type: 'geojson', data: built.trees });
    for (const l of tileLayers(key)) map.addLayer(l, IDS.ring);
    tiles.set(key, { x, y, data, bucket });
  }

  function relod(c) {
    for (const [key, t] of tiles) {
      const bucket = bucketFor(tileDistance(t.x, t.y, c.lng, c.lat));
      if (bucket === t.bucket) continue;
      const built = build(t.data, bucket);
      map.getSource('buildings-' + key)?.setData(built.buildings);
      map.getSource('trees-' + key)?.setData(built.trees);
      t.bucket = bucket;
    }
  }

  function dropTile(key) {
    for (const l of tileLayers(key)) if (map.getLayer(l.id)) map.removeLayer(l.id);
    for (const s of ['buildings-' + key, 'trees-' + key]) if (map.getSource(s)) map.removeSource(s);
    tiles.delete(key);
  }

  function visibleTiles() {
    const c = map.getCenter();
    const canvas = map.getCanvas();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const found = new Map();
    for (let i = 0; i <= 8; i++) {
      for (let j = 0; j <= 9; j++) {
        const p = map.unproject([(i / 8) * w, h * (0.1 + (j / 9) * 0.9)]);
        if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
        if (haversine(c.lat, c.lng, p.lat, p.lng) > MAX_VIEW_METERS) continue;
        const t = tileAt(p.lng, p.lat);
        found.set(tileKey(t.x, t.y), { ...t, d: tileDistance(t.x, t.y, c.lng, c.lat) });
      }
    }
    const here = tileAt(c.lng, c.lat);
    found.set(tileKey(here.x, here.y), { ...here, d: 0 });
    return [...found.values()].sort((a, b) => a.d - b.d);
  }

  function refresh() {
    if (destroyed || map.getZoom() < MIN_BUILDING_ZOOM) return;
    const c = map.getCenter();
    relod(c);
    const wanted = visibleTiles().slice(0, MAX_TILES);
    for (const t of wanted) {
      const key = tileKey(t.x, t.y);
      if (tiles.has(key) || pending.has(key)) continue;
      pending.add(key);
      loadTile(t.x, t.y)
        .then((data) => {
          pending.delete(key);
          addTile(t.x, t.y, data, t.d);
          if (!firstReady) {
            firstReady = true;
            onReady?.({ tiles: tiles.size });
            map.easeTo({ pitch: 70, bearing: -28, zoom: 14.4, center, duration: 3000, easing: (v) => 1 - Math.pow(1 - v, 4) });
            map.once('moveend', () => {
              for (const ev of ['mousedown', 'wheel', 'touchstart', 'keydown']) map.once(ev, stopOrbit);
              startOrbit();
            });
          }
        })
        .catch((err) => {
          pending.delete(key);
          if (!firstReady) onError?.(err);
        });
    }
    if (tiles.size > MAX_TILES + 12) {
      const far = [...tiles.entries()]
        .map(([key, t]) => [key, tileDistance(t.x, t.y, c.lng, c.lat)])
        .sort((a, b) => b[1] - a[1])
        .slice(0, tiles.size - MAX_TILES);
      for (const [key] of far) dropTile(key);
    }
  }

  const scheduleRefresh = () => {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refresh();
    }, 350);
  };

  const buildingLayerIds = () => [...tiles.keys()].map((k) => 'buildings-' + k).filter((id) => map.getLayer(id));

  function pick(e) {
    const ids = buildingLayerIds();
    if (!ids.length) return null;
    const f = map.queryRenderedFeatures(e.point, { layers: ids })[0];
    if (!f) return null;
    const p = f.properties;
    const { lat, lng } = e.lngLat;
    return {
      index: p.node,
      node: nodes[p.node],
      dist: Math.round(haversine(lat, lng, nodes[p.node].lat, nodes[p.node].lng)),
      businessDist: selfNode ? Math.round(haversine(lat, lng, selfNode.lat, selfNode.lng)) : null,
      est: p.est >= 0 ? p.est : null,
      height: p.height,
    };
  }

  map.once('load', () => {
    for (const id of Object.values(IDS)) map.addSource(id, { type: 'geojson', data: EMPTY });
    for (const l of overlayLayers()) map.addLayer(l);
    map.getSource(IDS.ring).setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: center }, properties: {} }] });
    map.getSource(IDS.nodes).setData({
      type: 'FeatureCollection',
      features: nodes.map((n, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [n.lng, n.lat] }, properties: { i, color: rankColor(n.rank) } })),
    });
    new maplibregl.Marker({ element: pin('scan-center', '<span>Scan center</span>'), anchor: 'center' }).setLngLat(center).addTo(map);
    if (selfNode) {
      new maplibregl.Marker({ element: pin('scan-business', '<span>' + escapeHtml(scan.target_name) + '</span><i></i>'), anchor: 'bottom' })
        .setLngLat([selfNode.lng, selfNode.lat])
        .addTo(map);
    }
    refresh();
  });

  map.on('moveend', scheduleRefresh);

  let moveQueued = false;
  map.on("mousemove", (e) => {
    if (moveQueued) return;
    moveQueued = true;
    requestAnimationFrame(() => {
      moveQueued = false;
      if (destroyed) return;
      const hit = pick(e);
      map.getCanvas().style.cursor = hit ? "pointer" : "";
      if (!hit && hovered === null) return;
      hovered = hit ? hit.index : null;
      onNodeSelect?.(hit ? { ...hit, hover: true } : selected);
    });
  });
  map.on("click", (e) => {
    const hit = pick(e);
    if (!hit) return;
    selected = { ...hit, hover: false };
    onNodeSelect?.(selected);
  });

  return {
    map,
    destroy: () => {
      destroyed = true;
      clearTimeout(refreshTimer);
      stopOrbit();
      map.remove();
    },
  };
}
