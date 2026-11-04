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
uniform sampler2D uWaterTex;
vec2 gDx;
vec2 gDy;
// Lecture des textures du sol avec des dérivées calculées hors de toute branche : mip juste au bord des triangles.
vec3 groundTex(vec2 p, float scale, float layer) {
  return textureGrad(uGroundTex, vec3(p * scale, layer), gDx * scale, gDy * scale).rgb;
}
vec3 groundTexR(vec2 p, float scale, float layer) {
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8) * scale;
  return textureGrad(uGroundTex, vec3(r * p, layer), r * gDx, r * gDy).rgb;
}
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
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uFogCol;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uDisc;
uniform float uTime;
uniform vec3 uCam;
uniform float uFocusR;
uniform float uEdge;
uniform float uMidR;
vec4 sampleField(vec2 xz) {
  vec4 f = texture2D(uField, (xz - uFieldMin) / uFieldSpan);
  f.a *= smoothstep(uReveal, uReveal - 500.0, length(xz));
  f.a *= mix(smoothstep(0.03, 0.2, max(f.r, max(f.g, f.b)) - min(f.r, min(f.g, f.b))), 1.0, uScan);
  return f;
}
float revealRing(vec2 xz) {
  return smoothstep(70.0, 0.0, abs(length(xz) - uReveal)) * step(uReveal, 14000.0);
}
`;

// Brouillard habituel, plus un fondu complet avant le bord de la zone chargée : ni cercle ni fin de ville visibles.
const EDGE_FOG = /* glsl */ `
#ifdef USE_FOG
  float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  fogFactor = max(fogFactor, smoothstep(uEdge * 0.7, uEdge, length(vW.xz - uCam.xz)));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif
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
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${emissive}`)
      .replace('#include <fog_fragment>', EDGE_FOG);
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

// Passage du détaillé (zoom 14) au simplifié (zoom 13) : chaque immeuble bascule entier, selon un bruit lent
// propre à sa position, partagé par les deux versions. Pas de hauteurs intermédiaires ni d'anneau visible.
const LOD = /* glsl */ `
float lodHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lodPick(vec2 p) {
  p /= 240.0;
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = mix(mix(lodHash(i), lodHash(i + vec2(1.0, 0.0)), f.x), mix(lodHash(i + vec2(0.0, 1.0)), lodHash(i + vec2(1.0, 1.0)), f.x), f.y);
  return 0.1 + 0.8 * n;
}
`;
const GROW = /* glsl */ `
vec2 lodP = (modelMatrix * vec4(aCenter.x, 0.0, aCenter.y, 1.0)).xz;
float rim = step(lodPick(lodP), smoothstep(uFocusR, uFocusR * 0.74, distance(vec3(lodP.x, 0.0, lodP.y), uCam)));
float grow = clamp((uTime - aMeta.w) / 1.3, 0.0, 1.0);
grow = (1.0 - pow(1.0 - grow, 3.0)) * rim;
if (rim <= 0.0) transformed = vec3(aCenter.x, 0.0, aCenter.y);
else transformed.y *= max(grow, 0.002);
`;
const FOCUS = `uniform vec3 uCam; uniform float uFocusR; ${LOD}`;
// Lointain : exactement les immeubles que le détaillé ne montre pas.
const GROW_MID = /* glsl */ `
vec2 lodP = (modelMatrix * vec4(aCenter.x, 0.0, aCenter.y, 1.0)).xz;
float rim = 1.0 - step(lodPick(lodP), smoothstep(uLodR, uLodR * 0.74, distance(vec3(lodP.x, 0.0, lodP.y), uCam)));
rim *= step(lodPick(lodP * 1.7 + 31.0), smoothstep(uMidR, uMidR * 0.85, length(lodP - uCam.xz)));
float grow = clamp((uTime - aMeta.w) / 1.3, 0.0, 1.0);
grow = (1.0 - pow(1.0 - grow, 3.0)) * rim;
if (rim <= 0.0) transformed = vec3(aCenter.x, 0.0, aCenter.y);
else transformed.y *= max(grow, 0.002);
`;
// Cheminées et équipements : disparaissent immeuble par immeuble avec la distance, avant de devenir plus fins qu'un pixel.
const DETAIL_FADE = /* glsl */ `
if (lodHash(floor(lodP / 3.0)) >= smoothstep(1000.0, 620.0, distance(vec3(lodP.x, 15.0, lodP.y), uCam))) transformed = vec3(aCenter.x, 0.0, aCenter.y);
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
    uSkyZenith: { value: new THREE.Color() },
    uSkyHorizon: { value: new THREE.Color() },
    uFogCol: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() },
    uDisc: { value: 0 },
    uNoise: { value: noiseTexture() },
    uFacadeTex: { value: cityTextures().facade },
    uGroundTex: { value: cityTextures().ground },
    uWaterTex: { value: cityTextures().water },
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uMidR: { value: 18000 },
    uFocusR: { value: 5000 },
    uPixel: { value: 0.0005 },
    uFogD: { value: 0 },
    uDpr: { value: 1 },
    uEdge: { value: 12000 },
  };

  const buildingParts = {
      uniforms,
      vertexHead: `attribute vec2 aWall; attribute vec2 aCenter; attribute vec4 aMeta; varying vec2 vWall; flat varying vec4 vMeta; uniform float uTime; ${FOCUS}`,
      vertexBody: `${GROW}\nvWall = aWall; vMeta = aMeta;`,
      fragmentHead: 'varying vec2 vWall; flat varying vec4 vMeta; float gWin; float gDetail; float gTower; float gShop; float gShopRnd; vec2 gCell; vec4 gF;',
      color: /* glsl */ `
        gF = sampleField(vW.xz);
        gDx = dFdx(vW.xz);
        gDy = dFdy(vW.xz);
        float cellTone = vWarp.x + 0.5;
        float seed = vMeta.y;
        gWin = 0.0;
        gDetail = 0.0;
        gTower = 0.0;
        gShop = 0.0;
        gShopRnd = 0.0;
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
          float sFade = 1.0 - smoothstep(0.1, 0.5, fwidth(vWall.y));
          float sBay = fract(vWall.x / 6.5);
          gShopRnd = hash21(vec2(floor(vWall.x / 6.5), seed * 17.0));
          float isShop = step(0.25, gShopRnd) * sFade;
          gShop = isShop * smoothstep(0.03, 0.05, sBay) * smoothstep(0.97, 0.95, sBay) * step(0.5, vWall.y) * step(vWall.y, 2.85) * mix(1.0, step(0.05, fract(sBay * 3.0)), 1.0 - smoothstep(0.02, 0.06, fwidth(vWall.y)));
          facade = mix(facade, vec3(0.035, 0.045, 0.055), gShop);
          vec3 awning = 0.2 + 0.32 * cos(6.283 * (gShopRnd * 3.0 + vec3(0.0, 0.33, 0.67)));
          facade = mix(facade, awning, isShop * step(2.98, vWall.y) * step(vWall.y, 3.5));
          // Patine : coulures verticales sous les fenêtres et la corniche, plus marquées en bas de façade.
          float streak = smoothstep(0.38, 0.85, fbm2(vec2(vWall.x * 0.85, vWall.y * 0.05) + seed * 40.0));
          float stain = 1.0 - 0.2 * streak * (0.45 + 0.55 * (1.0 - height01)) - 0.1 * smoothstep(vMeta.z - 4.0, vMeta.z - 0.8, vWall.y) * (1.0 - coping);
          diffuseColor.rgb = facade * ao * stain * (0.92 + 0.14 * height01) * (1.0 + 0.3 * coping);
          float pane = tex.a * upper;
          gWin = pane * gDetail;
          vec3 skyGrey = mix(vec3(dot(uSky, vec3(0.33))), uSky, 0.45);
          // Reflets propres à chaque fenêtre seulement quand elle couvre assez de pixels, sinon leur moyenne : pas de grésillement au loin.
          vec3 glass = mix(vec3(0.05, 0.065, 0.085), skyGrey * 0.42, mix(0.5, 0.25 + 0.5 * fract(c.y), gDetail)) * mix(0.95, 0.75 + 0.4 * hash21(floor(c) + seed * 37.0), gDetail);
          glass = mix(glass, skyGrey * 0.7, tower * 0.45);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(glass, vec3(0.025, 0.03, 0.04), smoothstep(0.3, 0.8, uNight)), pane);
        } else {
          float tone = fract(seed * 5.1 + cellTone * 0.6);
          vec3 roof;
          if (vMeta.x < 1.5) {
            // Toit-terrasse : gravier, lés d'étanchéité, taches d'eau stagnante.
            roof = groundTex(vW.xz, 1.0 / 9.0, 0.0) * mix(0.72, 1.0, tone);
            float lane = abs(fract(vW.x / 1.1) - 0.5);
            float lf = fwidth(vW.x / 1.1);
            roof *= 1.0 - 0.1 * smoothstep(0.42, 0.5 - lf, lane) * (1.0 - smoothstep(0.08, 0.3, lf));
            roof *= 0.8 + 0.32 * fbm2(vW.xz / 6.0 + seed * 20.0);
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
          } else if (vMeta.x > 5.5) {
            // Halle de gare : verrière en bandes de 2,2 m sur fermes métalliques tous les 6 m, lumineuse la nuit.
            vec2 q = vWall / vec2(6.0, 2.2);
            vec2 qf = fwidth(q);
            vec2 e = abs(fract(q) - 0.5);
            float rib = max(smoothstep(0.42, 0.5 - qf.x, e.x) * (1.0 - smoothstep(0.1, 0.35, qf.x)), smoothstep(0.45, 0.5 - qf.y, e.y) * (1.0 - smoothstep(0.1, 0.35, qf.y)));
            rib = max(rib, 0.22 * smoothstep(0.1, 0.35, max(qf.x, qf.y)));
            vec3 skyG = mix(vec3(dot(uSky, vec3(0.33))), uSky, 0.5);
            roof = mix(mix(vec3(0.12, 0.15, 0.18), skyG * 0.55, 0.45), vec3(0.3, 0.32, 0.34), rib);
            gWin = (1.0 - rib) * 0.45;
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
          vec3 win = mix(tint, mix(tint, gF.rgb, 0.55), scanned);
          totalEmissiveRadiance += win * gWin * step(rnd, density) * uNight * (0.55 + 0.55 * fract(rnd * 31.0)) * (0.7 + 0.5 * fract(gCell.y)) * mix(1.0, 0.4, gTower) * mix(uWinGlow, uColorWin, uScan);
          totalEmissiveRadiance += mix(warm * 0.5, gF.rgb * 0.9, gF.a * mix(uFacadeScan, 1.0, uScan)) * (1.0 - gDetail) * density * uFacade * uNight;
          totalEmissiveRadiance += mix(warm, vec3(1.0, 0.88, 0.72), fract(gShopRnd * 7.0)) * gShop * step(0.42, gShopRnd) * (0.55 + 0.15 * vWall.y) * uNight * uShop * 0.7;
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
      vertexHead: `attribute vec2 aWall; attribute vec2 aCenter; attribute vec4 aMeta; varying vec2 vWall; flat varying vec4 vMeta; uniform float uTime; uniform vec3 uCam; uniform float uLodR; uniform float uMidR; ${LOD}`,
      vertexBody: `${GROW_MID}\nvWall = aWall; vMeta = aMeta;`,
    },
    'building-mid',
  );
  const buildingDetail = patch(new THREE.MeshLambertMaterial(), { ...buildingParts, vertexBody: `${GROW}
${DETAIL_FADE}
vWall = aWall; vMeta = aMeta;` }, 'building-detail');
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
  // Profondeur poussée d'un cran : la passe principale, compilée à part, ne peut plus échouer au test d'égalité (points de ciel sur les façades).
  const buildingPre = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
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

  // Dérivées calculées avant tout branchement : dans une branche, elles ne sont pas fiables au bord des triangles.
  const ROAD_PRE = /* glsl */ `
        gF = sampleField(vW.xz);
        float W = abs(vRoad.z);
        float halfW = W * 0.5;
        float xm = abs(vRoad.x) * halfW;
        float aaX = fwidth(vRoad.x) * halfW;
        float aaY = fwidth(vRoad.y);
        float paintFade = 1.0 - smoothstep(0.12, 0.6, aaX);
        gDx = dFdx(vW.xz);
        gDy = dFdy(vW.xz);
  `;
  const ROAD_COLOR = /* glsl */ `
        if (vRoad.z < 0.0) {
          // Trottoir : bitume clair, taches à grande échelle.
          diffuseColor.rgb = mix(groundTex(vW.xz, 0.2, 4.0), groundTexR(vW.xz, 0.071, 4.0), 0.35) * (0.86 + 0.28 * fbm2(vW.xz / 23.0));
        } else if (W < 2.6) {
          // Allées : sable stabilisé, plus tassé et clair au milieu, bord gagné par l'herbe.
          float mid = smoothstep(halfW, 0.0, xm);
          diffuseColor.rgb = mix(groundTex(vW.xz, 0.33, 6.0), groundTexR(vW.xz, 0.11, 6.0), 0.4) * (0.82 + 0.3 * fbm2(vW.xz / 13.0)) * mix(0.8, 1.08, mid);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.12, 0.04), (1.0 - smoothstep(0.0, 0.25, halfW - xm)) * 0.45 * paintFade);
        } else if (W < 3.6) {
          // Rues piétonnes et places : pavés de granit.
          diffuseColor.rgb = groundTex(vW.xz, 0.27, 7.0) * vec3(1.08, 1.02, 0.94) * (0.82 + 0.34 * fbm2(vW.xz / 19.0));
        } else {
          // Bitume : deux échelles croisées contre la répétition, usure lente.
          diffuseColor.rgb = mix(groundTex(vW.xz, 1.0 / 7.0, 3.0), groundTexR(vW.xz, 1.0 / 26.0, 3.0), 0.38) * (0.8 + 0.4 * fbm2(vW.xz * 0.07));
          // Usure au passage des roues, caniveau sombre le long de la bordure.
          diffuseColor.rgb *= mix(0.8, 1.0, smoothstep(0.0, 0.6, halfW - xm));
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
            paint = max(paint, mix(0.5, step(0.5, fract(xm / 1.1)), 1.0 - smoothstep(0.1, 0.3, aaX)) * step(2.5, ends) * step(xm, halfW - 0.2));
            paint = max(paint, (1.0 - smoothstep(0.0, 0.5, abs(ends - 1.7))) * step(xm, halfW - 0.2));
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.72, 0.7), paint * paintFade * (1.0 - smoothstep(0.5, 2.0, aaY)));
          float curb = smoothstep(halfW - 0.14 - aaX, halfW - 0.08, xm);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.33, 0.31), curb * paintFade);
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, gF.rgb * 0.5, gF.a * 0.4 * mix(uScanGround, 0.2, uScan) * (vRoad.z < 0.0 ? 0.5 : 0.12));
  `;
  const ROAD_EMISSIVE = /* glsl */ `
        totalEmissiveRadiance += vec3(0.9, 0.6, 0.3) * 0.05 * (1.0 - gF.a) * uNight;
        totalEmissiveRadiance += gF.rgb * 0.5 * gF.a * 0.4 * uScanRoad * (vRoad.z < 0.0 ? 0.2 : 0.04);
        if (W > 3.6 && uNight > 0.0) {
          float visible = 1.0 - smoothstep(0.0, 0.5, aaY / 8.0);
          if (vRoad.z > 0.0) {
            float side = vRoad.x > 0.0 ? 1.0 : -1.0;
            float lane = 1.0 - smoothstep(0.12, 0.26, abs(abs(vRoad.x) - 0.5));
            float flow = fract(vRoad.y / 38.0 + side * uTime * 0.28 + floor(vRoad.y / 400.0) * 0.37);
            vec3 tone = side > 0.0 ? vec3(1.0, 0.9, 0.75) : vec3(1.0, 0.12, 0.08);
            // De près les voitures sont en 3D : ces traînées ne servent que de loin.
            float farOnly = smoothstep(0.35, 0.9, aaY);
            // Traînée élargie à au moins un pixel, intensité réduite d'autant : même lumière moyenne, sans clignoter.
            float fw = max(0.05, aaY / 38.0 * 1.5);
            totalEmissiveRadiance += tone * smoothstep(fw, 0.0, abs(flow - 0.5)) * (0.05 / fw) * lane * visible * farOnly * uNight * 3.5;
          }
          float lampLine = vRoad.z > 0.0 ? W * 0.5 + 1.0 : W * 0.46;
          vec2 pool = vec2((fract(vRoad.y / 27.0) - 0.5) * 27.0 / 6.0, (abs(vRoad.x) * W * 0.5 - lampLine) / 4.0);
          totalEmissiveRadiance += vec3(1.0, 0.68, 0.4) * exp(-dot(pool, pool) * 2.0) * visible * uNight * 0.05;
        }
  `;
  const roadParts = {
      uniforms,
      vertexHead: 'attribute vec4 aRoad; varying vec4 vRoad;',
      vertexBody: 'vRoad = aRoad;',
      fragmentHead: 'varying vec4 vRoad; vec4 gF;',
      color: ROAD_PRE + ROAD_COLOR,
      emissive: `${ROAD_EMISSIVE}
totalEmissiveRadiance += vec3(0.4, 1.0, 0.75) * revealRing(vW.xz) * 2.0;`,
  };
  const bridge = patch(
    new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }),
    {
      ...roadParts,
      color: roadParts.color + `
        if (vRoad.z < 0.0) {
          vec3 stone = vec3(0.47, 0.45, 0.41) * (0.8 + 0.4 * fbm2(vW.xz * 0.25 + vW.y * 0.25));
          diffuseColor.rgb = stone * (1.0 - 0.14 * step(0.92, fract(vW.y / 0.8)) * (1.0 - smoothstep(0.03, 0.08, fwidth(vW.y))));
        }
      `,
      emissive: roadParts.emissive.replace('if (W > 3.6 && uNight > 0.0)', 'if (false)').replace('uScanRoad * (vRoad.z < 0.0 ? 0.5 : 0.04)', 'uScanRoad * 0.0'),
    },
    'bridge',
  );

  const groundEmission = /* glsl */ `
    totalEmissiveRadiance += gF.rgb * gF.a * mix(uScanGround, 0.2, uScan) * uScanGroundGlow;
    totalEmissiveRadiance += vec3(0.4, 1.0, 0.75) * revealRing(vW.xz) * 2.0;
  `;

  const land = patch(
    new THREE.MeshLambertMaterial({ color: 0x3a3836, ...groundOpts }),
    {
      uniforms,
      warp: false,
      fragmentHead: 'vec4 gF;',
      color: /* glsl */ `
        gF = sampleField(vW.xz);
        gDx = dFdx(vW.xz);
        gDy = dFdy(vW.xz);
        diffuseColor.rgb = groundTex(vW.xz, 0.125, 4.0) * (0.72 + 0.3 * fbm2(vW.xz * 0.03)) * mix(1.0, 0.62, uNight);
        diffuseColor.rgb = mix(diffuseColor.rgb, gF.rgb * 0.5, gF.a * 0.4 * mix(uScanGround, 0.2, uScan));
      `,
      emissive: groundEmission,
    },
    'land',
  );

  // Sol d'une tuile en un seul maillage et un seul appel : verdure, puis eau, puis trottoirs et chaussées, dessinés
  // dans cet ordre sans écrire la profondeur. aRoad.w distingue le type : -1 verdure (couleur dans aRoad.xyz), -2 eau.
  // Eau : reflet du ciel (même dégradé que sky.js) par Fresnel, houle lente et large. Aucun détail plus fin
  // que quelques mètres, et la houle s'aplatit au loin : rien ne peut scintiller.
  const ground = patch(
    new THREE.MeshLambertMaterial(groundOpts),
    {
      uniforms,
      vertexHead: 'attribute vec4 aRoad; varying vec4 vRoad;',
      vertexBody: 'vRoad = aRoad;',
      fragmentHead: 'varying vec4 vRoad; vec4 gF; float gKind;',
      color: /* glsl */ `
        ${ROAD_PRE}
        float gPix = length(fwidth(vW.xz));
        gKind = vRoad.w > -0.5 ? 0.0 : vRoad.w > -1.5 ? 1.0 : vRoad.w > -2.5 ? 2.0 : vRoad.w > -3.5 ? 3.0 : 4.0;
        float gFar = smoothstep(uMidR * 0.7, uMidR * 0.92, length(vW.xz - uCam.xz));
        if (gKind > 3.5) {
          // Voie ferrée : ballast, traverses tous les 60 cm, deux rails. Remplacés par leur moyenne quand ils passent sous le pixel.
          vec3 ballast = groundTex(vW.xz, 0.5, 0.0) * vec3(0.44, 0.39, 0.34) * mix(0.62, 1.0, smoothstep(halfW, halfW - 0.5, xm));
          float sl = abs(fract(vRoad.y / 0.6) - 0.5);
          float sleeper = mix(0.42, smoothstep(0.27, 0.31, sl), 1.0 - smoothstep(0.06, 0.2, aaY)) * step(xm, 1.3);
          ballast = mix(ballast, vec3(0.34, 0.33, 0.31) * (0.85 + 0.3 * fbm2(vW.xz)), sleeper);
          float rail = (1.0 - smoothstep(0.035, 0.035 + aaX, abs(xm - 0.72))) * (1.0 - smoothstep(0.05, 0.2, aaX));
          diffuseColor.rgb = mix(ballast, vec3(0.5, 0.5, 0.52), rail) * mix(1.0, 0.85, smoothstep(0.05, 0.2, aaX) * step(xm, 1.0));
        } else if (gKind > 2.5) {
          // Zones bâties vues de très loin, au-delà des derniers immeubles : toits et rues mêlés.
          vec3 landC = groundTex(vW.xz, 0.125, 4.0) * (0.72 + 0.3 * fbm2(vW.xz * 0.03)) * mix(1.0, 0.62, uNight);
          vec3 city = mix(vec3(0.3, 0.28, 0.27), vec3(0.44, 0.34, 0.29), fbm2(vW.xz / 160.0)) * (0.7 + 0.6 * fbm2(vW.xz / 41.0)) * mix(1.0, 0.45, uNight);
          diffuseColor.rgb = mix(landC, city, gFar);
        } else if (gKind > 1.5) {
          diffuseColor.rgb = vec3(0.012, 0.032, 0.036);
        } else if (gKind > 0.5) {
          // Herbe : brins à deux échelles croisées, plaques sèches et creux plus sombres à 20 et 90 m.
          vec3 gt = mix(groundTex(vW.xz, 0.33, 5.0), groundTexR(vW.xz, 0.09, 5.0), 0.4);
          float big = fbm2(vW.xz / 70.0);
          float mid = fbm2(vW.xz / 9.0);
          float small = fbm2(vW.xz / 2.6 + 3.1);
          float dry = smoothstep(0.55, 0.8, fbm2(vW.xz / 31.0 + 5.3));
          diffuseColor.rgb = vRoad.rgb * gt * 6.6 * (0.58 + 0.84 * mid) * (0.78 + 0.44 * small) * (0.82 + 0.36 * big);
          diffuseColor.rgb *= mix(vec3(0.72, 0.9, 1.0), vec3(1.0), smoothstep(0.25, 0.6, mid));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.4, 1.2, 0.6), dry * 0.6);
          float grassLuma = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(grassLuma) * vec3(1.05, 1.1, 0.7), 0.32) * (0.72 + 0.4 * smoothstep(0.2, 0.75, fbm2(vW.xz / 1.3 + 9.0)));
          // Là où les arbres 3D s'arrêtent (bord de zone, distance), la verdure boisée prend l'aspect d'une canopée vue de haut.
          float treeDensity = (vRoad.w + 1.0) / 0.4;
          float treeR = min(uFocusR, 3000.0);
          float treesShown = smoothstep(treeR, treeR * 0.72, distance(vW, uCam));
          float canopy = treeDensity * mix(1.0, smoothstep(0.42, 0.62, fbm2(vW.xz / 70.0)), step(treeDensity, 0.75)) * (1.0 - treesShown);
          vec3 leaves = mix(vec3(0.07, 0.16, 0.05), vec3(0.15, 0.27, 0.08), fbm2(vW.xz / 11.0)) * (0.55 + 0.7 * fbm2(vW.xz / 4.5));
          diffuseColor.rgb = mix(diffuseColor.rgb, leaves, canopy * 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, gF.rgb * 0.45, gF.a * 0.25 * mix(uScanGround, 0.2, uScan));
        } else {
          ${ROAD_COLOR}
        }
      `,
      emissive: /* glsl */ `
        if (gKind > 3.5) {
        } else if (gKind > 2.5) {
          totalEmissiveRadiance += vec3(1.0, 0.6, 0.28) * (0.03 + 0.12 * smoothstep(0.45, 0.8, fbm2(vW.xz / 55.0))) * uNight * gFar;
        } else if (gKind > 1.5) {
          // Eau : deux nappes de vaguelettes (texture de normales à mipmaps : lisse au loin, jamais de grain), reflet du
          // ciel par Fresnel, rive d'en face sombre dans le reflet rasant, éclat du soleil.
          float wt = uTime;
          mat2 wr2 = mat2(0.8, -0.6, 0.6, 0.8);
          vec2 p1 = vW.xz / 13.0 + vec2(wt * 0.014, wt * 0.009);
          vec2 p2 = wr2 * vW.xz / 41.0 - vec2(wt * 0.006, -wt * 0.009);
          vec2 n1 = textureGrad(uWaterTex, p1, gDx / 13.0, gDy / 13.0).rg * 2.0 - 1.0;
          vec2 n2 = textureGrad(uWaterTex, p2, wr2 * gDx / 41.0, wr2 * gDy / 41.0).rg * 2.0 - 1.0;
          vec2 slope = (n1 * 0.55 + n2 * 0.75) * 0.6;
          vec3 wn = normalize(vec3(slope.x, 1.0, slope.y));
          vec3 wv = normalize(vW - cameraPosition);
          vec3 wr = reflect(wv, wn);
          float wh = abs(wr.y);
          float wside = pow(max(dot(normalize(vec3(wr.x, 0.0, wr.z) + 1e-4), normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-4)) * 0.5 + 0.5, 0.0), 2.5);
          vec3 wsky = mix(mix(uFogCol, uSkyHorizon, wside), uSky, smoothstep(0.0, 0.2, wh));
          wsky = mix(wsky, uSkyZenith, smoothstep(0.12, 0.72, wh));
          float bank = 1.0 - smoothstep(0.02, 0.14, wh);
          vec3 bankCol = uFogCol * 0.42 + vec3(1.0, 0.62, 0.3) * smoothstep(0.5, 0.85, vnoise(vec2(vW.x + vW.z, wh * 40.0) * 0.08)) * 0.35 * uNight;
          wsky = mix(wsky, bankCol, bank * 0.65);
          float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(-wv, wn), 0.0, 1.0), 5.0);
          totalEmissiveRadiance += wsky * fres + (1.0 - fres) * mix(vec3(0.008, 0.026, 0.03), uFogCol * 0.12, 0.5);
          float sunR = max(dot(wr, uSunDir), 0.0);
          totalEmissiveRadiance += uSunCol * (pow(sunR, 80.0) * 0.6 + pow(sunR, 900.0) * 6.0) * uDisc * fres * 2.5;
        } else if (gKind > 0.5) {
          totalEmissiveRadiance += gF.rgb * gF.a * mix(uScanGround, 0.2, uScan) * uScanGroundGlow;
        } else {
          ${ROAD_EMISSIVE}
        }
        totalEmissiveRadiance += vec3(0.4, 1.0, 0.75) * revealRing(vW.xz) * 2.0;
      `,
    },
    'ground',
  );

  // Les arbres s'éclaircissent un par un au bord de la zone détaillée et au loin, au lieu de rétrécir en anneau.
  const treeV = /* glsl */ `
    float ta = fract(aInst.x * 0.137 + aInst.y * 0.271) * 6.283;
    float tc = cos(ta);
    float ts = sin(ta);
    transformed = vec3(transformed.x * tc - transformed.z * ts, transformed.y, transformed.x * ts + transformed.z * tc);
    vec2 tp = (modelMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0)).xz;
    float treeR = min(uFocusR, 3000.0);
    float tk = smoothstep(treeR, treeR * 0.72, distance(vec3(tp.x, 0.0, tp.y), uCam));
    float tg = clamp((uTime - aTree.y) / 1.1, 0.0, 1.0);
    tg = (1.0 - pow(1.0 - tg, 3.0)) * step(lodHash(floor(tp * 0.7)), tk);
    transformed = vec3(transformed.x * aInst.z, transformed.y * aInst.w, transformed.z * aInst.z) * tg + vec3(aInst.x, 0.0, aInst.y);
  `;
  const tree = patch(
    new THREE.MeshLambertMaterial(),
    {
      uniforms,
      warp: false,
      vertexHead: `attribute vec4 aInst; attribute vec2 aTree; uniform float uTime; ${FOCUS} varying float vTreeY; varying float vTone;`,
      normalBody: /* glsl */ `
        float na = fract(aInst.x * 0.137 + aInst.y * 0.271) * 6.283;
        objectNormal = vec3(objectNormal.x * cos(na) - objectNormal.z * sin(na), objectNormal.y, objectNormal.x * sin(na) + objectNormal.z * cos(na));
      `,
      vertexBody: `vTreeY = position.y; vTone = aTree.x;\n${treeV}`,
      fragmentHead: 'varying float vTreeY; varying float vTone; float gLeaf;',
      // Normales cassées par le bruit : la lumière tombe par touffes plutôt que sur une boule lisse.
      normal: /* glsl */ `
        if (vTreeY >= 0.24) {
          normal = normalize(normal + (viewMatrix * vec4((gLeaf - 0.5) * 1.1, 0.0, (0.5 - gLeaf) * 1.1, 0.0)).xyz);
        }
      `,
      color: /* glsl */ `
        if (vTreeY < 0.24) {
          gLeaf = 0.5;
          diffuseColor.rgb = vec3(0.14, 0.1, 0.07);
        } else {
          vec3 leaf = mix(vec3(0.07, 0.16, 0.05), vec3(0.15, 0.27, 0.08), vTone);
          leaf = mix(leaf, vec3(0.17, 0.2, 0.07), step(0.86, vTone) * 0.6);
          // Projection sur les trois axes : le bruit ne s'étire plus sur les flancs du feuillage.
          vec3 fn = abs(normalize(cross(dFdx(vW), dFdy(vW))));
          fn /= fn.x + fn.y + fn.z;
          float clump = texture2D(uNoise, vW.xz * 0.09).r * fn.y + texture2D(uNoise, vW.xy * 0.09).r * fn.z + texture2D(uNoise, vW.zy * 0.09).r * fn.x;
          float twig = texture2D(uNoise, vW.xz * 0.23 + 0.5).r * fn.y + texture2D(uNoise, vW.xy * 0.23 + 0.5).r * fn.z + texture2D(uNoise, vW.zy * 0.23 + 0.5).r * fn.x;
          gLeaf = smoothstep(0.22, 0.78, clump * 0.65 + twig * 0.35);
          // Touffes à deux échelles, pointes éclairées plus jaunes, intérieur et bas du houppier dans l'ombre.
          vec3 lit = leaf * (0.66 + 0.62 * gLeaf);
          lit = mix(lit, lit * vec3(1.3, 1.22, 0.78), smoothstep(0.7, 1.05, vTreeY) * gLeaf * 0.6);
          diffuseColor.rgb = lit * (0.4 + 1.05 * smoothstep(0.3, 1.0, vTreeY));
        }
      `,
    },
    'tree',
  );
  const treeDepth = depthPatch(uniforms, `attribute vec4 aInst; attribute vec2 aTree; uniform float uTime; ${FOCUS}`, treeV, 'tree-depth');

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
        else if (vPart < 2.5) diffuseColor.rgb = vec3(0.04, 0.055, 0.07) + uSky * 0.22;
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
      vertexHead: 'attribute vec4 aLamp; attribute float aPart; varying float vPart; uniform float uPixel;',
      normalBody: 'objectNormal = vec3(objectNormal.x * aLamp.z - objectNormal.z * aLamp.w, objectNormal.y, objectNormal.x * aLamp.w + objectNormal.z * aLamp.z);',
      // Au loin, le mât plus fin qu'un pixel scintillait : il disparaît, la lanterne garde au moins deux pixels.
      vertexBody: /* glsl */ `
        vPart = aPart;
        vec2 lw = (modelMatrix * vec4(aLamp.x, 0.0, aLamp.y, 1.0)).xz;
        float ld = distance(vec3(lw.x, 6.0, lw.y), cameraPosition);
        vec3 lp = position;
        if (aPart > 0.5) lp = (lp - vec3(1.6, 7.42, 0.0)) * clamp(ld * uPixel * 2.0 / 0.4, 1.0, 3.0) + vec3(1.6, 7.42, 0.0);
        else if (ld > 380.0 + 220.0 * fract(sin(dot(lw, vec2(12.9898, 78.233))) * 43758.5453)) lp = vec3(0.0);
        transformed = vec3(lp.x * aLamp.z - lp.z * aLamp.w + aLamp.x, lp.y, lp.x * aLamp.w + lp.z * aLamp.z + aLamp.y);
      `,
      fragmentHead: 'varying float vPart;',
      color: 'diffuseColor.rgb = vec3(0.17, 0.18, 0.19);',
      emissive: 'if (vPart > 0.5) totalEmissiveRadiance += vec3(1.0, 0.76, 0.48) * (0.03 + 3.0 * uNight);',
    },
    'lamp',
  );

  // La ville vue du ciel, la nuit : un point par lampadaire, toujours entre 1,6 et 3,4 pixels pour ne jamais
  // scintiller, absent de près (les vrais lampadaires prennent le relais), estompé par le brouillard.
  const lights = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aK;
      uniform float uNight, uFogD, uDpr, uEdge;
      uniform vec3 uCam;
      uniform float uMidR;
      varying vec3 vCol;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        float fog = max(1.0 - exp(-uFogD * uFogD * d * d), smoothstep(uEdge * 0.7, uEdge, length(wp.xz - uCam.xz)));
        float farL = step(3.5, aK);
        float k = aK - 4.0 * farL;
        float led = step(1.5, k);
        float rnd = fract(sin(dot(wp.xz, vec2(12.9898, 78.233))) * 43758.5453);
        float a = (k - 2.0 * led) * mix(1.0, smoothstep(uMidR * 0.75, uMidR * 0.92, length(wp.xz - uCam.xz)), farL) * (0.6 + 0.7 * rnd) * smoothstep(250.0, 900.0, d) * (1.0 - fog) * smoothstep(0.55, 1.0, uNight);
        vCol = mix(vec3(1.0, 0.5, 0.18), vec3(1.0, 0.86, 0.68), led) * a * 1.8;
        gl_PointSize = a > 0.0 ? uDpr * clamp(2600.0 / d, 0.8, 1.7) : 0.0;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vCol * smoothstep(0.5, 0.1, r), 1.0);
      }
    `,
  });

  return { uniforms, lights, building, buildingMid, buildingDetail, buildingPre, skirt, lamp, bridge, buildingDepth, ground, land, tree, treeDepth, car };
}
