import { MapboxOverlay } from '@deck.gl/mapbox';
import { AmbientLight, DirectionalLight, LightingEffect } from '@deck.gl/core';
import { GeoJsonLayer } from '@deck.gl/layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { CylinderGeometry, SphereGeometry } from '@luma.gl/engine';

const SPHERE = new SphereGeometry({ radius: 1, nlat: 10, nlong: 12 });
const TRUNK = new CylinderGeometry({ radius: 0.35, height: 1, nradial: 6, verticalAxis: 'z' });

const BUILDING_MATERIAL = { ambient: 0.55, diffuse: 0.75, shininess: 18, specularColor: [70, 74, 82] };
const TREE_MATERIAL = { ambient: 0.6, diffuse: 0.7, shininess: 6, specularColor: [20, 30, 20] };

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function leaf(tone) {
  const a = [34, 84, 48];
  const b = [70, 124, 64];
  return a.map((v, i) => v + (b[i] - v) * tone);
}

export function createDeck() {
  const ambient = new AmbientLight({ color: [186, 200, 235], intensity: 0.55 });
  const sun = new DirectionalLight({ color: [255, 224, 188], intensity: 1.7, direction: [0.6, 0.5, -0.65], _shadow: false });
  const lighting = new LightingEffect({ ambient, sun });
  lighting.shadowColor = [0, 0, 0, 0.55];
  return new MapboxOverlay({ interleaved: false, layers: [], effects: [lighting] });
}

export function tileDeckLayers(key, built) {
  const layers = [
    new GeoJsonLayer({
      id: 'buildings-' + key,
      data: built.buildings,
      extruded: true,
      filled: true,
      stroked: false,
      getElevation: (f) => f.properties.height,
      getFillColor: (f) => hexRgb(f.properties.color),
      material: BUILDING_MATERIAL,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 60],
    }),
  ];
  if (built.trees.length) {
    layers.push(
      new SimpleMeshLayer({
        id: 'trunks-' + key,
        data: built.trees,
        mesh: TRUNK,
        getPosition: (d) => [d.position[0], d.position[1], 1.7],
        getScale: () => [1, 1, 3.4],
        getColor: [74, 56, 40],
        material: TREE_MATERIAL,
        pickable: false,
      }),
      new SimpleMeshLayer({
        id: 'canopy-' + key,
        data: built.trees,
        mesh: SPHERE,
        getPosition: (d) => [d.position[0], d.position[1], 3 + d.height * 0.42],
        getScale: (d) => [d.radius, d.radius, d.height * 0.45],
        getColor: (d) => leaf(d.tone),
        material: TREE_MATERIAL,
        pickable: false,
      }),
    );
  }
  return layers;
}
