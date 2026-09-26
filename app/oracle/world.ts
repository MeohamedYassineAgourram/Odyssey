import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Resource } from './types';

export type Collider = { x: number; z: number; w: number; d: number };
export type Supply = { id: string; resource: Resource; mesh: THREE.Group; x: number; z: number; taken: boolean; halo: THREE.Mesh };
export type OracleWorld = { root: THREE.Group; colliders: Collider[]; supplies: Supply[]; sanctuary: THREE.Vector3; fire: THREE.Group; beacon: THREE.Group; update: (time: number, dt: number, marked: boolean) => void; setDay: (day: number, won?: boolean) => void; groundHeight: (x: number, z: number) => number };

const colors = { stone: '#e9d8ad', light: '#fff0d0', deep: '#bb9569', tile: '#b85335', blue: '#367a84', olive: '#738450', leaf: '#637147' };
let seed = 28391;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

export function createWorld(): OracleWorld {
  const materialCache = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: string | number, roughness = .85) => { const key = `${color}:${roughness}`; let result = materialCache.get(key); if (!result) { result = new THREE.MeshStandardMaterial({ color, roughness }); materialCache.set(key, result); } return result; };
  const root = new THREE.Group(); root.name = 'The island of Asteria';
  const colliders: Collider[] = [], supplies: Supply[] = [];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1), cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 12), ballGeo = new THREE.IcosahedronGeometry(1, 1);
  const stone = material(colors.stone), lightStone = material(colors.light), shadowStone = material(colors.deep), terracotta = material(colors.tile), wood = material('#775338'), olive = material(colors.olive), darkGreen = material('#344d36'), bronze = material('#a27643', .47);
  const make = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const box = (parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => make(boxGeo, mat, parent, x, y, z, sx, sy, sz);
  const cyl = (parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, r: number, h: number) => make(cylinderGeo, mat, parent, x, y, z, r, h, r);

  // Each surface is painted locally so the island remains fully playable without downloads.
  const plasterCanvas = document.createElement('canvas'); plasterCanvas.width = plasterCanvas.height = 256;
  const pc = plasterCanvas.getContext('2d')!; pc.fillStyle = '#eee2c7'; pc.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3600; i++) { pc.fillStyle = `rgba(128,102,72,${rand() * .10})`; const s = 1 + rand() * 5; pc.fillRect(rand() * 256, rand() * 256, s, s); }
  const plasterTexture = new THREE.CanvasTexture(plasterCanvas); plasterTexture.wrapS = plasterTexture.wrapT = THREE.RepeatWrapping; plasterTexture.repeat.set(2, 2); plasterTexture.colorSpace = THREE.SRGBColorSpace;
  const plaster = new THREE.MeshStandardMaterial({ color: '#f3e4c8', map: plasterTexture, roughness: .98 });
  const pavingCanvas = document.createElement('canvas'); pavingCanvas.width = pavingCanvas.height = 512; const p = pavingCanvas.getContext('2d')!;
  p.fillStyle = '#a98d68'; p.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row++) for (let col = -1; col < 8; col++) { const x = col * 80 + (row % 2) * 40, y = row * 66; p.fillStyle = `hsl(39, ${22 + rand() * 12}%, ${65 + rand() * 11}%)`; p.fillRect(x + 2, y + 2, 76, 62); p.strokeStyle = '#d4bd94'; p.lineWidth = 1; p.strokeRect(x + 4, y + 4, 72, 58); }
  const pavingTexture = new THREE.CanvasTexture(pavingCanvas); pavingTexture.wrapS = pavingTexture.wrapT = THREE.RepeatWrapping; pavingTexture.repeat.set(8, 7); pavingTexture.colorSpace = THREE.SRGBColorSpace; pavingTexture.anisotropy = 8;
  const groundMat = new THREE.MeshStandardMaterial({ color: '#fff1cd', map: pavingTexture, roughness: .98 }); groundMat.name = 'Asteria paving';
  box(root, groundMat, 0, -.23, 0, 52, .4, 44);

  // Broken limestone escarpment and terraces above the Aegean.
  box(root, shadowStone, 0, -2.8, 0, 51.5, 5.2, 43.5);
  for (let i = 0; i < 76; i++) {
    const edge = i % 4, v = rand(); let x = 0, z = 0;
    if (edge < 2) { x = (edge ? -1 : 1) * (25.8 + rand()); z = v * 46 - 23; } else { x = v * 52 - 26; z = (edge === 2 ? -1 : 1) * (21.8 + rand()); }
    const rock = make(ballGeo, i % 3 ? shadowStone : stone, root, x, -2.5 - rand(), z, 1.8 + rand() * 2.8, 2.4 + rand() * 3, 1.8 + rand() * 2); rock.rotation.set(rand() * .4, rand() * 3, rand() * .5);
  }
  // Main avenue, inlaid edges and circular agora mosaic.
  const roadMat = material('#eadcbd'); box(root, roadMat, 0, -.009, 3, 7.7, .06, 34); box(root, roadMat, 0, .01, 1.4, 43, .04, 5.5);
  for (const x of [-3.65, 3.65]) box(root, bronze, x, .03, 3, .1, .025, 33);
  const mosaic = new THREE.Mesh(new THREE.CircleGeometry(5.1, 64), material('#d3bfa0')); mosaic.rotation.x = -Math.PI / 2; mosaic.position.set(0, .045, 1.5); root.add(mosaic);
  for (const r of [3.8, 4.7, 5]) { const ring = new THREE.Mesh(new THREE.RingGeometry(r - .07, r, 64), material(r === 3.8 ? '#538681' : '#b58347')); ring.rotation.x = -Math.PI / 2; ring.position.set(0, .055, 1.5); root.add(ring); }
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; const tile = box(root, bronze, Math.sin(a) * 4.25, .06, 1.5 + Math.cos(a) * 4.25, .3, .025, .3); tile.rotation.y = a + Math.PI / 4; }

  const column = (parent: THREE.Object3D, x: number, z: number, h = 5, y = 0) => {
    cyl(parent, lightStone, x, y + .2, z, .66, .4); cyl(parent, stone, x, y + .47, z, .51, .2);
    const shaft = make(new THREE.CylinderGeometry(.36, .45, h, 16), lightStone, parent, x, y + .6 + h / 2, z); shaft.name = 'Fluted marble column';
    for (let j = 0; j < 12; j++) { const a = j / 12 * Math.PI * 2; cyl(parent, stone, x + Math.sin(a) * .375, y + .65 + h / 2, z + Math.cos(a) * .375, .045, h - .1); }
    cyl(parent, stone, x, y + h + .67, z, .52, .22); box(parent, lightStone, x, y + h + .85, z, 1.23, .25, 1.23);
  };
  const pediment = (parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, depth: number) => {
    const shape = new THREE.Shape(); shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, h); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }); const m = make(geo, stone, parent, x, y, z); m.castShadow = true;
    return m;
  };
  // The sanctuary: open front, six Doric columns, engraved frieze, tiled pediment.
  const temple = new THREE.Group(); temple.position.set(0, 0, -13.3); root.add(temple);
  for (let i = 0; i < 3; i++) box(temple, i % 2 ? stone : lightStone, 0, i * .17 + .08, 0, 13.2 - i * .8, .17, 10.2 - i * .8);
  box(temple, plaster, 0, 2.9, -2.9, 8.7, 4.8, 1); colliders.push({ x: 0, z: -16.2, w: 8.9, d: 1.1 });
  box(temple, material('#716f55'), 0, 2.5, -2.34, 2.2, 3.9, .15);
  for (const x of [-4.9, -2.95, -.98, .98, 2.95, 4.9]) { column(temple, x, 2.9, 4.6, .5); colliders.push({ x, z: -10.4, w: .84, d: .84 }); }
  for (const x of [-4.9, 4.9]) for (const z of [-2.9, 0]) { column(temple, x, z, 4.6, .5); colliders.push({ x, z: z - 13.3, w: .84, d: .84 }); }
  box(temple, stone, 0, 6.2, 0, 11.9, .55, 8.3); box(temple, lightStone, 0, 6.56, 0, 12.25, .18, 8.65);
  for (let i = -11; i <= 11; i++) { box(temple, shadowStone, i * .5, 6.24, 4.17, .12, .3, .07); }
  pediment(temple, 0, 6.65, -4.5, 12.8, 2.3, 9);
  for (const side of [-1, 1]) { const roof = box(temple, terracotta, side * 3.15, 7.84, 0, 6.85, .2, 9.45); roof.rotation.z = -side * Math.atan2(2.3, 6.4); }
  // A relief sun high over the door, and long indigo votive banners.
  const sunRelief = new THREE.Mesh(new THREE.TorusGeometry(.53, .095, 8, 24), bronze); sunRelief.position.set(0, 7.23, 4.57); temple.add(sunRelief);
  const bannerMaterial = new THREE.MeshStandardMaterial({ color: '#3f6975', roughness: .9, side: THREE.DoubleSide });
  const banners: THREE.Mesh[] = [];
  for (const x of [-4, 4]) { const banner = new THREE.Mesh(new THREE.PlaneGeometry(.9, 3.2, 4, 12), bannerMaterial); banner.position.set(x, 4.15, 3.7); temple.add(banner); banners.push(banner); box(temple, bronze, x, 5.83, 3.7, 1.3, .08, .09); }
  for (const x of [-7.4, 7.4]) { box(root, lightStone, x, .42, -8.7, 1.6, .85, 1.6); const urn = make(new THREE.CylinderGeometry(.52, .3, .8, 12), bronze, root, x, 1.2, -8.7); urn.name = 'Bronze sanctuary brazier'; }

  const shutters = material('#417685');
  const house = (x: number, z: number, w: number, d: number, h: number, variant: number) => {
    const group = new THREE.Group(); group.position.set(x, 0, z); root.add(group);
    box(group, shadowStone, 0, .16, 0, w + .25, .32, d + .25); box(group, plaster, 0, h / 2 + .26, 0, w, h, d);
    box(group, stone, 0, .67, d / 2 + .01, w, .25, .04);
    const doorway = material('#5b5143'); box(group, doorway, 0, 1.2, d / 2 + .035, 1.3, 2, .12); box(group, wood, 0, 1.12, d / 2 + .11, 1.06, 1.8, .08);
    for (const xx of [-.61, .61]) box(group, lightStone, xx, 1.2, d / 2 + .14, .15, 2.1, .2); box(group, lightStone, 0, 2.27, d / 2 + .1, 1.5, .18, .22);
    for (const xx of [-w * .32, w * .32]) { box(group, shadowStone, xx, h * .67, d / 2 + .025, 1.08, 1.2, .08); box(group, shutters, xx, h * .67, d / 2 + .08, 1, 1.13, .07); for (let j = 0; j < 5; j++) box(group, material('#355b64'), xx, h * .67 - .42 + j * .21, d / 2 + .13, .87, .035, .05); box(group, lightStone, xx, h * .67 - .67, d / 2 + .15, 1.25, .15, .25); }
    if (variant % 2) {
      box(group, terracotta, 0, h + .37, 0, w + .5, .22, d + .5);
      for (const xx of [-w / 2, w / 2]) box(group, plaster, xx, h + .62, 0, .2, .5, d + .35);
      box(group, plaster, 0, h + .62, -d / 2, w, .5, .2);
      for (let j = 0; j < 3; j++) amphora(group, w * .2 + j * .65, h + .48, 0, .6, j);
    } else {
      const rise = w * .25; pediment(group, 0, h + .25, -d / 2, w + .7, rise, d);
      for (const side of [-1, 1]) { const roof = box(group, terracotta, side * w * .26, h + rise / 2 + .45, 0, w * .58, .16, d + .65); roof.rotation.z = -side * Math.atan2(rise, w / 2); }
      for (let i = 0; i < 9; i++) { const rr = box(group, material('#cf7650'), 0, h + rise + .48, (i / 8 - .5) * (d + .2), .22, .13, .46); rr.rotation.z = 0; }
    }
    const awning = new THREE.Mesh(new THREE.PlaneGeometry(w * .6, 1.6, 8, 3), new THREE.MeshStandardMaterial({ color: variant % 2 ? '#dbb461' : '#e9d4aa', side: THREE.DoubleSide, roughness: 1 })); awning.position.set(0, 2.7, d / 2 + .8); awning.rotation.x = -1.38; group.add(awning);
    for (const xx of [-w * .3, w * .3]) cyl(group, wood, xx, 1.3, d / 2 + 1.48, .045, 2.6);
    colliders.push({ x, z, w: w + .25, d: d + .25 }); return group;
  };
  function amphora(parent: THREE.Object3D, x: number, y: number, z: number, scale = 1, variant = 0) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(scale); parent.add(g); const mat = variant % 3 === 0 ? terracotta : variant % 3 === 1 ? material('#c29566') : material('#7b7770');
    const points = [new THREE.Vector2(.18, 0), new THREE.Vector2(.25, .08), new THREE.Vector2(.42, .4), new THREE.Vector2(.4, .7), new THREE.Vector2(.23, .93), new THREE.Vector2(.17, 1.03), new THREE.Vector2(.2, 1.13)];
    make(new THREE.LatheGeometry(points, 14), mat, g, 0, 0, 0);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(.195, .035, 5, 14), mat); lip.rotation.x = Math.PI / 2; lip.position.y = 1.11; g.add(lip);
    for (const side of [-1, 1]) { const handle = new THREE.Mesh(new THREE.TorusGeometry(.18, .038, 5, 12, Math.PI * 1.6), mat); handle.position.set(side * .27, .8, 0); handle.scale.set(.7, 1, 1); handle.rotation.z = side * .5; g.add(handle); }
    const band = make(new THREE.CylinderGeometry(.409, .417, .12, 14, 1, true), bronze, g, 0, .54, 0); band.castShadow = false; return g;
  }
  house(-17, -12, 6.8, 5.6, 5.4, 1); house(-17, -3, 5.8, 5, 3.8, 0); house(-17.5, 8.6, 6.8, 6.1, 4.4, 3);
  house(16, -11.2, 6.4, 5.7, 4.8, 0); house(17.6, -2.4, 6.4, 5, 4.2, 1); house(17.2, 9.7, 7, 6, 5.7, 0);
  // Colonnaded shaded market down the western edge of the agora.
  for (let i = 0; i < 5; i++) column(root, -10.8, -5 + i * 2.4, 2.7);
  box(root, stone, -12, 3.83, -.2, 3.9, .38, 12.2); box(root, terracotta, -12, 4.07, -.2, 4.25, .16, 12.6);
  for (let i = 0; i < 5; i++) colliders.push({ x: -10.8, z: -5 + i * 2.4, w: .8, d: .8 });
  // A roofless circular fountain leaves the centre of the route open.
  cyl(root, stone, 8.6, .25, 1.5, 2.1, .5); cyl(root, lightStone, 8.6, .61, 1.5, 1.86, .22);
  const basin = new THREE.Mesh(new THREE.TorusGeometry(1.75, .2, 8, 36), lightStone); basin.rotation.x = Math.PI / 2; basin.position.set(8.6, .83, 1.5); root.add(basin);
  cyl(root, material('#4bafb7', .22), 8.6, .76, 1.5, 1.62, .025); cyl(root, shadowStone, 8.6, 1.17, 1.5, .32, 1); cyl(root, lightStone, 8.6, 1.7, 1.5, .72, .18); colliders.push({ x: 8.6, z: 1.5, w: 3.7, d: 3.7 });

  const oliveTree = (x: number, z: number, s = 1) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); root.add(g);
    const trunk = make(new THREE.CylinderGeometry(.15, .32, 2.8, 8), wood, g, 0, 1.4, 0); trunk.rotation.z = -.08;
    for (let j = 0; j < 5; j++) { const a = j * 2.4; const limb = make(new THREE.CylinderGeometry(.06, .13, 1.8, 6), wood, g, Math.sin(a) * .45, 2.2, Math.cos(a) * .45); limb.rotation.z = Math.sin(a) * .65; limb.rotation.x = Math.cos(a) * .65; const crown = make(ballGeo, j % 2 ? olive : material('#85905b'), g, Math.sin(a) * 1.05, 3 + rand() * .5, Math.cos(a) * .85, 1.25 + rand() * .3, .8 + rand() * .35, 1.05); crown.rotation.y = a; }
    for (let j = 0; j < 11; j++) { const a = j * 2.4; make(ballGeo, j % 2 ? olive : material('#95a06b'), g, Math.sin(a) * (1 + rand() * .6), 2.9 + rand() * .8, Math.cos(a) * (1 + rand() * .5), .7, .6, .65); }
    colliders.push({ x, z, w: .65 * s, d: .65 * s });
    const border = new THREE.Mesh(new THREE.TorusGeometry(1.28 * s, .12, 5, 16), lightStone); border.rotation.x = Math.PI / 2; border.position.set(x, .1, z); root.add(border);
  };
  for (const [x, z, s] of [[-7, 8, 1.1], [8, 9.1, 1.2], [-7.6, -3.8, .9], [9.1, -5.3, 1], [-21, 17, 1.15], [21, 16, .95], [-21, -19, 1.2]]) oliveTree(x, z, s);
  for (const [x, z] of [[-8.2, -16], [8, -16.9], [-11, -18], [12, -17.5], [-23, 2], [23, -7], [-12, 14], [12.5, 16.5]]) {
    cyl(root, wood, x, 1.1, z, .14, 2.2); for (let j = 0; j < 3; j++) make(new THREE.ConeGeometry(1 - j * .14, 3.7 - j * .4, 9), j % 2 ? darkGreen : material('#52684a'), root, x, 2.5 + j * .9, z); colliders.push({ x, z, w: .6, d: .6 });
  }
  // Planters, flowers, and pottery make every corner feel lived in.
  const flowerMat = material('#b9758d');
  for (let i = 0; i < 55; i++) { const x = (rand() > .5 ? 1 : -1) * (20 + rand() * 4), z = rand() * 38 - 19; make(ballGeo, olive, root, x, .19, z, .35, .32, .35); if (i % 2 === 0) for (let j = 0; j < 3; j++) make(ballGeo, flowerMat, root, x + (rand() - .5) * .4, .4 + rand() * .2, z + (rand() - .5) * .4, .085, .08, .085); }
  for (const [x, z, sc] of [[-14, 12, .9], [-13.1, 12.4, .65], [12.8, 13.3, .85], [13.5, 13.3, 1], [12, -7, .9], [-13.4, -8.3, .85], [20.8, 3.8, .7], [-20.5, -7, .85]]) amphora(root, x, .05, z, sc, Math.floor(rand() * 3));

  // Low parapets frame the view, with gaps at the ancient harbour stair.
  for (const x of [-19, -10, 0, 9, 23]) { box(root, stone, x, .6, 20.9, x === 23 ? 3 : 7.6, 1.2, .55); box(root, lightStone, x, 1.23, 20.9, x === 23 ? 3.2 : 7.8, .12, .75); }
  for (const x of [-24.3, 24.3]) for (let i = 0; i < 7; i++) { box(root, stone, x, .45, -17 + i * 5.4, .5, .9, 4.2); }
  for (let i = 0; i < 12; i++) box(root, stone, 16.7, -.15 - i * .37, 22 + i * .55, 4, .28, 1);
  box(root, wood, 16.7, -4.7, 32, 4.6, .3, 10);
  for (let j = 0; j < 18; j++) box(root, material('#a08258'), 16.7, -4.53, 27.1 + j * .53, 4.5, .08, .05);
  for (const x of [14.2, 19.2]) for (const z of [28, 32, 36]) cyl(root, wood, x, -4.5, z, .11, 2.4);
  const boat = new THREE.Group(); boat.position.set(23, -5.12, 32); boat.rotation.y = .3; root.add(boat);
  const hull = make(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), wood, boat, 0, .35, 0, 1.3, .9, 3.5); hull.rotation.z = Math.PI;
  box(boat, material('#bb9865'), 0, .25, 0, 1.6, .12, 4.5); cyl(boat, wood, 0, 2.2, 0, .07, 4.7);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3), new THREE.MeshStandardMaterial({ color: '#eee0b8', side: THREE.DoubleSide, roughness: 1 })); sail.position.set(1.1, 2.7, .03); boat.add(sail);

  // Supply meshes have their own silhouettes; animated halos communicate interaction.
  const resourceColors: Record<Resource, string> = { food: '#e5b764', water: '#76d8dd', herbs: '#b4d88b', wood: '#edc799' };
  const supply = (id: string, resource: Resource, x: number, z: number) => {
    const g = new THREE.Group(); g.position.set(x, .07, z); root.add(g);
    if (resource === 'water') { amphora(g, -.25, 0, 0, .86, 2); amphora(g, .35, 0, -.12, .67, 2); const waterBand = make(new THREE.CylinderGeometry(.34, .36, .16, 14), material('#77c0c2'), g, -.25, .45, 0); waterBand.castShadow = false; }
    if (resource === 'food') { box(g, wood, 0, .34, 0, 1.04, .67, .84); for (let j = 0; j < 4; j++) box(g, material('#b58b50'), 0, .1 + j * .17, .44, 1.13, .08, .06); for (let j = 0; j < 8; j++) make(ballGeo, j % 2 ? material('#b08a4a') : material('#d2a663'), g, (rand() - .5) * .75, .75 + rand() * .08, (rand() - .5) * .55, .19, .12, .13); }
    if (resource === 'herbs') { const basket = make(new THREE.CylinderGeometry(.5, .34, .47, 12), material('#bba074'), g, 0, .26, 0); basket.name = 'Wild thyme and medicinal herbs'; for (let j = 0; j < 9; j++) make(ballGeo, j % 3 ? olive : flowerMat, g, (rand() - .5) * .6, .62 + rand() * .2, (rand() - .5) * .55, .15, .28, .15); }
    if (resource === 'wood') { for (let j = 0; j < 5; j++) { const log = cyl(g, j % 2 ? wood : material('#ac8960'), (j % 3 - 1) * .28, .18 + Math.floor(j / 3) * .3, 0, .17, 1.24); log.rotation.x = Math.PI / 2; } const tie = new THREE.Mesh(new THREE.TorusGeometry(.46, .028, 5, 12), bronze); tie.position.set(0, .32, 0); g.add(tie); }
    const halo = new THREE.Mesh(new THREE.RingGeometry(.75, .81, 40), new THREE.MeshBasicMaterial({ color: resourceColors[resource], transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = .04; g.add(halo);
    supplies.push({ id, resource, mesh: g, x, z, taken: false, halo });
  };
  supply('water-south', 'water', 4.9, 12); supply('food-market', 'food', -7.5, 3); supply('herbs-olive', 'herbs', -6.8, 10.4); supply('wood-harbour', 'wood', 12.1, 14.4);
  supply('water-fountain', 'water', 6.2, 2.8); supply('food-north', 'food', -9.4, -8.4); supply('herbs-healer', 'herbs', 11.3, -5.7); supply('wood-stoa', 'wood', -12.1, 6.6);
  supply('food-harbour', 'food', 11.9, 8.8); supply('water-temple', 'water', 7.7, -10); supply('herbs-sanctuary', 'herbs', -7.8, -11.8); supply('wood-east', 'wood', 11.5, -11.2);
  const sanctuary = new THREE.Vector3(0, .1, -7.1);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.55, 2.64, 80), new THREE.MeshBasicMaterial({ color: '#efd899', transparent: true, opacity: .9, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.copy(sanctuary); root.add(ring);
  const innerRing = new THREE.Mesh(new THREE.RingGeometry(2.33, 2.37, 80), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .35, depthWrite: false })); innerRing.rotation.x = -Math.PI / 2; innerRing.position.copy(sanctuary); root.add(innerRing);

  const fire = new THREE.Group(); fire.position.set(0, .16, -8.2); root.add(fire); fire.visible = false;
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; make(ballGeo, shadowStone, fire, Math.sin(a) * .75, .1, Math.cos(a) * .75, .25, .2, .25); }
  for (let i = 0; i < 3; i++) { const log = cyl(fire, wood, 0, .22, 0, .15, 1.3); log.rotation.set(Math.PI / 2, 0, i * 2); }
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb751', transparent: true, opacity: .8, depthWrite: false });
  for (let i = 0; i < 4; i++) { const flame = make(new THREE.ConeGeometry(.33, 1.2, 6), flameMat, fire, (rand() - .5) * .5, .8, (rand() - .5) * .5); flame.castShadow = false; }
  const fireLight = new THREE.PointLight('#ffae60', 7, 17, 1.4); fireLight.position.set(0, 1.5, 0); fire.add(fireLight);
  const beacon = new THREE.Group(); beacon.position.set(0, 8.9, -13.3); root.add(beacon); beacon.visible = false;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.15, .7, 45, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe4a1', transparent: true, opacity: .28, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); beam.position.y = 22; beacon.add(beam); const beaconLight = new THREE.PointLight('#ffe2a0', 12, 30); beacon.add(beaconLight);

  // Batch the static architecture by material; animated objects keep their own rigs.
  const excluded = new Set<THREE.Object3D>([boat, fire, beacon, ...banners, ...supplies.map(s => s.mesh), ring, innerRing]);
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    let parent: THREE.Object3D | null = object;
    while (parent) { if (excluded.has(parent)) return; parent = parent.parent; }
    const batch = batches.get(object.material) ?? []; batch.push(object); batches.set(object.material, batch);
  });
  const sourceGeometries = new Set<THREE.BufferGeometry>();
  for (const [mat, meshes] of batches) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map(mesh => { const geometry = mesh.geometry.clone(); geometry.applyMatrix4(mesh.matrixWorld); sourceGeometries.add(mesh.geometry); return geometry.index ? geometry.toNonIndexed() : geometry; });
    const merged = mergeGeometries(geometries, false);
    if (merged) { const batch = new THREE.Mesh(merged, mat); batch.name = 'Batched island architecture'; batch.castShadow = true; batch.receiveShadow = true; root.add(batch); meshes.forEach(mesh => mesh.removeFromParent()); }
    geometries.forEach(geometry => geometry.dispose());
  }
  const retainedGeometries = new Set<THREE.BufferGeometry>(); root.traverse(object => { if (object instanceof THREE.Mesh) retainedGeometries.add(object.geometry); });
  sourceGeometries.forEach(geometry => { if (!retainedGeometries.has(geometry)) geometry.dispose(); });

  let day = 0;
  return { root, colliders, supplies, sanctuary, fire, beacon,
    groundHeight: (x, z) => Math.abs(x) < 6.1 && z < -8.7 && z > -18 ? .51 : 0,
    setDay: (value, won) => { day = value; fire.visible = value > 0; beacon.visible = !!won; ring.visible = value === 0; innerRing.visible = value === 0; },
    update: (time, _dt, marked) => {
      ring.material.opacity = .64 + Math.sin(time * 2) * .22;
      for (const s of supplies) if (!s.taken) { (s.halo.material as THREE.MeshBasicMaterial).opacity = marked ? .7 + Math.sin(time * 4) * .3 : .25 + Math.sin(time * 2 + s.x) * .14; s.halo.scale.setScalar(marked ? 1.65 + Math.sin(time * 3) * .12 : 1); }
      for (let n = 0; n < banners.length; n++) { const pos = banners[n].geometry.attributes.position; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setZ(i, Math.sin(time * 2 + y * 2 + n) * .13 * ((1.6 - y) / 3.2)); } pos.needsUpdate = true; }
      if (day) { fireLight.intensity = 7 + Math.sin(time * 10) * 1.2; for (let i = 11; i < 15; i++) { const flame = fire.children[i]; if (flame) flame.scale.y = .8 + Math.sin(time * 8 + i) * .25; } }
      boat.rotation.z = Math.sin(time * .7) * .035; boat.position.y = -5.12 + Math.sin(time * .9) * .06;
    }
  };
}
