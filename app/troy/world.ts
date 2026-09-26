import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FINALE_DURATION, PLOTS, RESOURCE_NODES } from './config';
import type { BuildingKind, RunState } from './types';

export type Collider = { x: number; z: number; w: number; d: number };
type Building = { id: string; kind: BuildingKind; mesh: THREE.Group; rubble: THREE.Group; sparks: THREE.InstancedMesh; x: number; z: number; age: number; order: number };
type Supply = { object: THREE.Group; halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; token: THREE.Group; available: boolean; x: number };
export type TroyWorld = {
  root: THREE.Group; colliders: Collider[];
  sync(state: RunState): void;
  update(time: number, dt: number, state: RunState, marked: boolean): void;
  setNodeAvailable(id: string, available: boolean): void;
  reset(): void;
  dispose(): void;
  groundHeight(x: number, z: number): number;
};
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };

export function createTroyWorld(): TroyWorld {
  const root = new THREE.Group(); root.name = 'Troy — a city on borrowed time';
  const landscape = new THREE.Group(); root.add(landscape);
  const colliders: Collider[] = [], staticColliders: Collider[] = [];
  const buildings = new Map<string, Building>(), supplies = new Map<string, Supply>(), plots = new Map<string, THREE.Group>();
  let seed = 29171;
  const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: string, roughness = .88, metalness = 0) => {
    const key = `${color}/${roughness}/${metalness}`;
    let mat = materials.get(key);
    if (!mat) { mat = new THREE.MeshStandardMaterial({ color, roughness, metalness }); materials.set(key, mat); }
    return mat;
  };
  const stone = material('#dcc69a'), ivory = material('#f7e7c8'), shadowStone = material('#b99b70'), plaster = material('#efe2c3'), tile = material('#b75436'), tileLight = material('#dc8051');
  const wood = material('#785034'), lightWood = material('#b5834f'), darkWood = material('#473323'), olive = material('#75834d'), leafLight = material('#9ba66d'), cypressMat = material('#3f5b3e');
  const turquoise = material('#397d85'), dark = material('#313e3b'), bronze = material('#b68742', .45, .48), gold = material('#e5ba66', .35, .56);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1), cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12), ballGeo = new THREE.IcosahedronGeometry(1, 1), coneGeo = new THREE.ConeGeometry(1, 1, 8);
  const ringGeo = new THREE.TorusGeometry(1, .085, 6, 24);
  const triangle = new THREE.Shape(); triangle.moveTo(-.5, 0); triangle.lineTo(.5, 0); triangle.lineTo(0, 1); triangle.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(triangle, { depth: 1, bevelEnabled: false }); roofGeo.translate(0, 0, -.5);
  const sharedGeometries = new Set<THREE.BufferGeometry>([boxGeo, cylGeo, ballGeo, coneGeo, ringGeo, roofGeo]);
  const make = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const box = (parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) => make(boxGeo, mat, parent, x, y, z, w, h, d);
  const cyl = (parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, r: number, h: number) => make(cylGeo, mat, parent, x, y, z, r, h, r);
  const beam = (parent: THREE.Object3D, mat: THREE.Material, from: THREE.Vector3, to: THREE.Vector3, thickness: number) => {
    const midpoint = from.clone().add(to).multiplyScalar(.5); const b = box(parent, mat, midpoint.x, midpoint.y, midpoint.z, thickness, from.distanceTo(to), thickness);
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()); return b;
  };
  const torus = (parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, r: number, flat = false) => {
    const m = make(ringGeo, mat, parent, x, y, z, r, r, r); if (flat) m.rotation.x = Math.PI / 2; return m;
  };
  // Merge only a self-contained static subtree. Shared primitive geometry and materials
  // stay owned by the world; resetting a run only disposes its merged building buffers.
  const batch = (group: THREE.Group) => {
    group.updateMatrixWorld(true);
    const inverse = group.matrixWorld.clone().invert();
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    group.traverse(obj => { if (obj instanceof THREE.Mesh && !Array.isArray(obj.material)) { const list = batches.get(obj.material) ?? []; list.push(obj); batches.set(obj.material, list); } });
    for (const [mat, meshes] of batches) {
      const transformed: THREE.BufferGeometry[] = [];
      for (const mesh of meshes) {
        const clone = mesh.geometry.clone(); clone.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
        if (clone.index) { transformed.push(clone.toNonIndexed()); clone.dispose(); } else transformed.push(clone);
      }
      const merged = mergeGeometries(transformed, false); transformed.forEach(g => g.dispose());
      if (merged) { const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'Batched handcrafted architecture'; meshes.forEach(m => m.removeFromParent()); group.add(mesh); }
    }
  };
  const pavingMat = material('#e9d8b2'); pavingMat.name = 'Troy paving';
  box(landscape, pavingMat, 0, -.2, .5, 50, .4, 43);
  box(landscape, shadowStone, 0, -2.65, .5, 49.7, 4.9, 42.6);
  // Warm limestone cliff facets frame the turquoise water provided by the engine.
  for (let i = 0; i < 78; i++) {
    const edge = i % 4; const along = random();
    const x = edge < 2 ? (edge ? -1 : 1) * (24.7 + random() * .8) : along * 50 - 25;
    const z = edge < 2 ? along * 43 - 21 : (edge === 2 ? -20.8 : 21.9) + random() * .6;
    const rock = make(ballGeo, i % 3 ? shadowStone : stone, landscape, x, -2.5 - random(), z, 1.3 + random() * 2.4, 1.7 + random() * 2, 1.5 + random() * 1.6);
    rock.rotation.set(random(), random() * 3, random() * .5);
  }
  // A broad processional avenue remains clear even after all twelve plots are built.
  box(landscape, ivory, 0, .013, 0, 4.65, .04, 38);
  for (const x of [-2.2, 2.2]) box(landscape, bronze, x, .04, 0, .065, .025, 37.8);
  for (const z of [-9.7, -2.5, 4.5, 11.55]) {
    box(landscape, ivory, 0, .018, z, 37, .04, 1.6);
    for (const dz of [-.68, .68]) box(landscape, shadowStone, 0, .044, z + dz, 37, .02, .055);
  }
  for (let i = 0; i < 32; i++) {
    const z = -17.5 + i * 1.05;
    box(landscape, stone, 0, .045, z, .8, .025, .03);
    for (const x of [-1.55, 1.55]) { const mosaic = box(landscape, turquoise, x, .045, z, .16, .025, .16); mosaic.rotation.y = Math.PI / 4; }
  }
  cyl(landscape, stone, 0, .04, 13.35, 3.1, .065);
  for (const r of [1.8, 2.55, 2.98]) torus(landscape, r === 2.55 ? turquoise : bronze, 0, .074, 13.35, r, true).scale.z = .035;
  // Small public fountain stands off the avenue, outside the construction sites.
  cyl(landscape, stone, 10.1, .17, 14.15, 1.25, .3); cyl(landscape, ivory, 10.1, .37, 14.15, 1.08, .16);
  torus(landscape, ivory, 10.1, .62, 14.15, 1.03, true);
  cyl(landscape, material('#52adb1', .2), 10.1, .51, 14.15, .96, .035);
  cyl(landscape, bronze, 10.1, .85, 14.15, .13, .7); cyl(landscape, ivory, 10.1, 1.2, 14.15, .42, .1);
  staticColliders.push({ x: 10.1, z: 14.15, w: 2.5, d: 2.5 });
  const fountainWater = new THREE.Group(); fountainWater.position.set(10.1, 0, 14.15); root.add(fountainWater);
  const waterMat = new THREE.MeshBasicMaterial({ color: '#bceff0', transparent: true, opacity: .68 });
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; make(ballGeo, waterMat, fountainWater, Math.sin(a) * .3, 1.34, Math.cos(a) * .3, .028, .16, .028); }

  const urn = (parent: THREE.Object3D, x: number, z: number, size = .7) => {
    const g = new THREE.Group(); g.position.set(x, .08, z); g.scale.setScalar(size); parent.add(g);
    make(ballGeo, tile, g, 0, .42, 0, .34, .43, .34); cyl(g, tileLight, 0, .83, 0, .14, .3); torus(g, bronze, 0, .98, 0, .17, true);
    for (const side of [-1, 1]) torus(g, tile, side * .26, .72, 0, .16);
  };
  const tree = (x: number, z: number, s: number, tall = false) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); landscape.add(g);
    const trunk = cyl(g, wood, 0, 1.1, 0, tall ? .12 : .22, 2.2); trunk.rotation.z = .1;
    if (tall) for (let j = 0; j < 3; j++) make(coneGeo, j % 2 ? olive : cypressMat, g, 0, 2.2 + j * .9, 0, .7 - j * .12, 2.8 - j * .2, .7 - j * .12);
    else for (let j = 0; j < 7; j++) { const a = j * 2.4; beam(g, wood, new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(Math.sin(a) * .85, 2.7, Math.cos(a) * .75), .13); make(ballGeo, j % 2 ? olive : leafLight, g, Math.sin(a), 2.75 + random() * .5, Math.cos(a) * .8, 1.05, .65, .92); }
    staticColliders.push({ x, z, w: .5 * s, d: .5 * s });
    cyl(landscape, shadowStone, x, .04, z, .85 * s, .08);
  };
  for (const [x, z, s] of [[-21, 15, 1.1], [19, 15, 1], [-21, -13, 1], [20.8, -12, 1.1], [-14, 14, .9], [15.5, -13.5, .85]]) tree(x, z, s);
  for (const [x, z] of [[-23, 0], [23, -4], [-11.5, -15], [11.5, -15], [-7, 16.5], [6.6, 18.2], [-22.5, -17], [22.5, 9]]) tree(x, z, .95, true);
  for (let i = 0; i < 65; i++) {
    const x = (i % 2 ? -1 : 1) * (21.8 + random() * 2.3), z = -17 + random() * 36;
    make(ballGeo, i % 3 ? olive : leafLight, landscape, x, .2, z, .28 + random() * .3, .23, .35);
    if (i % 3 === 0) make(ballGeo, material('#b9828f'), landscape, x + .12, .42, z, .1, .12, .1);
  }
  // Low seaward parapets and a harbour stair make the plateau a believable place.
  for (const [x, width] of [[-20, 6], [-11.5, 7], [-2.4, 7.5], [7, 6.5], [22, 3]]) {
    box(landscape, stone, x, .43, 20.8, width, .86, .45); box(landscape, ivory, x, .92, 20.8, width + .15, .12, .64);
    staticColliders.push({ x, z: 20.8, w: width, d: .6 });
  }
  for (const x of [-24.2, 24.2]) for (let i = 0; i < 6; i++) { box(landscape, stone, x, .3, -15.6 + i * 6.1, .38, .6, 4.7); }
  for (let i = 0; i < 11; i++) box(landscape, stone, 15.8, -.17 - i * .36, 21.4 + i * .56, 3.5, .32, .9);
  box(landscape, wood, 15.8, -4.1, 30.3, 3.6, .25, 8.9);
  for (let i = 0; i < 23; i++) box(landscape, lightWood, 15.8, -3.95, 26 + i * .39, 3.58, .045, .28);
  for (const x of [13.85, 17.75]) for (const z of [26.5, 30, 34]) cyl(landscape, darkWood, x, -3.95, z, .12, 2.2);
  const ship = new THREE.Group(); ship.position.set(21.4, -4.7, 31.6); ship.rotation.y = -.24; root.add(ship);
  make(ballGeo, wood, ship, 0, .35, 0, 1.25, .85, 3.4);
  box(ship, darkWood, 0, .79, 0, 1.65, .12, 4.7);
  for (const x of [-.91, .91]) box(ship, lightWood, x, .94, 0, .12, .32, 4.6);
  cyl(ship, wood, 0, 2.5, -.25, .075, 4.8); box(ship, wood, 0, 4.25, -.25, 3.5, .09, .09);
  const sailMat = new THREE.MeshStandardMaterial({ color: '#f3e3bd', roughness: .95, side: THREE.DoubleSide });
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(3.15, 2.6, 10, 10), sailMat); sail.position.set(0, 2.95, -.19); ship.add(sail);
  const sailPos = sail.geometry.attributes.position; for (let i = 0; i < sailPos.count; i++) sailPos.setZ(i, .25 * Math.sin((sailPos.getX(i) / 3.15 + .5) * Math.PI)); sailPos.needsUpdate = true;
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) { const oar = box(ship, lightWood, side * 1.35, .5, -1.7 + i * .75, 1.4, .045, .1); oar.rotation.z = side * -.15; }
  batch(ship);

  // The gate is defensive scenery; all twelve civic plots still begin as empty plans.
  const gate = new THREE.Group(); gate.position.set(0, 0, -17.6); landscape.add(gate);
  for (const side of [-1, 1]) {
    const x = side * 4.2;
    box(gate, shadowStone, x, 1.5, 0, 2.5, 3, 2.35); box(gate, stone, x, 1.8, .03, 2.3, 3.3, 2.2);
    box(gate, ivory, x, 3.52, 0, 2.65, .23, 2.65);
    for (const dx of [-.95, 0, .95]) for (const z of [-1, 1]) box(gate, stone, x + dx, 3.93, z, .48, .65, .48);
    for (let row = 0; row < 4; row++) box(gate, shadowStone, x, .6 + row * .72, 1.15, 2.3, .04, .025);
    box(gate, dark, x, 2.35, 1.17, .16, .8, .04);
    staticColliders.push({ x, z: -17.6, w: 2.5, d: 2.5 });
    const door = box(gate, wood, side * 2.95, 1.35, .6, .18, 2.7, 2.7); door.rotation.y = -side * .45;
    box(gate, stone, side * 11, .83, -.25, 10.6, 1.66, .7); box(gate, ivory, side * 11, 1.71, -.25, 10.8, .14, .9);
    staticColliders.push({ x: side * 11, z: -17.85, w: 10.8, d: .9 });
  }
  const banners: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>[] = [];
  const bannerMat = new THREE.MeshStandardMaterial({ color: '#36747c', side: THREE.DoubleSide, roughness: .9 });
  for (const x of [-4.2, 4.2]) {
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(.86, 1.55, 4, 8), bannerMat); flag.position.set(x, 2.15, -16.37); root.add(flag); banners.push(flag);
    box(landscape, bronze, x, 2.99, -16.33, 1.05, .06, .07);
    torus(landscape, bronze, x, 2.3, -16.31, .19);
  }
  // North causeway supports the waiting horse above the sea.
  box(landscape, stone, 0, -.16, -21.7, 7, .32, 9.5);
  for (const x of [-3.2, 3.2]) box(landscape, shadowStone, x, .12, -23, .3, .25, 7);
  for (const [x, z, s] of [[-16.5, 13, .9], [13.8, 12.9, .7], [-2.8, -14.4, .6], [3.4, 16.3, .8], [21.8, 4.8, .75]]) urn(landscape, x, z, s);

  // Azure survey lines, rubble and corner pegs communicate real, empty building lots.
  const plotLineMat = new THREE.MeshStandardMaterial({ color: '#73b9b5', emissive: '#337977', emissiveIntensity: .24, roughness: .8 });
  const plotRuneMat = new THREE.MeshBasicMaterial({ color: '#9ae4da', transparent: true, opacity: .78, depthWrite: false });
  for (let index = 0; index < PLOTS.length; index++) {
    const p = PLOTS[index], g = new THREE.Group(); g.name = `Unbuilt foundation ${p.id}`; g.position.set(p.x, 0, p.z); root.add(g); plots.set(p.id, g);
    box(g, shadowStone, 0, .018, 0, 4.55, .035, 4.55);
    box(g, material('#cbbc99'), 0, .042, 0, 4.35, .045, 4.35);
    for (const side of [-1, 1]) {
      box(g, plotLineMat, side * 2.24, .075, 0, .055, .03, 4.55); box(g, plotLineMat, 0, .075, side * 2.24, 4.55, .03, .055);
      for (const other of [-1, 1]) { box(g, stone, side * 2.13, .2, other * 2.13, .3, .4, .3); box(g, bronze, side * 2.13, .43, other * 2.13, .38, .075, .38); }
    }
    for (let i = 0; i < 6; i++) { const a = i * 2.4 + index; const rubble = box(g, i % 2 ? stone : ivory, Math.sin(a) * (1.5 + random() * .3), .13, Math.cos(a) * (1.45 + random() * .3), .2 + random() * .4, .15 + random() * .12, .27); rubble.rotation.y = a; }
    const plaque = box(g, ivory, 0, .095, 0, 1.15, .09, 1.15); plaque.rotation.y = Math.PI / 4;
    torus(g, bronze, 0, .17, 0, .47, true).scale.z = .018;
    box(g, plotRuneMat, 0, .19, 0, .64, .025, .06); box(g, plotRuneMat, 0, .19, 0, .06, .025, .64);
    batch(g);
  }
  // Pickups retain different physical silhouettes, as well as colour-coded halos.
  const resourceColor = { wood: '#eac494', stone: '#9ddce0', bronze: '#ffc466' };
  for (const node of RESOURCE_NODES) {
    const g = new THREE.Group(); g.name = `${node.resource} supply — ${node.id}`; g.position.set(node.x, .05, node.z); root.add(g);
    cyl(g, shadowStone, 0, .03, 0, 1.02, .08);
    const prop = new THREE.Group(); g.add(prop);
    if (node.resource === 'wood') {
      for (let j = 0; j < 7; j++) { const x = (j % 3 - 1) * .43, y = .25 + Math.floor(j / 3) * .35; const log = cyl(prop, wood, x, y, 0, .23, 1.6); log.rotation.x = Math.PI / 2; for (const z of [-.81, .81]) { const cut = cyl(prop, lightWood, x, y, z, .19, .025); cut.rotation.x = Math.PI / 2; } }
      for (const z of [-.55, .55]) { const tie = torus(prop, bronze, 0, .5, z, .76); tie.scale.y = .58; }
    } else if (node.resource === 'stone') {
      for (let j = 0; j < 6; j++) { const stoneMesh = make(ballGeo, j % 2 ? ivory : stone, prop, (j % 3 - 1) * .44, .25 + Math.floor(j / 3) * .34, (j % 2 - .5) * .35, .46, .34, .48); stoneMesh.rotation.y = j * 1.2; }
      box(prop, turquoise, 0, .75, .13, .3, .14, .3);
    } else {
      box(prop, darkWood, 0, .12, 0, 1.35, .2, 1.1);
      for (let j = 0; j < 5; j++) { const ingot = box(prop, j % 2 ? bronze : gold, (j % 3 - 1) * .32, .32 + Math.floor(j / 3) * .24, (j % 2 - .5) * .2, .28, .2, .56); ingot.rotation.y = j % 2 ? .15 : -.12; }
      torus(prop, gold, .4, .55, .42, .25);
    }
    batch(prop);
    const halo = new THREE.Mesh(new THREE.RingGeometry(1.12, 1.18, 40), new THREE.MeshBasicMaterial({ color: resourceColor[node.resource], transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = .065; g.add(halo);
    const token = new THREE.Group(); token.position.y = 1.9; g.add(token);
    const gem = make(ballGeo, material(resourceColor[node.resource], .4, .2), token, 0, 0, 0, .17, .27, .17); gem.castShadow = false;
    torus(token, bronze, 0, 0, 0, .3);
    supplies.set(node.id, { object: prop, halo, token, available: true, x: node.x });
  }
  batch(landscape);

  const column = (parent: THREE.Object3D, x: number, z: number, height: number, base = .35) => {
    cyl(parent, stone, x, base + .1, z, .29, .2); cyl(parent, ivory, x, base + .22, z, .22, .12);
    cyl(parent, ivory, x, base + .3 + height / 2, z, .16, height);
    for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4; cyl(parent, stone, x + Math.sin(angle) * .158, base + .3 + height / 2, z + Math.cos(angle) * .158, .016, height - .08); }
    cyl(parent, stone, x, base + height + .36, z, .24, .13); box(parent, ivory, x, base + height + .48, z, .61, .15, .61);
  };
  const gabledRoof = (parent: THREE.Object3D, y: number, width: number, depth: number, rise: number, mat = tile) => {
    make(roofGeo, plaster, parent, 0, y, 0, width, rise, depth);
    const angle = Math.atan2(rise, width / 2), panelWidth = Math.hypot(width / 2, rise) + .15;
    for (const side of [-1, 1]) {
      const roof = box(parent, mat, side * width / 4, y + rise / 2 + .075, 0, panelWidth, .12, depth + .3); roof.rotation.z = -side * angle;
      // Individually raised tile ribs make the silhouette read in raking sunset light.
      for (let i = 0; i < 10; i++) {
        const rib = box(parent, mat === gold ? bronze : tileLight, side * width / 4, y + rise / 2 + .15, -depth / 2 + i * depth / 9, panelWidth, .035, .065); rib.rotation.z = -side * angle;
      }
    }
    box(parent, mat === gold ? gold : tileLight, 0, y + rise + .16, 0, .15, .13, depth + .42);
  };
  const createBuilding = (kind: BuildingKind): THREE.Group => {
    const g = new THREE.Group(); g.name = `Constructed ${kind}`;
    box(g, shadowStone, 0, .14, 0, 4.25, .28, 4.25); box(g, stone, 0, .3, 0, 4.04, .12, 4.04);
    if (kind === 'house') {
      box(g, plaster, 0, 1.58, -.12, 3.4, 2.45, 2.96);
      for (const x of [-1.72, 1.72]) box(g, ivory, x, 1.58, 1.37, .18, 2.48, .18);
      box(g, shadowStone, 0, .68, 1.4, 3.45, .22, .1);
      box(g, darkWood, 0, 1.24, 1.4, .8, 1.75, .09);
      for (let i = 0; i < 5; i++) box(g, wood, -.32 + i * .16, 1.22, 1.48, .13, 1.65, .065);
      box(g, bronze, 0, .73, 1.53, .72, .07, .045); box(g, bronze, 0, 1.68, 1.53, .72, .07, .045);
      make(ballGeo, gold, g, .21, 1.21, 1.57, .045, .045, .035);
      for (const x of [-.49, .49]) box(g, ivory, x, 1.3, 1.51, .15, 1.98, .18); box(g, ivory, 0, 2.3, 1.5, 1.18, .15, .2);
      for (const x of [-1.12, 1.12]) {
        box(g, dark, x, 1.84, 1.4, .56, .68, .08); box(g, turquoise, x, 1.84, 1.47, .52, .65, .06);
        for (let i = 0; i < 4; i++) box(g, shadowStone, x, 1.59 + i * .16, 1.52, .45, .025, .035);
        box(g, ivory, x, 1.44, 1.53, .75, .13, .2);
      }
      for (const x of [-1.74, 1.74]) { box(g, turquoise, x, 1.7, -.15, .06, .74, .65); box(g, ivory, x, 1.28, -.15, .15, .12, .82); }
      gabledRoof(g, 2.82, 3.85, 3.43, .88);
      box(g, plaster, 1.1, 3.3, -.66, .44, 1.32, .52); box(g, ivory, 1.1, 3.94, -.66, .62, .13, .66); box(g, darkWood, 1.1, 4.02, -.66, .36, .035, .4);
      const awning = box(g, turquoise, 0, 2.35, 1.73, 1.45, .07, .74); awning.rotation.x = -.12;
      for (const x of [-.68, .68]) cyl(g, lightWood, x, 1.28, 2, .035, 1.95);
      urn(g, 1.5, 1.8, .5);
    } else if (kind === 'farm') {
      // A working timber yard: log stacks, covered shed, crane and a suspended beam.
      for (const x of [-1.48, .35]) for (const z of [-1.4, .52]) box(g, wood, x, 1.28, z, .15, 1.85, .15);
      box(g, darkWood, -.55, 1.08, -1.5, 2.12, 1.48, .1);
      for (let i = 0; i < 8; i++) box(g, lightWood, -1.5 + i * .27, 1.13, -1.43, .19, 1.45, .05);
      const shed = new THREE.Group(); shed.position.set(-.58, 0, -.4); g.add(shed); gabledRoof(shed, 2.25, 2.4, 2.55, .53, wood);
      for (let i = 0; i < 8; i++) {
        const x = -.6 + (i % 3 - 1) * .44, y = .59 + Math.floor(i / 3) * .39;
        const log = cyl(g, wood, x, y, -.45, .225, 1.45); log.rotation.x = Math.PI / 2;
        const end = cyl(g, lightWood, x, y, .285, .195, .04); end.rotation.x = Math.PI / 2;
      }
      box(g, wood, 1.28, 1.85, -.8, .25, 3.1, .25); box(g, lightWood, 1.28, 3.33, .17, .2, .2, 2.45);
      beam(g, wood, new THREE.Vector3(1.28, 2.2, -.8), new THREE.Vector3(1.28, 3.25, .75), .15);
      cyl(g, darkWood, 1.28, 2.62, 1.16, .022, 1.34);
      const wheel = torus(g, bronze, 1.28, 3.3, 1.18, .18); wheel.rotation.y = Math.PI / 2;
      const load = cyl(g, lightWood, 1.28, 1.87, 1.12, .19, 1.4); load.rotation.z = Math.PI / 2;
      box(g, turquoise, -.8, .75, 1.48, 1.2, .75, .7); for (const x of [-1.35, -.25]) box(g, lightWood, x, .75, 1.85, .08, .75, .08);
      box(g, bronze, -.8, 1.18, 1.51, .87, .07, .45);
    } else if (kind === 'tower') {
      box(g, stone, 0, 2.43, 0, 2.45, 4.14, 2.45);
      for (let row = 0; row < 6; row++) {
        const y = .66 + row * .64;
        for (const z of [-1.235, 1.235]) { box(g, shadowStone, 0, y, z, 2.44, .035, .025); for (const x of row % 2 ? [-.75, .75] : [0]) box(g, shadowStone, x, y + .3, z, .035, .61, .035); }
        for (const x of [-1.235, 1.235]) box(g, shadowStone, x, y, 0, .025, .035, 2.44);
      }
      box(g, darkWood, 0, 1.14, 1.25, .8, 1.56, .08); box(g, wood, 0, 1.11, 1.31, .63, 1.48, .06);
      for (const x of [-.47, .47]) box(g, ivory, x, 1.18, 1.35, .13, 1.68, .15); box(g, ivory, 0, 2.08, 1.32, 1.06, .16, .16);
      for (const z of [-1.255, 1.255]) box(g, dark, 0, 3.2, z, .14, .84, .03);
      for (const x of [-1.255, 1.255]) box(g, dark, x, 3.2, 0, .03, .84, .14);
      box(g, shadowStone, 0, 4.51, 0, 2.85, .25, 2.85); box(g, ivory, 0, 4.69, 0, 3.05, .17, 3.05);
      for (const side of [-1, 1]) {
        box(g, stone, side * 1.36, 4.97, 0, .26, .4, 2.95); box(g, stone, 0, 4.97, side * 1.36, 2.95, .4, .26);
        for (const along of [-1.25, 0, 1.25]) { box(g, ivory, along, 5.3, side * 1.36, .54, .47, .4); box(g, ivory, side * 1.36, 5.3, along, .4, .47, .54); }
      }
      box(g, turquoise, -.84, 3.3, 1.28, .49, 1.42, .035); torus(g, bronze, -.84, 3.65, 1.32, .15);
      cyl(g, wood, .6, 5.65, -.55, .045, 1.6); box(g, turquoise, .91, 6.1, -.55, .58, .57, .05);
      for (const x of [-1.52, 1.52]) { beam(g, bronze, new THREE.Vector3(x, 2.2, 1), new THREE.Vector3(x, 2.6, 1.37), .07); make(coneGeo, gold, g, x, 2.9, 1.37, .13, .44, .13); }
    } else {
      for (let i = 0; i < 3; i++) box(g, i % 2 ? stone : ivory, 0, .35 + i * .12, 0, 4.12 - i * .28, .13, 4.12 - i * .28);
      box(g, plaster, 0, 1.67, -1.12, 2.6, 2.06, .35); box(g, turquoise, 0, 1.57, -.92, 1.25, 1.9, .04);
      for (const x of [-1.4, 0, 1.4]) column(g, x, 1.2, 2.15, .6);
      for (const x of [-1.4, 1.4]) column(g, x, -1.2, 2.15, .6);
      box(g, stone, 0, 3.34, 0, 3.78, .26, 3.6); box(g, ivory, 0, 3.54, 0, 3.99, .13, 3.8);
      for (let i = 0; i < 12; i++) box(g, bronze, -1.7 + i * .31, 3.35, 1.825, .09, .18, .035);
      gabledRoof(g, 3.64, 4.12, 3.94, .9, gold);
      torus(g, bronze, 0, 3.99, 1.99, .22); make(ballGeo, gold, g, 0, 4, 2.02, .11, .11, .035);
      for (const x of [-1.7, 1.7]) cyl(g, bronze, x, .95, 1.78, .12, .75);
    }
    batch(g); return g;
  };

  // A fully articulated wooden gift. It has no downloaded model or hidden dependency.
  const horse = new THREE.Group(); horse.name = 'The Trojan Horse'; horse.position.set(0, 0, -22); root.add(horse);
  const horseBody = new THREE.Group(); horse.add(horseBody);
  const barrel = cyl(horseBody, wood, 0, 2.38, 0, .91, 2.85); barrel.rotation.x = Math.PI / 2; barrel.scale.z = .78;
  for (const side of [-1, 1]) {
    for (let row = 0; row < 8; row++) box(horseBody, row % 3 ? lightWood : wood, side * (.72 + Math.sin(row / 7 * Math.PI) * .15), 1.75 + row * .18, 0, .075, .15, 2.9);
    for (const z of [-1.22, 1.22]) { box(horseBody, bronze, side * .88, 2.36, z, .07, 1.32, .095); for (let row = 0; row < 5; row++) make(ballGeo, gold, horseBody, side * .925, 1.85 + row * .25, z, .035, .035, .035); }
    box(horseBody, darkWood, side * .83, 1.68, 0, .13, .14, 3.05); box(horseBody, bronze, side * .81, 3, 0, .13, .1, 2.8);
  }
  for (const z of [-1.43, 1.43]) {
    const end = cyl(horseBody, lightWood, 0, 2.38, z, .84, .07); end.rotation.x = Math.PI / 2;
    for (let i = -2; i <= 2; i++) box(horseBody, darkWood, i * .27, 2.35, z * 1.035, .025, 1.15, .03);
    const endBand = torus(horseBody, bronze, 0, 2.38, z * 1.05, .75); endBand.scale.y = .83;
  }
  beam(horseBody, lightWood, new THREE.Vector3(0, 2.45, .93), new THREE.Vector3(0, 3.64, 1.33), .78);
  for (let row = 0; row < 6; row++) box(horseBody, row % 2 ? wood : lightWood, 0, 2.75 + row * .17, 1.04 + row * .06, .84, .145, .61);
  box(horseBody, lightWood, 0, 3.65, 1.65, .89, .65, 1.1);
  const brow = box(horseBody, wood, 0, 3.9, 1.67, .94, .22, .91); brow.rotation.x = .08;
  box(horseBody, lightWood, 0, 3.44, 2.12, .74, .43, .75); box(horseBody, darkWood, 0, 3.3, 2.45, .58, .045, .05);
  for (const side of [-1, 1]) {
    const ear = make(coneGeo, wood, horseBody, side * .3, 4.13, 1.33, .17, .63, .16); ear.rotation.z = -side * .13;
    make(ballGeo, darkWood, horseBody, side * .455, 3.74, 1.92, .026, .12, .12);
    make(ballGeo, gold, horseBody, side * .486, 3.76, 1.94, .02, .058, .058);
    box(horseBody, bronze, side * .38, 3.44, 2.29, .025, .47, .07); make(ballGeo, darkWood, horseBody, side * .24, 3.55, 2.51, .055, .05, .035);
  }
  for (let i = 0; i < 8; i++) { const mane = box(horseBody, darkWood, 0, 2.84 + i * .14, .83 + i * .035, .33, .29, .25); mane.rotation.x = -.3; }
  beam(horseBody, darkWood, new THREE.Vector3(0, 2.75, -1.32), new THREE.Vector3(0, 2.45, -2.1), .17);
  for (let i = 0; i < 4; i++) beam(horseBody, wood, new THREE.Vector3((i - 1.5) * .09, 2.48, -2.04), new THREE.Vector3((i - 1.5) * .14, 1.42, -2.16), .1);
  batch(horseBody);
  const horseLegs: THREE.Group[] = [], wheels: THREE.Group[] = [];
  for (const x of [-.62, .62]) for (const z of [-.97, .98]) {
    const leg = new THREE.Group(); leg.position.set(x, 1.9, z); horse.add(leg); horseLegs.push(leg);
    box(leg, lightWood, 0, -.63, 0, .35, 1.4, .4); box(leg, wood, 0, -1.12, .04, .42, .2, .45); box(leg, bronze, 0, -1.41, .12, .51, .28, .67);
    make(ballGeo, bronze, leg, x < 0 ? -.2 : .2, -.58, .02, .045, .11, .11); batch(leg);
    const wheel = new THREE.Group(); wheel.position.set(x < 0 ? -1.05 : 1.05, .36, z); horse.add(wheel); wheels.push(wheel);
    const rim = torus(wheel, darkWood, 0, 0, 0, .37); rim.rotation.y = Math.PI / 2;
    const band = torus(wheel, bronze, 0, 0, 0, .39); band.rotation.y = Math.PI / 2;
    const hub = cyl(wheel, bronze, 0, 0, 0, .09, .22); hub.rotation.z = Math.PI / 2;
    for (let i = 0; i < 6; i++) { const spoke = box(wheel, lightWood, 0, 0, 0, .09, .7, .05); spoke.rotation.x = i * Math.PI / 6; } batch(wheel);
  }
  const platform = box(horse, darkWood, 0, .29, 0, 1.93, .18, 3.17); platform.name = 'Horse wheeled base';
  const hatch = new THREE.Group(); hatch.position.set(-.92, 2.87, 0); horse.add(hatch);
  box(hatch, darkWood, 0, -.48, 0, .06, .94, 1.33);
  for (let i = 0; i < 6; i++) box(hatch, lightWood, -.04, -.48, -.55 + i * .22, .06, .85, .18);
  for (const z of [-.49, .49]) box(hatch, bronze, -.09, -.48, z, .055, .88, .06);
  torus(hatch, bronze, -.12, -.69, 0, .09).rotation.y = Math.PI / 2;
  batch(hatch);
  const furnaceMat = new THREE.MeshBasicMaterial({ color: '#ff5a21', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const furnace = box(horse, furnaceMat, -.91, 2.37, 0, .04, .93, 1.35); furnace.castShadow = false;
  const horseLight = new THREE.PointLight('#ff6328', 0, 15, 1.5); horseLight.position.set(-1, 2.4, 0); horse.add(horseLight);

  // Finale effects are pooled once and positioned deterministically from finaleTime.
  const disasterEffects = new THREE.Group(); disasterEffects.visible = false; root.add(disasterEffects);
  const emberMat = new THREE.MeshBasicMaterial({ color: '#ffbe4d', transparent: true, opacity: .95, depthWrite: false });
  const fireMat = new THREE.MeshBasicMaterial({ color: '#ff732c', transparent: true, opacity: .76, depthWrite: false });
  const smokeMat = new THREE.MeshStandardMaterial({ color: '#57443a', transparent: true, opacity: .58, roughness: 1, depthWrite: false });
  const sparksMat = new THREE.MeshBasicMaterial({ color: '#fff0b3', transparent: true, opacity: .82, depthWrite: false });
  const volleys = new THREE.InstancedMesh(ballGeo, emberMat, 84); volleys.frustumCulled = false; disasterEffects.add(volleys);
  const fires = new THREE.InstancedMesh(coneGeo, fireMat, 60); fires.frustumCulled = false; disasterEffects.add(fires);
  const smoke = new THREE.InstancedMesh(ballGeo, smokeMat, 36); smoke.frustumCulled = false; disasterEffects.add(smoke);
  const dustMat = new THREE.MeshBasicMaterial({ color: '#e6cda2', transparent: true, opacity: .24, depthWrite: false });
  const dust = new THREE.InstancedMesh(ballGeo, dustMat, 36); dust.frustumCulled = false; disasterEffects.add(dust);
  const impactRings: THREE.Mesh[] = [];
  const shockMat = new THREE.MeshBasicMaterial({ color: '#ebc693', transparent: true, opacity: .28, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) { const mesh = new THREE.Mesh(new THREE.RingGeometry(.95, 1, 80), shockMat); mesh.rotation.x = -Math.PI / 2; mesh.position.y = .09; disasterEffects.add(mesh); impactRings.push(mesh); }
  const cracks = new THREE.Group(); cracks.visible = false; disasterEffects.add(cracks);
  const fissureMat = new THREE.MeshBasicMaterial({ color: '#34241c', side: THREE.DoubleSide });
  const crackMeshes: THREE.Mesh[] = [];
  for (let ray = 0; ray < 14; ray++) {
    const angle = ray / 14 * Math.PI * 2; let x = 0, z = -7;
    for (let section = 0; section < 6; section++) {
      const a = angle + Math.sin(ray * 4.7 + section * 2.1) * .33;
      const nx = x + Math.sin(a) * 3.1, nz = z + Math.cos(a) * 3.1;
      const mesh = box(cracks, fissureMat, (x + nx) / 2, .079, (z + nz) / 2, .11 + section * .025, .025, 3.2); mesh.rotation.y = a; mesh.userData.width = mesh.scale.x; mesh.userData.section = section; crackMeshes.push(mesh); x = nx; z = nz;
    }
  }
  const looseSlabs: THREE.Mesh[] = [];
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? -1 : 1, z = -12 + Math.floor(i / 2) * 3.15;
    const slab = box(disasterEffects, stone, side * 1.47, .06, z, 1.28, .18, 1.75); slab.userData.baseX = side * 1.47; slab.userData.baseZ = z; looseSlabs.push(slab);
  }
  const army = new THREE.Group(); army.visible = false; disasterEffects.add(army);
  const soldiers: THREE.Group[] = [];
  for (let i = 0; i < 28; i++) {
    const soldier = new THREE.Group(); army.add(soldier); soldiers.push(soldier);
    box(soldier, i % 2 ? bronze : dark, 0, .78, 0, .38, .51, .26);
    make(ballGeo, bronze, soldier, 0, 1.16, 0, .2, .22, .2); box(soldier, tile, 0, 1.38, -.015, .045, .2, .26);
    box(soldier, darkWood, -.1, .33, 0, .12, .42, .15); box(soldier, darkWood, .1, .33, .05, .12, .42, .15);
    const shield = cyl(soldier, bronze, -.28, .8, .11, .25, .06); shield.rotation.x = Math.PI / 2;
    beam(soldier, darkWood, new THREE.Vector3(.28, .25, .05), new THREE.Vector3(.28, 1.65, .35), .027); make(coneGeo, ivory, soldier, .28, 1.73, .37, .065, .2, .065);
    batch(soldier);
  }
  const proxy = new THREE.Object3D();
  const setInstance = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, rotation = 0) => { proxy.position.set(x, y, z); proxy.rotation.set(0, rotation, 0); proxy.scale.set(Math.max(.0001, sx), Math.max(.0001, sy), Math.max(.0001, sz)); proxy.updateMatrix(); mesh.setMatrixAt(i, proxy.matrix); };
  const rebuildColliders = () => { colliders.length = 0; colliders.push(...staticColliders); for (const b of buildings.values()) colliders.push({ x: b.x, z: b.z, w: 4.25, d: 4.25 }); };
  rebuildColliders();
  let runSeed: number | undefined, previousPhase: RunState['phase'] | undefined;
  const disposeBuilding = (b: Building) => {
    b.mesh.traverse(obj => { if (obj instanceof THREE.Mesh && !sharedGeometries.has(obj.geometry)) obj.geometry.dispose(); });
    b.mesh.removeFromParent(); b.rubble.removeFromParent(); b.sparks.removeFromParent(); b.sparks.dispose();
  };
  const reset = () => {
    buildings.forEach(disposeBuilding); buildings.clear(); plots.forEach(g => { g.visible = true; g.position.y = 0; });
    supplies.forEach(s => { s.available = true; s.object.visible = s.halo.visible = s.token.visible = true; });
    horse.position.set(0, 0, -22); horse.rotation.set(0, 0, 0); horse.scale.setScalar(1); horseBody.position.y = 0; horseBody.rotation.set(0, 0, 0); horseLegs.forEach(l => l.rotation.x = 0); hatch.rotation.z = 0; furnaceMat.opacity = 0; horseLight.intensity = 0;
    disasterEffects.visible = false; landscape.position.set(0, 0, 0); rebuildColliders(); runSeed = undefined; previousPhase = undefined;
  };
  const sync = (state: RunState) => {
    if ((runSeed !== undefined && runSeed !== state.seed) || (state.phase === 'ready' && previousPhase !== 'ready' && buildings.size > 0) || state.buildings.length < buildings.size) reset();
    runSeed = state.seed; previousPhase = state.phase;
    let changed = false;
    for (const placed of state.buildings) {
      if (buildings.has(placed.plotId)) continue;
      const p = PLOTS.find(plot => plot.id === placed.plotId); if (!p) continue;
      const mesh = createBuilding(placed.kind); mesh.position.set(p.x, 0, p.z); mesh.scale.setScalar(.05); root.add(mesh); plots.get(p.id)!.visible = false;
      const rubble = new THREE.Group(); rubble.position.set(p.x, 0, p.z); root.add(rubble); rubble.visible = false;
      for (let i = 0; i < 20; i++) {
        const debris = make(i % 4 ? boxGeo : ballGeo, i % 5 === 0 ? tile : i % 4 === 0 ? wood : stone, rubble, 0, 0, 0, .25 + random() * .6, .18 + random() * .32, .2 + random() * .65);
        debris.userData = { angle: i * 2.399 + p.x, distance: .5 + random() * 2.5, height: .3 + random() * 2.8, sizeX: debris.scale.x, sizeY: debris.scale.y, sizeZ: debris.scale.z };
      }
      const sparks = new THREE.InstancedMesh(ballGeo, sparksMat, 18); sparks.position.set(p.x, 0, p.z); sparks.frustumCulled = false; root.add(sparks);
      buildings.set(p.id, { id: p.id, kind: placed.kind, mesh, rubble, sparks, x: p.x, z: p.z, age: 0, order: (p.z + 6) / 14 });
      changed = true;
    }
    if (changed) rebuildColliders();
  };

  const update = (time: number, dt: number, state: RunState, marked: boolean) => {
    const finale = state.phase === 'disaster' || state.phase === 'ended';
    const progress = finale ? (state.phase === 'ended' ? 1 : clamp(state.finaleTime / FINALE_DURATION)) : 0;
    const ending = state.ending;
    for (const s of supplies.values()) {
      s.halo.visible = s.available && !finale; s.token.visible = s.available && !finale;
      s.halo.material.opacity = marked ? .74 + Math.sin(time * 5) * .2 : .38 + Math.sin(time * 2.2 + s.x) * .13;
      s.halo.scale.setScalar(marked ? 1.35 + Math.sin(time * 3) * .08 : 1);
      s.token.position.y = 1.85 + Math.sin(time * 2.3 + s.x) * .12; s.token.rotation.y = time * .65;
    }
    plotRuneMat.opacity = .6 + Math.sin(time * 2) * .19;
    for (let n = 0; n < banners.length; n++) {
      const positions = banners[n].geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) { const y = positions.getY(i); positions.setZ(i, Math.sin(time * 2.5 + y * 3 + n) * .09 * (.78 - y)); }
      positions.needsUpdate = true;
    }
    ship.rotation.z = Math.sin(time * .8) * .025; ship.position.y = -4.7 + Math.sin(time * .75) * .08;
    fountainWater.children.forEach((drop, i) => { drop.position.y = 1.1 + ((time * .55 + i * .13) % .45); drop.scale.y = .1 + Math.sin(time * 5 + i) * .035; });
    disasterEffects.visible = finale;
    // The gift starts at human scale. The reveal is physically animated in every ending.
    const growth = smooth(progress / .31);
    const targetScale = ending === 'stampede' ? 3.15 : ending === 'earthquake' ? 2.75 : 2.35;
    const horseScale = 1 + growth * (targetScale - 1);
    horse.scale.setScalar(horseScale);
    const march = smooth((progress - .17) / .71);
    const travel = ending === 'stampede' ? 35.5 : ending === 'ambush' ? 12 : ending === 'firestorm' ? 13.5 : 14;
    horse.position.z = -22 + travel * march;
    horse.position.x = finale && ending === 'stampede' ? Math.sin(progress * 10) * .65 * Math.sin(progress * Math.PI) : 0;
    const walking = finale && progress > .14 && progress < .9;
    const gaitTime = finale ? progress * 58 : time * .5;
    horse.position.y = walking ? Math.abs(Math.sin(gaitTime)) * (ending === 'earthquake' ? .36 : .11) * growth : 0;
    horse.rotation.z = walking ? Math.sin(gaitTime) * .018 : 0;
    horseBody.position.y = finale ? Math.sin(gaitTime) * .025 : Math.sin(time * .7) * .006;
    horseLegs.forEach((leg, index) => { leg.rotation.x = walking ? Math.sin(gaitTime + (index === 0 || index === 3 ? 0 : Math.PI)) * .22 : 0; });
    wheels.forEach(wheel => { wheel.rotation.x = -travel * march / .39; });
    const openHatch = finale && (ending === 'ambush' || ending === 'firestorm') ? smooth((progress - .14) / .2) : 0;
    hatch.rotation.z = -openHatch * 1.4;
    furnaceMat.opacity = ending === 'firestorm' ? openHatch * (.78 + Math.sin(time * 17) * .17) : 0;
    horseLight.intensity = ending === 'firestorm' ? openHatch * (16 + Math.sin(time * 12) * 4) : 0;

    for (const b of buildings.values()) {
      b.age += Math.max(0, Math.min(dt, .1));
      const pop = clamp(b.age / .55); const popScale = pop >= 1 ? 1 : Math.max(.025, 1 + 2.70158 * Math.pow(pop - 1, 3) + 1.70158 * Math.pow(pop - 1, 2));
      b.mesh.scale.setScalar(popScale); b.mesh.position.set(b.x, 0, b.z); b.mesh.rotation.set(0, 0, 0); b.mesh.visible = true;
      b.sparks.visible = b.age < 1.15 && !finale;
      if (b.sparks.visible) {
        for (let i = 0; i < 18; i++) {
          const angle = i * 2.399, life = clamp(b.age / 1.15), r = .6 + life * 2.4;
          setInstance(b.sparks, i, Math.sin(angle) * r, .25 + Math.sin(life * Math.PI) * (1 + i % 4) + life, Math.cos(angle) * r, .04 * (1 - life), .09 * (1 - life), .04 * (1 - life));
        }
        b.sparks.instanceMatrix.needsUpdate = true;
      }
      let onset = .25 + b.order * .43;
      if (ending === 'firestorm') onset = .27 + b.order * .34 + (b.x > 0 ? .045 : 0);
      if (ending === 'ambush') onset = .29 + b.order * .35 + Math.abs(b.x) * .004;
      if (ending === 'earthquake') onset = .24 + Math.abs(b.x) * .006 + b.order * .2;
      const collapse = finale ? smooth((progress - onset) / (ending === 'earthquake' ? .37 : .26)) : 0;
      if (collapse > 0) {
        const side = b.x < 0 ? -1 : 1;
        if (ending === 'earthquake') {
          b.mesh.position.x += Math.sin(progress * 160 + b.x) * .22 * (1 - collapse);
          b.mesh.position.z += Math.cos(progress * 145 + b.z) * .17 * (1 - collapse);
          b.mesh.position.y = -collapse * 6;
          b.mesh.rotation.z = side * collapse * .36 + Math.sin(progress * 130) * .055 * (1 - collapse);
          b.mesh.rotation.x = Math.sin(b.x) * collapse * .4;
        } else {
          b.mesh.position.y = -Math.pow(collapse, 1.4) * 5.8;
          b.mesh.position.x += side * collapse * (ending === 'stampede' ? 1.2 : .45);
          b.mesh.rotation.z = -side * collapse * (ending === 'stampede' ? 1.05 : .52);
          b.mesh.rotation.x = collapse * (ending === 'ambush' ? .6 : .27);
          if (ending === 'firestorm') b.mesh.scale.y *= 1 - collapse * .6;
        }
        b.mesh.visible = collapse < .96;
      }
      b.rubble.visible = collapse > 0;
      if (collapse > 0) b.rubble.children.forEach((object, i) => {
        const data = object.userData, blast = smooth(collapse * 1.8);
        object.position.set(Math.sin(data.angle) * data.distance * blast, .12 + Math.sin(collapse * Math.PI) * data.height, Math.cos(data.angle) * data.distance * blast);
        object.rotation.set(blast * (i % 3) * 1.7, data.angle + blast * 2, blast * .9);
        object.scale.set(data.sizeX, data.sizeY, data.sizeZ);
      });
    }
    if (!finale) return;

    // Flames arc out of the opened belly before each district burns and falls.
    volleys.visible = ending === 'firestorm'; fires.visible = ending === 'firestorm'; smoke.visible = ending === 'firestorm';
    if (ending === 'firestorm') {
      for (let i = 0; i < 84; i++) {
        const plot = PLOTS[i % PLOTS.length], launch = .2 + Math.floor(i / 12) * .087 + (i % 12) * .002;
        const life = (progress - launch) / .2, alive = life > 0 && life < 1;
        const t = clamp(life), sourceZ = -18 + smooth((launch - .17) / .71) * 13.5;
        setInstance(volleys, i, -1.7 * (1 - t) + plot.x * t, 5.4 * (1 - t) + .8 * t + Math.sin(t * Math.PI) * (6 + i % 3), sourceZ * (1 - t) + plot.z * t, alive ? .12 + .05 * Math.sin(t * Math.PI) : 0);
      }
      for (let i = 0; i < 60; i++) {
        const plot = PLOTS[i % 12], delay = .25 + (plot.z + 6) / 14 * .34;
        const strength = clamp((progress - delay) / .08) * (1 - smooth((progress - .83) / .17) * .72);
        const angle = i * 2.4, radius = .4 + Math.floor(i / 12) * .28;
        const flicker = .8 + Math.sin(time * 13 + i * 2) * .25;
        setInstance(fires, i, plot.x + Math.sin(angle) * radius, .7 + strength * flicker * 1.1, plot.z + Math.cos(angle) * radius, strength * .4, strength * flicker * (2.2 + i % 3 * .6), strength * .4);
      }
      for (let i = 0; i < 36; i++) {
        const plot = PLOTS[i % 12], burn = clamp((progress - .3 - (plot.z + 6) / 14 * .3) / .15), rise = (progress * 3 + i * .21) % 1;
        setInstance(smoke, i, plot.x + Math.sin(i * 2.4) * (.3 + rise), .5 + rise * 7 * burn, plot.z + rise * 1.9, burn * (.25 + rise * .9), burn * (.4 + rise), burn * (.3 + rise * .9));
      }
      volleys.instanceMatrix.needsUpdate = fires.instanceMatrix.needsUpdate = smoke.instanceMatrix.needsUpdate = true;
    }
    // In the ambush, the horse disgorges an impossibly large, visible bronze army.
    army.visible = ending === 'ambush';
    if (ending === 'ambush') for (let i = 0; i < soldiers.length; i++) {
      const soldier = soldiers[i], target = PLOTS[i % 12];
      const travelTime = clamp((progress - .2 - i * .008) / .51);
      const emerge = smooth(travelTime * 4); const lane = (i % 3 - 1) * .55;
      soldier.visible = progress > .2 + i * .008;
      soldier.position.set(-2.3 * (1 - travelTime) + (target.x + lane) * travelTime, Math.abs(Math.sin(time * 13 + i)) * .055, -14 * (1 - travelTime) + (target.z + lane) * travelTime);
      soldier.rotation.y = Math.atan2(target.x + 2.3, target.z + 14) + (travelTime === 1 ? Math.sin(time * 4 + i) * .2 : 0);
      soldier.scale.setScalar(emerge * .91); soldier.rotation.z = Math.sin(time * 13 + i) * .065 * (1 - travelTime * .6);
    }
    // A hoof strike propagates through expanding rings and opening fault lines.
    cracks.visible = ending === 'earthquake';
    for (const slab of looseSlabs) {
      slab.visible = ending === 'earthquake';
      if (ending === 'earthquake') {
        const breakTime = smooth((progress - .25 - (slab.userData.baseZ + 12) * .007) / .48);
        slab.position.x = slab.userData.baseX + Math.sign(slab.userData.baseX) * breakTime * .28;
        slab.position.y = .06 - breakTime * .07 + Math.sin(progress * 80 + slab.userData.baseZ) * .15 * Math.sin(breakTime * Math.PI);
        slab.rotation.z = Math.sign(slab.userData.baseX) * breakTime * .14;
        slab.rotation.x = Math.sin(slab.userData.baseZ) * breakTime * .12;
      }
    }
    if (ending === 'earthquake') for (const crack of crackMeshes) {
      const open = smooth((progress - .19 - crack.userData.section * .032) / .3);
      crack.scale.x = crack.userData.width * open * (1.3 + Math.sin(progress * 50) * .14); crack.visible = open > 0;
    }
    for (let i = 0; i < impactRings.length; i++) {
      const ring = impactRings[i]; ring.visible = ending === 'earthquake' || ending === 'stampede';
      const strike = (progress * (ending === 'earthquake' ? 4.5 : 6) + i / 3) % 1;
      ring.scale.setScalar(1 + strike * (ending === 'earthquake' ? 32 : 15));
      ring.position.z = ending === 'earthquake' ? -7 : horse.position.z + 2;
      ring.visible = ring.visible && progress > .2 && progress < .98;
    }
    for (let i = 0; i < 36; i++) {
      const plot = PLOTS[i % 12], onset = .25 + (plot.z + 6) / 14 * (ending === 'earthquake' ? .2 : .43);
      const age = clamp((progress - onset) / .38), bloom = Math.sin(age * Math.PI);
      setInstance(dust, i, plot.x + Math.sin(i * 2.4) * age * 2, .15 + age * 2.6, plot.z + Math.cos(i * 2.4) * age * 2, bloom * (1 + i % 3 * .25), bloom * .8, bloom * 1.1);
    }
    dust.instanceMatrix.needsUpdate = true;
    // Even an unbuilt district is swallowed by the finale, leaving an unambiguous ruin.
    plots.forEach(g => { if (g.visible) g.position.y = -smooth((progress - .5) / .4) * .3; });
  };

  return {
    root, colliders, sync, update, reset,
    dispose: () => { sharedGeometries.forEach(geometry => geometry.dispose()); materials.forEach(mat => mat.dispose()); },
    groundHeight: () => 0,
    setNodeAvailable: (id: string, available: boolean) => {
      const supply = supplies.get(id); if (!supply) return;
      supply.available = available; supply.object.visible = supply.halo.visible = supply.token.visible = available;
    },
  };
}
