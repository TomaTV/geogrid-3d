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
uniform sampler2D uField;
uniform vec2 uFieldMin;
uniform vec2 uFieldSpan;
uniform float uReveal;
uniform float uNight;
uniform float uDataGain;
uniform float uTime;
vec4 sampleField(vec2 xz) {
  vec2 warp = vec2(fbm2(xz / 420.0), fbm2(xz / 420.0 + 17.3)) - 0.5;
  vec2 p = xz + warp * 300.0;
  vec4 f = texture2D(uField, (p - uFieldMin) / uFieldSpan);
  float front = smoothstep(uReveal, uReveal - 500.0, length(xz));
  f.a *= front;
  return f;
}
float revealRing(vec2 xz) {
  return smoothstep(70.0, 0.0, abs(length(xz) - uReveal)) * step(uReveal, 14000.0);
}
`;

function patch(material, { uniforms, vertexHead = '', vertexBody = '', fragmentHead = '', color = '', emissive = '', rough = '', normal = '' }, key) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vW;\n${vertexHead}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexBody}\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vW;\n${NOISE}\n${FIELD}\n${fragmentHead}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${color}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${rough}`)
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
float grow = clamp((uTime - aMeta.w) / 1.3, 0.0, 1.0);
grow = 1.0 - pow(1.0 - grow, 3.0);
transformed.y *= max(grow, 0.002);
`;

export function createMaterials(field) {
  const uniforms = {
    uField: { value: field.texture },
    uFieldMin: { value: new THREE.Vector2(field.min[0], field.min[1]) },
    uFieldSpan: { value: new THREE.Vector2(field.span[0], field.span[1]) },
    uReveal: { value: 0 },
    uNight: { value: 1 },
    uDataGain: { value: 1 },
    uTime: { value: 0 },
  };

  const building = patch(
    new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 }),
    {
      uniforms,
      vertexHead: 'attribute vec2 aWall; attribute vec4 aMeta; varying vec2 vWall; varying vec4 vMeta; uniform float uTime;',
      vertexBody: `${GROW}\nvWall = aWall; vMeta = aMeta;`,
      fragmentHead: 'varying vec2 vWall; varying vec4 vMeta; float gWin; float gDetail; vec2 gCell; vec4 gF;',
      color: /* glsl */ `
        gF = sampleField(vW.xz);
        float cellTone = vnoise(vW.xz / 55.0);
        float seed = vMeta.y;
        gWin = 0.0;
        gDetail = 0.0;
        if (vMeta.x < 0.5) {
          vec3 stoneA = vec3(0.60, 0.53, 0.42);
          vec3 stoneB = vec3(0.70, 0.65, 0.56);
          vec3 brick = vec3(0.46, 0.30, 0.24);
          vec3 stone = mix(stoneA, stoneB, fract(seed * 7.3 + cellTone));
          stone = mix(stone, brick, step(0.86, fract(seed * 13.7)));
          vec2 c = vec2(vWall.x / 3.7, (vWall.y - 0.4) / 3.3);
          vec2 fw = fwidth(c);
          gCell = c;
          vec2 f = fract(c);
          gDetail = 1.0 - smoothstep(0.22, 0.6, max(fw.x, fw.y));
          vec2 aa = clamp(fw * 1.2, 0.01, 0.2);
          float wx = smoothstep(0.24 - aa.x, 0.24 + aa.x, f.x) * (1.0 - smoothstep(0.76 - aa.x, 0.76 + aa.x, f.x));
          float wy = smoothstep(0.2 - aa.y, 0.2 + aa.y, f.y) * (1.0 - smoothstep(0.84 - aa.y, 0.84 + aa.y, f.y));
          gWin = wx * wy * gDetail * step(3.6, vWall.y);
          float cornice = smoothstep(0.1, 0.0, f.y) * gDetail;
          float ao = mix(0.45, 1.0, smoothstep(0.0, 9.0, vWall.y));
          float streak = 0.92 + 0.08 * vnoise(vec2(vWall.x * 0.6, vWall.y * 0.08) + seed * 40.0);
          diffuseColor.rgb = stone * ao * streak * (1.0 - 0.22 * cornice);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.16, 0.2, 0.25), vec3(0.025, 0.03, 0.04), uNight), gWin);
          diffuseColor.rgb = mix(diffuseColor.rgb, gF.rgb * 0.8, gF.a * (1.0 - uNight) * 0.45 * uDataGain);
        } else {
          vec3 zinc = mix(vec3(0.17, 0.2, 0.24), vec3(0.3, 0.31, 0.33), fract(seed * 5.1 + cellTone * 0.6));
          float seams = 0.94 + 0.06 * step(0.5, fract(vWall.x * 0.9));
          diffuseColor.rgb = zinc * seams;
          diffuseColor.rgb = mix(diffuseColor.rgb, gF.rgb, gF.a * 0.62 * uDataGain);
        }
      `,
      rough: /* glsl */ `
        if (vMeta.x < 0.5) roughnessFactor = mix(roughnessFactor, 0.08, gWin);
        else roughnessFactor = 0.62;
      `,
      emissive: /* glsl */ `
        vec3 warm = vec3(1.0, 0.68, 0.36);
        float data = gF.a * uDataGain;
        if (vMeta.x < 0.5) {
          vec2 id = floor(gCell);
          float rnd = hash21(id + vec2(vMeta.y * 91.0, vMeta.y * 37.0));
          float density = mix(0.3, 0.85, data);
          float lit = step(rnd, density);
          vec3 win = mix(warm * (0.6 + 0.8 * fract(rnd * 17.0)), gF.rgb * 2.6, data);
          totalEmissiveRadiance += win * gWin * lit * uNight * 2.0;
          totalEmissiveRadiance += mix(warm * 0.35, gF.rgb * 1.5, data) * (1.0 - gDetail) * density * 0.42 * uNight;
          float shop = (1.0 - smoothstep(3.0, 3.5, vWall.y)) * smoothstep(0.6, 1.2, vWall.y);
          float shopLit = step(0.45, vnoise(vec2(vWall.x * 0.14, vMeta.y * 40.0)));
          totalEmissiveRadiance += warm * shop * shopLit * uNight * 1.1;
        } else {
          totalEmissiveRadiance += gF.rgb * data * (0.12 + 0.32 * uNight);
        }
        totalEmissiveRadiance += vec3(0.4, 1.0, 0.75) * revealRing(vW.xz) * 3.0;
      `,
    },
    'building',
  );
  const buildingDepth = depthPatch(uniforms, 'attribute vec4 aMeta; uniform float uTime;', GROW, 'building-depth');

  const groundOpts = { depthTest: false, depthWrite: false };

  const roads = patch(
    new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...groundOpts }),
    {
      uniforms,
      vertexHead: 'attribute vec3 aRoad; varying vec3 vRoad;',
      vertexBody: 'vRoad = aRoad;',
      fragmentHead: 'varying vec3 vRoad; vec4 gF;',
      color: /* glsl */ `
        gF = sampleField(vW.xz);
        float across = abs(vRoad.x);
        float kerb = smoothstep(0.78, 0.84, across);
        vec3 asphalt = vec3(0.045, 0.047, 0.052) * (0.85 + 0.3 * vnoise(vW.xz * 0.4));
        vec3 walk = vec3(0.2, 0.19, 0.18);
        diffuseColor.rgb = mix(asphalt, walk, vRoad.z > 5.0 ? kerb : 0.0);
        float dash = step(0.5, fract(vRoad.y / 7.0)) * (1.0 - smoothstep(0.015, 0.04, across)) * step(7.0, vRoad.z);
        diffuseColor.rgb += dash * 0.3;
        diffuseColor.rgb = mix(diffuseColor.rgb, gF.rgb * 0.7, gF.a * 0.25 * (1.0 - uNight) * uDataGain);
      `,
      emissive: /* glsl */ `
        float data = gF.a * uDataGain;
        float edge = smoothstep(0.55, 0.8, abs(vRoad.x)) * (1.0 - smoothstep(0.8, 1.0, abs(vRoad.x)));
        totalEmissiveRadiance += mix(vec3(0.9, 0.6, 0.3) * 0.16, gF.rgb * 1.6, data) * (0.35 + edge) * uNight;
        if (vRoad.z > 5.0) {
          float side = vRoad.x > 0.0 ? 1.0 : -1.0;
          float lane = 1.0 - smoothstep(0.1, 0.22, abs(abs(vRoad.x) - 0.38));
          float flow = fract(vRoad.y / 38.0 + side * uTime * 0.28 + hash21(vec2(floor(vRoad.y / 400.0), vRoad.z)));
          float car = smoothstep(0.05, 0.0, abs(flow - 0.5));
          float visible = 1.0 - smoothstep(0.0, 0.5, fwidth(vRoad.y) / 8.0);
          vec3 tone = side > 0.0 ? vec3(1.0, 0.9, 0.75) : vec3(1.0, 0.12, 0.08);
          totalEmissiveRadiance += tone * car * lane * visible * uNight * 3.5;
        }
        totalEmissiveRadiance += vec3(0.4, 1.0, 0.75) * revealRing(vW.xz) * 3.0;
      `,
    },
    'road',
  );

  const groundEmission = /* glsl */ `
    totalEmissiveRadiance += gF.rgb * gF.a * uDataGain * (0.05 + 0.2 * uNight);
    totalEmissiveRadiance += vec3(0.4, 1.0, 0.75) * revealRing(vW.xz) * 3.0;
  `;

  const green = patch(
    new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, vertexColors: true, ...groundOpts }),
    {
      uniforms,
      fragmentHead: 'vec4 gF;',
      color: /* glsl */ `
        gF = sampleField(vW.xz);
        float blades = 0.72 + 0.56 * fbm2(vW.xz * 0.09) * (0.7 + 0.6 * vnoise(vW.xz * 0.7));
        diffuseColor.rgb *= blades;
      `,
      emissive: groundEmission,
    },
    'green',
  );

  const land = patch(
    new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.96, metalness: 0, ...groundOpts }),
    {
      uniforms,
      fragmentHead: 'vec4 gF;',
      color: /* glsl */ `
        gF = sampleField(vW.xz);
        diffuseColor.rgb *= 0.72 + 0.5 * fbm2(vW.xz * 0.012);
        diffuseColor.rgb = mix(diffuseColor.rgb, gF.rgb * 0.65, gF.a * 0.35 * (1.0 - uNight) * uDataGain);
      `,
      emissive: groundEmission,
    },
    'land',
  );

  const water = patch(
    new THREE.MeshStandardMaterial({ color: 0x0a2034, roughness: 0.1, metalness: 0.25, envMapIntensity: 1.6, ...groundOpts }),
    {
      uniforms,
      fragmentHead: 'vec4 gF;',
      color: 'gF = sampleField(vW.xz);',
      normal: /* glsl */ `
        vec2 wp = vW.xz * 0.05;
        float wt = uTime * 0.22;
        vec2 ripple = vec2(vnoise(wp + wt) - vnoise(wp - wt + 9.0), vnoise(wp * 1.8 - wt + 3.0) - vnoise(wp * 1.8 + wt + 5.0));
        normal = normalize(normal + (viewMatrix * vec4(ripple.x * 0.16, 0.0, ripple.y * 0.16, 0.0)).xyz);
      `,
      emissive: /* glsl */ `
        totalEmissiveRadiance += vec3(0.4, 1.0, 0.75) * revealRing(vW.xz) * 2.0;
      `,
    },
    'water',
  );

  const TREE_V = /* glsl */ `
    float tg = clamp((uTime - aTree.y) / 1.1, 0.0, 1.0);
    tg = 1.0 - pow(1.0 - tg, 3.0);
    transformed = vec3(transformed.x * aInst.z, transformed.y * aInst.w, transformed.z * aInst.z) * tg + vec3(aInst.x, 0.0, aInst.y);
  `;
  const tree = patch(
    new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }),
    {
      uniforms,
      vertexHead: 'attribute vec4 aInst; attribute vec2 aTree; uniform float uTime; varying float vTreeY; varying float vTone;',
      vertexBody: `vTreeY = position.y; vTone = aTree.x;\n${TREE_V}`,
      fragmentHead: 'varying float vTreeY; varying float vTone; vec4 gF;',
      color: /* glsl */ `
        gF = sampleField(vW.xz);
        if (vTreeY < 0.24) {
          diffuseColor.rgb = vec3(0.09, 0.065, 0.045);
        } else {
          vec3 leaf = mix(vec3(0.045, 0.11, 0.035), vec3(0.14, 0.22, 0.06), vTone);
          float mottled = 0.72 + 0.56 * vnoise(vW.xz * 0.8 + vW.y * 0.9);
          diffuseColor.rgb = leaf * mottled * (0.5 + 0.85 * smoothstep(0.24, 1.0, vTreeY));
        }
      `,
      emissive: 'totalEmissiveRadiance += gF.rgb * gF.a * uDataGain * 0.05 * uNight;',
    },
    'tree',
  );
  const treeDepth = depthPatch(uniforms, 'attribute vec4 aInst; attribute vec2 aTree; uniform float uTime;', TREE_V, 'tree-depth');

  return { uniforms, building, buildingDepth, roads, green, land, water, tree, treeDepth };
}
