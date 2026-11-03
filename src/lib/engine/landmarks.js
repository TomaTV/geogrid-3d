import * as THREE from 'three';

// Repères parisiens absents ou trop simples dans OpenStreetMap, dessinés à la main.
function frustum(out, a, ra, ya, b, rb, yb) {
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < 4; i++) {
    const c = corners[i];
    const d = corners[(i + 1) % 4];
    const p = [
      [a[0] + c[0] * ra, ya, a[1] + c[1] * ra],
      [a[0] + d[0] * ra, ya, a[1] + d[1] * ra],
      [b[0] + d[0] * rb, yb, b[1] + d[1] * rb],
      [b[0] + c[0] * rb, yb, b[1] + c[1] * rb],
    ];
    out.push(...p[0], ...p[2], ...p[1], ...p[0], ...p[3], ...p[2]);
  }
}

function eiffel() {
  const pos = [];
  const sections = [
    [0, 62, 13], [28, 50, 11.5], [57, 39, 10], [85, 28, 8.5], [115, 19, 7], [150, 11.5, 5], [190, 6.8, 3.6],
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let i = 0; i + 1 < sections.length; i++) {
        const [y0, o0, r0] = sections[i];
        const [y1, o1, r1] = sections[i + 1];
        frustum(pos, [sx * o0, sz * o0], r0, y0, [sx * o1, sz * o1], r1, y1);
      }
    }
  }
  frustum(pos, [0, 0], 10, 190, [0, 0], 6.5, 230);
  frustum(pos, [0, 0], 6.5, 230, [0, 0], 4, 276);
  frustum(pos, [0, 0], 4, 276, [0, 0], 1.2, 312);
  frustum(pos, [0, 0], 0.7, 312, [0, 0], 0.2, 330);
  frustum(pos, [0, 0], 56, 57, [0, 0], 56, 64);
  frustum(pos, [0, 0], 33, 115, [0, 0], 33, 120);
  frustum(pos, [0, 0], 8, 276, [0, 0], 8, 280);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function pyramid() {
  const pos = [];
  frustum(pos, [0, 0], 18, 0, [0, 0], 0.01, 21.6);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function addLandmarks(scene, proj) {
  const iron = new THREE.MeshLambertMaterial({ color: 0x4a3c2c, emissive: new THREE.Color(1, 0.6, 0.2), emissiveIntensity: 0, side: THREE.DoubleSide });
  iron.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float side = vLocal.x + vLocal.z;
        float a = abs(fract((vLocal.y + side) / 9.0) - 0.5);
        float b = abs(fract((vLocal.y - side) / 9.0) - 0.5);
        float rail = abs(fract(vLocal.y / 19.0) - 0.5);
        if (min(min(a, b), rail) > 0.16 && vLocal.y < 300.0) discard;`,
      );
  };
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.08, metalness: 0.6, emissive: new THREE.Color(1, 0.86, 0.6), emissiveIntensity: 0 });
  const place = (geometry, material, lng, lat) => {
    const m = new THREE.Mesh(geometry, material);
    const [x, z] = proj.toWorld(lng, lat);
    m.position.set(x, 0, z);
    m.castShadow = true;
    scene.add(m);
  };
  place(eiffel(), iron, 2.2945, 48.85826);
  place(pyramid(), glass, 2.33585, 48.86103);
  return (night) => {
    iron.emissiveIntensity = night * 0.32;
    glass.emissiveIntensity = night * 0.35;
  };
}
