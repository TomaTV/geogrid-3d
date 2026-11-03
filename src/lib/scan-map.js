import * as maplibregl from 'maplibre-gl';
import { buildStyle, overlayLayers, IDS, SUN_AZIMUTH } from './map-style.js';
import { createDeck, tileDeckLayers } from './deck-layers.js';
import { gridStep, makeEstimator, rankBuildings, scanBounds } from './building-ranks.js';
import { loadTile, tileAt, tileDistance, tileKey } from './buildings.js';
import { growTrees } from './trees.js';
import { rankColor } from './rank-colors.js';

maplibregl.setWorkerUrl(new URL('maplibre/maplibre-gl-worker.mjs', document.baseURI).href);

const EMPTY = { type: 'FeatureCollection', features: [] };
const MAX_TILES = 36;
const MAX_VIEW_METERS = 7500;
const MIN_BUILDING_ZOOM = 12.6;
const NEAR = 2500;
const FAR = 7000;

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

  const overlay = createDeck();
  map.addControl(overlay);
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
    return distance > FAR * k ? 2 : distance > NEAR * k ? 1 : 0;
  }

  function build(data, bucket) {
    const { west, east, north, south } = data.bbox;
    if (bucket === 2) return { buildings: { type: "FeatureCollection", features: [] }, trees: [] };
    const minHeight = [0, 6][bucket];
    const own = data.buildings.filter((f) => {
      const [lng, lat] = ringCenter(f.geometry);
      return (
        lng >= west && lng < east && lat <= north && lat > south &&
        (f.properties.render_min_height ?? 0) === 0 &&
        (f.properties.render_height ?? 8) >= minHeight
      );
    });
    return {
      buildings: { type: "FeatureCollection", features: rankBuildings(own, estimate) },
      trees: bucket > 0 ? [] : growTrees(data.green, data.bbox).points,
    };
  }

  const addQueue = [];
  let draining = false;
  function queueTile(x, y, data, distance) {
    addQueue.push([x, y, data, distance]);
    if (draining) return;
    draining = true;
    const drain = () => {
      const job = addQueue.shift();
      if (!job || destroyed) {
        draining = false;
        return;
      }
      addTile(...job);
      setTimeout(drain, 140);
    };
    drain();
  }

  function renderDeck() {
    overlay.setProps({ layers: [...tiles.values()].flatMap((t) => t.layers) });
  }

  function addTile(x, y, data, distance) {
    const key = tileKey(x, y);
    if (destroyed || tiles.has(key)) return;
    const bucket = bucketFor(distance);
    tiles.set(key, { x, y, data, bucket, layers: tileDeckLayers(key, build(data, bucket)) });
    renderDeck();
  }

  function relod(c) {
    let changed = false;
    for (const [key, t] of tiles) {
      const bucket = bucketFor(tileDistance(t.x, t.y, c.lng, c.lat));
      if (bucket === t.bucket) continue;
      t.layers = tileDeckLayers(key, build(t.data, bucket));
      t.bucket = bucket;
      changed = true;
    }
    if (changed) renderDeck();
  }

  function dropTile(key) {
    tiles.delete(key);
    renderDeck();
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
          queueTile(t.x, t.y, data, t.d);
          if (!firstReady) {
            firstReady = true;
            onReady?.({ tiles: tiles.size });
            map.easeTo({ pitch: 78, bearing: -28, zoom: 14.2, center, duration: 3000, easing: (v) => 1 - Math.pow(1 - v, 4) });
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

  function footprintAnchor(object, coordinate) {
    const g = object.geometry;
    const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
    let best = null;
    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        const d = haversine(coordinate[1], coordinate[0], lat, lng);
        if (!best || d < best.d) best = { d, lng, lat };
      }
    }
    return best ? [best.lng, best.lat] : coordinate;
  }

  function pick(e) {
    if (!tiles.size) return null;
    const info = overlay.pickObject({ x: e.point.x, y: e.point.y, radius: 2 });
    if (!info || !info.object || info.object.properties?.node === undefined) return null;
    const p = info.object.properties;
    const [lng, lat] = info.coordinate ? footprintAnchor(info.object, info.coordinate) : [p.clng, p.clat];
    const est = estimate(lat, lng);
    const n = nodes[est.node];
    return {
      index: est.node,
      node: n,
      dist: Math.round(est.dist),
      businessDist: selfNode ? Math.round(haversine(lat, lng, selfNode.lat, selfNode.lng)) : null,
      est: est.rank != null && est.conf >= 0.5 ? Math.round(est.rank * 10) / 10 : null,
      height: p.height,
      from: [lng, lat],
    };
  }

  function showLink(hit) {
    const src = map.getSource(IDS.link);
    if (!src) return;
    src.setData(
      hit
        ? { type: 'Feature', geometry: { type: 'LineString', coordinates: [hit.from, [hit.node.lng, hit.node.lat]] }, properties: {} }
        : EMPTY,
    );
  }

  const sun = document.createElement('div');
  sun.className = 'scan-sun';
  container.appendChild(sun);

  function updateSun() {
    const pitch = map.getPitch();
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (pitch < 62 || !w) {
      sun.style.opacity = '0';
      return;
    }
    const delta = ((SUN_AZIMUTH - map.getBearing() + 540) % 360) - 180;
    const horizon = h / 2 - (h / 2) * (Math.tan(((90 - pitch) * Math.PI) / 180) / Math.tan((36.87 / 2) * (Math.PI / 180)));
    const x = w / 2 + (delta / 28) * (w / 2);
    sun.style.left = x - 110 + 'px';
    sun.style.top = Math.max(-40, horizon - 0.1 * h) - 110 + 'px';
    sun.style.opacity = String(Math.max(0, Math.min(1, 1.6 - Math.abs(delta) / 30)));
  }
  map.on('render', updateSun);

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
      showLink(hit ?? selected);
      onNodeSelect?.(hit ? { ...hit, hover: true } : selected);
    });
  });
  map.on("click", (e) => {
    const hit = pick(e);
    if (!hit) return;
    selected = { ...hit, hover: false };
    showLink(selected);
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
