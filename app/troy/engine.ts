import * as THREE from 'three';
import { createCharacter } from '../oracle/characters';
import { BLUEPRINTS, FINALE_DURATION, RUN_DURATION } from './config';
import { advanceRun, buildAt, buildingCostReason, canBuild, collectWeapon, createRun, discoverLandmark, equipWeapon, gather, getMissions, recordKill, takeDamage } from './rules';
import { createCityMap } from './maps';
import { createWeaponLoot, createWeaponModel } from './arsenal';
import type { BuildingKind, CityMap, CompanionOrder, CompanionStatus, ControllerInput, EndingKind, Interaction, RunState, TroyCallbacks, TroyEngine, WeaponKind } from './types';
import { createTroyWorld } from './world';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const DODGE_COOLDOWN = 1.8, HERO_RADIUS = .38;
const WEAPON_STATS = { sword: { cooldown: .38, name: 'Bronze sword' }, bow: { cooldown: .64, name: 'Trojan bow' }, hammer: { cooldown: 1.05, name: 'War hammer' } };
const RESOURCE_NAMES = { wood: 'timber', stone: 'stone', bronze: 'bronze' };
type Collider = { x: number; z: number; w: number; d: number };
type EnemyKind = 'skirmisher' | 'brute' | 'archer';
const ENEMY_WEAPONS: Record<EnemyKind, WeaponKind> = { skirmisher: 'sword', archer: 'bow', brute: 'hammer' };
const ENEMY_STATS = {
  skirmisher: { hp: 2, speed: 5.6, damage: 13, windup: .58, cooldown: 1.15, range: 2.1, color: '#ee725b' },
  brute: { hp: 4, speed: 3.75, damage: 24, windup: .95, cooldown: 1.85, range: 2.8, color: '#c586e8' },
  archer: { hp: 2, speed: 4.6, damage: 11, windup: 1.1, cooldown: 2.5, range: 16, color: '#f3c85c' },
};
/** Difficulty plateaus so a long career remains playable. */
export function getRaidDifficulty(stage: number) {
  const level = clamp(Number.isFinite(stage) ? Math.floor(stage) : 1, 1, 12);
  return { firstRaid: Math.max(11, 18 - (level - 1) * .65), interval: Math.max(10, 20 - (level - 1) * 1.15), aliveCap: Math.min(18, 14 + Math.floor((level - 1) / 2)), hpBonus: Math.min(2, Math.floor((level - 1) / 4)), damageScale: 1 + (level - 1) * .055, speedScale: 1 + (level - 1) * .018, extraRaiders: Math.min(4, Math.floor((level - 1) / 3)) };
}
/** Swept projectile collision prevents arrows tunnelling past the hero between frames. */
export function distanceToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz;
  const t = length > 0 ? clamp(((x - ax) * dx + (z - az) * dz) / length, 0, 1) : 0;
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

/** Shared by walking, dashing, construction relocation, and enemy navigation. */
export function canOccupyTroyPosition(x: number, z: number, colliders: Collider[], radius = HERO_RADIUS, bounds: CityMap['bounds'] = { minX: -23, maxX: 23, minZ: -18, maxZ: 19 }) {
  return Number.isFinite(x) && Number.isFinite(z) && x >= bounds.minX + radius && x <= bounds.maxX - radius && z >= bounds.minZ + radius && z <= bounds.maxZ - radius
    && !colliders.some(c => Math.abs(x - c.x) < c.w / 2 + radius && Math.abs(z - c.z) < c.d / 2 + radius);
}

/** Dispose removed objects immediately, not only objects still attached at teardown. */
function disposeObject(root: THREE.Object3D, preserveTexture?: THREE.Texture) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (object instanceof THREE.InstancedMesh) object.dispose();
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) geometries.add(object.geometry);
    if ('material' in object) {
      const material = object.material as THREE.Material | THREE.Material[];
      for (const value of Array.isArray(material) ? material : [material]) {
        materials.add(value);
        for (const property of Object.values(value)) if (property instanceof THREE.Texture) textures.add(property);
      }
    }
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => { if (texture !== preserveTexture) texture.dispose(); });
}

function weaponHand(root: THREE.Group) {
  const rig = root.children[0] as THREE.Group;
  const torso = rig.children.find(child => child instanceof THREE.Group && Math.abs(child.position.y - 1.27) < .01) as THREE.Group;
  const arm = torso?.children.find(child => child instanceof THREE.Group && child.position.x > .28 && child.position.y > .35) as THREE.Group | undefined;
  const elbow = arm?.children.find(child => child instanceof THREE.Group) as THREE.Group | undefined;
  const hand = elbow?.children.find(child => child instanceof THREE.Group) as THREE.Group | undefined;
  return { arm, elbow, hand: hand ?? root };
}

function createRaider(kind: EnemyKind) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.name = `raider-${kind}`; root.userData.enemyKind = kind;
  const stats = ENEMY_STATS[kind]; body.scale.setScalar(kind === 'brute' ? 1.28 : kind === 'archer' ? .96 : 1);
  const bronze = new THREE.MeshStandardMaterial({ color: kind === 'brute' ? '#66556e' : kind === 'archer' ? '#77694a' : '#ad7546', metalness: .68, roughness: .44 });
  const cloth = new THREE.MeshStandardMaterial({ color: kind === 'archer' ? '#567344' : kind === 'brute' ? '#653a71' : '#a34030', roughness: .95 });
  const skin = new THREE.MeshStandardMaterial({ color: '#b68865', roughness: .9 });
  const iron = new THREE.MeshStandardMaterial({ color: '#4c5351', metalness: .6, roughness: .5 });
  const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  part(body, new THREE.CylinderGeometry(.3, .23, .57, 8), bronze, 0, 1.3, 0);
  part(body, new THREE.CylinderGeometry(.24, .36, .38, 8), cloth, 0, .91, 0);
  part(body, new THREE.SphereGeometry(.21, 10, 8), skin, 0, 1.85, 0);
  part(body, new THREE.SphereGeometry(.235, 10, 8, 0, Math.PI * 2, 0, Math.PI * .58), bronze, 0, 1.9, 0);
  part(body, new THREE.BoxGeometry(.055, .29, .065), bronze, 0, 1.82, .205);
  part(body, new THREE.BoxGeometry(.065, .19, .39), cloth, 0, 2.14, -.01);
  const legs = [-1, 1].map(side => {
    const leg = new THREE.Group(); leg.position.set(side * .16, .79, 0); body.add(leg);
    part(leg, new THREE.CylinderGeometry(.075, .09, .61, 7), skin, 0, -.3, 0);
    part(leg, new THREE.BoxGeometry(.16, .3, .13), bronze, 0, -.45, .055);
    part(leg, new THREE.BoxGeometry(.19, .11, .29), iron, 0, -.72, .07);
    return leg;
  });
  const weapon = new THREE.Group(); weapon.position.set(.37, 1.53, 0); body.add(weapon);
  part(weapon, new THREE.CylinderGeometry(.07, .07, .48, 7), skin, 0, -.21, 0);
  if (kind === 'archer') {
    const bow = part(weapon, new THREE.TorusGeometry(.48, .035, 5, 14, Math.PI), bronze, 0, -.15, .32); bow.rotation.set(0, Math.PI / 2, -Math.PI / 2);
    part(weapon, new THREE.BoxGeometry(.025, .94, .025), iron, 0, -.15, .32);
    const quiver = part(body, new THREE.CylinderGeometry(.12, .1, .65, 8), cloth, -.17, 1.45, -.32); quiver.rotation.z = -.3;
    for (let i = 0; i < 3; i++) part(body, new THREE.CylinderGeometry(.018, .018, .45, 4), bronze, -.21 + i * .06, 1.92, -.32);
  } else {
    const blade = part(weapon, new THREE.BoxGeometry(kind === 'brute' ? .12 : .075, .95, .045), bronze, 0, -.26, .5); blade.rotation.x = Math.PI / 2;
    if (kind === 'brute') part(weapon, new THREE.BoxGeometry(.55, .085, .3), iron, 0, -.26, .83);
    const shield = part(body, new THREE.CylinderGeometry(kind === 'brute' ? .49 : .36, kind === 'brute' ? .49 : .36, .07, 14), bronze, -.37, 1.25, .25); shield.rotation.x = Math.PI / 2;
    const boss = part(body, new THREE.SphereGeometry(.12, 8, 6), iron, -.37, 1.25, .3); boss.scale.z = .5;
  }
  const telegraphMaterial = new THREE.MeshBasicMaterial({ color: stats.color, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false });
  const telegraph = new THREE.Mesh(new THREE.RingGeometry(kind === 'archer' ? .75 : .2, kind === 'brute' ? 2.8 : kind === 'archer' ? 1 : 2.1, 40), telegraphMaterial); telegraph.rotation.x = -Math.PI / 2; telegraph.position.y = .06; telegraph.visible = false; root.add(telegraph);
  const healthBack = new THREE.Mesh(new THREE.PlaneGeometry(.9, .09), new THREE.MeshBasicMaterial({ color: '#342d2b', side: THREE.DoubleSide, depthTest: false })); healthBack.position.y = kind === 'brute' ? 3.12 : 2.65; root.add(healthBack);
  const healthFill = new THREE.Mesh(new THREE.PlaneGeometry(.86, .065), new THREE.MeshBasicMaterial({ color: stats.color, side: THREE.DoubleSide, depthTest: false })); healthFill.position.copy(healthBack.position); healthFill.position.z = .01; root.add(healthFill);
  const aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: stats.color, transparent: true, opacity: .7, depthTest: false })); aimLine.visible = false; aimLine.name = 'archer-aim';
  return { root, telegraph, aimLine, healthBack, healthFill, animate(time: number, moving: boolean, winding: number, hit: number, health: number) {
    const gait = Math.sin(time * 9); legs[0].rotation.x = moving ? gait * .6 : 0; legs[1].rotation.x = moving ? -gait * .6 : 0;
    body.position.y = moving ? Math.abs(gait) * .055 : 0; body.rotation.z = hit > 0 ? Math.sin(hit * 45) * .16 : 0;
    weapon.rotation.x = winding > 0 ? -1.8 * (1 - winding / stats.windup) : -.2;
    telegraph.visible = winding > 0; telegraph.scale.setScalar(winding > 0 ? .5 + .5 * (1 - winding / stats.windup) : 1); healthFill.scale.x = Math.max(0, health); healthFill.position.x = -(1 - health) * .43;
    telegraphMaterial.opacity = .3 + .35 * Math.sin(time * 17) ** 2;
  } };
}

export function createTroyGame(canvas: HTMLCanvasElement, callbacks: TroyCallbacks, previousEnding?: EndingKind, stage = 1, initialWeapons: WeaponKind[] = ['sword']): TroyEngine {
  let state: RunState = { ...createRun(Date.now() >>> 0, previousEnding, stage, initialWeapons), phase: 'ready' };
  let map = createCityMap(state.stage, state.seed), difficulty = getRaidDifficulty(state.stage);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#c4d6cf'); scene.fog = new THREE.FogExp2('#cbd9ce', .0048);
  const camera = new THREE.PerspectiveCamera(47, 1, .15, 420);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const ambient = new THREE.HemisphereLight('#d5e9e9', '#a99472', 2.2); scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff0c8', 3.7); sun.position.set(-27, 42, 18); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -62, right: 62, top: 58, bottom: -58, near: .5, far: 170 }); sun.shadow.normalBias = .055; sun.shadow.bias = -.00015; scene.add(sun);
  const fill = new THREE.DirectionalLight('#a5cfd8', .45); fill.position.set(15, 15, -20); scene.add(fill);
  let world = createTroyWorld(map); scene.add(world.root);
  const hero = createCharacter('lyra'); hero.root.position.set(map.spawn.x, world.groundHeight(map.spawn.x, map.spawn.z), map.spawn.z); hero.root.rotation.y = Math.PI; scene.add(hero.root);
  const createAdvisors = () => map.advisors.map(config => {
    const actor = createCharacter(config.id); actor.root.position.set(config.x, world.groundHeight(config.x, config.z), config.z); actor.root.rotation.y = config.id === 'mira' ? .5 : -.5; scene.add(actor.root);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(.18), new THREE.MeshBasicMaterial({ color: config.id === 'mira' ? '#bde9c5' : '#f4cb82' })); marker.position.set(config.x, 3.1, config.z); scene.add(marker);
    const rig = weaponHand(actor.root), hammer = createWeaponModel('hammer'), bow = createWeaponModel('bow');
    rig.hand.add(hammer, bow); hammer.visible = bow.visible = false;
    return { config, actor, marker, rig, hammer, bow, action: 'idle' as CompanionStatus['action'], description: 'Ready for your orders', building: 'house' as BuildingKind, targetPlot: null as string | null, work: 0, cooldown: 0, attackTime: 0, moving: false, route: [] as { x: number; z: number }[], routeTarget: '', routeTime: 0 };
  });
  let advisors = createAdvisors();
  const heroRig = weaponHand(hero.root), swordArm = heroRig.arm, swordElbow = heroRig.elbow;
  const heldWeapons = { sword: createWeaponModel('sword'), bow: createWeaponModel('bow'), hammer: createWeaponModel('hammer') };
  for (const [kind, model] of Object.entries(heldWeapons)) { heroRig.hand.add(model); model.visible = kind === state.weapon; }
  const syncHeldWeapon = () => { for (const [kind, model] of Object.entries(heldWeapons)) model.visible = kind === state.weapon; };
  const slashMaterial = new THREE.MeshBasicMaterial({ color: '#ffe4a4', transparent: true, opacity: .85, depthWrite: false, side: THREE.DoubleSide });
  const slash = new THREE.Mesh(new THREE.RingGeometry(1.3, 2.6, 40, 1, -.8, 2), slashMaterial); slash.rotation.x = -Math.PI / 2; slash.visible = false; scene.add(slash);
  const dodgeRing = new THREE.Mesh(new THREE.RingGeometry(.5, .68, 32), new THREE.MeshBasicMaterial({ color: '#b8eef2', transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide })); dodgeRing.rotation.x = -Math.PI / 2; dodgeRing.visible = false; scene.add(dodgeRing);

  const waterUniforms = { uTime: { value: 0 }, uDusk: { value: 0 } };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(650, 650, 48, 48), new THREE.ShaderMaterial({ uniforms: waterUniforms,
    vertexShader: 'varying vec3 vWorld; uniform float uTime; void main(){vec3 p=position;p.z+=sin(p.x*.19+uTime*.7)*.10+sin(p.y*.28+uTime*.5)*.07;vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}',
    fragmentShader: 'varying vec3 vWorld;uniform float uTime;uniform float uDusk;void main(){vec2 p=vWorld.xz;float w=sin(p.x*.8+p.y*.31+uTime)*sin(p.y*.64-p.x*.12-uTime*.6);float w2=sin(p.x*2.1+p.y*1.4+uTime*1.3)*sin(p.y*1.7-uTime*.8);float shore=1.-smoothstep(25.,80.,length(p));vec3 col=mix(vec3(.12,.36,.43),vec3(.17,.64,.65),shore);col+=w*.018+pow(max(0.,w2),19.)*.12;col=mix(col,vec3(.66,.77,.75),smoothstep(75.,240.,length(p)));col=mix(col,col*vec3(.65,.48,.42),uDusk*.65);gl_FragColor=vec4(col,1.);}'
  })); water.rotation.x = -Math.PI / 2; water.position.y = -3.8; scene.add(water);
  const skyMaterial = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { dusk: { value: 0 }, panorama: { value: null }, hasPanorama: { value: 0 } },
    vertexShader: 'varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 vPos;uniform float dusk;uniform sampler2D panorama;uniform float hasPanorama;void main(){vec3 d=normalize(vPos);float h=clamp(d.y,0.,1.);vec3 c=mix(vec3(.83,.85,.75),vec3(.41,.66,.73),pow(h,.65));vec2 uv=vec2((atan(d.z,d.x)/6.2831853+.5)*2.,clamp(h*1.1,0.,1.));vec3 painted=texture2D(panorama,uv).rgb;c=mix(c,painted,hasPanorama*.48);c=mix(c,mix(vec3(.63,.34,.21),vec3(.2,.2,.25),h),dusk*.75);gl_FragColor=vec4(c,1.);}'
  }); scene.add(new THREE.Mesh(new THREE.SphereGeometry(330, 28, 14), skyMaterial));
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(5, 20, 12), new THREE.MeshBasicMaterial({ color: '#fff0c8', fog: false })); sunDisc.position.set(-130, 103, -155); scene.add(sunDisc);
  const mountainMaterial = new THREE.MeshStandardMaterial({ color: '#82968f', roughness: 1 });
  for (let i = 0; i < 11; i++) { const mountain = new THREE.Mesh(new THREE.ConeGeometry(24 + i % 3 * 7, 14 + i % 4 * 5, 7), mountainMaterial); mountain.position.set(-175 + i * 36, -4, -112 - i % 3 * 8); mountain.rotation.y = i * 1.3; mountain.scale.z = .65; scene.add(mountain); }
  const dustGeometry = new THREE.BufferGeometry(), dustPositions = new Float32Array(180 * 3);
  for (let i = 0; i < 180; i++) { dustPositions[i * 3] = Math.sin(i * 72.71) * 25; dustPositions[i * 3 + 1] = 1 + (i * 1.71) % 13; dustPositions[i * 3 + 2] = Math.cos(i * 18.3) * 23; }
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3)); const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: '#ffe4b8', transparent: true, opacity: .4, size: .05, depthWrite: false })); scene.add(dust);

  let destroyed = false, paused = false, lastEnding = previousEnding;
  let selected: BuildingKind = 'house', nearest: Interaction | null = null;
  let elapsed = 0, visualTime = 0, updateElapsed = 0, markedUntil = 0, lastFrame = performance.now(), frame = 0;
  let yaw = .2, pitch = .72, distance = 31, drag = false, dragPointer = -1, dragX = 0, dragY = 0;
  let stamina = 1, walking = 0, stepTime = 0, attackRemaining = 0, attackVisual = 0, dodgeRemaining = 0, invulnerable = 0, dashRemaining = 0, hitFlash = 0;
  let attackCooldownMax = WEAPON_STATS.sword.cooldown, attackKind: WeaponKind = 'sword';
  let dashX = 0, dashZ = -1, facingX = 0, facingZ = -1, wave = 0, hint = '', hintUntil = 0, prankStage = 0, prankTime = 0, navTime = 0;
  let nextRaidAt = difficulty.firstRaid, raidWarned = false;
  let audioMuted = true, audio: AudioContext | null = null;
  const movement = { forward: false, backward: false, left: false, right: false, sprint: false };
  const neutralController = (): ControllerInput => ({ x: 0, y: 0, lookX: 0, lookY: 0, sprint: false });
  let controller = neutralController();
  const nodeReady = new Map<string, number>(), towerReady = new Map<string, number>();
  const followTarget = hero.root.position.clone().add(new THREE.Vector3(0, 1.2, -1.6));
  const cameraPosition = new THREE.Vector3(), temp = new THREE.Vector3();
  type Enemy = { actor: ReturnType<typeof createRaider>; kind: EnemyKind; hp: number; maxHp: number; cooldown: number; windup: number; hit: number; id: number; aimX: number; aimZ: number; vx: number; vz: number };
  const enemies: Enemy[] = []; let enemySerial = 0, randomValue = state.seed;
  const shots: { mesh: THREE.Mesh; kind: 'bow' | 'cannon'; start: THREE.Vector3; end: THREE.Vector3; vx: number; vz: number; age: number; duration: number; damage: number }[] = [];
  const enemyArrows: { mesh: THREE.Mesh; vx: number; vz: number; life: number; damage: number }[] = [];
  const corpses: { actor: ReturnType<typeof createRaider>; age: number; y: number }[] = [];
  const loot: { id: string; kind: WeaponKind; root: THREE.Group; x: number; z: number }[] = []; let lootSerial = 0;
  const impacts: { mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; age: number; radius: number }[] = [];
  const prank = new THREE.Group(); scene.add(prank); prank.visible = false;
  const warningMaterial = new THREE.MeshBasicMaterial({ color: '#ffd25f', transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false });
  const warningCircle = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.65, 48), warningMaterial); warningCircle.rotation.x = -Math.PI / 2; warningCircle.position.y = .08; prank.add(warningCircle);
  const gift = new THREE.Mesh(new THREE.BoxGeometry(1.1, .9, 1.1), new THREE.MeshStandardMaterial({ color: '#b7904b', roughness: .9 })); gift.position.y = .5; gift.castShadow = true; prank.add(gift);
  const giftBand = new THREE.Mesh(new THREE.BoxGeometry(.13, .94, 1.14), new THREE.MeshStandardMaterial({ color: '#efd090', metalness: .5, roughness: .5 })); giftBand.position.y = .5; prank.add(giftBand);
  const crack = new THREE.Mesh(new THREE.RingGeometry(.12, 2.7, 9), new THREE.MeshBasicMaterial({ color: '#6b382a', transparent: true, opacity: .85, side: THREE.DoubleSide })); crack.rotation.x = -Math.PI / 2; crack.position.y = .045; crack.visible = false; prank.add(crack);

  let marbleLoaded = false;
  const applyMarble = (texture: THREE.Texture) => {
    world.root.traverse(object => { if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial && /paving/i.test(object.material.name)) { if (object.material.map !== texture) object.material.map?.dispose(); object.material.map = texture; object.material.needsUpdate = true; } });
  };
  const marbleTexture = new THREE.TextureLoader().load('/oracle/marble.jpg', texture => {
    if (destroyed) { texture.dispose(); return; }
    texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(18, 16); texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); marbleLoaded = true; applyMarble(texture);
  }, undefined, () => {});
  const skyTexture = new THREE.TextureLoader().load('/oracle/sky.jpg', texture => { if (destroyed) { texture.dispose(); return; } texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = THREE.MirroredRepeatWrapping; skyMaterial.uniforms.panorama.value = texture; skyMaterial.uniforms.hasPanorama.value = 1; }, undefined, () => {});

  const random = () => { randomValue = (Math.imul(randomValue, 1664525) + 1013904223) >>> 0; return randomValue / 4294967296; };
  const sound = (kind: 'pickup' | 'build' | 'step' | 'sword' | 'damage' | 'start') => {
    if (audioMuted || destroyed) return;
    try {
      audio ??= new AudioContext(); if (audio.state === 'suspended') void audio.resume();
      const oscillator = audio.createOscillator(), gain = audio.createGain(), time = audio.currentTime; oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.type = kind === 'sword' || kind === 'damage' ? 'sawtooth' : kind === 'step' ? 'triangle' : 'sine';
      const base = { pickup: 570, build: 290, step: 85, sword: 180, damage: 90, start: 200 }[kind]; oscillator.frequency.setValueAtTime(base, time); oscillator.frequency.exponentialRampToValueAtTime(kind === 'sword' || kind === 'damage' || kind === 'step' ? 40 : base * 1.5, time + .16);
      gain.gain.setValueAtTime(kind === 'step' ? .02 : .055, time); gain.gain.exponentialRampToValueAtTime(.001, time + .22); oscillator.start(time); oscillator.stop(time + .24);
    } catch { /* Audio is optional; gameplay does not depend on autoplay permission. */ }
  };
  const clearInput = () => { for (const key of Object.keys(movement) as (keyof typeof movement)[]) movement[key] = false; controller = neutralController(); drag = false; dragPointer = -1; };
  const active = () => !destroyed && !paused && state.phase === 'playing';
  const emit = () => {
    if (destroyed) return;
    // Cooldowns are normalized: zero is ready and one is the full cooldown.
    callbacks.onUpdate({ ...state, materials: { ...state.materials }, buildings: state.buildings.map(building => ({ ...building })), completedMissions: [...state.completedMissions], explored: [...state.explored], weapons: [...state.weapons], paused, selected, nearest: nearest ? { ...nearest } : null, player: { x: hero.root.position.x, z: hero.root.position.z }, stamina: stamina * 100, enemies: enemies.length, attackCooldown: clamp(attackRemaining / attackCooldownMax, 0, 1), dodgeCooldown: clamp(dodgeRemaining / DODGE_COOLDOWN, 0, 1), wave, hint, nextRaid: state.phase === 'playing' || state.phase === 'ready' ? Math.max(0, nextRaidAt - elapsed) : 0, enemyPositions: enemies.map(enemy => ({ x: enemy.actor.root.position.x, z: enemy.actor.root.position.z, kind: enemy.kind })), companions: advisors.map(advisor => ({ character: advisor.config.id, action: advisor.action, description: advisor.description })) });
  };
  const showEvent = (type: string, message: string) => { if (!destroyed) callbacks.onEvent({ type, message }); };
  const showHint = (message: string, seconds = 5) => { hint = message; hintUntil = elapsed + seconds; showEvent('warning', message); };
  const transition = (next: RunState) => {
    const previous = state; state = next;
    for (const mission of getMissions(state)) if (mission.completed && !previous.completedMissions.includes(mission.id)) {
      const supplies = Object.entries(mission.reward).filter(([, value]) => value > 0).map(([key, value]) => `+${value} ${RESOURCE_NAMES[key as keyof typeof RESOURCE_NAMES]}`).join(', ');
      showEvent('mission', `${mission.title} · +${mission.points} points · ${supplies}`);
    }
    if (state.phase !== previous.phase) {
      clearInput(); nearest = null; clearArrows(); clearEffects();
      if (state.phase === 'disaster') {
        lastEnding = state.ending; hint = 'A gift from the Greeks. What could possibly go wrong?'; hintUntil = Infinity; slash.visible = false; dodgeRing.visible = false; prank.visible = false;
        enemies.forEach(enemy => { enemy.actor.telegraph.visible = false; enemy.actor.aimLine.visible = false; });
        showEvent('warning', 'Time is up. Troy has accepted a very suspicious gift.');
      }
      if (state.phase === 'ended') {
        lastEnding = state.ending; hint = ''; paused = false; slash.visible = false; dodgeRing.visible = false; prank.visible = false; enemies.forEach(enemy => { enemy.actor.telegraph.visible = false; enemy.actor.aimLine.visible = false; });
        showEvent(state.outcome === 'fallen' ? 'warning' : 'ending', state.outcome === 'fallen' ? 'Lyra has fallen. Your legend deserves another try.' : 'Troy fell. Your legend survived.');
      }
      emit();
    }
  };
  const canMove = (x: number, z: number, radius = HERO_RADIUS) => canOccupyTroyPosition(x, z, world.colliders, radius, map.bounds);
  const findFree = (x: number, z: number, radius = HERO_RADIUS) => {
    const sx = clamp(x, map.bounds.minX + .8, map.bounds.maxX - .8), sz = clamp(z, map.bounds.minZ + .8, map.bounds.maxZ - .8);
    if (canMove(sx, sz, radius)) return { x: sx, z: sz };
    for (let ring = .5; ring < 12; ring += .5) for (let step = 0; step < 24; step++) {
      const angle = step / 24 * Math.PI * 2, nx = sx + Math.sin(angle) * ring, nz = sz + Math.cos(angle) * ring;
      if (canMove(nx, nz, radius)) return { x: nx, z: nz };
    }
    return { ...map.spawn };
  };
  const move = (position: THREE.Vector3, dx: number, dz: number, radius = HERO_RADIUS) => {
    // Substeps prevent a sprint or dodge from tunnelling through a narrow wall.
    const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .2));
    for (let i = 0; i < count; i++) { if (canMove(position.x + dx / count, position.z, radius)) position.x += dx / count; if (canMove(position.x, position.z + dz / count, radius)) position.z += dz / count; }
    position.y = world.groundHeight(position.x, position.z);
  };
  const updateNearest = () => {
    nearest = null; if (state.phase !== 'playing') return;
    const p = hero.root.position;
    const drop = loot.filter(item => Math.hypot(item.x - p.x, item.z - p.z) < 2.6).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (drop) { nearest = { id: drop.id, kind: 'loot', title: `Pick up ${WEAPON_STATS[drop.kind].name}`, description: state.weapons.includes(drop.kind) ? 'Already carried · recover this drop without adding a duplicate' : 'Add this weapon to your pack and equip it', available: true }; return; }
    const resources = map.resources.filter(node => Math.hypot(node.x - p.x, node.z - p.z) < 2.6).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const node = resources.find(item => (nodeReady.get(item.id) ?? 0) <= elapsed);
    if (node) { nearest = { id: node.id, kind: 'resource', title: `Collect ${RESOURCE_NAMES[node.resource]}`, description: `+${node.amount} ${RESOURCE_NAMES[node.resource]} · replenishes in 7 seconds`, available: true }; return; }
    const landmark = map.landmarks.filter(item => !state.explored.includes(item.id) && Math.hypot(item.x - p.x, item.z - p.z) < 3.7).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (landmark) { nearest = { id: landmark.id, kind: 'landmark', title: `Explore ${landmark.name}`, description: 'Discover this district · treasure, expedition points and career XP', available: true }; return; }
    const plot = map.plots.filter(item => !state.buildings.some(building => building.plotId === item.id) && Math.hypot(item.x - p.x, item.z - p.z) < 4.2).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (plot) {
      nearest = { id: plot.id, kind: 'plot', title: 'Plan this building plot', description: 'Open the building dashboard · choose a design and review its cost', available: true }; return;
    }
    const advisor = advisors.filter(item => Math.hypot(item.actor.root.position.x - p.x, item.actor.root.position.z - p.z) < 2.8).sort((a, b) => a.actor.root.position.distanceToSquared(p) - b.actor.root.position.distanceToSquared(p))[0];
    if (advisor) { nearest = { id: advisor.config.id, kind: 'advisor', title: `Talk to ${advisor.config.id === 'mira' ? 'Mira' : 'Theron'}`, description: advisor.config.id === 'mira' ? 'The healer has a thought about that wooden horse.' : 'A builder’s advice for a very short golden age.', available: true, character: advisor.config.id }; return; }
    if (resources[0]) { const remaining = Math.ceil((nodeReady.get(resources[0].id) ?? 0) - elapsed); nearest = { id: resources[0].id, kind: 'resource', title: 'Supplies replenishing', description: `${RESOURCE_NAMES[resources[0].resource]} returns in ${remaining}s`, available: false }; }
  };
  const completeBuilding = (plotId: string, kind: BuildingKind, builder?: string) => {
    const next = buildAt(state, plotId, kind); if (next.buildings.length === state.buildings.length) return false;
    transition(next); world.sync(state); navTime = 0; navDirty = true;
    for (const actor of [hero, ...advisors.map(advisor => advisor.actor), ...enemies.map(enemy => enemy.actor)]) {
      const p = actor.root.position; if (!canMove(p.x, p.z, .4)) { const free = findFree(p.x, p.z, .4); p.set(free.x, world.groundHeight(free.x, free.z), free.z); }
    }
    const blueprint = BLUEPRINTS.find(item => item.id === kind)!; sound('build'); showEvent('build', `${builder ? `${builder} completed a ` : ''}${blueprint.name} · +${blueprint.points} points`); updateNearest(); emit(); return true;
  };
  const buildAtPlot = (plotId: string, kind: BuildingKind) => {
    if (destroyed || state.phase !== 'playing') return false;
    const plot = map.plots.find(item => item.id === plotId);
    if (!plot || Math.hypot(plot.x - hero.root.position.x, plot.z - hero.root.position.z) > 4.3) { showEvent('notice', 'Walk closer to this building plot.'); return false; }
    const reason = buildingCostReason(state, kind, plotId); if (reason) { showEvent('notice', reason); return false; }
    selected = kind; return completeBuilding(plotId, kind);
  };
  const interact = () => {
    if (!active()) return; updateNearest(); if (!nearest) return;
    if (!nearest.available) { showEvent('notice', nearest.description); return; }
    if (nearest.kind === 'advisor' && nearest.character) { callbacks.onTalk(nearest.character); return; }
    if (nearest.kind === 'plot') { callbacks.onBuildPlot?.(nearest.id); return; }
    if (nearest.kind === 'loot') {
      const index = loot.findIndex(item => item.id === nearest!.id); if (index < 0) return;
      const drop = loot[index], owned = state.weapons.includes(drop.kind); transition(collectWeapon(state, drop.kind)); syncHeldWeapon(); scene.remove(drop.root); disposeObject(drop.root); loot.splice(index, 1); sound('pickup');
      showEvent('loot', owned ? `${WEAPON_STATS[drop.kind].name} is already in your pack.` : `${WEAPON_STATS[drop.kind].name} acquired and equipped.`); updateNearest(); emit(); return;
    }
    if (nearest.kind === 'resource') {
      const node = map.resources.find(item => item.id === nearest!.id); if (!node || (nodeReady.get(node.id) ?? 0) > elapsed) return;
      transition(gather(state, node.resource, node.amount)); nodeReady.set(node.id, elapsed + 7); world.setNodeAvailable(node.id, false); sound('pickup'); showEvent('pickup', `+${node.amount} ${RESOURCE_NAMES[node.resource]}`);
    } else if (nearest.kind === 'landmark') {
      const landmark = map.landmarks.find(item => item.id === nearest!.id); if (!landmark) return;
      const before = state.score, next = discoverLandmark(state, landmark.id); if (next === state) return;
      transition(next); world.sync(state); sound('pickup'); showEvent('explore', `${landmark.name} discovered · +${state.score - before} points · treasure recovered`);
    }
    updateNearest(); emit();
  };
  const impact = (x: number, z: number, radius: number, color = '#ffd891', fiery = false) => {
    if (impacts.length >= 30) { const oldest = impacts.shift()!; scene.remove(oldest.mesh); disposeObject(oldest.mesh); }
    const mesh = new THREE.Mesh(new THREE.RingGeometry(.65, 1, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false }));
    mesh.name = 'combat-impact'; mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, world.groundHeight(x, z) + .13, z); mesh.scale.setScalar(.15);
    if (fiery) { const burst = new THREE.Mesh(new THREE.IcosahedronGeometry(.32, 1), new THREE.MeshBasicMaterial({ color: '#ffd18c', transparent: true, opacity: .9, depthWrite: false })); burst.name = 'cannon-explosion'; burst.position.z = .24; mesh.add(burst); }
    scene.add(mesh); impacts.push({ mesh, age: 0, radius });
  };
  const launchBow = (from: THREE.Vector3, target: THREE.Vector3, damage: number) => {
    if (shots.length >= 64) return;
    const dx = target.x - from.x, dz = target.z - from.z, length = Math.hypot(dx, dz) || 1;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.035, .065, 1.2, 5), new THREE.MeshBasicMaterial({ color: '#bbedee' }));
    mesh.name = 'friendly-arrow'; mesh.position.set(from.x, from.y + 1.25, from.z); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / length, 0, dz / length)); scene.add(mesh);
    shots.push({ mesh, kind: 'bow', start: mesh.position.clone(), end: target.clone(), vx: dx / length * 25, vz: dz / length * 25, age: 0, duration: .95, damage });
  };
  const dropWeapon = (kind: WeaponKind, x: number, z: number) => {
    if (loot.length >= 16) { const oldest = loot.shift()!; scene.remove(oldest.root); disposeObject(oldest.root); }
    const free = findFree(x, z, .12), root = createWeaponLoot(kind), id = `weapon-drop-${lootSerial++}`;
    root.name = id; root.userData.weaponKind = kind; root.position.set(free.x, world.groundHeight(free.x, free.z) + .1, free.z); scene.add(root); loot.push({ id, kind, root, x: free.x, z: free.z });
  };
  const damageEnemy = (enemy: Enemy, amount: number) => {
    if (enemy.hp <= 0 || state.phase !== 'playing') return; enemy.hp -= amount; enemy.hit = .25;
    if (enemy.kind !== 'brute') { enemy.windup = 0; enemy.cooldown = Math.max(enemy.cooldown, .5); enemy.actor.aimLine.visible = false; }
    if (enemy.hp <= 0) {
      const index = enemies.indexOf(enemy); if (index >= 0) enemies.splice(index, 1);
      scene.remove(enemy.actor.aimLine); disposeObject(enemy.actor.aimLine); enemy.actor.telegraph.visible = enemy.actor.healthBack.visible = enemy.actor.healthFill.visible = false;
      delete enemy.actor.root.userData.enemyKind; enemy.actor.root.name = `fallen-${enemy.kind}`;
      if (corpses.length >= 18) { const oldest = corpses.shift()!; scene.remove(oldest.actor.root); disposeObject(oldest.actor.root); }
      corpses.push({ actor: enemy.actor, age: 0, y: enemy.actor.root.position.y });
      dropWeapon(ENEMY_WEAPONS[enemy.kind], enemy.actor.root.position.x, enemy.actor.root.position.z);
      transition(recordKill(state)); showEvent('combat', `${enemy.kind === 'brute' ? 'Armored brute' : enemy.kind === 'archer' ? 'Archer' : 'Skirmisher'} defeated · +35 points`);
    }
  };
  const attack = () => {
    if (!active() || attackRemaining > 0) return;
    attackKind = state.weapon; attackCooldownMax = WEAPON_STATS[state.weapon].cooldown; attackRemaining = attackCooldownMax; attackVisual = state.weapon === 'hammer' ? .48 : .28; sound('sword');
    const p = hero.root.position, range = state.weapon === 'bow' ? 21 : state.weapon === 'hammer' ? 4.2 : 3.8;
    const targets = enemies.filter(enemy => enemy.actor.root.position.distanceTo(p) < range && lineClear(p.x, p.z, enemy.actor.root.position.x, enemy.actor.root.position.z, .1)).sort((a, b) => a.actor.root.position.distanceToSquared(p) - b.actor.root.position.distanceToSquared(p)).slice(0, state.weapon === 'bow' ? 1 : state.weapon === 'hammer' ? 8 : 3);
    if (targets[0]) { const dx = targets[0].actor.root.position.x - p.x, dz = targets[0].actor.root.position.z - p.z; hero.root.rotation.y = Math.atan2(dx, dz); facingX = Math.sin(hero.root.rotation.y); facingZ = Math.cos(hero.root.rotation.y); }
    if (state.weapon === 'bow') launchBow(p, targets[0]?.actor.root.position ?? p.clone().add(new THREE.Vector3(facingX * 21, 0, facingZ * 21)), state.stage >= 5 ? 3 : 2);
    else {
      for (const enemy of targets) {
        damageEnemy(enemy, state.weapon === 'hammer' ? state.stage >= 5 ? 4 : 3 : state.stage >= 5 ? 2 : 1);
        if (state.weapon === 'hammer' && enemy.hp > 0) { const position = enemy.actor.root.position, dx = position.x - p.x, dz = position.z - p.z, length = Math.hypot(dx, dz) || 1; move(position, dx / length * 2.2, dz / length * 2.2, .4); enemy.windup = 0; enemy.cooldown = Math.max(enemy.cooldown, .6); }
      }
      if (state.weapon === 'hammer') impact(p.x, p.z, 4.4, '#e4c0ff');
    }
    emit();
  };
  const selectWeapon = (kind: WeaponKind) => { if (destroyed || state.phase !== 'playing') return; const next = equipWeapon(state, kind); if (next === state) return; state = next; syncHeldWeapon(); emit(); };
  const cycleWeapon = (direction: number) => { if (!active()) return; const index = state.weapons.indexOf(state.weapon); selectWeapon(state.weapons[(index + (direction < 0 ? -1 : 1) + state.weapons.length) % state.weapons.length]); };
  const dodge = () => {
    if (!active() || dodgeRemaining > 0) return;
    let horizontal = Number(movement.right) - Number(movement.left) + controller.x, vertical = Number(movement.forward) - Number(movement.backward) + controller.y;
    const length = Math.hypot(horizontal, vertical); if (length > .05) { horizontal /= length; vertical /= length; dashX = horizontal * Math.cos(yaw) - vertical * Math.sin(yaw); dashZ = -horizontal * Math.sin(yaw) - vertical * Math.cos(yaw); } else { dashX = facingX; dashZ = facingZ; }
    dodgeRemaining = DODGE_COOLDOWN; invulnerable = .5; dashRemaining = .25; sound('sword'); emit();
  };
  const selectBuilding = (kind: BuildingKind) => { if (!active() || !BLUEPRINTS.some(item => item.id === kind)) return; selected = kind; updateNearest(); emit(); };
  const cycleBuilding = (direction: number) => { if (!active()) return; const index = BLUEPRINTS.findIndex(item => item.id === selected); selectBuilding(BLUEPRINTS[(index + (direction < 0 ? -1 : 1) + BLUEPRINTS.length) % BLUEPRINTS.length].id); };
  const commandCompanion = (order: CompanionOrder) => {
    if (destroyed || state.phase !== 'playing') return { accepted: false, message: 'Start an expedition before giving field orders.' };
    const advisor = advisors.find(item => item.config.id === order.character);
    if (!advisor || !['fight', 'build', 'follow'].includes(order.action)) return { accepted: false, message: 'Choose Theron or Mira and a fight, build, or follow order.' };
    const kind = order.building ?? 'house';
    if (order.action === 'build' && !BLUEPRINTS.some(item => item.id === kind)) return { accepted: false, message: 'Choose an available building design.' };
    if (advisor.action !== order.action || (order.action === 'build' && advisor.building !== kind)) { advisor.work = 0; advisor.targetPlot = null; advisor.route = []; advisor.routeTarget = ''; }
    advisor.action = order.action; advisor.building = kind;
    const name = order.character === 'theron' ? 'Theron' : 'Mira';
    advisor.description = order.action === 'build' ? `Preparing to build ${BLUEPRINTS.find(item => item.id === kind)!.name}` : order.action === 'fight' ? 'Protecting Lyra and engaging nearby raiders' : 'Following Lyra';
    const message = order.action === 'build' ? `${name} will build ${BLUEPRINTS.find(item => item.id === kind)!.name} using your shared materials. Each build takes six seconds.` : order.action === 'fight' ? `${name} will follow you and fight nearby raiders.` : `${name} will follow you.`;
    emit(); return { accepted: true, message };
  };
  const pause = () => { if (destroyed || (state.phase !== 'playing' && state.phase !== 'disaster')) return; paused = true; clearInput(); if (audio?.state === 'running') void audio.suspend(); emit(); };
  const resume = () => { if (destroyed || !paused || (state.phase !== 'playing' && state.phase !== 'disaster')) return; paused = false; lastFrame = performance.now(); if (!audioMuted && audio?.state === 'suspended') void audio.resume(); emit(); };
  const clearEnemies = () => { for (const enemy of enemies) { scene.remove(enemy.actor.root, enemy.actor.aimLine); disposeObject(enemy.actor.root); disposeObject(enemy.actor.aimLine); } enemies.length = 0; };
  const clearArrows = () => { for (const arrow of [...shots, ...enemyArrows]) { scene.remove(arrow.mesh); disposeObject(arrow.mesh); } shots.length = 0; enemyArrows.length = 0; };
  const clearEffects = () => {
    for (const corpse of corpses) { scene.remove(corpse.actor.root); disposeObject(corpse.actor.root); } corpses.length = 0;
    for (const item of loot) { scene.remove(item.root); disposeObject(item.root); } loot.length = 0;
    for (const effect of impacts) { scene.remove(effect.mesh); disposeObject(effect.mesh); } impacts.length = 0;
  };
  const start = (nextStage = state.stage, weapons = state.weapons) => {
    if (destroyed) return;
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0; state = createRun(seed, lastEnding, nextStage, weapons); randomValue = state.seed; syncHeldWeapon();
    paused = false; selected = 'house'; nearest = null; clearInput(); clearEnemies(); clearArrows(); clearEffects(); nodeReady.clear(); towerReady.clear();
    scene.remove(world.root); disposeObject(world.root, marbleTexture); world.dispose();
    for (const { actor, marker } of advisors) { scene.remove(actor.root, marker); disposeObject(actor.root); disposeObject(marker); }
    map = createCityMap(state.stage, state.seed); difficulty = getRaidDifficulty(state.stage); world = createTroyWorld(map); scene.add(world.root); if (marbleLoaded) applyMarble(marbleTexture); advisors = createAdvisors(); world.sync(state); resetNavigation();
    elapsed = 0; visualTime = 0; updateElapsed = 0; markedUntil = 0; stamina = 1; walking = 0; stepTime = 0; attackRemaining = 0; attackVisual = 0; dodgeRemaining = 0; invulnerable = 0; dashRemaining = 0; hitFlash = 0;
    facingX = 0; facingZ = -1; dashX = 0; dashZ = -1; wave = 0; hint = ''; hintUntil = 0; prankStage = 0; prankTime = 0; navTime = 0; enemySerial = 0; lootSerial = 0; attackCooldownMax = WEAPON_STATS.sword.cooldown; attackKind = 'sword'; nextRaidAt = difficulty.firstRaid; raidWarned = false;
    hero.root.position.set(map.spawn.x, world.groundHeight(map.spawn.x, map.spawn.z), map.spawn.z); hero.root.rotation.set(0, Math.PI, 0); hero.root.visible = true;
    yaw = .13; pitch = .72; distance = 31; followTarget.copy(hero.root.position).add(new THREE.Vector3(0, 1.2, -1.6));
    slash.visible = false; dodgeRing.visible = false; prank.visible = false; crack.visible = false; gift.visible = true; giftBand.visible = true; warningCircle.visible = true;
    skyMaterial.uniforms.dusk.value = 0; waterUniforms.uDusk.value = 0; sun.intensity = 3.7; sun.color.set(map.theme === 'desert' ? '#ffdeb0' : '#fff0c8'); ambient.intensity = 2.2; scene.fog = new THREE.FogExp2(map.theme === 'desert' ? '#e4ceb0' : map.theme === 'forest' ? '#b9cec0' : '#cbd9ce', .003);
    updateNearest(); emit(); sound('start'); lastFrame = performance.now();
  };

  // One cached occupancy grid and flood field serves all raiders across the larger map.
  const NAV_STEP = 1.5;
  let navWidth = 1, navHeight = 1, navMinX = 0, navMinZ = 0, nav = new Int16Array(1), navWalk = new Uint8Array(1), navDirty = true;
  const resetNavigation = () => {
    navMinX = map.bounds.minX + .8; navMinZ = map.bounds.minZ + .8;
    navWidth = Math.floor((map.bounds.maxX - map.bounds.minX - 1.6) / NAV_STEP) + 1;
    navHeight = Math.floor((map.bounds.maxZ - map.bounds.minZ - 1.6) / NAV_STEP) + 1;
    nav = new Int16Array(navWidth * navHeight); navWalk = new Uint8Array(nav.length); navDirty = true;
  };
  resetNavigation();
  const navIndex = (x: number, z: number) => clamp(Math.round((z - navMinZ) / NAV_STEP), 0, navHeight - 1) * navWidth + clamp(Math.round((x - navMinX) / NAV_STEP), 0, navWidth - 1);
  const rebuildNavigation = () => {
    if (navDirty) { for (let i = 0; i < nav.length; i++) navWalk[i] = Number(canMove(navMinX + i % navWidth * NAV_STEP, navMinZ + Math.floor(i / navWidth) * NAV_STEP, .5)); navDirty = false; }
    nav.fill(-1); const queue: number[] = [], p = hero.root.position, start = navIndex(p.x, p.z); nav[start] = 0; queue.push(start);
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head], x = index % navWidth, z = Math.floor(index / navWidth);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz; if (nx < 0 || nx >= navWidth || nz < 0 || nz >= navHeight) continue;
        const next = nz * navWidth + nx; if (nav[next] !== -1 || !navWalk[next]) continue; nav[next] = nav[index] + 1; queue.push(next);
      }
    }
  };
  const lineClear = (x: number, z: number, tx: number, tz: number, radius = .43) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(tx - x, tz - z) / .65));
    for (let i = 1; i <= steps; i++) if (!canMove(x + (tx - x) * i / steps, z + (tz - z) * i / steps, radius)) return false;
    return true;
  };
  const spawnEnemy = (x: number, z: number, kind: EnemyKind = 'skirmisher') => {
    if (enemies.length >= difficulty.aliveCap) return;
    const p = findFree(x, z, .43), actor = createRaider(kind), maxHp = ENEMY_STATS[kind].hp + difficulty.hpBonus;
    actor.root.position.set(p.x, world.groundHeight(p.x, p.z), p.z); scene.add(actor.root, actor.aimLine);
    enemies.push({ actor, kind, hp: maxHp, maxHp, cooldown: .7 + random() * .7, windup: 0, hit: 0, id: enemySerial++, aimX: p.x, aimZ: p.z, vx: 0, vz: 0 });
  };
  const spawnWave = () => {
    const p = hero.root.position, b = map.bounds;
    const fronts = [
      { name: 'western', distance: p.x - b.minX, x: b.minX + 2.8, z: p.z, alongX: false },
      { name: 'eastern', distance: b.maxX - p.x, x: b.maxX - 2.8, z: p.z, alongX: false },
      { name: 'northern', distance: p.z - b.minZ, x: p.x, z: b.minZ + 2.8, alongX: true },
      { name: 'southern', distance: b.maxZ - p.z, x: p.x, z: b.maxZ - 2.8, alongX: true },
    ].sort((a, c) => a.distance - c.distance);
    const primary = fronts[0], secondary = fronts[1 + Math.floor(random() * 3)];
    const count = 4 + difficulty.extraRaiders + Math.min(2, Math.floor((wave - 1) / 3));
    const kinds: EnemyKind[] = ['skirmisher', 'skirmisher', 'archer', 'brute', 'skirmisher', 'archer', 'brute', 'skirmisher', 'archer', 'brute'];
    for (let i = 0; i < count; i++) {
      const front = i < Math.ceil(count * .65) ? primary : secondary, spread = (random() - .5) * 19;
      spawnEnemy(front.x + (front.alongX ? spread : 0), front.z + (front.alongX ? 0 : spread), kinds[(i + (wave > 1 ? wave % 3 : 0)) % kinds.length]);
    }
    showHint(`Raid ${wave}: ${primary.name} + ${secondary.name} fronts! Gold bows, red blades, purple brutes.`, 5);
  };
  const hurtHero = (amount: number) => {
    if (state.phase !== 'playing' || invulnerable > 0) return;
    transition(takeDamage(state, amount)); hitFlash = .32; invulnerable = .38; sound('damage'); emit();
  };
  const projected = new THREE.Vector3();
  const onScreen = (position: THREE.Vector3) => {
    projected.copy(position).add(new THREE.Vector3(0, 1.3, 0)).project(camera);
    return projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .94 && Math.abs(projected.y) < .92;
  };
  const fireEnemyArrow = (enemy: Enemy) => {
    const position = enemy.actor.root.position, dx = enemy.aimX - position.x, dz = enemy.aimZ - position.z, length = Math.hypot(dx, dz);
    if (length < .1 || !onScreen(position)) return;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.045, .07, 1.35, 5), new THREE.MeshBasicMaterial({ color: '#ffbd58' }));
    mesh.name = 'hostile-arrow'; mesh.position.set(position.x, world.groundHeight(position.x, position.z) + 1.15, position.z);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / length, 0, dz / length)); scene.add(mesh);
    enemyArrows.push({ mesh, vx: dx / length * 16, vz: dz / length * 16, life: 1.4, damage: Math.round(ENEMY_STATS.archer.damage * difficulty.damageScale) });
  };
  const updateCombat = (dt: number) => {
    attackRemaining = Math.max(0, attackRemaining - dt); attackVisual = Math.max(0, attackVisual - dt); dodgeRemaining = Math.max(0, dodgeRemaining - dt); invulnerable = Math.max(0, invulnerable - dt); hitFlash = Math.max(0, hitFlash - dt);
    navTime -= dt; if (navTime <= 0) { rebuildNavigation(); navTime = .5; }
    const p = hero.root.position;
    for (const enemy of [...enemies]) {
      if (state.phase !== 'playing') break;
      const stats = ENEMY_STATS[enemy.kind], position = enemy.actor.root.position, dx = p.x - position.x, dz = p.z - position.z, range = Math.hypot(dx, dz);
      const beforeX = position.x, beforeZ = position.z; enemy.hit = Math.max(0, enemy.hit - dt); enemy.cooldown = Math.max(0, enemy.cooldown - dt); let moving = false;
      const archer = enemy.kind === 'archer', clear = range < 18 && lineClear(position.x, position.z, p.x, p.z, .15);
      if (enemy.windup > 0) {
        enemy.windup = Math.max(0, enemy.windup - dt);
        if (enemy.windup === 0) {
          if (archer) { if (range < 19) fireEnemyArrow(enemy); }
          else if (range < stats.range && clear) hurtHero(Math.round(stats.damage * difficulty.damageScale));
          enemy.cooldown = stats.cooldown; enemy.actor.aimLine.visible = false;
        }
      } else if (enemy.cooldown <= 0 && clear && (archer ? range > 5 && range < 16 && onScreen(position) : range < stats.range - .35)) {
        enemy.windup = stats.windup; enemy.aimX = p.x; enemy.aimZ = p.z;
      } else if (archer ? range > 12 || range < 6 || !clear || !onScreen(position) : range > stats.range - .55) {
        let tx = p.x, tz = p.z;
        if (archer && range < 6 && range > .1) { tx = position.x - dx / range * 4; tz = position.z - dz / range * 4; }
        else if (!lineClear(position.x, position.z, tx, tz)) {
          const center = navIndex(position.x, position.z), cx = center % navWidth, cz = Math.floor(center / navWidth); let best = Infinity;
          for (let nx = cx - 1; nx <= cx + 1; nx++) for (let nz = cz - 1; nz <= cz + 1; nz++) {
            if (nx < 0 || nx >= navWidth || nz < 0 || nz >= navHeight) continue;
            const index = nz * navWidth + nx, x = navMinX + nx * NAV_STEP, z = navMinZ + nz * NAV_STEP;
            if (!navWalk[index] || !lineClear(position.x, position.z, x, z)) continue;
            const score = nav[index], cost = score + Math.hypot(x - position.x, z - position.z) * .1;
            if (score >= 0 && cost < best) { best = cost; tx = x; tz = z; }
          }
        }
        const distance = Math.hypot(tx - position.x, tz - position.z);
        if (distance > .08) {
          let vx = (tx - position.x) / distance, vz = (tz - position.z) / distance;
          for (const other of enemies) if (other !== enemy) { const ox = position.x - other.actor.root.position.x, oz = position.z - other.actor.root.position.z, gap = Math.hypot(ox, oz); if (gap > .01 && gap < 1.1) { vx += ox / gap * (1.1 - gap) * 1.7; vz += oz / gap * (1.1 - gap) * 1.7; } }
          const speed = Math.min(stats.speed * difficulty.speedScale * dt, distance), length = Math.hypot(vx, vz) || 1; move(position, vx / length * speed, vz / length * speed, .4); moving = true;
        }
      }
      enemy.vx = (position.x - beforeX) / dt; enemy.vz = (position.z - beforeZ) / dt;
      const desired = archer && enemy.windup > 0 ? Math.atan2(enemy.aimX - position.x, enemy.aimZ - position.z) : Math.atan2(dx, dz); enemy.actor.root.rotation.y += Math.atan2(Math.sin(desired - enemy.actor.root.rotation.y), Math.cos(desired - enemy.actor.root.rotation.y)) * Math.min(1, dt * 9);
      enemy.actor.animate(visualTime + enemy.id, moving, enemy.windup, enemy.hit, enemy.hp / enemy.maxHp);
      const billboard = enemy.actor.root.quaternion.clone().invert().multiply(camera.quaternion); enemy.actor.healthBack.quaternion.copy(billboard); enemy.actor.healthFill.quaternion.copy(billboard);
      enemy.actor.aimLine.visible = archer && enemy.windup > 0;
      if (enemy.actor.aimLine.visible) {
        const points = enemy.actor.aimLine.geometry.attributes.position; points.setXYZ(0, position.x, .12, position.z); points.setXYZ(1, enemy.aimX, .12, enemy.aimZ); points.needsUpdate = true; enemy.actor.aimLine.geometry.computeBoundingSphere();
      }
    }
    if (state.phase !== 'playing') return;
    for (const building of state.buildings) if (building.kind === 'tower') {
      if (elapsed - building.builtAt < .65) continue;
      const plot = map.plots.find(item => item.id === building.plotId); if (!plot) continue;
      const enemy = enemies.filter(item => Math.hypot(item.actor.root.position.x - plot.x, item.actor.root.position.z - plot.z) < 24).sort((a, b) => Math.hypot(a.actor.root.position.x - plot.x, a.actor.root.position.z - plot.z) - Math.hypot(b.actor.root.position.x - plot.x, b.actor.root.position.z - plot.z))[0];
      if (!enemy) continue;
      world.aimTower(plot.id, enemy.actor.root.position.x, enemy.actor.root.position.z);
      if ((towerReady.get(plot.id) ?? 0) > elapsed || shots.length >= 64) continue;
      const start = world.getCannonMuzzle(plot.id); if (!start) continue;
      const duration = clamp(Math.hypot(enemy.actor.root.position.x - start.x, enemy.actor.root.position.z - start.z) / 19, .38, 1.15);
      const end = new THREE.Vector3(enemy.actor.root.position.x + enemy.vx * duration * .75, .35, enemy.actor.root.position.z + enemy.vz * duration * .75);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(.23, 10, 8), new THREE.MeshStandardMaterial({ color: '#d8ad61', emissive: '#9f431d', emissiveIntensity: 1.3, metalness: .7, roughness: .4 }));
      mesh.name = 'cannon-shell'; mesh.position.copy(start); scene.add(mesh); world.fireTower(plot.id); towerReady.set(plot.id, elapsed + 1.8);
      shots.push({ mesh, kind: 'cannon', start, end, vx: 0, vz: 0, age: 0, duration, damage: state.stage >= 5 ? 4 : 3 });
    }
    for (let i = shots.length - 1; i >= 0; i--) {
      const shot = shots[i]; shot.age += dt; let remove = false;
      if (shot.kind === 'cannon') {
        const progress = clamp(shot.age / shot.duration, 0, 1); shot.mesh.position.lerpVectors(shot.start, shot.end, progress); shot.mesh.position.y += Math.sin(progress * Math.PI) * 3;
        if (progress >= 1) {
          impact(shot.end.x, shot.end.z, 3.6, '#ffbd73', true); sound('build');
          for (const enemy of [...enemies]) if (Math.hypot(enemy.actor.root.position.x - shot.end.x, enemy.actor.root.position.z - shot.end.z) < 3.6) damageEnemy(enemy, shot.damage);
          remove = true;
        }
      } else {
        const fromX = shot.mesh.position.x, fromZ = shot.mesh.position.z, toX = fromX + shot.vx * dt, toZ = fromZ + shot.vz * dt;
        const blocked = !lineClear(fromX, fromZ, toX, toZ, .07);
        const target = !blocked ? enemies.filter(enemy => distanceToSegment(enemy.actor.root.position.x, enemy.actor.root.position.z, fromX, fromZ, toX, toZ) < .68).sort((a, b) => Math.hypot(a.actor.root.position.x - fromX, a.actor.root.position.z - fromZ) - Math.hypot(b.actor.root.position.x - fromX, b.actor.root.position.z - fromZ))[0] : undefined;
        shot.mesh.position.x = toX; shot.mesh.position.z = toZ;
        if (target) { impact(toX, toZ, .8, '#bcf1ed'); damageEnemy(target, shot.damage); }
        remove = blocked || Boolean(target) || shot.age >= shot.duration;
      }
      if (remove) { scene.remove(shot.mesh); disposeObject(shot.mesh); shots.splice(i, 1); }
    }
    for (let i = enemyArrows.length - 1; i >= 0; i--) {
      if (state.phase !== 'playing') break;
      const arrow = enemyArrows[i], startX = arrow.mesh.position.x, startZ = arrow.mesh.position.z;
      const endX = startX + arrow.vx * dt, endZ = startZ + arrow.vz * dt; arrow.life -= dt;
      const blocked = !lineClear(startX, startZ, endX, endZ, .07);
      const hit = !blocked && distanceToSegment(p.x, p.z, startX, startZ, endX, endZ) < .65;
      arrow.mesh.position.x = endX; arrow.mesh.position.z = endZ;
      if (hit || blocked || arrow.life <= 0) {
        scene.remove(arrow.mesh); disposeObject(arrow.mesh); enemyArrows.splice(i, 1);
        if (hit) hurtHero(arrow.damage);
      }
    }
  };
  const updateEffects = (dt: number) => {
    for (let i = corpses.length - 1; i >= 0; i--) {
      const corpse = corpses[i]; corpse.age += dt; const progress = clamp(corpse.age / .7, 0, 1);
      corpse.actor.root.rotation.z = -Math.sin(progress * Math.PI / 2) * 1.48; corpse.actor.root.position.y = corpse.y + .08;
      corpse.actor.root.traverse(object => { if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) { material.transparent = true; material.opacity = 1 - clamp((progress - .25) / .75, 0, 1); material.depthWrite = false; } });
      if (progress >= 1) { scene.remove(corpse.actor.root); disposeObject(corpse.actor.root); corpses.splice(i, 1); }
    }
    for (const item of loot) { item.root.rotation.y = visualTime * .7; item.root.position.y = world.groundHeight(item.x, item.z) + .12 + Math.sin(visualTime * 2.4 + item.x) * .07; }
    for (let i = impacts.length - 1; i >= 0; i--) {
      const effect = impacts[i]; effect.age += dt; const progress = clamp(effect.age / .55, 0, 1); effect.mesh.scale.setScalar(.15 + effect.radius * progress); effect.mesh.material.opacity = (1 - progress) * .9;
      for (const child of effect.mesh.children) if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) child.material.opacity = (1 - progress) * .9;
      if (progress >= 1) { scene.remove(effect.mesh); disposeObject(effect.mesh); impacts.splice(i, 1); }
    }
  };
  type Advisor = (typeof advisors)[number];
  const planCompanionRoute = (position: THREE.Vector3, x: number, z: number) => {
    if (navDirty) rebuildNavigation();
    const start = navIndex(position.x, position.z), free = findFree(x, z, .4), target = navIndex(free.x, free.z);
    const previous = new Int32Array(nav.length).fill(-1), queue = [start]; previous[start] = start;
    for (let head = 0; head < queue.length && previous[target] === -1; head++) {
      const cell = queue[head], cx = cell % navWidth, cz = Math.floor(cell / navWidth);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, nz = cz + dz; if (nx < 0 || nx >= navWidth || nz < 0 || nz >= navHeight) continue;
        const next = nz * navWidth + nx; if (previous[next] !== -1 || (!navWalk[next] && next !== target)) continue; previous[next] = cell; queue.push(next);
      }
    }
    const route: { x: number; z: number }[] = []; if (previous[target] === -1) return route;
    for (let cell = target; cell !== start; cell = previous[cell]) route.push({ x: navMinX + cell % navWidth * NAV_STEP, z: navMinZ + Math.floor(cell / navWidth) * NAV_STEP });
    return route.reverse();
  };
  const walkCompanion = (advisor: Advisor, x: number, z: number, dt: number, stop = .8) => {
    const position = advisor.actor.root.position, distance = Math.hypot(x - position.x, z - position.z);
    if (distance <= stop) return;
    let tx = x, tz = z; advisor.routeTime -= dt;
    if (!lineClear(position.x, position.z, x, z, .4)) {
      const key = `${Math.round(x / NAV_STEP)},${Math.round(z / NAV_STEP)}`;
      if (advisor.routeTime <= 0 || advisor.routeTarget !== key || advisor.route.length === 0) { advisor.route = planCompanionRoute(position, x, z); advisor.routeTarget = key; advisor.routeTime = .85; }
      while (advisor.route[0] && Math.hypot(advisor.route[0].x - position.x, advisor.route[0].z - position.z) < .65) advisor.route.shift();
      if (advisor.route[0]) { tx = advisor.route[0].x; tz = advisor.route[0].z; }
    }
    const dx = tx - position.x, dz = tz - position.z, length = Math.hypot(dx, dz); if (length < .01) return;
    const speed = Math.min((distance > 12 ? 10.5 : 7.4) * dt, length), beforeX = position.x, beforeZ = position.z;
    move(position, dx / length * speed, dz / length * speed, .4); advisor.moving = Math.hypot(position.x - beforeX, position.z - beforeZ) > .002;
    const desired = Math.atan2(dx, dz); advisor.actor.root.rotation.y += Math.atan2(Math.sin(desired - advisor.actor.root.rotation.y), Math.cos(desired - advisor.actor.root.rotation.y)) * Math.min(1, dt * 10);
  };
  const updateCompanions = (dt: number) => {
    for (const advisor of advisors) {
      advisor.moving = false; advisor.cooldown = Math.max(0, advisor.cooldown - dt); advisor.attackTime = Math.max(0, advisor.attackTime - dt);
      const position = advisor.actor.root.position, name = advisor.config.id === 'theron' ? 'Theron' : 'Mira';
      if (advisor.action === 'build') {
        const reserved = advisors.filter(other => other !== advisor).map(other => other.targetPlot);
        let plot = map.plots.find(item => item.id === advisor.targetPlot && !state.buildings.some(building => building.plotId === item.id));
        if (!plot) { advisor.work = 0; plot = map.plots.filter(item => !reserved.includes(item.id) && !state.buildings.some(building => building.plotId === item.id)).sort((a, b) => Math.hypot(a.x - position.x, a.z - position.z) - Math.hypot(b.x - position.x, b.z - position.z))[0]; advisor.targetPlot = plot?.id ?? null; }
        const blueprint = BLUEPRINTS.find(item => item.id === advisor.building)!;
        if (!plot) advisor.description = 'Every plot is occupied';
        else if (!canBuild(state, advisor.building, plot.id)) { advisor.work = 0; advisor.description = `Waiting for materials · ${buildingCostReason(state, advisor.building, plot.id) ?? ''}`; }
        else if (Math.hypot(plot.x - position.x, plot.z - position.z) > 2.8) { advisor.description = `Walking to build ${blueprint.name}`; walkCompanion(advisor, plot.x, plot.z, dt, 2.55); }
        else {
          advisor.work += dt; advisor.description = `Building ${blueprint.name} · ${Math.ceil(Math.max(0, 6 - advisor.work))}s`;
          advisor.actor.root.rotation.y = Math.atan2(plot.x - position.x, plot.z - position.z);
          if (advisor.work >= 6) { completeBuilding(plot.id, advisor.building, name); advisor.work = 0; advisor.targetPlot = null; advisor.route = []; }
        }
      } else if (advisor.action === 'follow' || advisor.action === 'fight') {
        const p = hero.root.position;
        const target = advisor.action === 'fight' ? enemies.filter(enemy => Math.hypot(enemy.actor.root.position.x - p.x, enemy.actor.root.position.z - p.z) < 19).sort((a, b) => a.actor.root.position.distanceToSquared(position) - b.actor.root.position.distanceToSquared(position))[0] : undefined;
        if (target) {
          const targetPosition = target.actor.root.position, range = Math.hypot(targetPosition.x - position.x, targetPosition.z - position.z), ranged = advisor.config.id === 'mira';
          advisor.description = ranged ? 'Covering you with bow fire' : 'Intercepting a raider';
          if (range > (ranged ? 12 : 2.65) || !lineClear(position.x, position.z, targetPosition.x, targetPosition.z, .15)) walkCompanion(advisor, targetPosition.x, targetPosition.z, dt, ranged ? 10 : 2.1);
          else if (advisor.cooldown <= 0) {
            advisor.actor.root.rotation.y = Math.atan2(targetPosition.x - position.x, targetPosition.z - position.z); advisor.attackTime = .42; advisor.cooldown = ranged ? 2.2 : 1.1;
            if (ranged) launchBow(position, targetPosition, state.stage >= 5 ? 2 : 1);
            else { impact(targetPosition.x, targetPosition.z, 1.3, '#f3cb8c'); damageEnemy(target, state.stage >= 5 ? 2 : 1); }
          }
        } else { advisor.description = advisor.action === 'fight' ? 'Following you · watching for raiders' : 'Following you'; walkCompanion(advisor, p.x + (advisor.config.id === 'theron' ? -2.4 : 2.4), p.z + 1.5, dt, 1.1); }
      }
      advisor.actor.animate(visualTime + (advisor.config.id === 'mira' ? 1 : 2.5), advisor.moving ? 1 : 0, false);
      advisor.hammer.visible = advisor.action === 'build' || (advisor.action === 'fight' && advisor.config.id === 'theron'); advisor.bow.visible = advisor.action === 'fight' && advisor.config.id === 'mira';
      if (advisor.rig.arm && (advisor.work > 0 || advisor.attackTime > 0)) {
        advisor.rig.arm.rotation.x = advisor.bow.visible ? -1.3 : -1.25 + Math.sin(visualTime * 14) * 1.15; advisor.rig.arm.rotation.z = advisor.bow.visible ? -.35 : .28;
        if (advisor.rig.elbow) advisor.rig.elbow.rotation.x = -.45;
      }
      advisor.marker.position.set(position.x, position.y + 3.1 + Math.sin(visualTime * 2) * .12, position.z); advisor.marker.rotation.y = visualTime;
    }
  };
  const updatePrank = (dt: number) => {
    if (prankStage === 0 && elapsed >= 57) {
      prankStage = 1; prankTime = 0; const free = findFree(hero.root.position.x + facingX * 1.8, hero.root.position.z + facingZ * 1.8); prank.position.set(free.x, world.groundHeight(free.x, free.z), free.z); prank.visible = true;
      showHint(state.seed % 2 === 0 ? 'A generous gift! Why is it making sword noises? Move away!' : 'That gift is ticking. The golden circle looks unhealthy. Move!', 4);
    }
    if (prankStage === 1) { prankTime += dt; warningCircle.scale.setScalar(.93 + Math.sin(prankTime * 15) * .08); gift.rotation.y += dt * .8;
      if (prankTime >= 2) { prankStage = 2; prankTime = 0; warningCircle.visible = false; gift.visible = false; giftBand.visible = false;
        if (state.seed % 2 === 0) { spawnEnemy(prank.position.x - 1, prank.position.z); spawnEnemy(prank.position.x + 1, prank.position.z); showHint('Surprise! The gift contained two very rude Greeks.', 5); }
        else { crack.visible = true; if (Math.hypot(hero.root.position.x - prank.position.x, hero.root.position.z - prank.position.z) < 2.65) hurtHero(18); showHint('A minor structural disagreement with the ground.', 4); }
      }
    } else if (prankStage === 2) { prankTime += dt; if (prankTime >= 4) { prank.visible = false; prankStage = 3; } }
  };

  const keyMap: Record<string, keyof typeof movement> = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'backward', ArrowDown: 'backward', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'sprint', ShiftRight: 'sprint' };
  const keydown = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]') || !active()) return;
    const key = keyMap[event.code]; if (key) { movement[key] = true; event.preventDefault(); return; }
    if (['KeyE', 'KeyF', 'Space', 'KeyC', 'KeyQ', 'KeyR'].includes(event.code)) { event.preventDefault(); if (event.repeat) return; if (event.code === 'KeyE') interact(); else if (event.code === 'KeyF' || event.code === 'Space') attack(); else if (event.code === 'KeyC') dodge(); else cycleWeapon(event.code === 'KeyQ' ? -1 : 1); }
  };
  const keyup = (event: KeyboardEvent) => { const key = keyMap[event.code]; if (key) movement[key] = false; };
  const pointerdown = (event: PointerEvent) => { if (event.button !== 0 || !active()) return; drag = true; dragPointer = event.pointerId; dragX = event.clientX; dragY = event.clientY; canvas.setPointerCapture(event.pointerId); };
  const pointermove = (event: PointerEvent) => { if (!drag || paused || event.pointerId !== dragPointer) return; yaw -= (event.clientX - dragX) * .006; pitch = clamp(pitch + (event.clientY - dragY) * .004, .35, 1.02); dragX = event.clientX; dragY = event.clientY; };
  const pointerup = () => { drag = false; dragPointer = -1; };
  const wheel = (event: WheelEvent) => { if (!active()) return; event.preventDefault(); distance = clamp(distance + event.deltaY * .015, 18, 44); };
  const onBlur = () => pause(), onVisibility = () => { if (document.hidden) pause(); };
  window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', onBlur); document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('pointerdown', pointerdown); canvas.addEventListener('pointermove', pointermove); canvas.addEventListener('pointerup', pointerup); canvas.addEventListener('pointercancel', pointerup); canvas.addEventListener('wheel', wheel, { passive: false });
  const resize = () => { const rect = canvas.getBoundingClientRect(), width = Math.max(1, rect.width), height = Math.max(1, rect.height); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();

  const simulate = (dt: number) => {
    if (paused || state.phase === 'ended') return;
    visualTime += dt;
    if (state.phase === 'playing') {
      elapsed += dt; if (hint && elapsed >= hintUntil) hint = '';
      transition(advanceRun(state, dt));
      if (state.phase === 'playing') {
        yaw -= controller.lookX * dt * 1.8; pitch = clamp(pitch + controller.lookY * dt * 1.1, .35, 1.02);
        let horizontal = Number(movement.right) - Number(movement.left) + controller.x, vertical = Number(movement.forward) - Number(movement.backward) + controller.y;
        const length = Math.hypot(horizontal, vertical); if (length > 1) { horizontal /= length; vertical /= length; }
        const moving = length > .02, sprinting = moving && (movement.sprint || controller.sprint) && stamina > .04;
        stamina = clamp(stamina + dt * (sprinting ? -.12 : .18), 0, 1);
        const speed = sprinting ? 11.5 : 9, dx = horizontal * Math.cos(yaw) - vertical * Math.sin(yaw), dz = -horizontal * Math.sin(yaw) - vertical * Math.cos(yaw);
        if (dashRemaining > 0) { const dashStep = Math.min(dt, dashRemaining); move(hero.root.position, dashX * 18 * dashStep, dashZ * 18 * dashStep); dashRemaining = Math.max(0, dashRemaining - dt); }
        else if (moving) { move(hero.root.position, dx * speed * dt, dz * speed * dt); facingX = dx / Math.hypot(dx, dz); facingZ = dz / Math.hypot(dx, dz); const desired = Math.atan2(dx, dz); hero.root.rotation.y += Math.atan2(Math.sin(desired - hero.root.rotation.y), Math.cos(desired - hero.root.rotation.y)) * Math.min(1, dt * 14); stepTime += dt; if (stepTime > (sprinting ? .24 : .34)) { sound('step'); stepTime = 0; } }
        walking = THREE.MathUtils.damp(walking, Math.min(1, length), 10, dt); hero.animate(visualTime, walking, sprinting);
        updateCombat(dt);
        if (state.phase === 'playing') {
          updateCompanions(dt); updateEffects(dt);
          if (!raidWarned && nextRaidAt - elapsed <= 4 && nextRaidAt < RUN_DURATION) { raidWarned = true; showHint(`Raid ${wave + 1} in ${Math.ceil(Math.max(0, nextRaidAt - elapsed))} seconds. Find cover or a watchtower.`, 4); }
          if (elapsed >= nextRaidAt) {
            // A stalled frame skips missed raid slots instead of dumping many armies at once.
            const due = Math.floor((elapsed - nextRaidAt) / difficulty.interval) + 1;
            wave += due; nextRaidAt += difficulty.interval * due; raidWarned = false; spawnWave();
          }
          updatePrank(dt);
          for (const [id, ready] of nodeReady) if (elapsed >= ready) { nodeReady.delete(id); world.setNodeAvailable(id, true); }
          updateNearest();
        }
        slash.visible = attackVisual > 0 && attackKind === 'sword' && state.phase === 'playing'; slash.position.copy(hero.root.position).add(new THREE.Vector3(0, .85, 0)); slash.rotation.z = -hero.root.rotation.y + .4 - attackVisual * 8; slashMaterial.opacity = attackVisual / .28 * .85;
        if (swordArm && attackVisual > 0) {
          swordArm.rotation.x = attackKind === 'hammer' ? -1.3 + Math.cos(attackVisual / .48 * Math.PI) * 1.2 : -1.15;
          swordArm.rotation.z = attackKind === 'bow' ? -.4 : attackKind === 'hammer' ? .25 : -.8 + (1 - attackVisual / .28) * 2; if (swordElbow) swordElbow.rotation.x = -.4;
        }
        dodgeRing.visible = invulnerable > 0 && state.phase === 'playing'; dodgeRing.position.copy(hero.root.position).add(new THREE.Vector3(0, .08, 0)); dodgeRing.scale.setScalar(1 + dashRemaining * 2);
        hero.root.rotation.z = hitFlash > 0 ? Math.sin(hitFlash * 40) * .06 : 0;
      }
    } else if (state.phase === 'disaster') { transition(advanceRun(state, dt)); }
    else hero.animate(visualTime, 0, false);
    // Apply the last legend frame once, so the frozen result shows the complete collapse.
    if (state.outcome !== 'fallen') {
      if (state.phase !== 'playing') for (const { actor, marker, config } of advisors) { actor.animate(visualTime + (config.id === 'mira' ? 1 : 2.5), 0, false); marker.position.set(actor.root.position.x, actor.root.position.y + 3.1 + Math.sin(visualTime * 2) * .12, actor.root.position.z); marker.rotation.y = visualTime; }
      world.update(visualTime, dt, state, elapsed < markedUntil); waterUniforms.uTime.value = visualTime;
      const dusk = state.phase === 'disaster' || state.outcome === 'legend' ? clamp(state.finaleTime / 5, 0, .8) : clamp((RUN_DURATION - state.timeLeft - 85) / 90, 0, .3);
      skyMaterial.uniforms.dusk.value = dusk; waterUniforms.uDusk.value = dusk; sun.intensity = 3.7 - dusk * 1.4; sun.color.set(state.phase === 'disaster' || state.outcome === 'legend' ? '#ffc392' : map.theme === 'desert' ? '#ffdeb0' : '#fff0c8'); ambient.intensity = 2.2 - dusk * .6;
      const attributes = dustGeometry.attributes.position; for (let i = 0; i < attributes.count; i++) { const x = attributes.getX(i) + dt * .12, y = attributes.getY(i) - dt * .055; attributes.setX(i, x > map.bounds.maxX ? map.bounds.minX : x); attributes.setY(i, y < .2 ? 14 : y); } attributes.needsUpdate = true;
    }
  };
  const animate = (now: number) => {
    if (destroyed) return;
    const rawDelta = Math.max(0, (now - lastFrame) / 1000);
    const frameDelta = Math.min(rawDelta, .25); lastFrame = now;
    if (!paused && state.phase !== 'ended') {
      const boundary = state.phase === 'playing' ? state.timeLeft : state.phase === 'disaster' ? FINALE_DURATION - state.finaleTime : Infinity;
      if (rawDelta >= boundary) {
        // Check the real deadline before combat. Discard time beyond this boundary
        // so a slow frame cannot skip any of the next nine-second horse reveal.
        if (state.phase === 'playing') elapsed += state.timeLeft;
        visualTime += boundary; transition(advanceRun(state, rawDelta));
        world.update(visualTime, 0, state, elapsed < markedUntil);
      } else {
        const physicsTime = Math.min(rawDelta, .24), skipped = rawDelta - physicsTime;
        if (skipped > 0 && state.phase !== 'ready') {
          // Rules and resource/production clocks use all active wall time. Movement
          // has a bounded catch-up budget; a stalled frame never causes a damage burst.
          visualTime += skipped;
          if (state.phase === 'playing') {
            elapsed += skipped; attackRemaining = Math.max(0, attackRemaining - skipped); dodgeRemaining = Math.max(0, dodgeRemaining - skipped);
            attackVisual = Math.max(0, attackVisual - skipped); invulnerable = Math.max(0, invulnerable - skipped); dashRemaining = Math.max(0, dashRemaining - skipped); hitFlash = Math.max(0, hitFlash - skipped);
            enemies.forEach(enemy => { enemy.cooldown = Math.max(0, enemy.cooldown - skipped); });
          }
          transition(advanceRun(state, skipped));
        }
        let remaining = physicsTime;
        for (let substep = 0; substep < 6 && remaining > .000001; substep++) {
          const previousPhase: RunState['phase'] = state.phase, dt = Math.min(.04, remaining); simulate(dt); remaining -= dt; if (state.phase !== previousPhase) break;
        }
      }
    }
    if (!paused && state.phase !== 'ended') {
      if (state.phase === 'ready') { const angle = .27 + Math.sin(visualTime * .07) * .06, extent = Math.max(map.bounds.maxX - map.bounds.minX, map.bounds.maxZ - map.bounds.minZ); cameraPosition.set(Math.sin(angle) * extent * .9, extent * .65, Math.cos(angle) * extent * .9); camera.position.lerp(cameraPosition, 1 - Math.exp(-frameDelta * 2)); camera.lookAt((map.bounds.minX + map.bounds.maxX) / 2, 1.2, (map.bounds.minZ + map.bounds.maxZ) / 2); }
      else if (state.phase === 'disaster') { const angle = .23 + state.finaleTime * .105, extent = Math.max(map.bounds.maxX - map.bounds.minX, map.bounds.maxZ - map.bounds.minZ); cameraPosition.set(Math.sin(angle) * extent * .79, extent * .56, Math.cos(angle) * extent * .79); camera.position.lerp(cameraPosition, 1 - Math.exp(-frameDelta * 1.4)); temp.set(map.gate.x, 2, (map.gate.z + map.spawn.z) * .2); camera.lookAt(temp); }
      else { temp.copy(hero.root.position).add(new THREE.Vector3(-Math.sin(yaw) * 1.6, 1.3, -Math.cos(yaw) * 1.6)); followTarget.lerp(temp, 1 - Math.exp(-frameDelta * 7)); cameraPosition.set(followTarget.x + Math.sin(yaw) * Math.cos(pitch) * distance, followTarget.y + Math.sin(pitch) * distance, followTarget.z + Math.cos(yaw) * Math.cos(pitch) * distance); camera.position.lerp(cameraPosition, 1 - Math.exp(-frameDelta * 6)); camera.lookAt(followTarget); }
    }
    renderer.render(scene, camera); updateElapsed += frameDelta; if (updateElapsed >= .1) { emit(); updateElapsed = 0; } frame = requestAnimationFrame(animate);
  };
  world.sync(state); camera.position.set(26, 65, 88); camera.lookAt((map.bounds.minX + map.bounds.maxX) / 2, 1.2, (map.bounds.minZ + map.bounds.maxZ) / 2); frame = requestAnimationFrame(animate);
  queueMicrotask(() => { if (!destroyed) { emit(); callbacks.onReady(); } });
  return { start, pause, resume, interact, attack, dodge, selectBuilding, cycleBuilding, buildAtPlot, selectWeapon, cycleWeapon, commandCompanion,
    // Advisors speak in a paused dialog; the reveal clock begins when play resumes.
    markSupplies: () => { if (destroyed || state.phase !== 'playing') return; markedUntil = elapsed + 10; showEvent('oracle', 'Resource deposits are marked for ten seconds.'); },
    setInput: (action, pressed) => { if (active() || !pressed) movement[action] = pressed; },
    setControllerInput: input => { const axis = (value: number) => Number.isFinite(value) ? clamp(value, -1, 1) : 0; controller = active() ? { x: axis(input.x), y: axis(input.y), lookX: axis(input.lookX), lookY: axis(input.lookY), sprint: Boolean(input.sprint) } : neutralController(); },
    setMuted: muted => { audioMuted = muted; if (muted && audio?.state === 'running') void audio.suspend(); else if (!muted && !paused && audio?.state === 'suspended') void audio.resume(); },
    destroy: () => {
      if (destroyed) return; destroyed = true; cancelAnimationFrame(frame); observer.disconnect(); clearInput(); clearEnemies(); clearArrows(); clearEffects();
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', onBlur); document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', pointerdown); canvas.removeEventListener('pointermove', pointermove); canvas.removeEventListener('pointerup', pointerup); canvas.removeEventListener('pointercancel', pointerup); canvas.removeEventListener('wheel', wheel);
      disposeObject(scene); world.dispose(); marbleTexture.dispose(); skyTexture.dispose(); sun.shadow.map?.dispose(); renderer.dispose(); if (audio) void audio.close();
    }
  };
}
