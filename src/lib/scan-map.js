import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createField, createProjection } from './engine/field.js';
import { createMaterials } from './engine/materials.js';
import { PRESETS, createSky, sunDirection } from './engine/sky.js';

const TILES_URL = 'https://tiles.openfreemap.org/planet';
const WORKERS = 2;
const MAX_NEAR = 70;
const FAR_ZOOM = 11;
const NEAR_ZOOM = 14;

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
    unit(new THREE.IcosahedronGeometry(1, 1), 0.55, 0.28, 0.55, -0.24, 0.74, -0.2),
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
  let dpr = Math.min(window.devicePixelRatio || 1, 1.75);
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
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.normalBias = 1.6;
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null;

  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(dpr);
  composer.setSize(container.clientWidth, container.clientHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth / 2, container.clientHeight / 2), 0.34, 0.55, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
  controls.minDistance = 35;
  controls.maxDistance = 16000;
  controls.zoomToCursor = true;
  controls.autoRotateSpeed = 0.22;
  controls.target.set(0, 0, 0);

  let shadowDirty = true;
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
    bloom.strength = p.bloom;
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

  const look = new THREE.Vector3();
  function refreshTiles() {
    if (!template) return;
    const t = controls.target;
    const dist = camera.position.distanceTo(t);
    const R = THREE.MathUtils.clamp(dist * 1.7, 1800, 5000);
    camera.getWorldDirection(look);
    const size = proj.tileMeters(NEAR_ZOOM);
    const [cx, cy] = proj.tileAt(t.x + look.x * R * 0.3, t.z + look.z * R * 0.3, NEAR_ZOOM);
    const span = Math.ceil(R / size) + 1;
    const wantedNear = new Set();
    if (dist < 9500) {
      for (let x = cx - span; x <= cx + span; x++) {
        for (let y = cy - span; y <= cy + span; y++) {
          const [ox, oz] = proj.tileOrigin(x, y, NEAR_ZOOM);
          const mx = ox + size / 2;
          const mz = oz + size / 2;
          const d = Math.hypot(mx - t.x, mz - t.z);
          if (d > R + size) continue;
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
    for (let x = fx - 2; x <= fx + 2; x++) {
      for (let y = fy - 2; y <= fy + 2; y++) {
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
      const useNear = d < 1400;
      const geo = useNear ? e.treeNear : e.treeFar;
      if (e.treeMesh.geometry !== geo) {
        e.treeMesh.geometry = geo;
        e.treeMesh.castShadow = useNear;
        shadowDirty = true;
      }
      e.treeMesh.visible = d < 4800;
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
      g.setIndex(new THREE.BufferAttribute(b.idx, 1));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mats.building);
      mesh.customDepthMaterial = mats.buildingDepth;
      mesh.position.set(result.origin[0], 0, result.origin[1]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      add(mesh);
      entry.buildingMesh = mesh;
      entry.data = b;
      growUntil = Math.max(growUntil, now + 3.2);
    }
    if (result.trees) {
      const t = result.trees;
      for (let i = 1; i < t.tree.length; i += 2) t.tree[i] += now;
      const inst = new THREE.InstancedBufferAttribute(t.inst, 4);
      const attr = new THREE.InstancedBufferAttribute(t.tree, 2);
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
    labels.push({ el, pos: new THREE.Vector3(x, y, z) });
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

  const zoomUi = document.createElement('div');
  zoomUi.className = 'eng-zoom';
  zoomUi.innerHTML = '<button type="button" aria-label="Zoom in">+</button><button type="button" aria-label="Zoom out">&minus;</button>';
  container.appendChild(zoomUi);
  const zoomBy = (factor) => {
    const offset = camera.position.clone().sub(controls.target).multiplyScalar(factor);
    if (offset.length() < controls.minDistance || offset.length() > controls.maxDistance) return;
    endIntro();
    camera.position.copy(controls.target).add(offset);
  };
  zoomUi.children[0].addEventListener('click', () => zoomBy(0.7));
  zoomUi.children[1].addEventListener('click', () => zoomBy(1.4));

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
  const arc = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.1, 0.65), fog: false, transparent: true, opacity: 0.9, depthWrite: false }));
  const nodeArc = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.8, 0.8), fog: false, transparent: true, opacity: 0.55, depthWrite: false }));
  arc.visible = false;
  nodeArc.visible = false;
  arc.frustumCulled = false;
  nodeArc.frustumCulled = false;
  scene.add(arc, nodeArc);

  function setArc(mesh, from, to) {
    const span = from.distanceTo(to);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    mid.y = Math.max(from.y, to.y) + Math.min(span * 0.14, 180);
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    mesh.geometry.dispose();
    mesh.geometry = new THREE.TubeGeometry(curve, 48, Math.max(0.5, camera.position.distanceTo(controls.target) * 0.0005), 6, false);
    mesh.visible = true;
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered = null;
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
      est: e.rank != null && e.conf >= 0.5 ? Math.round(e.rank * 10) / 10 : null,
      height: Math.round(h.height),
      hit: h,
    };
  }

  function showLinks(info) {
    if (!info) {
      arc.visible = false;
      nodeArc.visible = false;
      return;
    }
    const from = info.hit.point.clone();
    if (businessXZ) setArc(arc, from, new THREE.Vector3(businessXZ[0], 4, businessXZ[1]));
    const p = field.pts[info.index];
    setArc(nodeArc, from, new THREE.Vector3(p[0], 2, p[1]));
  }

  let pointer = null;
  let hoverTimer = null;
  let dragging = false;
  let downAt = null;
  const el = renderer.domElement;
  const onMove = (e) => {
    if (dragging) return;
    pointer = [e.clientX, e.clientY];
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      const h = raycast(pointer[0], pointer[1]);
      el.style.cursor = h ? 'pointer' : '';
      const key = h ? h.entry.key + ':' + h.building : null;
      if (key === hovered) return;
      hovered = key;
      if (h) {
        const info = describe(h);
        showHighlight(h);
        showLinks(info);
        onNodeSelect?.({ ...info, hover: true });
      } else {
        showHighlight(selected?.hit ?? null);
        showLinks(selected);
        onNodeSelect?.(selected);
      }
    }, 110);
  };
  const onDown = (e) => {
    dragging = true;
    downAt = [e.clientX, e.clientY];
    endIntro();
  };
  const onUp = (e) => {
    dragging = false;
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5) {
      const h = raycast(e.clientX, e.clientY);
      if (h) {
        selected = { ...describe(h), hover: false };
        showHighlight(h);
        showLinks(selected);
        onNodeSelect?.(selected);
      }
    }
    downAt = null;
  };
  const onWheel = () => endIntro();
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
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('wheel', onWheel, { passive: true });
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
    const animating = now < growUntil;
    if (!shadowDirty && !animating && shadowAnchor.distanceTo(t) < S * 0.14 && Math.abs(c.right - S) < S * 0.2) return;
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
  let refreshAt = 0;
  let frames = 0;
  let fpsAt = 0;
  let last = 0;
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
        controls.autoRotate = true;
      }
    }

    if (keys.size) {
      const speed = camera.position.distanceTo(controls.target) * 0.9 * delta * (keys.has('ShiftLeft') ? 3 : 1);
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

    controls.update();
    controls.target.y = 0;

    const dist = camera.position.distanceTo(controls.target);
    const near = Math.max(1.5, Math.min(camera.position.y * 0.15, dist * 0.04));
    if (Math.abs(near - camera.near) > camera.near * 0.2) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
    land.position.set(camera.position.x, 0, camera.position.z);

    if (now > refreshAt) {
      refreshAt = now + 0.4;
      refreshTiles();
    }

    updateShadow();
    composer.render(delta);

    for (const l of labels) {
      v.copy(l.pos).project(camera);
      const visible = v.z < 1 && v.z > -1;
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
      if (!hq && firstReady && fps < 26 && dpr > 1) {
        dpr = Math.max(1, dpr - 0.35);
        renderer.setPixelRatio(dpr);
        composer.setPixelRatio(dpr);
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
    setTime(name) {
      if (PRESETS[name]) applyPreset(PRESETS[name]);
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      clearTimeout(hoverTimer);
      resize.disconnect();
      el.removeEventListener('pointermove', onMove);
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
