export const TILES_URL = 'https://tiles.openfreemap.org/planet';

export function buildStyle() {
  return {
    version: 8,
    name: 'geogrid-3d-dusk',
    light: { anchor: 'map', color: '#f4f7ff', intensity: 0.6, position: [1.25, 235, 50] },
    sky: {
      'sky-color': '#24456f',
      'horizon-color': '#9fb4cf',
      'fog-color': '#33465f',
      'fog-ground-blend': 0.75,
      'horizon-fog-blend': 0.85,
      'sky-horizon-blend': 0.75,
      'atmosphere-blend': 0.9,
    },
    sources: {
      omt: { type: 'vector', url: TILES_URL },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#1c2633' } },
      {
        id: 'landcover',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        paint: { 'fill-color': ['match', ['get', 'class'], ['wood', 'forest'], '#16301f', ['grass', 'farmland'], '#1b3324', '#172019'] },
      },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#1b3626' } },
      {
        id: 'landuse-green',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landuse',
        filter: ['in', 'class', 'park', 'garden', 'cemetery', 'grass', 'recreation_ground'],
        paint: { 'fill-color': '#1b3626' },
      },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#12304d' } },
      {
        id: 'roads-minor',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'minor', 'service', 'tertiary', 'secondary', 'path', 'pedestrian'],
        paint: { 'line-color': '#323b47', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.6, 17, 5] },
      },
      {
        id: 'roads-major',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'motorway', 'trunk', 'primary'],
        paint: { 'line-color': '#4a5666', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 17, 9] },
      },
    ],
  };
}

export const IDS = {
  ring: 'scan-ring',
  nodes: 'scan-nodes',
};

export function overlayLayers() {
  return [
    {
      id: IDS.ring,
      type: 'circle',
      source: IDS.ring,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 6, 16, 26],
        'circle-color': 'rgba(255,255,255,0.04)',
        'circle-stroke-color': 'rgba(255,255,255,0.85)',
        'circle-stroke-width': 1.2,
        'circle-pitch-alignment': 'map',
        'circle-pitch-scale': 'map',
      },
    },
    {
      id: IDS.nodes,
      type: 'circle',
      source: IDS.nodes,
      minzoom: 14.6,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.2, 17, 6],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': 'rgba(5,5,5,0.9)',
        'circle-stroke-width': 1,
        'circle-pitch-alignment': 'map',
        'circle-pitch-scale': 'map',
      },
    },
  ];
}

export function tileLayers(key) {
  return [
    {
      id: 'trunks-' + key,
      type: 'fill-extrusion',
      source: 'trees-' + key,
      filter: ['<=', ['get', 'base'], 0.5],
      paint: { 'fill-extrusion-color': '#3a2c20', 'fill-extrusion-height': ['get', 'top'], 'fill-extrusion-base': ['get', 'base'] },
    },
    {
      id: 'canopy-' + key,
      type: 'fill-extrusion',
      source: 'trees-' + key,
      filter: ['>', ['get', 'base'], 0.5],
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'tone'], 0, '#2a5a38', 0.5, '#356b42', 1, '#4a7d45'],
        'fill-extrusion-height': ['get', 'top'],
        'fill-extrusion-base': ['get', 'base'],
      },
    },
    {
      id: 'buildings-' + key,
      type: 'fill-extrusion',
      source: 'buildings-' + key,
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': ['get', 'base'],
        'fill-extrusion-opacity': 1,
      },
    },
  ];
}
