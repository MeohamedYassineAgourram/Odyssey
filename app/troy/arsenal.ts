import * as THREE from 'three';
import type { WeaponKind } from './types';

/** Self-contained, independently disposable equipment. The grip is at zero and the attack points +Z. */
export function createWeaponModel(kind: WeaponKind): THREE.Group {
  const root = new THREE.Group(); root.name = `Equipped ${kind}`; root.userData.weapon = kind;
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: string, metalness = 0, roughness = .65) => {
    const key = `${color}/${metalness}`; let material = materials.get(key);
    if (!material) { material = new THREE.MeshStandardMaterial({ color, metalness, roughness }); materials.set(key, material); }
    return material;
  };
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1), cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 10), sphereGeometry = new THREE.IcosahedronGeometry(1, 1);
  const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], scale: [number, number, number] = [1, 1, 1]) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(...position); mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  const box = (name: string, material: THREE.Material, position: [number, number, number], scale: [number, number, number]) => add(name, boxGeometry, material, position, scale);
  const rod = (name: string, material: THREE.Material, from: THREE.Vector3, to: THREE.Vector3, radius: number) => {
    const middle = from.clone().add(to).multiplyScalar(.5), mesh = add(name, cylinderGeometry, material, [middle.x, middle.y, middle.z], [radius, from.distanceTo(to), radius]);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()); return mesh;
  };
  const wood = mat('#89613d'), leather = mat('#44382c'), bronze = mat('#b8914c', .65, .37), gold = mat('#edcb83', .66, .3), iron = mat('#687d85', .78, .3);
  if (kind === 'bow') {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -.85, -.19), new THREE.Vector3(0, -.72, -.23), new THREE.Vector3(0, -.46, -.04),
      new THREE.Vector3(0, -.18, .025), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, .18, .025),
      new THREE.Vector3(0, .46, -.04), new THREE.Vector3(0, .72, -.23), new THREE.Vector3(0, .85, -.19),
    ]);
    add('Curved ash bow limbs', new THREE.TubeGeometry(curve, 30, .035, 7, false), wood, [0, 0, 0]);
    rod('Leather bow grip', leather, new THREE.Vector3(0, -.15, 0), new THREE.Vector3(0, .15, 0), .052);
    for (const y of [-.17, .17, -.69, .69]) add('Bronze limb binding', cylinderGeometry, bronze, [0, y, Math.abs(y) > .5 ? -.21 : .014], [.043, .038, .043]);
    const string = mat('#e9dcb8', 0, .9);
    rod('Upper bowstring', string, new THREE.Vector3(0, .85, -.19), new THREE.Vector3(0, .015, -.34), .006);
    rod('Lower bowstring', string, new THREE.Vector3(0, -.85, -.19), new THREE.Vector3(0, .015, -.34), .006);
    rod('Nocked arrow shaft', wood, new THREE.Vector3(.055, .025, -.35), new THREE.Vector3(.055, .025, .87), .013);
    const head = add('Bronze arrowhead', new THREE.ConeGeometry(.047, .18, 4), bronze, [.055, .025, .96]); head.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) { const feather = box('Arrow feather', mat('#d7e2da'), [.055 + side * .034, .025, -.23], [.062, .012, .16]); feather.rotation.z = side * .35; }
    for (let i = 0; i < 5; i++) add('Grip stitching', cylinderGeometry, gold, [0, -.1 + i * .05, 0], [.054, .008, .054]);
  } else if (kind === 'hammer') {
    rod('Long oak hammer haft', wood, new THREE.Vector3(0, 0, -.25), new THREE.Vector3(0, 0, 1.06), .047);
    rod('Bound hammer grip', leather, new THREE.Vector3(0, 0, -.22), new THREE.Vector3(0, 0, .18), .06);
    for (let i = 0; i < 7; i++) { const binding = add('Hammer grip binding', cylinderGeometry, bronze, [0, 0, -.2 + i * .058], [.063, .016, .063]); binding.rotation.x = Math.PI / 2; }
    box('Bronze hammer socket', bronze, [0, 0, 1.03], [.29, .34, .35]);
    for (const side of [-1, 1]) {
      const head = add('Faceted iron striking head', cylinderGeometry, iron, [side * .27, 0, 1.03], [.24, .38, .24]); head.rotation.z = Math.PI / 2;
      const face = add('Polished hammer striking face', cylinderGeometry, gold, [side * .48, 0, 1.03], [.23, .045, .23]); face.rotation.z = Math.PI / 2;
      box('Hammer head bronze strap', bronze, [side * .15, 0, 1.03], [.04, .47, .47]);
      for (const y of [-.11, .11]) add('Hammer rivet', sphereGeometry, gold, [side * .11, y, 1.213], [.027, .027, .016]);
    }
    add('Hammer pommel', sphereGeometry, bronze, [0, 0, -.27], [.083, .083, .083]);
  } else {
    rod('Leather sword grip', leather, new THREE.Vector3(0, 0, -.19), new THREE.Vector3(0, 0, .2), .055);
    for (let i = 0; i < 6; i++) { const binding = add('Sword grip binding', cylinderGeometry, bronze, [0, 0, -.17 + i * .06], [.058, .013, .058]); binding.rotation.x = Math.PI / 2; }
    box('Bronze sword guard', bronze, [0, 0, .23], [.42, .09, .075]);
    for (const side of [-1, 1]) add('Sword guard finial', sphereGeometry, gold, [side * .205, 0, .23], [.045, .045, .045]);
    add('Sword pommel', sphereGeometry, bronze, [0, 0, -.23], [.084, .065, .065]);
    const outline = new THREE.Shape(); outline.moveTo(-.094, .27); outline.lineTo(.094, .27); outline.lineTo(.069, 1.04); outline.lineTo(0, 1.29); outline.lineTo(-.069, 1.04); outline.closePath();
    const bladeGeometry = new THREE.ExtrudeGeometry(outline, { depth: .035, bevelEnabled: true, bevelSize: .01, bevelThickness: .009, bevelSegments: 1, steps: 1 });
    bladeGeometry.rotateX(Math.PI / 2); bladeGeometry.translate(0, .0175, 0);
    add('Forged leaf sword blade', bladeGeometry, iron, [0, 0, 0]);
    box('Golden blade fuller', gold, [0, .035, .63], [.014, .009, .61]);
  }
  const retained = new Set<THREE.BufferGeometry>(); root.traverse(object => { if (object instanceof THREE.Mesh) retained.add(object.geometry); });
  for (const geometry of [boxGeometry, cylinderGeometry, sphereGeometry]) if (!retained.has(geometry)) geometry.dispose();
  // Only model-local geometry/materials are shared, so disposing one pickup cannot break a held weapon.
  const usedMaterials = new Set<THREE.Material>(); root.traverse(object => { if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) usedMaterials.add(material); });
  materials.forEach(material => { if (!usedMaterials.has(material)) material.dispose(); });
  return root;
}

export function createWeaponLoot(kind: WeaponKind): THREE.Group {
  const root = new THREE.Group(); root.name = `Weapon loot ${kind}`; root.userData.weapon = kind;
  const weapon = createWeaponModel(kind); weapon.position.y = kind === 'bow' ? 1 : .65; weapon.rotation.x = kind === 'bow' ? -.15 : -.7; root.add(weapon);
  const colour = kind === 'hammer' ? '#ffd184' : kind === 'bow' ? '#aee4b8' : '#bce6ed';
  const halo = new THREE.Mesh(new THREE.RingGeometry(.63, .71, 32), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: .72, depthWrite: false, side: THREE.DoubleSide }));
  halo.name = 'Weapon loot halo'; halo.rotation.x = -Math.PI / 2; halo.position.y = .07; root.add(halo);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(.42, .5, .1, 12), new THREE.MeshStandardMaterial({ color: '#877354', roughness: .9 })); core.position.y = .04; core.receiveShadow = true; root.add(core);
  return root;
}

export function disposeWeaponModel(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); } });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); root.removeFromParent();
}
