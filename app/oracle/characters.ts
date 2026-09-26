import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type CharacterKind = 'lyra' | 'mira' | 'theron';

/** Self-contained, ground-level character rig. Its forward direction is +Z. */
export function createCharacter(kind: CharacterKind): {
  root: THREE.Group;
  animate: (time: number, moving: number, sprint: boolean) => void;
} {
  const root = new THREE.Group();
  root.name = kind;
  const rig = new THREE.Group();
  root.add(rig);

  // Reuse primitive buffers within a character, while keeping disposal local to it.
  const sphere = new THREE.SphereGeometry(1, 12, 9);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const material = (color: number, roughness = 0.8, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const skin = material(kind === 'theron' ? 0xaf704b : kind === 'mira' ? 0xc68c68 : 0xc9916e);
  const skinShade = material(kind === 'theron' ? 0x925239 : 0xac7055);
  const hair = material(kind === 'mira' ? 0x543625 : kind === 'theron' ? 0x382a25 : 0x302420);
  const hairLight = material(kind === 'mira' ? 0x76513a : 0x594035);
  const cloth = material(kind === 'lyra' ? 0x237b84 : kind === 'mira' ? 0x8b9a70 : 0x455b6a);
  const clothShade = material(kind === 'lyra' ? 0x1e5c67 : kind === 'mira' ? 0x687451 : 0x304550);
  const ivory = material(0xe9dbc0);
  const leather = material(0x63432d);
  const darkLeather = material(0x3d2d24);
  const bronze = material(0xc3944c, 0.4, 0.65);
  const bronzeShade = material(0x836535, 0.48, 0.6);
  const steel = material(0xbac5c4, 0.36, 0.75);
  const eyeWhite = material(0xf0e4d2);
  const eyes = material(kind === 'lyra' ? 0x284f4b : 0x352921);
  const mouth = material(0x884e43);

  function mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    position: [number, number, number],
    scale: [number, number, number] = [1, 1, 1],
  ) {
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(...position);
    object.scale.set(...scale);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  const oval = (parent: THREE.Object3D, mat: THREE.Material, p: [number, number, number], s: [number, number, number]) => mesh(parent, sphere, mat, p, s);
  const block = (parent: THREE.Object3D, mat: THREE.Material, p: [number, number, number], s: [number, number, number]) => mesh(parent, box, mat, p, s);
  const tube = (parent: THREE.Object3D, mat: THREE.Material, p: [number, number, number], r: number, h: number) => mesh(parent, cylinder, mat, p, [r, h, r]);
  function joint(parent: THREE.Object3D, x: number, y: number, z: number) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    parent.add(group);
    return group;
  }
  function strap(parent: THREE.Object3D, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, width: number, depth = 0.022) {
    const middle = a.clone().add(b).multiplyScalar(0.5);
    const object = block(parent, mat, [middle.x, middle.y, middle.z], [width, a.distanceTo(b), depth]);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return object;
  }

  // Soft tapered torso; the upper body can turn independently of the hips.
  const torso = joint(rig, 0, 1.27, 0);
  const torsoGeometry = new THREE.CylinderGeometry(0.265, 0.205, 0.43, 12);
  const chest = mesh(torso, torsoGeometry, cloth, [0, 0.225, 0], [1, 1, 0.61]);
  chest.name = 'tunic';
  oval(torso, cloth, [0, 0.03, 0], [0.235, 0.135, 0.15]);
  tube(torso, skin, [0, 0.48, 0], 0.074, 0.16);
  const neckline = mesh(torso, new THREE.TorusGeometry(0.084, 0.018, 5, 14), bronze, [0, 0.425, 0.075], [1, 0.58, 1]);
  neckline.rotation.x = Math.PI / 2.4;

  // Shoulder fasteners and wrapped cloth create a readable Greek silhouette.
  for (const side of [-1, 1]) {
    const shoulderWrap = block(torso, ivory, [side * 0.185, 0.427, 0.007], [0.10, 0.04, 0.27]);
    shoulderWrap.rotation.z = side * -0.1;
    oval(torso, bronze, [side * 0.185, 0.435, 0.145], [0.035, 0.035, 0.011]);
  }
  strap(torso, ivory, new THREE.Vector3(-0.185, 0.39, 0.158), new THREE.Vector3(0.135, 0.02, 0.156), 0.09);
  strap(torso, bronze, new THREE.Vector3(-0.222, 0.383, 0.161), new THREE.Vector3(0.098, 0.013, 0.16), 0.009, 0.012);

  const hips = joint(rig, 0, 1.0, 0);
  mesh(hips, new THREE.CylinderGeometry(0.225, 0.29, 0.35, 12, 1, true), cloth, [0, 0.08, 0], [1, 1, 0.67]);
  // Separate overlapping strips let the legs remain visible under the hem.
  const skirtPanels: THREE.Group[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const panel = joint(hips, Math.sin(angle) * 0.24, 0.01, Math.cos(angle) * 0.154);
    panel.rotation.y = angle;
    panel.rotation.x = -0.09;
    block(panel, i % 2 ? cloth : clothShade, [0, -0.12, 0], [0.125, 0.27, 0.029]);
    block(panel, ivory, [0, -0.244, 0.018], [0.125, 0.025, 0.016]);
    if (kind === 'lyra') block(panel, bronze, [0, -0.219, 0.023], [0.092, 0.007, 0.006]);
    skirtPanels.push(panel);
  }
  const belt = mesh(rig, new THREE.CylinderGeometry(0.239, 0.239, 0.083, 12), leather, [0, 1.265, 0], [1, 1, 0.665]);
  belt.name = 'belt';
  block(rig, bronze, [0.045, 1.265, 0.171], [0.085, 0.075, 0.024]);
  block(rig, darkLeather, [0.045, 1.265, 0.188], [0.053, 0.041, 0.009]);
  for (const x of [-0.13, -0.085, -0.04]) oval(rig, bronze, [x, 1.265, 0.168], [0.006, 0.006, 0.004]);

  const legs = [-1, 1].map((side) => {
    const hip = joint(rig, side * 0.14, 1.005, 0);
    oval(hip, skin, [0, -0.22, 0], [0.088, 0.245, 0.094]);
    const knee = joint(hip, 0, -0.425, 0);
    oval(knee, skin, [0, -0.019, 0.007], [0.075, 0.083, 0.083]);
    oval(knee, skin, [0, -0.22, -0.01], [0.065, 0.235, 0.074]);
    const ankle = joint(knee, 0, -0.463, 0);
    oval(ankle, skin, [0, -0.045, 0.072], [0.075, 0.062, 0.14]);
    oval(ankle, darkLeather, [0, -0.082, 0.073], [0.085, 0.035, 0.151]);
    // Sandal straps cross the instep and spiral around the shin.
    block(ankle, leather, [0, -0.01, 0.125], [0.151, 0.027, 0.046]);
    block(ankle, leather, [0, 0.01, 0.028], [0.141, 0.033, 0.04]);
    for (let n = 0; n < 3; n++) {
      const lace = mesh(knee, new THREE.TorusGeometry(0.068 - n * 0.002, 0.009, 4, 10), leather, [0, -0.27 - n * 0.064, -0.005], [1, 1, 1]);
      lace.rotation.x = Math.PI / 2 + side * 0.16;
    }
    if (kind === 'lyra') {
      const guard = oval(knee, bronzeShade, [0, -0.17, 0.053], [0.053, 0.14, 0.042]);
      guard.rotation.x = -0.06;
      block(knee, bronze, [0, -0.17, 0.093], [0.013, 0.22, 0.008]);
    }
    return { hip, knee, ankle };
  });

  const arms = [-1, 1].map((side) => {
    const shoulder = joint(torso, side * 0.285, 0.365, 0);
    shoulder.rotation.z = side * 0.11;
    oval(shoulder, skin, [side * 0.008, -0.06, 0], [0.086, 0.12, 0.084]);
    oval(shoulder, skin, [0, -0.18, 0], [0.066, 0.18, 0.066]);
    if (kind !== 'lyra') oval(shoulder, cloth, [0, -0.055, 0], [0.099, 0.125, 0.096]);
    const elbow = joint(shoulder, 0, -0.325, 0);
    oval(elbow, skin, [0, -0.025, 0], [0.06, 0.067, 0.062]);
    oval(elbow, skin, [0, -0.15, 0.008], [0.058, 0.165, 0.058]);
    const hand = joint(elbow, 0, -0.305, 0.013);
    oval(hand, skin, [0, -0.045, 0.002], [0.049, 0.077, 0.035]);
    oval(hand, skin, [-side * 0.044, -0.025, 0.019], [0.021, 0.038, 0.021]);
    if (kind === 'lyra') {
      tube(elbow, leather, [0, -0.225, 0.009], 0.062, 0.13);
      tube(elbow, bronze, [0, -0.274, 0.009], 0.065, 0.016);
      tube(elbow, bronze, [0, -0.169, 0.009], 0.065, 0.018);
    } else {
      tube(elbow, kind === 'mira' ? bronze : leather, [0, -0.268, 0.009], 0.058, 0.035);
    }
    return { shoulder, elbow, hand };
  });

  const head = joint(torso, 0, 0.687, 0.008);
  oval(head, skin, [0, 0, 0], [0.16, 0.208, 0.15]);
  oval(head, skin, [0, -0.11, 0.055], [0.116, 0.109, 0.104]);
  for (const side of [-1, 1]) {
    oval(head, skin, [side * 0.158, -0.02, -0.005], [0.031, 0.058, 0.034]);
    oval(head, skinShade, [side * 0.172, -0.02, 0.013], [0.012, 0.031, 0.012]);
    oval(head, eyeWhite, [side * 0.061, 0.028, 0.139], [0.037, 0.016, 0.011]);
    oval(head, eyes, [side * 0.06, 0.026, 0.15], [0.013, 0.014, 0.007]);
    oval(head, darkLeather, [side * 0.06, 0.026, 0.155], [0.006, 0.009, 0.003]);
    oval(head, eyeWhite, [side * 0.056, 0.032, 0.157], [0.0035, 0.004, 0.002]);
    const brow = oval(head, hair, [side * 0.063, 0.062, 0.139], [0.043, 0.012, 0.012]);
    brow.rotation.z = side * -0.1;
    if (kind !== 'theron') {
      const earring = mesh(head, new THREE.TorusGeometry(0.02, 0.004, 5, 9), bronze, [side * 0.165, -0.071, 0.012]);
      earring.rotation.y = side * 0.35;
    }
  }
  oval(head, skin, [0, -0.014, 0.149], [0.022, 0.047, 0.035]);
  oval(head, skinShade, [0, -0.047, 0.167], [0.024, 0.01, 0.016]);
  oval(head, mouth, [0, -0.094, 0.14], [0.036, 0.009, 0.007]);
  oval(head, skin, [0, -0.116, 0.134], [0.046, 0.018, 0.013]);

  const hairCap = mesh(head, new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.53), hair, [0, 0.039, -0.009], [0.176, 0.19, 0.164]);
  hairCap.rotation.x = -0.08;
  oval(head, hair, [0, 0.014, -0.105], [0.161, 0.186, 0.079]);
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.047;
    const lock = oval(head, i % 3 === 0 ? hairLight : hair, [x, 0.144 - Math.abs(x) * 0.16, 0.102 - Math.abs(x) * 0.15], [0.039, 0.089, 0.044]);
    lock.rotation.z = -0.25 + i * 0.08;
  }

  let hairTail: THREE.Group | null = null;
  let cape: THREE.Group | null = null;
  if (kind === 'lyra') {
    // A bronze fillet, tied hair, ochre cape and sheathed blade distinguish Lyra.
    const fillet = mesh(head, new THREE.TorusGeometry(0.166, 0.013, 5, 16), bronze, [0, 0.126, 0], [1, 0.92, 1]);
    fillet.rotation.x = Math.PI / 2;
    oval(head, bronze, [0, 0.127, 0.155], [0.022, 0.025, 0.012]);
    hairTail = joint(head, 0, 0.075, -0.163);
    oval(hairTail, hair, [0, -0.145, -0.036], [0.085, 0.207, 0.078]);
    oval(hairTail, hairLight, [-0.026, -0.17, -0.096], [0.025, 0.151, 0.015]);
    tube(hairTail, bronze, [0, -0.014, -0.016], 0.065, 0.035).rotation.x = 0.2;
    const capeMat = material(0xc38a40);
    capeMat.side = THREE.DoubleSide;
    cape = joint(torso, -0.035, 0.397, -0.13);
    const vertices: number[] = [];
    const indices: number[] = [];
    for (let row = 0; row <= 5; row++) {
      const v = row / 5;
      for (let column = 0; column <= 6; column++) {
        const u = column / 6;
        vertices.push((u - 0.5) * (0.38 + v * 0.26), -v * 0.91, -v * 0.16 - Math.sin(u * Math.PI * 6) * 0.035 * v);
        if (row < 5 && column < 6) {
          const a = row * 7 + column;
          indices.push(a, a + 7, a + 1, a + 1, a + 7, a + 8);
        }
      }
    }
    const capeGeometry = new THREE.BufferGeometry();
    capeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    capeGeometry.setIndex(indices);
    capeGeometry.computeVertexNormals();
    mesh(cape, capeGeometry, capeMat, [0, 0, 0]);
    block(cape, bronze, [0, -0.88, -0.147], [0.62, 0.027, 0.025]);
    oval(torso, bronzeShade, [-0.265, 0.366, -0.013], [0.119, 0.073, 0.139]);
    oval(torso, bronze, [-0.28, 0.383, 0.003], [0.1, 0.065, 0.12]);
    const sword = joint(rig, -0.27, 1.19, 0.015);
    sword.rotation.z = -0.19;
    block(sword, darkLeather, [0, -0.265, 0], [0.081, 0.57, 0.06]);
    block(sword, bronze, [0, -0.539, 0], [0.085, 0.04, 0.066]);
    block(sword, bronze, [0, 0.018, 0], [0.172, 0.035, 0.072]);
    tube(sword, leather, [0, 0.098, 0], 0.028, 0.14);
    oval(sword, bronze, [0, 0.177, 0], [0.039, 0.027, 0.035]);
  } else if (kind === 'mira') {
    // Linen mantle, herb pouch, and a long braid identify the village healer.
    oval(torso, ivory, [0, 0.417, -0.067], [0.278, 0.067, 0.165]);
    const scarf = block(torso, ivory, [0.136, 0.203, 0.173], [0.117, 0.39, 0.032]);
    scarf.rotation.z = -0.12;
    block(torso, clothShade, [0.155, 0.023, 0.193], [0.116, 0.016, 0.01]);
    hairTail = joint(head, 0.117, -0.055, -0.064);
    for (let i = 0; i < 7; i++) {
      oval(hairTail, i % 2 ? hairLight : hair, [Math.sin(i * Math.PI) * 0.013 + (i % 2 ? 0.013 : -0.013), -i * 0.053, 0.015 + i * 0.016], [0.037, 0.043, 0.036]);
    }
    tube(hairTail, bronze, [0, -0.331, 0.11], 0.026, 0.023);
    strap(torso, leather, new THREE.Vector3(-0.19, 0.385, 0.186), new THREE.Vector3(0.22, -0.205, 0.172), 0.035);
    const pouch = joint(rig, 0.28, 1.05, 0.066);
    oval(pouch, leather, [0, 0, 0], [0.114, 0.142, 0.072]);
    block(pouch, darkLeather, [0, 0.053, 0.066], [0.18, 0.063, 0.025]);
    oval(pouch, bronze, [0, 0.031, 0.085], [0.014, 0.015, 0.005]);
    const green = material(0x506e42);
    for (let i = 0; i < 5; i++) {
      const stem = tube(pouch, green, [(i - 2) * 0.022, 0.166, -0.019], 0.005, 0.18);
      stem.rotation.z = (i - 2) * 0.17;
      const leaf = oval(pouch, green, [(i - 2) * 0.035, 0.227, -0.017], [0.024, 0.05, 0.012]);
      leaf.rotation.z = (i - 2) * 0.25;
    }
  } else {
    // Rolled sleeves, a worn apron, full beard and carpenter's mallet.
    const apron = material(0x98643f);
    block(torso, apron, [0, 0.19, 0.169], [0.31, 0.36, 0.027]);
    strap(torso, leather, new THREE.Vector3(-0.12, 0.35, 0.174), new THREE.Vector3(-0.11, 0.43, 0.045), 0.026);
    strap(torso, leather, new THREE.Vector3(0.12, 0.35, 0.174), new THREE.Vector3(0.11, 0.43, 0.045), 0.026);
    block(hips, apron, [0, 0.0, 0.19], [0.39, 0.43, 0.037]);
    block(hips, leather, [0.028, 0.036, 0.216], [0.2, 0.13, 0.02]);
    oval(head, hair, [0, -0.125, 0.074], [0.135, 0.125, 0.109]);
    oval(head, skin, [0, -0.061, 0.137], [0.068, 0.029, 0.031]);
    for (const side of [-1, 1]) {
      const moustache = oval(head, hair, [side * 0.029, -0.071, 0.159], [0.037, 0.019, 0.013]);
      moustache.rotation.z = side * -0.16;
      for (let i = 0; i < 3; i++) oval(head, hairLight, [side * (0.037 + i * 0.026), -0.143 + i * 0.008, 0.158 - i * 0.024], [0.01, 0.049, 0.011]);
    }
    const hammer = joint(rig, 0.292, 1.16, 0.015);
    hammer.rotation.z = 0.16;
    tube(hammer, leather, [0, -0.14, 0], 0.024, 0.4);
    block(hammer, darkLeather, [0, 0.045, 0], [0.23, 0.1, 0.1]);
    block(hammer, steel, [-0.099, 0.045, 0], [0.036, 0.106, 0.106]);
    block(hammer, bronzeShade, [0.087, 0.045, 0], [0.026, 0.106, 0.106]);
    const pencil = block(torso, bronze, [0.091, 0.272, 0.19], [0.014, 0.115, 0.017]);
    pencil.rotation.z = -0.12;
  }

  // Every animated part is a Group. Bake only its rigid mesh children, preserving
  // every joint. Vertex colors also combine cloth/skin/leather with identical
  // surface properties; metallic finishes remain separate draw calls.
  const originalGeometries = new Set<THREE.BufferGeometry>();
  const originalMaterials = new Set<THREE.Material>();
  const groups: THREE.Group[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Group) groups.push(object);
    if (object instanceof THREE.Mesh) {
      originalGeometries.add(object.geometry);
      if (!Array.isArray(object.material)) originalMaterials.add(object.material);
    }
  });
  const batchMaterials = new Map<string, THREE.MeshStandardMaterial>();
  for (const group of groups) {
    const batches = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[]>();
    for (const child of group.children) {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) continue;
      const mat = child.material;
      // All materials in this procedural model have default settings except
      // their color, roughness, metalness, and (for the cape) face side.
      const key = `${mat.roughness}/${mat.metalness}/${mat.side}`;
      const batch = batches.get(key) ?? [];
      batch.push(child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>);
      batches.set(key, batch);
    }
    for (const [key, meshes] of batches) {
      if (meshes.length < 2) continue;
      const copies = meshes.map((part) => {
        part.updateMatrix();
        const geometry = part.geometry.clone().applyMatrix4(part.matrix);
        const count = geometry.getAttribute('position').count;
        const colors = new Float32Array(count * 3);
        const { r, g, b } = part.material.color;
        for (let i = 0; i < count; i++) colors.set([r, g, b], i * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        if (!geometry.hasAttribute('uv')) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
        return geometry;
      });
      const geometry = mergeGeometries(copies);
      copies.forEach((copy) => copy.dispose());
      if (!geometry) continue;
      let mat = batchMaterials.get(key);
      if (!mat) {
        mat = meshes[0].material.clone();
        mat.color.set(0xffffff);
        mat.vertexColors = true;
        batchMaterials.set(key, mat);
      }
      const combined = new THREE.Mesh(geometry, mat);
      combined.castShadow = true;
      combined.receiveShadow = true;
      combined.name = 'rigid-character-detail';
      meshes.forEach((part) => group.remove(part));
      group.add(combined);
    }
  }
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      originalGeometries.delete(object.geometry);
      if (!Array.isArray(object.material)) originalMaterials.delete(object.material);
    }
  });
  originalGeometries.forEach((geometry) => geometry.dispose());
  originalMaterials.forEach((mat) => mat.dispose());

  root.userData.characterKind = kind;
  let gait = 0;
  let previousTime: number | undefined;
  let movement = 0;
  function animate(time: number, moving: number, sprint: boolean) {
    const delta = previousTime === undefined ? 1 / 60 : Math.max(0, Math.min(time - previousTime, 0.08));
    previousTime = time;
    const target = THREE.MathUtils.clamp(moving, 0, 1);
    movement = THREE.MathUtils.damp(movement, target, 13, delta);
    const speed = sprint ? 12.8 : 8.8;
    gait += delta * speed * (0.3 + movement * 0.7);
    const stride = movement * (sprint ? 0.74 : 0.51);
    const breath = Math.sin(time * 2.2) * 0.004;
    rig.position.y = Math.abs(Math.sin(gait)) * movement * (sprint ? 0.056 : 0.027) + breath + 0.004;
    torso.rotation.x = movement * (sprint ? 0.11 : 0.035);
    torso.rotation.y = Math.sin(gait) * movement * 0.065;
    torso.rotation.z = Math.sin(gait) * movement * 0.023;
    hips.rotation.y = -Math.sin(gait) * movement * 0.04;
    head.rotation.y = -torso.rotation.y * 0.55 + Math.sin(time * 0.67) * (1 - movement) * 0.04;
    head.rotation.x = -torso.rotation.x * 0.6;
    legs.forEach(({ hip, knee, ankle }, index) => {
      const phase = gait + index * Math.PI;
      hip.rotation.x = -Math.sin(phase) * stride;
      knee.rotation.x = Math.max(0, Math.sin(phase)) * stride * 1.3;
      ankle.rotation.x = -hip.rotation.x * 0.4 - knee.rotation.x * 0.65;
    });
    arms.forEach(({ shoulder, elbow }, index) => {
      const phase = gait + index * Math.PI;
      shoulder.rotation.x = Math.sin(phase) * stride * 0.8 + Math.sin(time * 1.9 + index) * 0.016 * (1 - movement);
      shoulder.rotation.z = (index === 0 ? -1 : 1) * (0.095 + movement * 0.045);
      elbow.rotation.x = -(0.13 + movement * (sprint ? 0.7 : 0.18) + Math.max(0, -Math.sin(phase)) * stride * 0.2);
    });
    skirtPanels.forEach((panel, index) => {
      panel.rotation.x = -0.09 + Math.sin(gait + index * 0.55) * movement * 0.055;
    });
    if (cape) {
      cape.rotation.x = 0.06 + movement * 0.2 + Math.sin(time * 3.5) * 0.035;
      cape.rotation.z = Math.sin(gait) * movement * 0.04;
    }
    if (hairTail) {
      hairTail.rotation.x = -Math.sin(gait * 2) * movement * 0.08;
      hairTail.rotation.z = Math.sin(gait) * movement * 0.11 + Math.sin(time * 1.7) * 0.02;
    }
  }
  animate(0, 0, false);
  return { root, animate };
}
