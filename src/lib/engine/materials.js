import * as THREE from 'three';
import { cityTextures } from './textures.js';

const NOISE = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm2(vec2 p) {
  return vnoise(p) * 0.65 + vnoise(p * 2.13 + 11.0) * 0.35;
}
`;

// Bruit précalculé : une lecture de texture coûte bien moins que le calculer à chaque pixel.
const NOISE_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform sampler2DArray uFacadeTex;
uniform sampler2DArray uGroundTex;
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  return texture2D(uNoise, p * 0.0625).r;
}
float fbm2(vec2 p) {
  return texture2D(uNoise, p * 0.0625).r;
}
`;

function noiseTexture() {
  const SIZE = 256;
  const rnd = (x, y, n) => {
    const s = Math.sin(((x % n) + n) % n * 127.1 + (((y % n) + n) % n) * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vn = (x, y, n) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = rnd(ix, iy, n);
    const b = rnd(ix + 1, iy, n);
    const c = rnd(ix, iy + 1, n);
    const d = rnd(ix + 1, iy + 1, n);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      const x = (i / SIZE) * 16;
      const y = (j / SIZE) * 16;
      const v = vn(x, y, 16) * 0.65 + vn(x * 2, y * 2, 32) * 0.35;
      const k = (j * SIZE + i) * 4;
      data[k] = data[k + 1] = data[k + 2] = v * 255;
      data[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

const FIELD = /* glsl */ `
varying vec2 vWarp;
uniform sampler2D uField;
uniform vec2 uFieldMin;
uniform vec2 uFieldSpan;
uniform float uReveal;
uniform float uNight;
uniform float uScan;
uniform float uColorMix;
uniform float uColorGlow;
uniform float uColorWin;
uniform float uScanRoad;
uniform float uScanGround;
uniform float uScanGroundGlow;
uniform float uScanWall;
uniform float uScanWin;
uniform float uFacade;
uniform float uShop;
uniform float uWinGlow;
uniform float uRoof;
uniform float uFacadeScan;
uniform vec3 uSky;
uniform float uTime;
uniform vec2 uFocus;
uniform float uFocusR;
vec4 sampleField(vec2 xz) {
  vec4 f = texture2D(uField, (xz - uFieldMin) / uFieldSpan);
  f.a *= smoothstep(uReveal, uReveal - 500.0, length(xz));
  f.a *= smoothstep(uFocusR, uFocusR * 0.8, length(xz - uFocus));
  f.a *= mix(smoothstep(0.03, 0.2, max(f.r, max(f.g, f.b)) - min(f.r, min(f.g, f.b))), 1.0, uScan);
  return f;
}
float revealRing(vec2 xz) {
  return smoothstep(70.0, 0.0, abs(length(xz) - uReveal)) * step(uReveal, 14000.0);
}
`;

function patch(material, { uniforms, warp = true, vertexHead = '', normalBody = '', vertexBody = '', fragmentHead = '', color = '', emissive = '', normal = '' }, key) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vW;\nvarying vec2 vWarp;\n${warp ? NOISE : ''}\n${vertexHead}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${normalBody}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n${vertexBody}\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWarp = ${warp ? 'vec2(vnoise(vW.xz / 55.0) - 0.5, 0.0)' : 'vec2(0.0)'};`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vW;\n${NOISE_FRAG}\n${FIELD}\n${fragmentHead}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${color}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${normal}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${emissive}`);
  };
  material.customProgramCacheKey = () => key;
  return material;
}

function depthPatch(uniforms, head, body, key) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${head}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${body}`);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

const GROW = /* glsl */ `
float rim = smoothstep(uFocusR, uFocusR * 0.86, length((modelMatrix * vec4(aCenter.x, 0.0, aCenter.y, 1.0)).xz - uFocus));
float grow = clamp((uTime - aMeta.w) / 1.3, 0.0, 1.0);
grow = (1.0 - pow(1.0 - grow, 3.0)) * rim;
if (rim <= 0.0) transformed = vec3(aCenter.x, 0.0, aCenter.y);
else transformed.y *= max(grow, 0.002);
`;
const FOCUS = 'uniform vec2 uFocus; uniform float uFocusR;';
// Lointain : apparaît là où les immeubles détaillés s'arrêtent.
const GROW_MID = /* glsl */ `
float rim = smoothstep(uLodR * 0.86, uLodR, length((modelMatrix * vec4(aCenter.x, 0.0, aCenter.y, 1.0)).xz - uFocus));
float grow = clamp((uTime - aMeta.w) / 1.3, 0.0, 1.0);
grow = (1.0 - pow(1.0 - grow, 3.0)) * rim;
if (rim <= 0.0) transformed = vec3(aCenter.x, 0.0, aCenter.y);
else transformed.y *= max(grow, 0.002);
`;

export function createMaterials(field) {
  const uniforms = {
    uField: { value: field.texture },
    uFieldMin: { value: new THREE.Vector2(field.min[0], field.min[1]) },
    uFieldSpan: { value: new THREE.Vector2(field.span[0], field.span[1]) },
    uReveal: { value: 0 },
    uNight: { value: 1 },
    uScan: { value: 0 },
    uColorMix: { value: 0.9 },
    uColorGlow: { value: 0.1 },
    uColorWin: { value: 0.9 },
    uScanRoad: { value: 0.85 },
    uScanGround: { value: 0.45 },
    uScanGroundGlow: { value: 0.1 },
    uScanWall: { value: 0.24 },
    uScanWin: { value: 0.75 },
    uFacade: { value: 0.6 },
    uShop: { value: 1.1 },
    uWinGlow: { value: 1.25 },
    uRoof: { value: 0.08 },
    uFacadeScan: { value: 0.22 },
    uSky: { value: new THREE.Color() },
    uNoise: { value: noiseTexture() },
    uFacadeTex: { value: cityTextures().facade },
    uGroundTex: { value: cityTextures().ground },
    uTime: { value: 0 },
    uFocus: { value: new THREE.Vector2() },
    uFocusR: { value: 5000 },
  };

  const buildingParts = {
      uniforms,
      vertexHead: `attribute vec2 aWall; attribute vec2 aCenter; attribute vec4 aMeta; varying vec2 vWall; varying vec4 vMeta; uniform float uTime; ${FOCUS}`,
      vertexBody: `${GROW}\nvWall = aWall; vMeta = aMeta;`,
      fragmentHead: 'varying vec2 vWall; varying vec4 vMeta; float gWin; float gDetail; float gTower; vec2 gCell; vec4 gF;',
      color: /* glsl */ `
        gF = sampleField(vW.xz);
        float cellTone = vWarp.x + 0.5;
        float seed = vMeta.y;
        gWin = 0.0;
        gDetail = 0.0;
        gTower = 0.0;
        if (vMeta.x < 0.5) {
          float kind = fract(seed * 13.7);
          float tower = step(38.0, vMeta.z);
          gTower = tower;
          float layer = tower > 0.5 ? 3.0 : kind >= 0.84 ? 1.0 : kind >= 0.66 ? 2.0 : 0.0;
          vec2 c = vec2(vWall.x / mix(3.7, 1.8, tower), (vWall.y - 0.4) / mix(3.3, 3.6, tower));
          vec2 fw = fwidth(c);
          gCell = c;
          gDetail = 1.0 - smoothstep(0.25, 0.7, max(fw.x, fw.y));
          vec4 tex = texture(uFacadeTex, vec3(c * 0.5, layer));
          float tone = fract(seed * 7.3 + cellTone);
          vec3 tint = layer < 0.5 ? mix(vec3(0.84, 0.8, 0.72), vec3(1.0, 0.97, 0.91), tone) : vec3(0.82 + 0.2 * tone);
          float upper = step(3.6, vWall.y);
          float height01 = clamp(vWall.y / max(vMeta.z, 1.0), 0.0, 1.0);
          float ao = mix(0.42, 1.0, smoothstep(0.0, 9.0, vWall.y));
          float coping = smoothstep(vMeta.z - 0.8, vMeta.z - 0.4, vWall.y);
          vec3 facade = mix(tint * vec3(0.46, 0.44, 0.42), tex.rgb * tint, upper);
          diffuseColor.rgb = facade * ao * (0.92 + 0.14 * height01) * (1.0 + 0.3 * coping);
          float pane = tex.a * upper;
          gWin = pane * gDetail;
          vec3 skyGrey = mix(vec3(dot(uSky, vec3(0.33))), uSky, 0.45);
          vec3 glass = mix(vec3(0.05, 0.065, 0.085), skyGrey * 0.42, 0.25 + 0.5 * fract(c.y)) * (0.75 + 0.4 * hash21(floor(c) + seed * 37.0));
          glass = mix(glass, skyGrey * 0.7, tower * 0.45);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(glass, vec3(0.025, 0.03, 0.04), smoothstep(0.3, 0.8, uNight)), pane);
        } else {
          float tone = fract(seed * 5.1 + cellTone * 0.6);
          vec3 roof;
          if (vMeta.x < 1.5) {
            // Toit-terrasse.
            roof = texture(uGroundTex, vec3(vW.xz / 9.0, 0.0)).rgb * mix(0.72, 1.0, tone);
          } else if (vMeta.x < 2.5) {
            // Tuiles ou ardoise.
            vec3 tileTint = mix(vec3(0.72, 0.36, 0.23), vec3(0.86, 0.5, 0.32), tone);
            tileTint = mix(tileTint, vec3(0.3, 0.32, 0.37), step(0.72, fract(seed * 11.3)));
            roof = texture(uGroundTex, vec3(vWall / 2.6, 1.0)).rgb * tileTint;
          } else if (vMeta.x < 3.5) {
            // Zinc parisien et lucarnes.
            roof = texture(uGroundTex, vec3(vWall / 3.4, 2.0)).rgb * mix(0.6, 0.8, tone);
            vec2 d = vec2(fract(vWall.x / 4.2), (vWall.y - (vMeta.z - 2.5)) / 1.3);
            gWin = step(0.36, d.x) * step(d.x, 0.64) * step(0.0, d.y) * step(d.y, 1.0) * (1.0 - smoothstep(0.1, 0.4, fwidth(vWall.x / 4.2) * 4.0));
            roof = mix(roof, vec3(0.05, 0.06, 0.08), gWin);
          } else if (vMeta.x < 4.5) {
            // Cheminées en brique ou plâtre, équipements en métal.
            roof = mix(vec3(0.5, 0.3, 0.24), vec3(0.62, 0.6, 0.56), step(0.5, fract(seed * 3.7)));
          } else {
            roof = vec3(0.58, 0.56, 0.52);
          }
          diffuseColor.rgb = mix(roof, gF.rgb, gF.a * uRoof);
        }
        if (uScan > 0.5) {
          float relief = clamp(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)) / (vMeta.x < 0.5 ? 0.5 : 0.28), 0.6, 1.25);
          float shade = (vMeta.x < 0.5 ? mix(0.62, 1.0, smoothstep(0.0, 12.0, vWall.y)) : 0.68) * relief;
          diffuseColor.rgb = mix(diffuseColor.rgb, gF.rgb * shade * 0.85, smoothstep(0.03, 0.55, gF.a) * uColorMix);
        }
      `,
      emissive: /* glsl */ `
        if (uScan > 0.5) totalEmissiveRadiance += gF.rgb * smoothstep(0.03, 0.55, gF.a) * uColorGlow;
        if (vMeta.x < 0.5 && uScan < 0.5) totalEmissiveRadiance += gF.rgb * gF.a * (1.0 - smoothstep(0.0, 13.0, vWall.y)) * uScanWall;
        if (vMeta.x < 0.5) {
          float fresnel = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += uSky * gWin * fresnel * mix(0.35, 0.9, gTower);
          vec3 warm = vec3(1.0, 0.68, 0.36);
          float rnd = hash21(floor(gCell) + vec2(vMeta.y * 91.0, vMeta.y * 37.0));
          float rnd2 = fract(rnd * 53.7);
          float density = 0.28 + 0.1 * gF.a;
          vec3 tint = rnd2 > 0.95 ? vec3(0.68, 0.8, 1.0) : mix(vec3(1.0, 0.6, 0.28), vec3(1.0, 0.8, 0.56), fract(rnd * 17.0));
          float scanned = max(step(rnd2, gF.a * uScanWin), gF.a * uScan);
          vec3 win = mix(tint, gF.rgb * 1.3, scanned);
          totalEmissiveRadiance += win * gWin * step(rnd, density) * uNight * (0.55 + 0.55 * fract(rnd * 31.0)) * (0.7 + 0.5 * fract(gCell.y)) * mix(1.0, 0.4, gTower) * mix(uWinGlow, uColorWin, uScan);
          totalEmissiveRadiance += mix(warm * 0.5, gF.rgb * 0.9, gF.a * mix(uFacadeScan, 1.0, uScan)) * (1.0 - gDetail) * density * uFacade * uNight;
          float shop = (1.0 - smoothstep(3.0, 3.5, vWall.y)) * smoothstep(0.6, 1.2, vWall.y);
          shop *= 1.0 - smoothstep(0.2, 0.7, fwidth(vWall.y));
          float shopBay = fract(vWall.x / 6.5);
          float shopRnd = hash21(vec2(floor(vWall.x / 6.5), vMeta.y * 17.0));
          shop *= step(0.45, shopRnd) * smoothstep(0.04, 0.08, shopBay) * smoothstep(0.96, 0.92, shopBay);
          totalEmissiveRadiance += mix(warm, vec3(1.0, 0.88, 0.72), fract(shopRnd * 7.0)) * shop * uNight * uShop * 0.6;
        } else {
          totalEmissiveRadiance += gF.rgb * gF.a * uScan * uColorGlow * 1.6;
          totalEmissiveRadiance += vec3(1.0, 0.68, 0.36) * gWin * step(0.55, hash21(vec2(floor(vWall.x / 4.2), vMeta.y * 41.0))) * uNight * 0.8;
        }
        totalEmissiveRadiance += vec3(0.4, 1.0, 0.75) * revealRing(vW.xz) * 2.0;
      `,
  };
  const building = patch(new THREE.MeshLambertMaterial(), buildingParts, 'building');
  const buildingMid = patch(
    new THREE.MeshLambertMaterial(),
    {
      ...buildingParts,
      uniforms: { ...uniforms, uFocusR: { value: 1e9 }, uLodR: uniforms.uFocusR },
      vertexHead: 'attribute vec2 aWall; attribute vec2 aCenter; attribute vec4 aMeta; varying vec2 vWall; varying vec4 vMeta; uniform float uTime; uniform vec2 uFocus; uniform float uLodR;',
      vertexBody: `${GROW_MID}\nvWall = aWall; vMeta = aMeta;`,
    },
    'building-mid',
  );
  const skirt = new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec2 aFade;
      uniform float uTime;
      varying float vA;
      void main() {
        vA = aFade.x * aFade.x * clamp((uTime - aFade.y) / 1.3, 0.0, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: 'varying float vA; void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, vA * 0.42); }',
  });
  // Pré-passe : la profondeur d'abord, pour que le matériau des façades ne colore que les pixels visibles.
  const buildingPre = new THREE.MeshBasicMaterial({ colorWrite: false });
  buildingPre.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 aCenter; attribute vec4 aMeta; uniform float uTime; ${FOCUS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${GROW}`);
  };
  buildingPre.customProgramCacheKey = () => 'building-pre';
  const buildingDepth = depthPatch(uniforms, `attribute vec2 aCenter; attribute vec4 aMeta; uniform float uTime; ${FOCUS}`, GROW, 'building-depth');

  // Le sol teste la profondeur : après la pré-passe, il ne calcule plus les pixels cachés par un immeuble.
  const groundOpts = { depthTest: true, depthWrite: false };

  const roadParts = {
      uniforms,
      vertexHead: 'attribute vec4 aRoad; varying vec4 vRoad;',
      vertexBody: 'vRoad = aRoad;',
      fragmentHead: 'varying vec4 vRoad; vec4 gF;',
      color: /* glsl */ `
        gF = sampleField(vW.xz);
        float W = abs(vRoad.z);
        float halfW = W * 0.5;
        float xm = abs(vRoad.x) * halfW;
        float aaX = fwidth(vRoad.x) * halfW;
        float aaY = fwidth(vRoad.y);
        float paintFade = 1.0 - smoothstep(0.12, 0.6, aaX);
        if (vRoad.z < 0.0) {
          diffuseColor.rgb = texture(uGroundTex, vec3(vW.xz / 4.0, 4.0)).rgb;
        } else {
          diffuseColor.rgb = texture(uGroundTex, vec3(vW.xz / 7.0, 3.0)).rgb * (0.78 + 0.44 * fbm2(vW.xz * 0.07));
          // Usure au passage des roues, caniveau sombre le long de la bordure.
          float tracks = 1.0 - smoothstep(0.45, 0.95, abs(fract(xm / max(halfW * 0.5, 1.0)) - 0.5) * 2.0);
          diffuseColor.rgb *= 1.0 - 0.1 * tracks * paintFade;
          diffuseColor.rgb *= mix(0.68, 1.0, smoothstep(0.0, 0.8, halfW - xm));
          float ends = min(vRoad.y, vRoad.w);
          float clear = smoothstep(5.0, 10.0, ends);
          float paint = 0.0;
          if (W >= 6.0) {
            paint = max(paint, step(0.45, fract(vRoad.y / 9.0)) * (1.0 - smoothstep(0.11, 0.15 + aaX, xm)));
            paint = max(paint, 1.0 - smoothstep(0.09, 0.12 + aaX, abs(xm - (halfW - 0.5))));
          }
          if (W >= 9.0) paint = max(paint, step(0.5, fract(vRoad.y / 6.0)) * (1.0 - smoothstep(0.08, 0.11 + aaX, abs(xm - halfW * 0.5))));
          paint *= clear;
          if (W >= 4.5 && W <= 12.0 && ends < 7.0) {
            paint = max(paint, step(0.5, fract(xm / 1.1)) * step(2.5, ends) * step(xm, halfW - 0.2));
            paint = max(paint, (1.0 - smoothstep(0.0, 0.5, abs(ends - 1.7))) * step(xm, halfW - 0.2));
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.72, 0.7), paint * paintFade * (1.0 - smoothstep(0.5, 2.0, aaY)));
          float curb = smoothstep(halfW - 0.2 - aaX, halfW - 0.1, xm);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.54, 0.51), curb * paintFade);
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, gF.rgb * 0.5, gF.a * 0.4 * mix(uScanGround, 0.2, uScan) * (vRoad.z < 0.0 ? 1.0 : 0.12));
      `,
      emissive: /* glsl */ `
        totalEmissiveRadiance += vec3(0.9, 0.6, 0.3) * 0.05 * (1.0 - gF.a) * uNight;
        totalEmissiveRadiance += gF.rgb * 0.5 * gF.a * 0.4 * uScanRoad * (vRoad.z < 0.0 ? 0.5 : 0.04);
        if (W > 3.0 && uNight > 0.0) {
          float visible = 1.0 - smoothstep(0.0, 0.5, fwidth(vRoad.y) / 8.0);
          if (vRoad.z > 0.0) {
            float side = vRoad.x > 0.0 ? 1.0 : -1.0;
            float lane = 1.0 - smoothstep(0.12, 0.26, abs(abs(vRoad.x) - 0.5));
            float flow = fract(vRoad.y / 38.0 + side * uTime * 0.28 + floor(vRoad.y / 400.0) * 0.37);
            vec3 tone = side > 0.0 ? vec3(1.0, 0.9, 0.75) : vec3(1.0, 0.12, 0.08);
            // De près les voitures sont en 3D : ces traînées ne servent que de loin.
            float farOnly = smoothstep(0.35, 0.9, fwidth(vRoad.y));
            totalEmissiveRadiance += tone * smoothstep(0.05, 0.0, abs(flow - 0.5)) * lane * visible * farOnly * uNight * 3.5;
          }
          float lampLine = vRoad.z > 0.0 ? W * 0.5 + 1.0 : W * 0.46;
          vec2 pool = vec2((fract(vRoad.y / 27.0) - 0.5) * 27.0 / 6.0, (abs(vRoad.x) * W * 0.5 - lampLine) / 4.0);
          totalEmissiveRadiance += vec3(1.0, 0.68, 0.4) * exp(-dot(pool, pool) * 2.0) * visible * uNight * 0.13;
        }
        totalEmissiveRadiance += vec3(0.4, 1.0, 0.75) * revealRing(vW.xz) * 2.0;
      `,
  };
  const roads = patch(new THREE.MeshLambertMaterial(groundOpts), roadParts, 'road');
  const bridge = patch(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), roadParts, 'bridge');

  const groundEmission = /* glsl */ `
    totalEmissiveRadiance += gF.rgb * gF.a * mix(uScanGround, 0.2, uScan) * uScanGroundGlow;
    totalEmissiveRadiance += vec3(0.4, 1.0, 0.75) * revealRing(vW.xz) * 2.0;
  `;

  const green = patch(
    new THREE.MeshLambertMaterial({ vertexColors: true, ...groundOpts }),
    {
      uniforms,
      fragmentHead: 'vec4 gF;',
      color: /* glsl */ `
        gF = sampleField(vW.xz);
        diffuseColor.rgb *= 0.78 + 0.44 * vnoise(vW.xz * 0.09);
        diffuseColor.rgb = mix(diffuseColor.rgb, gF.rgb * 0.45, gF.a * 0.25 * mix(uScanGround, 0.2, uScan));
      `,
      emissive: groundEmission,
    },
    'green',
  );

  const land = patch(
    new THREE.MeshLambertMaterial({ color: 0x3a3836, ...groundOpts }),
    {
      uniforms,
      warp: false,
      fragmentHead: 'vec4 gF;',
      color: /* glsl */ `
        gF = sampleField(vW.xz);
        vec3 ground = vec3(0.3, 0.29, 0.26) * (0.86 + 0.28 * fbm2(vW.xz * 0.03)) * texture(uGroundTex, vec3(vW.xz / 11.0, 0.0)).rgb * 2.1;
        diffuseColor.rgb = mix(ground, diffuseColor.rgb, smoothstep(0.55, 0.85, uNight));
        diffuseColor.rgb = mix(diffuseColor.rgb, gF.rgb * 0.5, gF.a * 0.4 * mix(uScanGround, 0.2, uScan));
      `,
      emissive: groundEmission,
    },
    'land',
  );

  const water = patch(
    new THREE.MeshStandardMaterial({ color: 0x0a2034, roughness: 0.14, metalness: 0.25, envMapIntensity: 1.6, ...groundOpts }),
    {
      uniforms,
      normal: /* glsl */ `
        vec2 wp = vW.xz * 0.05;
        float wt = uTime * 0.22;
        vec2 ripple = vec2(vnoise(wp + wt) - vnoise(wp - wt + 9.0), vnoise(wp * 1.8 - wt + 3.0) - vnoise(wp * 1.8 + wt + 5.0));
        float closeUp = 1.0 - smoothstep(0.3, 2.5, fwidth(vW.x));
        vec2 fineP = vW.xz * 0.45;
        vec2 fine = vec2(vnoise(fineP + wt * 3.0) - vnoise(fineP - wt * 2.0 + 7.0), vnoise(fineP * 1.7 - wt * 3.0 + 3.0) - vnoise(fineP * 1.7 + wt * 2.0 + 5.0));
        ripple = ripple * 0.14 + fine * 0.09 * closeUp;
        normal = normalize(normal + (viewMatrix * vec4(ripple.x, 0.0, ripple.y, 0.0)).xyz);
      `,
      emissive: /* glsl */ `
        float grazing = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.5);
        totalEmissiveRadiance += uSky * grazing * 0.55;
        totalEmissiveRadiance += vec3(0.4, 1.0, 0.75) * revealRing(vW.xz) * 2.0;
      `,
    },
    'water',
  );

  const TREE_V = /* glsl */ `
    float tg = clamp((uTime - aTree.y) / 1.1, 0.0, 1.0);
    tg = (1.0 - pow(1.0 - tg, 3.0)) * smoothstep(uFocusR, uFocusR * 0.86, length((modelMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0)).xz - uFocus));
    transformed = vec3(transformed.x * aInst.z, transformed.y * aInst.w, transformed.z * aInst.z) * tg + vec3(aInst.x, 0.0, aInst.y);
  `;
  const tree = patch(
    new THREE.MeshLambertMaterial(),
    {
      uniforms,
      warp: false,
      vertexHead: `attribute vec4 aInst; attribute vec2 aTree; uniform float uTime; ${FOCUS} varying float vTreeY; varying float vTone;`,
      vertexBody: `vTreeY = position.y; vTone = aTree.x;\n${TREE_V}`,
      fragmentHead: 'varying float vTreeY; varying float vTone;',
      color: /* glsl */ `
        if (vTreeY < 0.24) {
          diffuseColor.rgb = vec3(0.09, 0.065, 0.045);
        } else {
          vec3 leaf = mix(vec3(0.05, 0.13, 0.045), vec3(0.11, 0.22, 0.07), vTone);
          leaf = mix(leaf, vec3(0.17, 0.2, 0.07), step(0.86, vTone) * 0.6);
          float dapple = texture2D(uNoise, vW.xz * 0.28 + vW.y * 0.17).r;
          diffuseColor.rgb = leaf * (0.62 + 0.75 * dapple) * (0.55 + 0.85 * smoothstep(0.24, 1.0, vTreeY));
        }
      `,
    },
    'tree',
  );
  const treeDepth = depthPatch(uniforms, `attribute vec4 aInst; attribute vec2 aTree; uniform float uTime; ${FOCUS}`, TREE_V, 'tree-depth');

  const car = patch(
    new THREE.MeshLambertMaterial(),
    {
      uniforms,
      warp: false,
      vertexHead: 'attribute vec4 aCar; attribute vec4 aCarData; attribute float aPart; uniform float uTime; uniform float uReveal; varying float vPart; varying float vTone;',
      normalBody: 'objectNormal = vec3(objectNormal.x * aCar.z - objectNormal.z * aCar.w, objectNormal.y, objectNormal.x * aCar.w + objectNormal.z * aCar.z);',
      vertexBody: /* glsl */ `
        vPart = aPart;
        vTone = aCarData.w;
        float s = fract(aCarData.y + uTime * aCarData.z / aCarData.x) * aCarData.x;
        float e = smoothstep(0.0, 6.0, s) * smoothstep(0.0, 6.0, aCarData.x - s);
        vec2 c = aCar.xy + aCar.zw * s;
        e *= step(length((modelMatrix * vec4(c.x, 0.0, c.y, 1.0)).xz), uReveal);
        vec3 p = position * e;
        transformed = vec3(p.x * aCar.z - p.z * aCar.w + c.x, p.y, p.x * aCar.w + p.z * aCar.z + c.y);
      `,
      fragmentHead: 'varying float vPart; varying float vTone;',
      color: /* glsl */ `
        vec3 paintCol = vec3(0.68, 0.69, 0.7);
        if (vTone < 0.18) paintCol = vec3(0.03, 0.03, 0.035);
        else if (vTone < 0.36) paintCol = vec3(0.13, 0.14, 0.15);
        else if (vTone < 0.56) paintCol = vec3(0.42, 0.43, 0.45);
        else if (vTone < 0.68) paintCol = vec3(0.07, 0.12, 0.27);
        else if (vTone < 0.76) paintCol = vec3(0.42, 0.05, 0.045);
        if (vPart < 0.5) diffuseColor.rgb = vec3(0.012);
        else if (vPart < 1.5) diffuseColor.rgb = paintCol;
        else if (vPart < 2.5) diffuseColor.rgb = vec3(0.05, 0.075, 0.1);
        else diffuseColor.rgb = vec3(0.018);
      `,
      emissive: /* glsl */ `
        if (vPart > 3.5 && vPart < 4.5) totalEmissiveRadiance += vec3(1.0, 0.92, 0.75) * (0.25 + 3.0 * uNight);
        if (vPart > 4.5) totalEmissiveRadiance += vec3(1.0, 0.08, 0.05) * (0.3 + 2.0 * uNight);
      `,
    },
    'car',
  );

  const lamp = patch(
    new THREE.MeshLambertMaterial(),
    {
      uniforms,
      warp: false,
      vertexHead: 'attribute vec4 aLamp; attribute float aPart; varying float vPart;',
      normalBody: 'objectNormal = vec3(objectNormal.x * aLamp.z - objectNormal.z * aLamp.w, objectNormal.y, objectNormal.x * aLamp.w + objectNormal.z * aLamp.z);',
      vertexBody: /* glsl */ `
        vPart = aPart;
        transformed = vec3(position.x * aLamp.z - position.z * aLamp.w + aLamp.x, position.y, position.x * aLamp.w + position.z * aLamp.z + aLamp.y);
      `,
      fragmentHead: 'varying float vPart;',
      color: 'diffuseColor.rgb = vec3(0.07, 0.075, 0.08);',
      emissive: 'if (vPart > 0.5) totalEmissiveRadiance += vec3(1.0, 0.76, 0.48) * (0.1 + 3.0 * uNight);',
    },
    'lamp',
  );

  return { uniforms, building, buildingMid, buildingPre, skirt, lamp, bridge, buildingDepth, roads, green, land, water, tree, treeDepth, car };
}
