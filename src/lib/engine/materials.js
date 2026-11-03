import * as THREE from 'three';

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

const FIELD = /* glsl */ `
varying vec2 vWarp;
uniform sampler2D uField;
uniform vec2 uFieldMin;
uniform vec2 uFieldSpan;
uniform float uReveal;
uniform float uNight;
uniform float uScan;
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

function patch(material, { uniforms, warp = true, vertexHead = '', vertexBody = '', fragmentHead = '', color = '', emissive = '', normal = '' }, key) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vW;\nvarying vec2 vWarp;\n${warp ? NOISE : ''}\n${vertexHead}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n${vertexBody}\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWarp = ${warp ? 'vec2(vnoise(vW.xz / 55.0) - 0.5, 0.0)' : 'vec2(0.0)'};`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vW;\n${NOISE}\n${FIELD}\n${fragmentHead}`)
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

export function createMaterials(field) {
  const uniforms = {
    uField: { value: field.texture },
    uFieldMin: { value: new THREE.Vector2(field.min[0], field.min[1]) },
    uFieldSpan: { value: new THREE.Vector2(field.span[0], field.span[1]) },
    uReveal: { value: 0 },
    uNight: { value: 1 },
    uScan: { value: 0 },
    uTime: { value: 0 },
    uFocus: { value: new THREE.Vector2() },
    uFocusR: { value: 5000 },
  };

  const building = patch(
    new THREE.MeshLambertMaterial(),
    {
      uniforms,
      vertexHead: `attribute vec2 aWall; attribute vec2 aCenter; attribute vec4 aMeta; varying vec2 vWall; varying vec4 vMeta; uniform float uTime; ${FOCUS}`,
      vertexBody: `${GROW}\nvWall = aWall; vMeta = aMeta;`,
      fragmentHead: 'varying vec2 vWall; varying vec4 vMeta; float gWin; float gDetail; vec2 gCell; vec4 gF;',
      color: /* glsl */ `
        gF = sampleField(vW.xz);
        float cellTone = vWarp.x + 0.5;
        float seed = vMeta.y;
        gWin = 0.0;
        gDetail = 0.0;
        if (vMeta.x < 0.5) {
          vec3 stone = mix(vec3(0.60, 0.53, 0.42), vec3(0.70, 0.65, 0.56), fract(seed * 7.3 + cellTone));
          stone = mix(stone, vec3(0.46, 0.30, 0.24), step(0.86, fract(seed * 13.7)));
          vec2 c = vec2(vWall.x / 3.7, (vWall.y - 0.4) / 3.3);
          vec2 fw = fwidth(c);
          gCell = c;
          gDetail = 1.0 - smoothstep(0.17, 0.5, max(fw.x, fw.y));
          float ao = mix(0.45, 1.0, smoothstep(0.0, 9.0, vWall.y));
          float cornice = 0.0;
          float balcony = 0.0;
          if (gDetail > 0.0) {
            vec2 f = fract(c);
            vec2 aa = clamp(fw * 1.2, 0.01, 0.2);
            float wx = smoothstep(0.24 - aa.x, 0.24 + aa.x, f.x) * (1.0 - smoothstep(0.76 - aa.x, 0.76 + aa.x, f.x));
            float wy = smoothstep(0.2 - aa.y, 0.2 + aa.y, f.y) * (1.0 - smoothstep(0.84 - aa.y, 0.84 + aa.y, f.y));
            gWin = wx * wy * gDetail * step(3.6, vWall.y);
            cornice = smoothstep(0.1, 0.0, f.y) * gDetail;
            balcony = step(2.5, mod(floor(c.y), 4.0)) * smoothstep(0.2, 0.12, f.y) * gDetail;
          }
          float storey = smoothstep(3.6, 3.2, vWall.y);
          float height01 = clamp(vWall.y / max(vMeta.z, 1.0), 0.0, 1.0);
          diffuseColor.rgb = stone * ao * (1.0 - 0.22 * cornice) * (1.0 - 0.55 * balcony) * mix(1.0, 0.68, storey) * (0.9 + 0.16 * height01);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.16, 0.2, 0.25), vec3(0.02, 0.025, 0.035), smoothstep(0.0, 0.4, uNight)), gWin);
        } else {
          vec3 zinc = mix(vec3(0.17, 0.2, 0.24), vec3(0.3, 0.31, 0.33), fract(seed * 5.1 + cellTone * 0.6));
          diffuseColor.rgb = mix(zinc, gF.rgb, gF.a * 0.14);
        }
        if (uScan > 0.5) {
          float shade = vMeta.x < 0.5 ? mix(0.62, 1.0, smoothstep(0.0, 12.0, vWall.y)) * (1.0 - gWin * 0.28) : 1.0;
          diffuseColor.rgb = mix(diffuseColor.rgb, gF.rgb * shade, smoothstep(0.03, 0.55, gF.a));
        }
      `,
      emissive: /* glsl */ `
        if (uScan > 0.5) totalEmissiveRadiance += gF.rgb * smoothstep(0.03, 0.55, gF.a) * (0.03 + 0.08 * uNight);
        if (vMeta.x < 0.5 && uScan < 0.5) totalEmissiveRadiance += gF.rgb * gF.a * (1.0 - smoothstep(0.0, 13.0, vWall.y)) * (0.1 + 0.22 * uNight);
        if (vMeta.x < 0.5) {
          vec3 warm = vec3(1.0, 0.68, 0.36);
          float rnd = hash21(floor(gCell) + vec2(vMeta.y * 91.0, vMeta.y * 37.0));
          float rnd2 = fract(rnd * 53.7);
          float density = 0.36 + 0.26 * gF.a;
          vec3 tint = rnd2 > 0.95 ? vec3(0.68, 0.8, 1.0) : mix(vec3(1.0, 0.6, 0.28), vec3(1.0, 0.8, 0.56), fract(rnd * 17.0));
          float scanned = max(step(rnd2, gF.a * 0.6), gF.a * uScan);
          vec3 win = mix(tint, gF.rgb * 1.3, scanned);
          totalEmissiveRadiance += win * gWin * step(rnd, density) * uNight * (0.65 + 0.65 * fract(rnd * 31.0)) * mix(1.25, 0.9, uScan);
          totalEmissiveRadiance += mix(warm * 0.5, gF.rgb * 0.9, gF.a * mix(0.55, 1.0, uScan)) * (1.0 - gDetail) * density * 0.6 * uNight;
          float shop = (1.0 - smoothstep(3.0, 3.5, vWall.y)) * smoothstep(0.6, 1.2, vWall.y);
          totalEmissiveRadiance += warm * shop * step(0.45, fract(floor(vWall.x * 0.14) * 0.37 + vMeta.y * 9.0)) * uNight * 1.1;
        } else {
          totalEmissiveRadiance += gF.rgb * gF.a * uScan * (0.12 + 0.32 * uNight);
        }
        totalEmissiveRadiance += vec3(0.4, 1.0, 0.75) * revealRing(vW.xz) * 2.0;
      `,
    },
    'building',
  );
  const buildingDepth = depthPatch(uniforms, `attribute vec2 aCenter; attribute vec4 aMeta; uniform float uTime; ${FOCUS}`, GROW, 'building-depth');

  const groundOpts = { depthTest: false, depthWrite: false };

  const roads = patch(
    new THREE.MeshLambertMaterial(groundOpts),
    {
      uniforms,
      vertexHead: 'attribute vec3 aRoad; varying vec3 vRoad;',
      vertexBody: 'vRoad = aRoad;',
      fragmentHead: 'varying vec3 vRoad; vec4 gF;',
      color: /* glsl */ `
        gF = sampleField(vW.xz);
        float across = abs(vRoad.x);
        float kerb = smoothstep(0.78, 0.84, across);
        diffuseColor.rgb = mix(vec3(0.05, 0.052, 0.057), vec3(0.2, 0.19, 0.18), vRoad.z > 5.0 ? kerb : 0.0);
        float dash = step(0.5, fract(vRoad.y / 7.0)) * (1.0 - smoothstep(0.015, 0.04, across)) * step(7.0, vRoad.z);
        diffuseColor.rgb += dash * 0.3;
        diffuseColor.rgb = mix(diffuseColor.rgb, gF.rgb * 0.5, gF.a * 0.4);
      `,
      emissive: /* glsl */ `
        float edge = smoothstep(0.55, 0.8, abs(vRoad.x)) * (1.0 - smoothstep(0.8, 1.0, abs(vRoad.x)));
        totalEmissiveRadiance += mix(vec3(0.9, 0.6, 0.3) * 0.16, gF.rgb * 0.8, gF.a) * (0.3 + edge) * uNight;
        if (vRoad.z > 5.0 && uNight > 0.0) {
          float side = vRoad.x > 0.0 ? 1.0 : -1.0;
          float lane = 1.0 - smoothstep(0.1, 0.22, abs(abs(vRoad.x) - 0.38));
          float flow = fract(vRoad.y / 38.0 + side * uTime * 0.28 + floor(vRoad.y / 400.0) * 0.37);
          float visible = 1.0 - smoothstep(0.0, 0.5, fwidth(vRoad.y) / 8.0);
          vec3 tone = side > 0.0 ? vec3(1.0, 0.9, 0.75) : vec3(1.0, 0.12, 0.08);
          totalEmissiveRadiance += tone * smoothstep(0.05, 0.0, abs(flow - 0.5)) * lane * visible * uNight * 3.5;
          float lamp = smoothstep(0.07, 0.0, abs(fract(vRoad.y / 27.0) - 0.5)) * smoothstep(0.14, 0.0, abs(abs(vRoad.x) - 0.88));
          totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * lamp * visible * uNight * 2.6;
        }
        totalEmissiveRadiance += vec3(0.4, 1.0, 0.75) * revealRing(vW.xz) * 2.0;
      `,
    },
    'road',
  );

  const groundEmission = /* glsl */ `
    totalEmissiveRadiance += gF.rgb * gF.a * (0.03 + 0.1 * uNight);
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
        diffuseColor.rgb = mix(diffuseColor.rgb, gF.rgb * 0.45, gF.a * 0.25);
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
        diffuseColor.rgb = mix(diffuseColor.rgb, gF.rgb * 0.5, gF.a * 0.4);
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
        normal = normalize(normal + (viewMatrix * vec4(ripple.x * 0.16, 0.0, ripple.y * 0.16, 0.0)).xyz);
      `,
      emissive: 'totalEmissiveRadiance += vec3(0.4, 1.0, 0.75) * revealRing(vW.xz) * 2.0;',
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
          vec3 leaf = mix(vec3(0.045, 0.11, 0.035), vec3(0.14, 0.22, 0.06), vTone);
          diffuseColor.rgb = leaf * (0.5 + 0.85 * smoothstep(0.24, 1.0, vTreeY));
        }
      `,
    },
    'tree',
  );
  const treeDepth = depthPatch(uniforms, `attribute vec4 aInst; attribute vec2 aTree; uniform float uTime; ${FOCUS}`, TREE_V, 'tree-depth');

  return { uniforms, building, buildingDepth, roads, green, land, water, tree, treeDepth };
}
