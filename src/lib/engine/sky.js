import * as THREE from 'three';

export const PRESETS = {
  standard: {
    elevation: 42, azimuth: 215, sun: '#d3daf0', sunPower: 1.55, envPower: 0.5, night: 0.55, stars: 0.2, sunDisc: 0, hemi: '#7d7c8a',
    zenith: '#070b14', mid: '#0e1522', horizon: '#18202f', fog: '#10151f', fogDensity: 0.00036, exposure: 1, bloom: 0.14, clouds: '#1a2232',
  },
  dusk: {
    elevation: 5.5, azimuth: 248, sun: '#ffa868', sunPower: 3.7, envPower: 0.6, hemi: '#a59ea8', night: 0.72, stars: 0.12, sunDisc: 1,
    zenith: '#17294f', mid: '#59608a', horizon: '#f08f58', fog: '#5d5a6c', fogDensity: 0.00036, exposure: 1.0, bloom: 0.22, clouds: '#ff9c72',
  },
  night: {
    elevation: 38, azimuth: 150, sun: '#7f9bd8', sunPower: 0.42, envPower: 0.32, night: 1, stars: 1, sunDisc: 0.12,
    zenith: '#02050f', mid: '#071024', horizon: '#14233f', fog: '#0c1526', fogDensity: 0.00046, exposure: 1.15, bloom: 0.2, clouds: '#1b2740',
  },
  day: {
    elevation: 44, azimuth: 205, sun: '#fff0da', sunPower: 3.5, envPower: 0.95, night: 0, stars: 0, sunDisc: 1,
    zenith: '#2a66b8', mid: '#6ea4dc', horizon: '#d6e6f3', fog: '#bfd2e2', fogDensity: 0.00034, exposure: 0.92, bloom: 0.12, clouds: '#ffffff',
  },
};

export function livePreset(lng, lat, date = new Date()) {
  const r = Math.PI / 180;
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545;
  const g = (357.528 + 0.9856003 * d) * r;
  const l = (280.46 + 0.9856474 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * r;
  const eps = (23.439 - 4e-7 * d) * r;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(l), Math.cos(l));
  const dec = Math.asin(Math.sin(eps) * Math.sin(l));
  const h = (18.697374558 + 24.06570982441908 * d) * 15 * r + lng * r - ra;
  const phi = lat * r;
  const elevation = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h)) / r;
  const azimuth = (Math.atan2(-Math.sin(h), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(h)) / r + 360) % 360;
  if (elevation > 10) return { ...PRESETS.day, elevation, azimuth };
  if (elevation > -5) return { ...PRESETS.dusk, elevation: Math.max(elevation, 3), azimuth };
  return PRESETS.night;
}

export function sunDirection(p) {
  const e = (p.elevation * Math.PI) / 180;
  const a = (p.azimuth * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
}

const color = (hex) => new THREE.Color(hex);

export function createSky() {
  const uniforms = {
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uZenith: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uFog: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uCloud: { value: new THREE.Color() },
    uStars: { value: 0 },
    uDisc: { value: 1 },
    uClock: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uSun, uZenith, uMid, uHorizon, uFog, uSunColor, uCloud;
      uniform float uStars, uDisc, uClock;
      float h21(vec2 p) { return fract(sin(dot(mod(p, 289.0), vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float a = 0.5, s = 0.0;
        for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 7.1; a *= 0.5; }
        return s;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        float toSun = max(dot(d, uSun), 0.0);
        float side = pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSun.x, 0.0, uSun.z))) * 0.5 + 0.5, 0.0), 2.5);
        vec3 horizon = mix(uFog, uHorizon, side);
        vec3 c = mix(horizon, uMid, smoothstep(0.0, 0.2, h));
        c = mix(c, uZenith, smoothstep(0.12, 0.72, h));
        c = mix(uFog, c, smoothstep(0.0, 0.08, h));
        c += uSunColor * pow(toSun, 9.0) * 0.32 * uDisc;
        c += uSunColor * pow(toSun, 90.0) * 0.8 * uDisc;
        c += uSunColor * smoothstep(0.99925, 0.99965, toSun) * 26.0 * uDisc;

        if (d.y > 0.015) {
          vec2 sp = d.xz / (d.y + 0.28) * 1.6;
          float n = fbm(sp + vec2(uClock * 0.006, uClock * 0.002));
          float cover = smoothstep(0.5, 0.78, n) * smoothstep(0.015, 0.14, d.y);
          float lit = 0.5 + 0.7 * pow(toSun, 3.0) + 0.4 * n;
          c = mix(c, uCloud * lit, cover * 0.8);
          if (uStars > 0.0) {
            vec3 g = d * 260.0;
            vec3 q = floor(g);
            float s = h21(q.xy + q.z * 3.1);
            float dot3 = smoothstep(0.34, 0.0, length(fract(g) - 0.5));
            c += vec3(0.9, 0.95, 1.0) * step(0.994, s) * dot3 * (0.4 + 2.2 * fract(s * 97.0)) * uStars * (1.0 - cover) * smoothstep(0.03, 0.3, d.y);
          }
        }
        if (d.y < 0.0) c = mix(c, uFog, smoothstep(0.0, -0.05, d.y));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;

  function apply(p) {
    uniforms.uSun.value.copy(sunDirection(p));
    uniforms.uZenith.value.copy(color(p.zenith));
    uniforms.uMid.value.copy(color(p.mid));
    uniforms.uHorizon.value.copy(color(p.horizon));
    uniforms.uFog.value.copy(color(p.fog));
    uniforms.uSunColor.value.copy(color(p.sun));
    uniforms.uCloud.value.copy(color(p.clouds));
    uniforms.uStars.value = p.stars;
    uniforms.uDisc.value = p.sunDisc;
  }

  return { mesh, uniforms, apply };
}
