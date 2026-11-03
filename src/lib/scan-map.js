import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createField, createProjection } from './engine/field.js';
import { rgbHex } from './rank-colors.js';
import { addLandmarks } from './engine/landmarks.js';
import { createMaterials } from './engine/materials.js';
import { PRESETS, createSky, livePreset, sunDirection } from './engine/sky.js';

const TILES_URL = 'https://tiles.openfreemap.org/planet';
const WORKERS = 2;
const MAX_NEAR = 36;
const FAR_ZOOM = 11;
const NEAR_ZOOM = 14;
const MAX_RANGE = 25000;

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function treeGeometries() {
  const unit = (g, sx, sy, sz, x, y, z) => {
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    return g.index ? g.toNonIndexed() : g;
  };
  const near = mergeGeometries([
    unit(new THREE.CylinderGeometry(0.05, 0.08, 0.3, 5, 1, true), 1, 1, 1, 0, 0.15, 0),
    unit(new THREE.IcosahedronGeometry(1, 1), 0.95, 0.42, 0.95, 0, 0.56, 0),
    unit(new THREE.IcosahedronGeometry(1, 1), 0.62, 0.32, 0.62, 0.26, 0.7, 0.18),
  ]);
  const far = unit(new THREE.IcosahedronGeometry(1, 0), 0.95, 0.45, 0.95, 0, 0.58, 0);
  return { near, far };
}

/** @param {any} container @param {any} scan @param {any} options */
export function createScanMap(container, scan, options) {
  const { onNodeSelect, onReady, onError, time = 'dusk' } = options;
  const nodes = scan.grid_data;
  const center = [scan.longitude, scan.latitude];
  const proj = createProjection(center[0], center[1]);
  const field = createField(nodes, proj);
  const selfNode = nodes.find((n) => n.self)?.self;
  const businessXZ = selfNode ? proj.toWorld(selfNode.lng, selfNode.lat) : null;
  const hq = /[?&]hq\b/.test(location.search);

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  let dpr = Math.min(window.devicePixelRatio || 1, 1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;outline:none';

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.0002);
  const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 2, 160000);
  camera.position.set(-300, 5200, 4200);

  const mats = createMaterials(field);
  const lightLandmarks = addLandmarks(scene, proj);
  const sky = createSky();
  sky.mesh.renderOrder = -200;
  scene.add(sky.mesh);

  const land = new THREE.Mesh(new THREE.CircleGeometry(150000, 48).rotateX(-Math.PI / 2), mats.land);
  land.renderOrder = -120;
  land.receiveShadow = true;
  land.frustumCulled = false;
  scene.add(land);

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 1.6;
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
  scene.add(hemi);

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 }));
  composer.setPixelRatio(dpr);
  composer.setSize(container.clientWidth, container.clientHeight);
  composer.addPass(new RenderPass(scene, camera));
  // Une seule valeur invalide suffit à noircir de grands rectangles dans le bloom.
  composer.addPass(
    new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (isnan(c.r) || isnan(c.g) || isnan(c.b) || isinf(c.r) || isinf(c.g) || isinf(c.b)) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(min(c.rgb, vec3(2.2)), 1.0); }',
    }),
  );
  const bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth / 2, container.clientHeight / 2), 0.22, 0.45, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null;

  const controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.panSpeed = 0.55;
  controls.rotateSpeed = 0.55;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(83);
  controls.minDistance = 35;
  controls.maxDistance = 9000;
  controls.enableZoom = false;
  controls.target.set(0, 0, 0);

  let shadowDirty = true;
  let fogBase = 0.0003;
  let shadowAt = -10;
  const shadowAnchor = new THREE.Vector3(1e9, 0, 0);

  function applyPreset(p) {
    sky.apply(p);
    sun.color.set(p.sun);
    sun.intensity = p.sunPower;
    sun.userData.dir = sunDirection(p);
    scene.fog.color.set(p.fog);
    scene.fog.density = p.fogDensity;
    mats.uniforms.uNight.value = p.night;
    renderer.toneMappingExposure = p.exposure;
    hemi.color.set(p.hemi ?? p.mid);
    hemi.groundColor.set(p.fog);
    hemi.intensity = p.envPower * 2.6;
    bloom.strength = p.bloom;
    lightLandmarks(p.night);
    fogBase = p.fogDensity;
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(sky.mesh.geometry, sky.mesh.material));
    const next = pmrem.fromScene(envScene, 0.02, 0.1, 10);
    scene.environment = next.texture;
    scene.environmentIntensity = p.envPower;
    envTarget?.dispose();
    envTarget = next;
    shadowDirty = true;
  }
  applyPreset(PRESETS[time] ?? PRESETS.dusk);

  const startedAt = performance.now();
  let now = 0;
  const trees = treeGeometries();
  const tiles = new Map();
  const uploads = [];
  const pendingJobs = new Map();
  const queue = [];
  const workers = [];
  const requested = new Set();
  const failedAt = new Map();
  let lastWanted = new Set();
  let template = null;
  let destroyed = false;
  let nextId = 1;
  let firstReady = false;
  let loadErrors = 0;
  let introStart = -1;
  let growUntil = 0;

  function launch(worker) {
    while (queue.length) {
      const job = queue.shift();
      if (!job.wanted()) {
        requested.delete(job.key);
        continue;
      }
      worker.busy = true;
      pendingJobs.set(job.id, job);
      worker.instance.postMessage({
        id: job.id, template, z: job.z, x: job.x, y: job.y, k: proj.k, mx0: proj.mx0, my0: proj.my0,
        radial: introStart < 0 || now - introStart < 5,
        exclude,
      });
      return;
    }
    worker.busy = false;
  }

  for (let i = 0; i < WORKERS; i++) {
    const instance = new Worker(new URL('./engine/tile.worker.js', import.meta.url), { type: 'module' });
    const worker = { instance, busy: false };
    instance.onmessage = ({ data }) => {
      const job = pendingJobs.get(data.id);
      pendingJobs.delete(data.id);
      if (destroyed) return;
      if (job) {
        requested.delete(job.key);
        if (data.error) {
          loadErrors++;
          failedAt.set(job.key, performance.now());
          if (!firstReady && loadErrors > 6) onError?.(new Error(data.error));
        } else {
          uploads.push({ ...job, result: data.result });
        }
      }
      launch(worker);
    };
    instance.onerror = (e) => {
      if (!firstReady) onError?.(e);
    };
    workers.push(worker);
  }

  function enqueue(z, x, y, priority, wanted) {
    const key = z + '/' + x + '/' + y;
    if (tiles.has(key) || requested.has(key)) {
      const queued = queue.find((j) => j.key === key);
      if (queued) queued.priority = priority;
      return;
    }
    const failed = failedAt.get(key);
    if (failed && performance.now() - failed < 15000) return;
    requested.add(key);
    queue.push({ id: nextId++, key, z, x, y, priority, wanted });
  }

  const freeAfterUpload = function () {
    this.array = null;
  };
  const exclude = [[...proj.toWorld(2.2945, 48.85826), 135]];
  const look = new THREE.Vector3();
  const focusTo = new THREE.Vector2();
  const focusRadius = (dist) => THREE.MathUtils.clamp(dist * 2.2, 2600, 3700);
  function refreshTiles() {
    if (!template) return;
    const t = controls.target;
    const dist = camera.position.distanceTo(t);
    const R = focusRadius(dist);
    camera.getWorldDirection(look);
    const size = proj.tileMeters(NEAR_ZOOM);
    const [cx, cy] = proj.tileAt(t.x, t.z, NEAR_ZOOM);
    const span = Math.ceil(R / size) + 1;
    const wantedNear = new Set();
    if (dist < 9500) {
      for (let x = cx - span; x <= cx + span; x++) {
        for (let y = cy - span; y <= cy + span; y++) {
          const [ox, oz] = proj.tileOrigin(x, y, NEAR_ZOOM);
          const mx = ox + size / 2;
          const mz = oz + size / 2;
          const d = Math.hypot(mx - t.x, mz - t.z);
          if (d > R + size * 0.75) continue;
          const key = NEAR_ZOOM + '/' + x + '/' + y;
          wantedNear.add(key);
          const toX = mx - camera.position.x;
          const toZ = mz - camera.position.z;
          const facing = (toX * look.x + toZ * look.z) / (Math.hypot(toX, toZ) || 1);
          enqueue(NEAR_ZOOM, x, y, d * (facing > 0.25 ? 1 : 2.5), () => lastWanted.has(key));
        }
      }
    }
    lastWanted = wantedNear;

    const farSize = proj.tileMeters(FAR_ZOOM);
    const [fx, fy] = proj.tileAt(t.x, t.z, FAR_ZOOM);
    for (let x = fx - 1; x <= fx + 1; x++) {
      for (let y = fy - 1; y <= fy + 1; y++) {
        const [ox, oz] = proj.tileOrigin(x, y, FAR_ZOOM);
        enqueue(FAR_ZOOM, x, y, 200000 + Math.hypot(ox + farSize / 2 - t.x, oz + farSize / 2 - t.z), () => true);
      }
    }
    queue.sort((a, b) => a.priority - b.priority);
    for (const w of workers) if (!w.busy) launch(w);

    const near = [...tiles.values()].filter((e) => e.z === NEAR_ZOOM);
    if (near.length > MAX_NEAR) {
      near
        .map((e) => [e, Math.hypot(e.cx - t.x, e.cz - t.z)])
        .sort((a, b) => b[1] - a[1])
        .slice(0, near.length - MAX_NEAR)
        .forEach(([e]) => dropTile(e));
    }
    for (const e of near) {
      if (!e.treeMesh) continue;
      const d = Math.hypot(e.cx - camera.position.x, e.cz - camera.position.z);
      const useNear = d < 900;
      const geo = useNear ? e.treeNear : e.treeFar;
      if (e.treeMesh.geometry !== geo) {
        e.treeMesh.geometry = geo;
        e.treeMesh.castShadow = useNear;
        shadowDirty = true;
      }
      e.treeMesh.visible = d < 3200;
    }
  }

  function groundMesh(part, material, order, origin) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(part.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(part.nor, 3));
    if (part.col) g.setAttribute('color', new THREE.BufferAttribute(part.col, 3));
    if (part.road) g.setAttribute('aRoad', new THREE.BufferAttribute(part.road, 3));
    g.setIndex(new THREE.BufferAttribute(part.idx, 1));
    g.computeBoundingSphere();
    for (const a of [...Object.values(g.attributes), g.index]) a.onUpload(freeAfterUpload);
    const m = new THREE.Mesh(g, material);
    m.position.set(origin[0], 0, origin[1]);
    m.renderOrder = order;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    return m;
  }

  function integrate({ key, z, x, y, result }) {
    const entry = { key, z, x, y, meshes: [], cx: result.origin[0] + result.size / 2, cz: result.origin[1] + result.size / 2, buildingMesh: null, data: null, treeMesh: null };
    const add = (m) => {
      scene.add(m);
      entry.meshes.push(m);
    };
    const base = z === NEAR_ZOOM ? 0 : -30;
    if (result.green) add(groundMesh(result.green, mats.green, -60 + base, result.origin));
    if (result.water) add(groundMesh(result.water, mats.water, -55 + base, result.origin));
    if (result.roads) add(groundMesh(result.roads, mats.roads, -50 + base, result.origin));

    if (result.buildings) {
      const b = result.buildings;
      for (let i = 3; i < b.meta.length; i += 4) b.meta[i] += now;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(b.nor, 3));
      g.setAttribute('aWall', new THREE.BufferAttribute(b.wall, 2));
      g.setAttribute('aMeta', new THREE.BufferAttribute(b.meta, 4));
      g.setAttribute('aCenter', new THREE.BufferAttribute(b.center, 2));
      g.setIndex(new THREE.BufferAttribute(b.idx, 1));
      g.computeBoundingSphere();
      for (const name of ['aWall', 'aMeta', 'aCenter']) g.attributes[name].onUpload(freeAfterUpload);
      const mesh = new THREE.Mesh(g, mats.building);
      mesh.customDepthMaterial = mats.buildingDepth;
      mesh.position.set(result.origin[0], 0, result.origin[1]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      add(mesh);
      entry.buildingMesh = mesh;
      entry.data = { pos: b.pos, idx: b.idx, starts: b.starts, idxStarts: b.idxStarts, heights: b.heights };
      growUntil = Math.max(growUntil, now + 3.2);
    }
    if (result.trees) {
      const t = result.trees;
      for (let i = 1; i < t.tree.length; i += 2) t.tree[i] += now;
      const inst = new THREE.InstancedBufferAttribute(t.inst, 4);
      const attr = new THREE.InstancedBufferAttribute(t.tree, 2);
      inst.onUpload(freeAfterUpload);
      attr.onUpload(freeAfterUpload);
      const sphere = new THREE.Sphere(new THREE.Vector3(result.size / 2, 10, result.size / 2), result.size * 0.75);
      const make = (src) => {
        const g = new THREE.InstancedBufferGeometry();
        g.setAttribute('position', src.attributes.position);
        g.setAttribute('normal', src.attributes.normal);
        g.setAttribute('aInst', inst);
        g.setAttribute('aTree', attr);
        g.instanceCount = t.inst.length / 4;
        g.boundingSphere = sphere;
        return g;
      };
      entry.treeNear = make(trees.near);
      entry.treeFar = make(trees.far);
      const mesh = new THREE.Mesh(entry.treeFar, mats.tree);
      mesh.customDepthMaterial = mats.treeDepth;
      mesh.position.set(result.origin[0], 0, result.origin[1]);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      add(mesh);
      entry.treeMesh = mesh;
    }
    tiles.set(key, entry);
    shadowDirty = true;

    if (!firstReady && z === NEAR_ZOOM) {
      firstReady = true;
      introStart = now;
      onReady?.({ tiles: tiles.size });
    }
  }

  function dropTile(entry) {
    for (const m of entry.meshes) {
      scene.remove(m);
      if (m !== entry.treeMesh) m.geometry.dispose();
    }
    entry.treeNear?.dispose();
    entry.treeFar?.dispose();
    tiles.delete(entry.key);
    shadowDirty = true;
  }

  // Repères
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  container.appendChild(overlay);
  const labels = [];
  function label(className, html, x, y, z) {
    const el = document.createElement('div');
    el.className = className;
    el.innerHTML = html;
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    overlay.appendChild(el);
    const item = { el, pos: new THREE.Vector3(x, y, z), hidden: false };
    labels.push(item);
    return item;
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(30, 33, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, fog: false }),
  );
  ring.position.y = 0.5;
  scene.add(ring);
  label('scan-center', '<span>Scan center</span>', 0, 8, 0);

  if (businessXZ) {
    const beamGeo = new THREE.CylinderGeometry(3, 3, 420, 12, 1, true);
    beamGeo.translate(0, 210, 0);
    const beam = new THREE.Mesh(
      beamGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        vertexShader: 'varying float vY; void main(){ vY = position.y / 420.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying float vY; void main(){ gl_FragColor = vec4(vec3(0.2, 1.0, 0.6) * 2.4, pow(1.0 - vY, 1.6) * 0.8); }',
      }),
    );
    beam.position.set(businessXZ[0], 0, businessXZ[1]);
    scene.add(beam);
    label('scan-business', '<span>' + escapeHtml(scan.target_name) + '</span><i></i>', businessXZ[0], 46, businessXZ[1]);
  }

  let zoomPending = 0;
  let zoomCursor = null;
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundHit = new THREE.Vector3();
  const zoomBy = (factor) => {
    endIntro();
    zoomCursor = null;
    zoomPending += Math.log(factor);
  };

  const credit = document.createElement('div');
  credit.className = 'eng-credit';
  credit.innerHTML = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
  container.appendChild(credit);

  // Sélection
  const highlight = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, depthFunc: THREE.LessEqualDepth, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false }),
  );
  highlight.visible = false;
  highlight.matrixAutoUpdate = false;
  scene.add(highlight);
  const arc = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uT: mats.uniforms.uTime, uSpan: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; uniform float uT; uniform float uSpan; void main(){ float dash = smoothstep(0.35, 0.5, fract(vUv.x * uSpan / 34.0 - uT * 0.7)); float ends = smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x); gl_FragColor = vec4(vec3(0.55, 1.0, 0.8), (0.28 + 0.62 * dash) * ends); }',
    }),
  );
  arc.visible = false;
  arc.frustumCulled = false;
  scene.add(arc);
  const distanceChip = label('scan-distance', '<span></span>', 0, 0, 0);
  distanceChip.hidden = true;

  function setArc(from, to) {
    const span = from.distanceTo(to);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    mid.y = Math.max(from.y, to.y) + Math.min(span * 0.2, 420);
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    arc.geometry.dispose();
    arc.geometry = new THREE.TubeGeometry(curve, 64, Math.max(0.6, camera.position.distanceTo(controls.target) * 0.0009), 6, false);
    arc.material.uniforms.uSpan.value = span;
    arc.visible = true;
    distanceChip.pos.copy(curve.getPoint(0.5));
    distanceChip.el.firstChild.textContent = span >= 1000 ? (span / 1000).toFixed(1) + ' km' : Math.round(span) + ' m';
    distanceChip.hidden = false;
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let selected = null;

  function raycast(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const entries = [...tiles.values()].filter((e) => e.buildingMesh);
    const hit = raycaster.intersectObjects(entries.map((e) => e.buildingMesh), false)[0];
    if (!hit) return null;
    const entry = entries.find((e) => e.buildingMesh === hit.object);
    const { starts, heights } = entry.data;
    const v = hit.face.a;
    let lo = 0;
    let hi = starts.length - 2;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (starts[m] <= v) lo = m;
      else hi = m - 1;
    }
    return { entry, building: lo, point: hit.point, height: heights[lo] };
  }

  function showHighlight(h) {
    if (!h) {
      highlight.visible = false;
      return;
    }
    const { pos, idx, idxStarts } = h.entry.data;
    const from = idxStarts[h.building];
    const to = idxStarts[h.building + 1];
    const out = new Float32Array((to - from) * 3);
    for (let i = from; i < to; i++) {
      const v = idx[i] * 3;
      out[(i - from) * 3] = pos[v];
      out[(i - from) * 3 + 1] = pos[v + 1];
      out[(i - from) * 3 + 2] = pos[v + 2];
    }
    highlight.geometry.dispose();
    highlight.geometry = new THREE.BufferGeometry();
    highlight.geometry.setAttribute('position', new THREE.BufferAttribute(out, 3));
    highlight.geometry.computeBoundingSphere();
    highlight.matrix.copy(h.entry.buildingMesh.matrix);
    highlight.matrixWorldNeedsUpdate = true;
    highlight.visible = true;
  }

  function describe(h) {
    const e = field.estimate(h.point.x, h.point.z);
    return {
      index: e.node,
      node: nodes[e.node],
      dist: Math.round(e.dist),
      businessDist: businessXZ ? Math.round(Math.hypot(h.point.x - businessXZ[0], h.point.z - businessXZ[1])) : null,
      inScan: e.conf >= 0.25,
      outOfTop: e.outOfTop,
      est: e.rank != null ? Math.round(e.rank) : null,
      estColor: e.rgb ? rgbHex(e.rgb) : '#555555',
      height: Math.round(h.height),
      from: proj.toLngLat(h.point.x, h.point.z),
      to: selfNode ? [selfNode.lng, selfNode.lat] : null,
      hit: h,
    };
  }

  function showLinks(info) {
    if (!info || !businessXZ) {
      arc.visible = false;
      distanceChip.hidden = true;
      return;
    }
    setArc(info.hit.point.clone(), new THREE.Vector3(businessXZ[0], 4, businessXZ[1]));
  }

  let dragging = false;
  let downAt = null;
  const el = renderer.domElement;
  const onDown = (e) => {
    dragging = true;
    downAt = [e.clientX, e.clientY];
    endIntro();
  };
  const onUp = (e) => {
    dragging = false;
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5) {
      const h = raycast(e.clientX, e.clientY);
      selected = h ? describe(h) : null;
      showHighlight(h);
      showLinks(selected);
      onNodeSelect?.(selected);
    }
    downAt = null;
  };
  const onWheel = (e) => {
    e.preventDefault();
    endIntro();
    const unit = e.deltaMode === 1 ? 30 : 1;
    zoomPending += e.deltaY * unit * (e.ctrlKey ? 0.009 : 0.0011);
    zoomCursor = [e.clientX, e.clientY];
  };
  const keys = new Set();
  const onKey = (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.type === 'keydown') {
      keys.add(e.code);
      endIntro();
    } else {
      keys.delete(e.code);
    }
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  // Arrivée : la caméra descend pendant que le front de couleur se propage depuis le centre du scan.
  const startPos = camera.position.clone();
  const endPos = new THREE.Vector3(-780, 300, 1180);
  let introDone = false;
  function endIntro() {
    controls.autoRotate = false;
    if (introDone) return;
    introDone = true;
    mats.uniforms.uReveal.value = 20000;
  }

  const resize = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    composer.setSize(w, h);
  });
  resize.observe(container);

  function updateShadow() {
    const t = controls.target;
    const S = THREE.MathUtils.clamp(camera.position.distanceTo(t) * 1.5, 260, 2600);
    const c = sun.shadow.camera;
    if (now - shadowAt < 0.7) return;
    if (!shadowDirty && shadowAnchor.distanceTo(t) < S * 0.2 && Math.abs(c.right - S) < S * 0.3) return;
    shadowAt = now;
    c.left = -S;
    c.right = S;
    c.top = S;
    c.bottom = -S;
    c.near = 10;
    c.far = 9000;
    c.updateProjectionMatrix();
    sun.target.position.set(t.x, 0, t.z);
    sun.position.copy(sun.userData.dir).multiplyScalar(4500).add(sun.target.position);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
    renderer.shadowMap.needsUpdate = true;
    shadowAnchor.copy(t);
    shadowDirty = false;
  }

  let raf = 0;
  const lastTarget = new THREE.Vector3();
  let fly = null;
  let liveTimer = null;
  const origin = new THREE.Vector3();
  let refreshAt = 0;
  let frames = 0;
  let fpsAt = 0;
  let last = 0;
  let renderedAt = 0;
  let quality = 0;
  let lockQuality = false;
  const v = new THREE.Vector3();
  const side = new THREE.Vector3();
  const move = new THREE.Vector3();

  function frame() {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    now = (performance.now() - startedAt) / 1000;
    const delta = Math.min(now - last, 0.1);
    last = now;
    mats.uniforms.uTime.value = now;
    sky.uniforms.uClock.value = now;

    if (uploads.length) {
      uploads.sort((a, b) => a.priority - b.priority);
      integrate(uploads.shift());
    }

    if (introStart >= 0 && !introDone) {
      const t = Math.min((now - introStart) / 5.5, 1);
      const e = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(startPos, endPos, e);
      mats.uniforms.uReveal.value = 240 + e * 7200;
      if (t >= 1) {
        introDone = true;
        mats.uniforms.uReveal.value = 20000;
      }
    }

    if (keys.size) {
      const speed = camera.position.distanceTo(controls.target) * 0.4 * delta * (keys.has('ShiftLeft') ? 3 : 1);
      camera.getWorldDirection(v);
      v.y = 0;
      v.normalize();
      side.set(-v.z, 0, v.x);
      move.set(0, 0, 0);
      if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(v);
      if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(v);
      if (keys.has('KeyD') || keys.has('ArrowRight')) move.add(side);
      if (keys.has('KeyA') || keys.has('ArrowLeft')) move.sub(side);
      move.multiplyScalar(speed);
      camera.position.add(move);
      controls.target.add(move);
    }

    let changed = controls.update();
    if (Math.abs(zoomPending) > 1e-4) {
      const step = zoomPending * 0.2;
      zoomPending -= step;
      const offset = v.copy(camera.position).sub(controls.target);
      const d0 = offset.length();
      const d1 = THREE.MathUtils.clamp(d0 * Math.exp(step), controls.minDistance, controls.maxDistance);
      const f = d1 / d0;
      if (zoomCursor) {
        const rect = el.getBoundingClientRect();
        ndc.set(((zoomCursor[0] - rect.left) / rect.width) * 2 - 1, -((zoomCursor[1] - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        if (raycaster.ray.intersectPlane(groundPlane, groundHit) && groundHit.distanceTo(controls.target) < d0 * 1.2) controls.target.lerp(groundHit, 1 - f);
      }
      camera.position.copy(controls.target).add(offset.multiplyScalar(f));
      changed = true;
    }
    if (fly) {
      const t = Math.min((now - fly.at) / 1.4, 1);
      const e = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(fly.pos, endPos, e);
      controls.target.lerpVectors(fly.target, origin, e);
      changed = true;
      if (t >= 1) fly = null;
    }
    controls.target.y = 0;
    {
      // Un glissement ne peut ni dépasser une fraction de la vue par image, ni quitter la zone.
      const dx = controls.target.x - lastTarget.x;
      const dz = controls.target.z - lastTarget.z;
      const moved = Math.hypot(dx, dz);
      const limit = camera.position.distanceTo(controls.target) * 0.1 + 2;
      let back = moved > limit ? 1 - limit / moved : 0;
      const nx = controls.target.x - dx * back;
      const nz = controls.target.z - dz * back;
      const range = Math.hypot(nx, nz);
      const k = range > MAX_RANGE ? MAX_RANGE / range : 1;
      const fx = nx * k - controls.target.x;
      const fz = nz * k - controls.target.z;
      if (!fly && (fx || fz)) {
        controls.target.x += fx;
        controls.target.z += fz;
        camera.position.x += fx;
        camera.position.z += fz;
      }
      lastTarget.copy(controls.target);
    }

    const dist = camera.position.distanceTo(controls.target);
    const near = Math.max(1.5, Math.min(camera.position.y * 0.15, dist * 0.04));
    if (Math.abs(near - camera.near) > camera.near * 0.2) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
    land.position.set(camera.position.x, 0, camera.position.z);
    scene.fog.density = fogBase / Math.max(1, dist / 1500);
    mats.uniforms.uFocus.value.lerp(focusTo.set(controls.target.x, controls.target.z), 0.04);
    mats.uniforms.uFocusR.value += (focusRadius(dist) - mats.uniforms.uFocusR.value) * 0.04;

    if (now > refreshAt) {
      refreshAt = now + 0.4;
      refreshTiles();
    }

    const busy = changed || uploads.length > 0 || now < growUntil || !introDone || keys.size > 0;
    if (!busy && now - renderedAt < 0.066) {
      frames = 0;
      fpsAt = now;
      return;
    }
    renderedAt = now;
    updateShadow();
    if (quality < 2) composer.render(delta);
    else renderer.render(scene, camera);

    for (const l of labels) {
      v.copy(l.pos).project(camera);
      const visible = !l.hidden && v.z < 1 && v.z > -1;
      l.el.style.display = visible ? '' : 'none';
      if (visible) {
        const sx = ((v.x + 1) / 2) * container.clientWidth;
        const sy = ((1 - v.y) / 2) * container.clientHeight;
        l.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
      }
    }

    frames++;
    if (now - fpsAt > 2.5) {
      const fps = frames / (now - fpsAt);
      frames = 0;
      fpsAt = now;
      if (!hq && !lockQuality && firstReady && fps < 28 && quality < 4) {
        quality++;
        if (quality === 1 || quality === 3) {
          dpr = quality === 1 ? 1 : 0.8;
          renderer.setPixelRatio(dpr);
          composer.setPixelRatio(dpr);
        } else if (quality === 4) {
          sun.castShadow = false;
        }
      }
    }
  }

  fetch(TILES_URL)
    .then((r) => {
      if (!r.ok) throw new Error('tilejson ' + r.status);
      return r.json();
    })
    .then((meta) => {
      template = meta.tiles[0];
      refreshAt = 0;
    })
    .catch((e) => onError?.(e));

  frame();

  return {
    zoom: zoomBy,
    setScanColors(on) {
      mats.uniforms.uScan.value = on ? 1 : 0;
    },
    setTime(name) {
      clearInterval(liveTimer);
      liveTimer = null;
      if (name === 'live') {
        const tick = () => applyPreset(livePreset(center[0], center[1]));
        tick();
        liveTimer = setInterval(tick, 60000);
      } else if (PRESETS[name]) {
        applyPreset(PRESETS[name]);
      }
    },
    recenter() {
      endIntro();
      zoomPending = 0;
      fly = { at: now, pos: camera.position.clone(), target: controls.target.clone() };
    },
    setShadows(on) {
      sun.castShadow = on;
      shadowDirty = true;
    },
    setLowPower(on) {
      quality = on ? 4 : 0;
      lockQuality = on;
      dpr = on ? 0.8 : Math.min(window.devicePixelRatio || 1, 1);
      renderer.setPixelRatio(dpr);
      composer.setPixelRatio(dpr);
    },
    destroy() {
      destroyed = true;
      clearInterval(liveTimer);
      cancelAnimationFrame(raf);
      resize.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      for (const w of workers) w.instance.terminate();
      for (const e of [...tiles.values()]) dropTile(e);
      controls.dispose();
      composer.dispose();
      pmrem.dispose();
      envTarget?.dispose();
      field.texture.dispose();
      renderer.dispose();
      container.innerHTML = '';
    },
  };
}
