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
    rect(g, i % 2 ? 'rgba(60,55,50,0.07)' : 'rgba(255,255,250,0.06)', x, y, 40 + hash(i, 3) * 150, 30 + hash(i, 4) * 110);
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

function asphalt(g) {
  rect(g, '#5a5b5e', 0, 0, SIZE, SIZE);
  for (let i = 0; i < 16; i++) {
    rect(g, 'rgba(0,0,0,0.05)', hash(i, 5) * SIZE, hash(i, 6) * SIZE, 60 + hash(i, 7) * 220, 40 + hash(i, 8) * 120);
  }
}

function paving(g) {
  rect(g, '#6f6c66', 0, 0, SIZE, SIZE);
  const s = 64;
  for (let y = 0; y < SIZE; y += s) {
    for (let x = 0; x < SIZE; x += s) {
      const v = 150 + Math.floor(hash(x, y) * 30);
      rect(g, `rgb(${v},${v - 2},${v - 6})`, x + 2, y + 2, s - 3, s - 3);
    }
  }
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

let cached = null;

// Textures dessinées une fois au démarrage : aucune image à télécharger, et les mipmaps évitent le scintillement au loin.
export function cityTextures() {
  cached ??= {
    // 0 pierre, 1 brique, 2 béton, 3 verre. Chaque couche couvre 2 travées sur 2 étages ; l'alpha porte le verre.
    facade: buildArray([stone, brick, concrete, glassTower], [10, 12, 9, 5]),
    // 0 gravier, 1 tuiles, 2 zinc, 3 bitume, 4 dalles.
    ground: buildArray([gravel, tiles, zinc, asphalt, paving], [30, 12, 8, 22, 12]),
  };
  return cached;
}
