import * as THREE from 'three';

const SIZE = 512;
const CELL = SIZE / 2;

function hash(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d', { willReadFrequently: true });
  // Origine en bas à gauche : la ligne 0 de la texture correspond au bas du mur.
  g.setTransform(1, 0, 0, -1, 0, SIZE);
  return g;
}

function rect(g, color, x, y, w, h) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

function eachCell(paint) {
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) paint(col * CELL, row * CELL, row);
  }
}

// Vitre à deux battants : le masque porte le verre, la couleur porte le cadre.
function casement(g, m, x, y, w, h, frame, bar = 7) {
  rect(g, frame, x, y, w, h);
  const paneW = (w - bar * 3) / 2;
  const cut = y + bar + (h - bar * 3) * 0.68;
  for (const px of [x + bar, x + bar * 2 + paneW]) {
    rect(m, '#fff', px, y + bar, paneW, cut - (y + bar));
    rect(m, '#fff', px, cut + bar, paneW, y + h - bar - (cut + bar));
  }
}

function stone(g, m) {
  rect(g, '#e6dccb', 0, 0, SIZE, SIZE);
  for (let y = 0, r = 0; y < SIZE; y += 32, r++) {
    rect(g, 'rgba(70,55,40,0.13)', 0, y, SIZE, 2);
    for (let x = r % 2 ? 48 : 0; x < SIZE; x += 96) rect(g, 'rgba(70,55,40,0.08)', x, y, 2, 32);
  }
  eachCell((ox, oy, row) => {
    rect(g, '#f2ebdd', ox, oy, CELL, 12);
    rect(g, 'rgba(40,30,20,0.3)', ox, oy + 12, CELL, 4);
    const x = ox + 62;
    const y = oy + 50;
    const w = 132;
    const h = 170;
    rect(g, '#f3ede1', x - 12, y - 4, w + 24, h + 16);
    rect(g, 'rgba(30,24,18,0.55)', x - 3, y - 3, w + 6, h + 6);
    casement(g, m, x, y, w, h, '#4b4640');
    rect(g, '#f7f2e8', x - 16, y - 14, w + 32, 10);
    rect(g, 'rgba(40,30,20,0.28)', x - 16, y - 20, w + 32, 6);
    if (row === 0) {
      rect(g, '#1d1d20', x - 12, y + 46, w + 24, 5);
      rect(m, '#000', x - 12, y + 46, w + 24, 5);
      for (let bx = x - 8; bx < x + w + 10; bx += 12) {
        rect(g, '#1d1d20', bx, y, 3, 46);
        rect(m, '#000', bx, y, 3, 46);
      }
    }
  });
}

function brick(g, m) {
  rect(g, '#c8b8a4', 0, 0, SIZE, SIZE);
  const tones = ['#a9573f', '#9d4d39', '#b4624b', '#8f4634', '#a35240'];
  for (let y = 0, r = 0; y < SIZE; y += 16, r++) {
    for (let x = r % 2 ? -21 : 0; x < SIZE; x += 42) {
      rect(g, tones[Math.floor(hash(x, y) * tones.length)], x + 1, y + 1, 40, 14);
    }
  }
  eachCell((ox, oy) => {
    const x = ox + 66;
    const y = oy + 56;
    const w = 124;
    const h = 150;
    rect(g, 'rgba(30,22,18,0.5)', x - 4, y - 4, w + 8, h + 8);
    casement(g, m, x, y, w, h, '#d9d7d2');
    rect(g, '#d6d0c4', x - 14, y + h + 4, w + 28, 14);
    rect(g, '#d6d0c4', x - 10, y - 12, w + 20, 9);
  });
}

function concrete(g, m) {
  rect(g, '#cfcdc7', 0, 0, SIZE, SIZE);
  eachCell((ox, oy) => {
    rect(g, 'rgba(30,30,30,0.22)', ox, oy, CELL, 3);
    rect(g, 'rgba(30,30,30,0.16)', ox, oy, 3, CELL);
    rect(g, '#b9b7b1', ox + 18, oy + 40, CELL - 36, 170);
    const x = ox + 30;
    const y = oy + 62;
    const w = CELL - 60;
    const h = 134;
    rect(g, 'rgba(25,25,25,0.55)', x - 3, y - 3, w + 6, h + 6);
    casement(g, m, x, y, w, h, '#74777b', 6);
  });
}

function glassTower(g, m) {
  rect(g, '#8c9299', 0, 0, SIZE, SIZE);
  eachCell((ox, oy) => {
    rect(g, '#3b444e', ox, oy, CELL, 34);
    rect(g, '#aab0b6', ox, oy + 34, CELL, 4);
    rect(m, '#fff', ox + 8, oy + 42, CELL - 16, CELL - 46);
    rect(g, '#6f757c', ox, oy + 34, 8, CELL - 34);
  });
}

function gravel(g) {
  rect(g, '#b8b4aa', 0, 0, SIZE, SIZE);
  for (let i = 0; i < 26; i++) {
    const x = hash(i, 1) * SIZE;
    const y = hash(i, 2) * SIZE;
    rect(g, i % 2 ? 'rgba(60,55,50,0.03)' : 'rgba(255,255,250,0.025)', x, y, 40 + hash(i, 3) * 150, 30 + hash(i, 4) * 110);
  }
}

function tiles(g) {
  rect(g, '#6d6761', 0, 0, SIZE, SIZE);
  const h = 32;
  const w = 42.67;
  for (let y = 0, r = 0; y < SIZE; y += h, r++) {
    for (let x = r % 2 ? -w / 2 : 0; x < SIZE; x += w) {
      const v = 195 + Math.floor(hash(Math.round(x), r) * 55);
      rect(g, `rgb(${v},${v},${v})`, x + 1, y + 6, w - 2, h - 6);
      rect(g, 'rgba(0,0,0,0.3)', x + 1, y + h - 5, w - 2, 5);
    }
  }
}

function zinc(g) {
  rect(g, '#c7ccd2', 0, 0, SIZE, SIZE);
  for (let x = 0; x < SIZE; x += 128) {
    const v = 185 + Math.floor(hash(x, 7) * 40);
    rect(g, `rgb(${v},${v + 3},${v + 7})`, x, 0, 128, SIZE);
    rect(g, 'rgba(255,255,255,0.45)', x, 0, 5, SIZE);
    rect(g, 'rgba(0,0,0,0.4)', x + 5, 0, 5, SIZE);
  }
}

// Dessin répété aux quatre coins : une forme qui déborde du bord réapparaît de l'autre côté, la texture se raccorde.
function wrap(draw) {
  for (const dx of [0, -SIZE]) for (const dy of [0, -SIZE]) draw(dx, dy);
}

function blot(g, x, y, r, color) {
  wrap((dx, dy) => {
    const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
  });
}

function specks(g, n, seed, colors, size = 1.5) {
  for (let i = 0; i < n; i++) {
    const x = hash(i, seed) * SIZE;
    const y = hash(seed, i) * SIZE;
    const s = size * (0.6 + hash(i * 3, seed + 1) * 0.9);
    g.fillStyle = colors[i % colors.length];
    wrap((dx, dy) => g.fillRect(x + dx, y + dy, s, s));
  }
}

function crack(g, seed) {
  let x = hash(seed, 1) * SIZE;
  let y = hash(seed, 2) * SIZE;
  let a = hash(seed, 3) * 6.28;
  g.strokeStyle = 'rgba(15,15,15,0.45)';
  g.lineWidth = 1.2;
  for (let k = 0; k < 14; k++) {
    const nx = x + Math.cos(a) * 9;
    const ny = y + Math.sin(a) * 9;
    wrap((dx, dy) => {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.lineTo(nx + dx, ny + dy);
      g.stroke();
    });
    x = nx;
    y = ny;
    a += (hash(seed, k + 9) - 0.5) * 1.2;
  }
}

// Bitume : granulats clairs et sombres, reprises de chaussée, taches et fissures fines.
function asphalt(g) {
  rect(g, '#505154', 0, 0, SIZE, SIZE);
  for (let i = 0; i < 26; i++) blot(g, hash(i, 51) * SIZE, hash(i, 52) * SIZE, 30 + hash(i, 53) * 90, i % 3 ? 'rgba(30,30,32,0.18)' : 'rgba(120,120,118,0.12)');
  for (let i = 0; i < 7; i++) {
    const x = hash(i, 61) * SIZE;
    const y = hash(i, 62) * SIZE;
    const w = 60 + hash(i, 63) * 160;
    const h = 40 + hash(i, 64) * 90;
    const v = hash(i, 65) > 0.5 ? 'rgba(40,40,44,0.55)' : 'rgba(98,98,100,0.35)';
    wrap((dx, dy) => rect(g, v, x + dx, y + dy, w, h));
  }
  specks(g, 26000, 71, ['rgba(170,168,160,0.55)', 'rgba(20,20,22,0.6)', 'rgba(120,118,112,0.5)', 'rgba(60,58,56,0.5)'], 1.6);
  for (let i = 0; i < 5; i++) crack(g, 80 + i);
}

// Trottoir parisien : bitume clair, plus fin, avec des joints de reprise espacés.
function sidewalk(g) {
  rect(g, '#8e8c87', 0, 0, SIZE, SIZE);
  for (let i = 0; i < 22; i++) blot(g, hash(i, 91) * SIZE, hash(i, 92) * SIZE, 30 + hash(i, 93) * 80, i % 2 ? 'rgba(60,58,55,0.16)' : 'rgba(190,186,178,0.14)');
  specks(g, 22000, 95, ['rgba(200,198,190,0.5)', 'rgba(70,68,64,0.45)', 'rgba(150,146,138,0.5)'], 1.3);
  for (let x = 0; x < SIZE; x += 128) rect(g, 'rgba(50,48,45,0.35)', x, 0, 2, SIZE);
  crack(g, 99);
}

// Pavés de granit en rangées décalées : places et rues piétonnes.
function cobbles(g) {
  rect(g, '#3d3c3a', 0, 0, SIZE, SIZE);
  const s = 16;
  for (let y = 0, r = 0; y < SIZE; y += s, r++) {
    for (let x = r % 2 ? -s / 2 : 0; x < SIZE; x += s) {
      const t = hash(x + 3, y + 7);
      const v = 105 + Math.floor(t * 60);
      const warm = hash(y, x) > 0.7 ? 12 : 0;
      rect(g, `rgb(${v + warm},${v + warm * 0.4},${v - 4})`, x + 1.5, y + 1.5, s - 3, s - 3);
      rect(g, 'rgba(255,255,255,0.12)', x + 2, y + s - 5, s - 5, 2);
      rect(g, 'rgba(0,0,0,0.18)', x + 2, y + 2, s - 4, 2);
    }
  }
  for (let i = 0; i < 18; i++) blot(g, hash(i, 111) * SIZE, hash(i, 112) * SIZE, 40 + hash(i, 113) * 70, 'rgba(20,18,16,0.18)');
}

// Herbe vue de près : brins de plusieurs verts et paille, touffes sombres, plaques plus claires.
function grass(g) {
  rect(g, '#5d7a3c', 0, 0, SIZE, SIZE);
  for (let i = 0; i < 40; i++) blot(g, hash(i, 121) * SIZE, hash(i, 122) * SIZE, 25 + hash(i, 123) * 70, i % 3 ? 'rgba(40,62,22,0.35)' : 'rgba(150,165,80,0.3)');
  const tones = ['rgba(52,78,30,0.85)', 'rgba(88,120,52,0.8)', 'rgba(120,150,70,0.75)', 'rgba(70,98,38,0.85)', 'rgba(150,160,90,0.6)', 'rgba(36,56,22,0.8)'];
  g.lineCap = 'round';
  for (let i = 0; i < 26000; i++) {
    const x = hash(i, 131) * SIZE;
    const y = hash(131, i) * SIZE;
    const a = hash(i, 132) * 6.28;
    const l = 3 + hash(i, 133) * 7;
    g.strokeStyle = tones[i % tones.length];
    g.lineWidth = 1 + hash(i, 134) * 0.8;
    wrap((dx, dy) => {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l);
      g.stroke();
    });
  }
  for (let i = 0; i < 260; i++) blot(g, hash(i, 141) * SIZE, hash(i, 142) * SIZE, 4 + hash(i, 143) * 7, 'rgba(25,40,14,0.45)');
}

// Sable stabilisé des allées de parc : grains clairs et sombres, petits cailloux, traces plus tassées.
function sand(g) {
  rect(g, '#b6a27e', 0, 0, SIZE, SIZE);
  for (let i = 0; i < 24; i++) blot(g, hash(i, 151) * SIZE, hash(i, 152) * SIZE, 30 + hash(i, 153) * 90, i % 2 ? 'rgba(120,102,72,0.22)' : 'rgba(215,200,170,0.2)');
  specks(g, 24000, 155, ['rgba(230,220,195,0.6)', 'rgba(110,92,66,0.55)', 'rgba(170,150,118,0.6)', 'rgba(140,132,120,0.5)'], 1.4);
  specks(g, 900, 157, ['rgba(95,88,80,0.7)', 'rgba(205,198,185,0.75)'], 3.2);
}

function buildArray(painters, grain) {
  const data = new Uint8Array(SIZE * SIZE * 4 * painters.length);
  painters.forEach((paint, layer) => {
    const g = canvas();
    const m = canvas();
    rect(m, '#000', 0, 0, SIZE, SIZE);
    paint(g, m);
    const rgb = g.getImageData(0, 0, SIZE, SIZE).data;
    const mask = m.getImageData(0, 0, SIZE, SIZE).data;
    const base = layer * SIZE * SIZE * 4;
    for (let k = 0; k < SIZE * SIZE; k++) {
      const i = k * 4;
      const n = (Math.random() + Math.random() - 1) * grain[layer];
      data[base + i] = Math.max(0, Math.min(255, rgb[i] + n));
      data[base + i + 1] = Math.max(0, Math.min(255, rgb[i + 1] + n));
      data[base + i + 2] = Math.max(0, Math.min(255, rgb[i + 2] + n));
      data[base + i + 3] = mask[i];
    }
  });
  const t = new THREE.DataArrayTexture(data, SIZE, SIZE, painters.length);
  t.format = THREE.RGBAFormat;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// Normales de vagues pour l'eau : somme de houles dont les fréquences tombent juste sur la tuile (raccord parfait).
// Les mipmaps moyennent les vaguelettes au loin : la surface y devient un miroir lisse au lieu de scintiller.
function waterNormals() {
  const N = 256;
  const waves = [];
  for (let i = 0; i < 28; i++) {
    const k = 2 + Math.floor(hash(i, 171) * 13);
    const a = hash(i, 172) * Math.PI * 2;
    const kx = Math.round(Math.cos(a) * k);
    const ky = Math.round(Math.sin(a) * k);
    if (!kx && !ky) continue;
    waves.push([kx, ky, 1 / Math.pow(Math.hypot(kx, ky), 1.3), hash(i, 173) * Math.PI * 2]);
  }
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let gx = 0;
      let gy = 0;
      for (const [kx, ky, amp, ph] of waves) {
        const c = Math.cos(((kx * x + ky * y) / N) * Math.PI * 2 + ph) * amp * Math.PI * 2;
        gx += c * kx;
        gy += c * ky;
      }
      const i = (y * N + x) * 4;
      data[i] = Math.max(0, Math.min(255, 128 - gx * 2.2));
      data[i + 1] = Math.max(0, Math.min(255, 128 - gy * 2.2));
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

let cached = null;

// Textures dessinées une fois au démarrage : aucune image à télécharger, et les mipmaps évitent le scintillement au loin.
export function cityTextures() {
  cached ??= {
    // 0 pierre, 1 brique, 2 béton, 3 verre. Chaque couche couvre 2 travées sur 2 étages ; l'alpha porte le verre.
    facade: buildArray([stone, brick, concrete, glassTower], [10, 12, 9, 5]),
    // 0 gravier, 1 tuiles, 2 zinc, 3 bitume, 4 trottoir, 5 herbe, 6 sable, 7 pavés.
    ground: buildArray([gravel, tiles, zinc, asphalt, sidewalk, grass, sand, cobbles], [30, 12, 8, 10, 8, 8, 10, 8]),
    water: waterNormals(),
  };
  return cached;
}
