import * as maplibregl from 'maplibre-gl';
import { buildStyle, overlayLayers, tileLayers, IDS } from './map-style.js';
import { gridStep, makeEstimator, rankBuildings, scanBounds } from './building-ranks.js';
import { loadTile, tileKey, tilesNear } from './buildings.js';
import { growTrees } from './trees.js';
import { rankColor } from './rank-colors.js';

maplibregl.setWorkerUrl(new URL('maplibre/maplibre-gl-worker.mjs', document.baseURI).href);

const EMPTY = { type: 'FeatureCollection', features: [] };
const LOAD_RADIUS = 3000;
const KEEP_RADIUS = 5500;
const MIN_BUILDING_ZOOM = 12.6;

function pin(className, html) {
  const el = document.createElement('div');
  el.className = className;
  el.innerHTML = html;
  return el;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
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

  function addTile(x, y, data) {
    const key = tileKey(x, y);
    if (destroyed || tiles.has(key)) return;
    const buildings = rankBuildings(data.buildings, estimate);
    const trees = growTrees(data.green, data.bbox);
    map.addSource('buildings-' + key, { type: 'geojson', data: { type: 'FeatureCollection', features: buildings } });
    map.addSource('trees-' + key, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [...trees.trunks.features, ...trees.canopy.features] },
    });
    for (const l of tileLayers(key)) map.addLayer(l, IDS.ring);
    tiles.set(key, { x, y });
  }

  function dropTile(key) {
    for (const l of tileLayers(key)) if (map.getLayer(l.id)) map.removeLayer(l.id);
    for (const s of ['buildings-' + key, 'trees-' + key]) if (map.getSource(s)) map.removeSource(s);
    tiles.delete(key);
  }

  function refresh() {
    if (destroyed || map.getZoom() < MIN_BUILDING_ZOOM) return;
    const c = map.getCenter();
    const wanted = tilesNear(c.lng, c.lat, LOAD_RADIUS);
    const keep = new Set(tilesNear(c.lng, c.lat, KEEP_RADIUS).map((t) => tileKey(t.x, t.y)));
    for (const key of [...tiles.keys()]) if (!keep.has(key)) dropTile(key);
    const todo = wanted.filter((t) => !tiles.has(tileKey(t.x, t.y)) && !pending.has(tileKey(t.x, t.y)));
    for (const t of todo) {
      const key = tileKey(t.x, t.y);
      pending.add(key);
      loadTile(t.x, t.y)
        .then((data) => {
          pending.delete(key);
          addTile(t.x, t.y, data);
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
  }

  const buildingLayerIds = () => [...tiles.keys()].map((k) => 'buildings-' + k).filter((id) => map.getLayer(id));

  function pick(point) {
    const ids = buildingLayerIds();
    if (!ids.length) return null;
    const f = map.queryRenderedFeatures(point, { layers: ids })[0];
    if (!f) return null;
    const p = f.properties;
    return {
      index: p.node,
      node: nodes[p.node],
      dist: p.dist,
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

  map.on('moveend', refresh);

  map.on('mousemove', (e) => {
    const hit = pick(e.point);
    map.getCanvas().style.cursor = hit ? 'pointer' : '';
    const idx = hit ? hit.index : null;
    if (idx === hovered) return;
    hovered = idx;
    onNodeSelect?.(hit ? { ...hit, hover: true } : selected);
  });
  map.on('click', (e) => {
    const hit = pick(e.point);
    if (!hit) return;
    selected = { ...hit, hover: false };
    onNodeSelect?.(selected);
  });

  return {
    map,
    destroy: () => {
      destroyed = true;
      stopOrbit();
      map.remove();
    },
  };
}
