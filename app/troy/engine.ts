import * as THREE from 'three';
import { createCharacter } from '../oracle/characters';
import { ADVISORS, BLUEPRINTS, FINALE_DURATION, PLOTS, RESOURCE_NODES, RUN_DURATION } from './config';
import { advanceRun, buildAt, buildingCostReason, canBuild, createRun, gather, getMissions, recordKill, takeDamage } from './rules';
import type { BuildingKind, ControllerInput, EndingKind, Interaction, RunState, TroyCallbacks, TroyEngine } from './types';
import { createTroyWorld } from './world';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const ATTACK_COOLDOWN = .42, DODGE_COOLDOWN = 2.4, HERO_RADIUS = .38;
const RESOURCE_NAMES = { wood: 'timber', stone: 'stone', bronze: 'bronze' };
type Collider = { x: number; z: number; w: number; d: number };

/** Shared by walking, dashing, construction relocation, and enemy navigation. */
export function canOccupyTroyPosition(x: number, z: number, colliders: Collider[], radius = HERO_RADIUS) {
  return Number.isFinite(x) && Number.isFinite(z) && x >= -23 + radius && x <= 23 - radius && z >= -18 + radius && z <= 19 - radius
    && !colliders.some(c => Math.abs(x - c.x) < c.w / 2 + radius && Math.abs(z - c.z) < c.d / 2 + radius);
}

/** Dispose removed objects immediately, not only objects still attached at teardown. */
function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) geometries.add(object.geometry);
    if ('material' in object) {
      const material = object.material as THREE.Material | THREE.Material[];
      for (const value of Array.isArray(material) ? material : [material]) {
        materials.add(value);
        for (const property of Object.values(value)) if (property instanceof THREE.Texture) textures.add(property);
      }
    }
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
}

function createRaider() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const bronze = new THREE.MeshStandardMaterial({ color: '#ad7546', metalness: .68, roughness: .44 });
  const cloth = new THREE.MeshStandardMaterial({ color: '#a34030', roughness: .95 });
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
  const blade = part(weapon, new THREE.BoxGeometry(.075, .78, .04), bronze, 0, -.26, .42); blade.rotation.x = Math.PI / 2;
  const shield = part(body, new THREE.CylinderGeometry(.4, .4, .065, 14), bronze, -.37, 1.25, .25); shield.rotation.x = Math.PI / 2;
  const boss = part(body, new THREE.SphereGeometry(.12, 8, 6), iron, -.37, 1.25, .3); boss.scale.z = .5;
  const telegraphMaterial = new THREE.MeshBasicMaterial({ color: '#ed573e', transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false });
  const telegraph = new THREE.Mesh(new THREE.RingGeometry(.2, 1.85, 40), telegraphMaterial); telegraph.rotation.x = -Math.PI / 2; telegraph.position.y = .06; telegraph.visible = false; root.add(telegraph);
  return { root, telegraph, animate(time: number, moving: boolean, winding: number, hit: number) {
    const gait = Math.sin(time * 9); legs[0].rotation.x = moving ? gait * .6 : 0; legs[1].rotation.x = moving ? -gait * .6 : 0;
    body.position.y = moving ? Math.abs(gait) * .055 : 0; body.rotation.z = hit > 0 ? Math.sin(hit * 45) * .16 : 0;
    weapon.rotation.x = winding > 0 ? -1.8 * (1 - winding / .7) : -.2;
    telegraph.visible = winding > 0; telegraph.scale.setScalar(winding > 0 ? .5 + .5 * (1 - winding / .7) : 1);
    telegraphMaterial.opacity = .3 + .35 * Math.sin(time * 17) ** 2;
  } };
}

export function createTroyGame(canvas: HTMLCanvasElement, callbacks: TroyCallbacks, previousEnding?: EndingKind): TroyEngine {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#c4d6cf'); scene.fog = new THREE.FogExp2('#cbd9ce', .0048);
  const camera = new THREE.PerspectiveCamera(47, 1, .15, 420);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const ambient = new THREE.HemisphereLight('#d5e9e9', '#a99472', 2.2); scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff0c8', 3.7); sun.position.set(-27, 42, 18); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -33, right: 33, top: 32, bottom: -32, near: .5, far: 120 }); sun.shadow.normalBias = .055; sun.shadow.bias = -.00015; scene.add(sun);
  const fill = new THREE.DirectionalLight('#a5cfd8', .45); fill.position.set(15, 15, -20); scene.add(fill);
  const world = createTroyWorld(); scene.add(world.root);
  const hero = createCharacter('lyra'); hero.root.position.set(0, world.groundHeight(0, 12), 12); hero.root.rotation.y = Math.PI; scene.add(hero.root);
  const advisors = ADVISORS.map(config => {
    const actor = createCharacter(config.id); actor.root.position.set(config.x, world.groundHeight(config.x, config.z), config.z); actor.root.rotation.y = config.id === 'mira' ? .5 : -.5; scene.add(actor.root);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(.18), new THREE.MeshBasicMaterial({ color: config.id === 'mira' ? '#bde9c5' : '#f4cb82' })); marker.position.set(config.x, 3.1, config.z); scene.add(marker);
    return { config, actor, marker };
  });
  // Add a drawn blade to Lyra's existing right-hand joint; the original rig stays intact.
  const heroRig = hero.root.children[0] as THREE.Group;
  const torso = heroRig.children.find(child => child instanceof THREE.Group && Math.abs(child.position.y - 1.27) < .01) as THREE.Group;
  const swordArm = torso?.children.find(child => child instanceof THREE.Group && child.position.x > .28 && child.position.y > .35) as THREE.Group | undefined;
  const swordElbow = swordArm?.children.find(child => child instanceof THREE.Group) as THREE.Group | undefined;
  const swordHand = swordElbow?.children.find(child => child instanceof THREE.Group) as THREE.Group | undefined;
  const sword = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(.07, .035, .9), new THREE.MeshStandardMaterial({ color: '#efd293', metalness: .8, roughness: .3 })); blade.position.z = .4; sword.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(.24, .065, .06), new THREE.MeshStandardMaterial({ color: '#987036', metalness: .65, roughness: .45 })); guard.position.z = -.04; sword.add(guard); sword.position.y = -.04;
  (swordHand ?? hero.root).add(sword);
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
  let state: RunState = { ...createRun(Date.now() >>> 0, previousEnding), phase: 'ready' };
  let selected: BuildingKind = 'house', nearest: Interaction | null = null;
  let elapsed = 0, visualTime = 0, updateElapsed = 0, markedUntil = 0, lastFrame = performance.now(), frame = 0;
  let yaw = .2, pitch = .69, distance = 25, drag = false, dragPointer = -1, dragX = 0, dragY = 0;
  let stamina = 1, walking = 0, stepTime = 0, attackRemaining = 0, attackVisual = 0, dodgeRemaining = 0, invulnerable = 0, dashRemaining = 0, hitFlash = 0;
  let dashX = 0, dashZ = -1, facingX = 0, facingZ = -1, wave = 0, hint = '', hintUntil = 0, prankStage = 0, prankTime = 0, navTime = 0;
  let audioMuted = true, audio: AudioContext | null = null;
  const movement = { forward: false, backward: false, left: false, right: false, sprint: false };
  const neutralController = (): ControllerInput => ({ x: 0, y: 0, lookX: 0, lookY: 0, sprint: false });
  let controller = neutralController();
  const nodeReady = new Map<string, number>(), towerReady = new Map<string, number>();
  const followTarget = hero.root.position.clone().add(new THREE.Vector3(0, 1.2, -1.6));
  const cameraPosition = new THREE.Vector3(), temp = new THREE.Vector3();
  type Enemy = { actor: ReturnType<typeof createRaider>; hp: number; cooldown: number; windup: number; hit: number; id: number };
  const enemies: Enemy[] = []; let enemySerial = 0, randomValue = state.seed;
  const arrows: { mesh: THREE.Mesh; start: THREE.Vector3; end: THREE.Vector3; age: number }[] = [];
  const prank = new THREE.Group(); scene.add(prank); prank.visible = false;
  const warningMaterial = new THREE.MeshBasicMaterial({ color: '#ffd25f', transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false });
  const warningCircle = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.65, 48), warningMaterial); warningCircle.rotation.x = -Math.PI / 2; warningCircle.position.y = .08; prank.add(warningCircle);
  const gift = new THREE.Mesh(new THREE.BoxGeometry(1.1, .9, 1.1), new THREE.MeshStandardMaterial({ color: '#b7904b', roughness: .9 })); gift.position.y = .5; gift.castShadow = true; prank.add(gift);
  const giftBand = new THREE.Mesh(new THREE.BoxGeometry(.13, .94, 1.14), new THREE.MeshStandardMaterial({ color: '#efd090', metalness: .5, roughness: .5 })); giftBand.position.y = .5; prank.add(giftBand);
  const crack = new THREE.Mesh(new THREE.RingGeometry(.12, 2.7, 9), new THREE.MeshBasicMaterial({ color: '#6b382a', transparent: true, opacity: .85, side: THREE.DoubleSide })); crack.rotation.x = -Math.PI / 2; crack.position.y = .045; crack.visible = false; prank.add(crack);

  const marbleTexture = new THREE.TextureLoader().load('/oracle/marble.jpg', texture => {
    if (destroyed) { texture.dispose(); return; }
    texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(9, 8); texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    world.root.traverse(object => { if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial && /paving/i.test(object.material.name)) { object.material.map?.dispose(); object.material.map = texture; object.material.needsUpdate = true; } });
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
    callbacks.onUpdate({ ...state, materials: { ...state.materials }, buildings: state.buildings.map(building => ({ ...building })), completedMissions: [...state.completedMissions], paused, selected, nearest: nearest ? { ...nearest } : null, player: { x: hero.root.position.x, z: hero.root.position.z }, stamina: stamina * 100, enemies: enemies.length, attackCooldown: clamp(attackRemaining / ATTACK_COOLDOWN, 0, 1), dodgeCooldown: clamp(dodgeRemaining / DODGE_COOLDOWN, 0, 1), wave, hint });
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
      clearInput(); nearest = null; clearArrows();
      if (state.phase === 'disaster') {
        lastEnding = state.ending; hint = 'A gift from the Greeks. What could possibly go wrong?'; hintUntil = Infinity; slash.visible = false; dodgeRing.visible = false; prank.visible = false;
        enemies.forEach(enemy => { enemy.actor.telegraph.visible = false; });
        showEvent('warning', 'Time is up. Troy has accepted a very suspicious gift.');
      }
      if (state.phase === 'ended') {
        lastEnding = state.ending; hint = ''; paused = false; slash.visible = false; dodgeRing.visible = false; prank.visible = false; enemies.forEach(enemy => { enemy.actor.telegraph.visible = false; });
        showEvent(state.outcome === 'fallen' ? 'warning' : 'ending', state.outcome === 'fallen' ? 'Lyra has fallen. Your legend deserves another try.' : 'Troy fell. Your legend survived.');
      }
      emit();
    }
  };
  const canMove = (x: number, z: number, radius = HERO_RADIUS) => canOccupyTroyPosition(x, z, world.colliders, radius);
  const findFree = (x: number, z: number, radius = HERO_RADIUS) => {
    const sx = clamp(x, -22.4, 22.4), sz = clamp(z, -17.4, 18.4);
    if (canMove(sx, sz, radius)) return { x: sx, z: sz };
    for (let ring = .5; ring < 12; ring += .5) for (let step = 0; step < 24; step++) {
      const angle = step / 24 * Math.PI * 2, nx = sx + Math.sin(angle) * ring, nz = sz + Math.cos(angle) * ring;
      if (canMove(nx, nz, radius)) return { x: nx, z: nz };
    }
    return { x: 0, z: 12 };
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
    const resources = RESOURCE_NODES.filter(node => Math.hypot(node.x - p.x, node.z - p.z) < 2.3).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const node = resources.find(item => (nodeReady.get(item.id) ?? 0) <= elapsed);
    if (node) { nearest = { id: node.id, kind: 'resource', title: `Collect ${RESOURCE_NAMES[node.resource]}`, description: `+${node.amount} ${RESOURCE_NAMES[node.resource]} · replenishes in 7 seconds`, available: true }; return; }
    const plot = PLOTS.filter(item => !state.buildings.some(building => building.plotId === item.id) && Math.hypot(item.x - p.x, item.z - p.z) < 3.8).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (plot) {
      const blueprint = BLUEPRINTS.find(item => item.id === selected)!;
      const cost = Object.entries(blueprint.cost).filter(([, count]) => count > 0).map(([key, count]) => `${count} ${RESOURCE_NAMES[key as keyof typeof RESOURCE_NAMES]}`).join(' · ');
      const reason = buildingCostReason(state, selected, plot.id);
      nearest = { id: plot.id, kind: 'plot', title: `Build ${blueprint.name}`, description: reason ? `${cost} · ${reason}` : `${cost} · +${blueprint.points} points`, available: canBuild(state, selected, plot.id) }; return;
    }
    const advisor = advisors.filter(item => Math.hypot(item.config.x - p.x, item.config.z - p.z) < 2.8).sort((a, b) => Math.hypot(a.config.x - p.x, a.config.z - p.z) - Math.hypot(b.config.x - p.x, b.config.z - p.z))[0];
    if (advisor) { nearest = { id: advisor.config.id, kind: 'advisor', title: `Talk to ${advisor.config.id === 'mira' ? 'Mira' : 'Theron'}`, description: advisor.config.id === 'mira' ? 'The healer has a thought about that wooden horse.' : 'A builder’s advice for a very short golden age.', available: true, character: advisor.config.id }; return; }
    if (resources[0]) { const remaining = Math.ceil((nodeReady.get(resources[0].id) ?? 0) - elapsed); nearest = { id: resources[0].id, kind: 'resource', title: 'Supplies replenishing', description: `${RESOURCE_NAMES[resources[0].resource]} returns in ${remaining}s`, available: false }; }
  };
  const interact = () => {
    if (!active()) return; updateNearest(); if (!nearest) return;
    if (!nearest.available) { showEvent('notice', nearest.description); return; }
    if (nearest.kind === 'advisor' && nearest.character) { callbacks.onTalk(nearest.character); return; }
    if (nearest.kind === 'resource') {
      const node = RESOURCE_NODES.find(item => item.id === nearest!.id); if (!node || (nodeReady.get(node.id) ?? 0) > elapsed) return;
      transition(gather(state, node.resource, node.amount)); nodeReady.set(node.id, elapsed + 7); world.setNodeAvailable(node.id, false); sound('pickup'); showEvent('pickup', `+${node.amount} ${RESOURCE_NAMES[node.resource]}`);
    } else {
      const next = buildAt(state, nearest.id, selected); if (next.buildings.length === state.buildings.length) return;
      transition(next); world.sync(state); navTime = 0;
      const p = hero.root.position; if (!canMove(p.x, p.z)) { const free = findFree(p.x, p.z); p.set(free.x, world.groundHeight(free.x, free.z), free.z); }
      for (const enemy of enemies) { const p = enemy.actor.root.position; if (!canMove(p.x, p.z, .4)) { const free = findFree(p.x, p.z, .4); p.set(free.x, world.groundHeight(free.x, free.z), free.z); } }
      const blueprint = BLUEPRINTS.find(item => item.id === selected)!; sound('build'); showEvent('build', `${blueprint.name} completed · +${blueprint.points} points`);
    }
    updateNearest(); emit();
  };
  const damageEnemy = (enemy: Enemy, amount: number) => {
    if (enemy.hp <= 0 || state.phase !== 'playing') return; enemy.hp -= amount; enemy.hit = .25;
    if (enemy.hp <= 0) { const index = enemies.indexOf(enemy); if (index >= 0) enemies.splice(index, 1); scene.remove(enemy.actor.root); disposeObject(enemy.actor.root); transition(recordKill(state)); showEvent('combat', 'Raider defeated · +35 points'); }
  };
  const attack = () => {
    if (!active() || attackRemaining > 0) return; attackRemaining = ATTACK_COOLDOWN; attackVisual = .28; sound('sword');
    const p = hero.root.position, targets = enemies.filter(enemy => enemy.actor.root.position.distanceTo(p) < 3.5).sort((a, b) => a.actor.root.position.distanceToSquared(p) - b.actor.root.position.distanceToSquared(p)).slice(0, 2);
    if (targets[0]) { const dx = targets[0].actor.root.position.x - p.x, dz = targets[0].actor.root.position.z - p.z; hero.root.rotation.y = Math.atan2(dx, dz); facingX = Math.sin(hero.root.rotation.y); facingZ = Math.cos(hero.root.rotation.y); }
    targets.forEach(enemy => damageEnemy(enemy, 1)); emit();
  };
  const dodge = () => {
    if (!active() || dodgeRemaining > 0) return;
    let horizontal = Number(movement.right) - Number(movement.left) + controller.x, vertical = Number(movement.forward) - Number(movement.backward) + controller.y;
    const length = Math.hypot(horizontal, vertical); if (length > .05) { horizontal /= length; vertical /= length; dashX = horizontal * Math.cos(yaw) - vertical * Math.sin(yaw); dashZ = -horizontal * Math.sin(yaw) - vertical * Math.cos(yaw); } else { dashX = facingX; dashZ = facingZ; }
    dodgeRemaining = DODGE_COOLDOWN; invulnerable = .4; dashRemaining = .25; sound('sword'); emit();
  };
  const selectBuilding = (kind: BuildingKind) => { if (!active() || !BLUEPRINTS.some(item => item.id === kind)) return; selected = kind; updateNearest(); emit(); };
  const cycleBuilding = (direction: number) => { if (!active()) return; const index = BLUEPRINTS.findIndex(item => item.id === selected); selectBuilding(BLUEPRINTS[(index + (direction < 0 ? -1 : 1) + BLUEPRINTS.length) % BLUEPRINTS.length].id); };
  const pause = () => { if (destroyed || (state.phase !== 'playing' && state.phase !== 'disaster')) return; paused = true; clearInput(); if (audio?.state === 'running') void audio.suspend(); emit(); };
  const resume = () => { if (destroyed || !paused || (state.phase !== 'playing' && state.phase !== 'disaster')) return; paused = false; lastFrame = performance.now(); if (!audioMuted && audio?.state === 'suspended') void audio.resume(); emit(); };
  const clearEnemies = () => { for (const enemy of enemies) { scene.remove(enemy.actor.root); disposeObject(enemy.actor.root); } enemies.length = 0; };
  const clearArrows = () => { for (const arrow of arrows) { scene.remove(arrow.mesh); disposeObject(arrow.mesh); } arrows.length = 0; };
  const start = () => {
    if (destroyed) return;
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0; state = createRun(seed, lastEnding); randomValue = seed;
    paused = false; selected = 'house'; nearest = null; clearInput(); clearEnemies(); clearArrows(); nodeReady.clear(); towerReady.clear(); world.reset(); world.sync(state);
    elapsed = 0; visualTime = 0; updateElapsed = 0; markedUntil = 0; stamina = 1; walking = 0; stepTime = 0; attackRemaining = 0; attackVisual = 0; dodgeRemaining = 0; invulnerable = 0; dashRemaining = 0; hitFlash = 0;
    facingX = 0; facingZ = -1; dashX = 0; dashZ = -1; wave = 0; hint = ''; hintUntil = 0; prankStage = 0; prankTime = 0; navTime = 0; enemySerial = 0;
    hero.root.position.set(0, world.groundHeight(0, 12), 12); hero.root.rotation.set(0, Math.PI, 0); hero.root.visible = true;
    yaw = .13; pitch = .69; distance = 24; followTarget.copy(hero.root.position).add(new THREE.Vector3(0, 1.2, -1.6));
    slash.visible = false; dodgeRing.visible = false; prank.visible = false; crack.visible = false; gift.visible = true; giftBand.visible = true; warningCircle.visible = true;
    skyMaterial.uniforms.dusk.value = 0; waterUniforms.uDusk.value = 0; sun.intensity = 3.7; sun.color.set('#fff0c8'); ambient.intensity = 2.2; scene.fog = new THREE.FogExp2('#cbd9ce', .0048);
    updateNearest(); emit(); sound('start'); lastFrame = performance.now();
  };

  // One flood field serves every raider. It prevents enemies getting stranded behind buildings.
  const NAV_W = 45, NAV_H = 36, nav = new Int16Array(NAV_W * NAV_H);
  const navIndex = (x: number, z: number) => clamp(Math.round(z) + 17, 0, NAV_H - 1) * NAV_W + clamp(Math.round(x) + 22, 0, NAV_W - 1);
  const rebuildNavigation = () => {
    nav.fill(-1); const queue: number[] = [], p = hero.root.position, start = navIndex(p.x, p.z); nav[start] = 0; queue.push(start);
    for (let head = 0; head < queue.length; head++) { const index = queue[head], x = index % NAV_W, z = Math.floor(index / NAV_W);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nx >= NAV_W || nz < 0 || nz >= NAV_H) continue; const next = nz * NAV_W + nx; if (nav[next] !== -1 || !canMove(nx - 22, nz - 17, .48)) continue; nav[next] = nav[index] + 1; queue.push(next); }
    }
  };
  const lineClear = (x: number, z: number, tx: number, tz: number) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(tx - x, tz - z) / .5)); for (let i = 1; i <= steps; i++) if (!canMove(x + (tx - x) * i / steps, z + (tz - z) * i / steps, .43)) return false; return true;
  };
  const spawnEnemy = (x: number, z: number) => {
    if (enemies.length >= 7) return; const p = findFree(x, z, .43), actor = createRaider(); actor.root.position.set(p.x, world.groundHeight(p.x, p.z), p.z); scene.add(actor.root); enemies.push({ actor, hp: 2, cooldown: .7 + random() * .7, windup: 0, hit: 0, id: enemySerial++ });
  };
  const spawnWave = (count: number) => {
    const side = random() < .5 ? -1 : 1; for (let i = 0; i < count; i++) spawnEnemy(side * 21.3, -13 + random() * 29);
    showHint(`Raiders at the ${side < 0 ? 'western' : 'eastern'} gate! Draw your sword.`, 6);
  };
  const hurtHero = (amount: number) => {
    if (state.phase !== 'playing' || invulnerable > 0) return; transition(takeDamage(state, amount)); hitFlash = .32; invulnerable = .32; sound('damage'); emit();
  };
  const updateCombat = (dt: number) => {
    attackRemaining = Math.max(0, attackRemaining - dt); attackVisual = Math.max(0, attackVisual - dt); dodgeRemaining = Math.max(0, dodgeRemaining - dt); invulnerable = Math.max(0, invulnerable - dt); hitFlash = Math.max(0, hitFlash - dt);
    navTime -= dt; if (navTime <= 0) { rebuildNavigation(); navTime = .55; }
    const p = hero.root.position;
    for (const enemy of [...enemies]) {
      if (state.phase !== 'playing') break;
      const position = enemy.actor.root.position, dx = p.x - position.x, dz = p.z - position.z, range = Math.hypot(dx, dz); enemy.hit = Math.max(0, enemy.hit - dt); enemy.cooldown = Math.max(0, enemy.cooldown - dt); let moving = false;
      if (enemy.windup > 0) { enemy.windup = Math.max(0, enemy.windup - dt); if (enemy.windup === 0) { if (range < 2.15) hurtHero(14); enemy.cooldown = 1.5; } }
      else if (range < 1.75 && enemy.cooldown <= 0) { enemy.windup = .7; }
      else if (range > 1.3) {
        let tx = p.x, tz = p.z;
        if (!lineClear(position.x, position.z, tx, tz)) {
          const cx = Math.round(position.x), cz = Math.round(position.z); let best = Infinity;
          for (let nx = cx - 1; nx <= cx + 1; nx++) for (let nz = cz - 1; nz <= cz + 1; nz++) {
            if (!canMove(nx, nz, .45) || !lineClear(position.x, position.z, nx, nz)) continue;
            const score = nav[navIndex(nx, nz)]; if (score >= 0 && score + Math.hypot(nx - position.x, nz - position.z) * .1 < best) { best = score + Math.hypot(nx - position.x, nz - position.z) * .1; tx = nx; tz = nz; }
          }
        }
        const distance = Math.hypot(tx - position.x, tz - position.z); if (distance > .08) {
          let vx = (tx - position.x) / distance, vz = (tz - position.z) / distance;
          for (const other of enemies) if (other !== enemy) { const ox = position.x - other.actor.root.position.x, oz = position.z - other.actor.root.position.z, gap = Math.hypot(ox, oz); if (gap > .01 && gap < .85) { vx += ox / gap * (.85 - gap) * 1.5; vz += oz / gap * (.85 - gap) * 1.5; } }
          const speed = Math.min(2.6 * dt, distance), length = Math.hypot(vx, vz) || 1; move(position, vx / length * speed, vz / length * speed, .4); moving = true;
        }
      }
      const desired = Math.atan2(dx, dz); enemy.actor.root.rotation.y += Math.atan2(Math.sin(desired - enemy.actor.root.rotation.y), Math.cos(desired - enemy.actor.root.rotation.y)) * Math.min(1, dt * 9);
      enemy.actor.animate(visualTime + enemy.id, moving, enemy.windup, enemy.hit);
    }
    if (state.phase !== 'playing') return;
    for (const building of state.buildings) if (building.kind === 'tower' && (towerReady.get(building.plotId) ?? 0) <= elapsed) {
      const plot = PLOTS.find(item => item.id === building.plotId)!;
      const enemy = enemies.filter(item => Math.hypot(item.actor.root.position.x - plot.x, item.actor.root.position.z - plot.z) < 12).sort((a, b) => Math.hypot(a.actor.root.position.x - plot.x, a.actor.root.position.z - plot.z) - Math.hypot(b.actor.root.position.x - plot.x, b.actor.root.position.z - plot.z))[0];
      if (!enemy) continue; towerReady.set(plot.id, elapsed + 2);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.035, .045, 1.05, 5), new THREE.MeshBasicMaterial({ color: '#ffe7a3' })); const start = new THREE.Vector3(plot.x, 5.1, plot.z), end = enemy.actor.root.position.clone().add(new THREE.Vector3(0, 1.3, 0)); mesh.position.copy(start); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()); scene.add(mesh); arrows.push({ mesh, start, end, age: 0 }); damageEnemy(enemy, 1);
    }
    for (let i = arrows.length - 1; i >= 0; i--) { const arrow = arrows[i]; arrow.age += dt; arrow.mesh.position.lerpVectors(arrow.start, arrow.end, clamp(arrow.age / .3, 0, 1)); arrow.mesh.position.y += Math.sin(clamp(arrow.age / .3, 0, 1) * Math.PI) * .7; if (arrow.age >= .3) { scene.remove(arrow.mesh); disposeObject(arrow.mesh); arrows.splice(i, 1); } }
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
    if (['KeyE', 'KeyF', 'Space', 'KeyC', 'KeyQ', 'KeyR'].includes(event.code)) { event.preventDefault(); if (event.repeat) return; if (event.code === 'KeyE') interact(); else if (event.code === 'KeyF' || event.code === 'Space') attack(); else if (event.code === 'KeyC') dodge(); else cycleBuilding(event.code === 'KeyQ' ? -1 : 1); }
  };
  const keyup = (event: KeyboardEvent) => { const key = keyMap[event.code]; if (key) movement[key] = false; };
  const pointerdown = (event: PointerEvent) => { if (event.button !== 0 || !active()) return; drag = true; dragPointer = event.pointerId; dragX = event.clientX; dragY = event.clientY; canvas.setPointerCapture(event.pointerId); };
  const pointermove = (event: PointerEvent) => { if (!drag || paused || event.pointerId !== dragPointer) return; yaw -= (event.clientX - dragX) * .006; pitch = clamp(pitch + (event.clientY - dragY) * .004, .35, 1.02); dragX = event.clientX; dragY = event.clientY; };
  const pointerup = () => { drag = false; dragPointer = -1; };
  const wheel = (event: WheelEvent) => { if (!active()) return; event.preventDefault(); distance = clamp(distance + event.deltaY * .015, 12, 34); };
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
        stamina = clamp(stamina + dt * (sprinting ? -.17 : .16), 0, 1);
        const speed = sprinting ? 8.2 : 5.5, dx = horizontal * Math.cos(yaw) - vertical * Math.sin(yaw), dz = -horizontal * Math.sin(yaw) - vertical * Math.cos(yaw);
        if (dashRemaining > 0) { const dashStep = Math.min(dt, dashRemaining); move(hero.root.position, dashX * 12 * dashStep, dashZ * 12 * dashStep); dashRemaining = Math.max(0, dashRemaining - dt); }
        else if (moving) { move(hero.root.position, dx * speed * dt, dz * speed * dt); facingX = dx / Math.hypot(dx, dz); facingZ = dz / Math.hypot(dx, dz); const desired = Math.atan2(dx, dz); hero.root.rotation.y += Math.atan2(Math.sin(desired - hero.root.rotation.y), Math.cos(desired - hero.root.rotation.y)) * Math.min(1, dt * 14); stepTime += dt; if (stepTime > (sprinting ? .24 : .34)) { sound('step'); stepTime = 0; } }
        walking = THREE.MathUtils.damp(walking, Math.min(1, length), 10, dt); hero.animate(visualTime, walking, sprinting);
        updateCombat(dt);
        if (state.phase === 'playing') {
          if (wave === 0 && elapsed >= 32) { wave = 1; spawnWave(3); } else if (wave === 1 && elapsed >= 77) { wave = 2; spawnWave(4); }
          updatePrank(dt);
          for (const [id, ready] of nodeReady) if (elapsed >= ready) { nodeReady.delete(id); world.setNodeAvailable(id, true); }
          updateNearest();
        }
        slash.visible = attackVisual > 0 && state.phase === 'playing'; slash.position.copy(hero.root.position).add(new THREE.Vector3(0, .85, 0)); slash.rotation.z = -hero.root.rotation.y + .4 - attackVisual * 8; slashMaterial.opacity = attackVisual / .28 * .85;
        if (swordArm && attackVisual > 0) { swordArm.rotation.x = -1.15; swordArm.rotation.z = -.8 + (1 - attackVisual / .28) * 2; if (swordElbow) swordElbow.rotation.x = -.4; }
        dodgeRing.visible = invulnerable > 0 && state.phase === 'playing'; dodgeRing.position.copy(hero.root.position).add(new THREE.Vector3(0, .08, 0)); dodgeRing.scale.setScalar(1 + dashRemaining * 2);
        hero.root.rotation.z = hitFlash > 0 ? Math.sin(hitFlash * 40) * .06 : 0;
      }
    } else if (state.phase === 'disaster') { transition(advanceRun(state, dt)); }
    else hero.animate(visualTime, 0, false);
    // Apply the last legend frame once, so the frozen result shows the complete collapse.
    if (state.outcome !== 'fallen') {
      for (const { actor, marker, config } of advisors) { actor.animate(visualTime + (config.id === 'mira' ? 1 : 2.5), 0, false); marker.position.y = 3.1 + Math.sin(visualTime * 2) * .12; marker.rotation.y = visualTime; }
      world.update(visualTime, dt, state, elapsed < markedUntil); waterUniforms.uTime.value = visualTime;
      const dusk = state.phase === 'disaster' || state.outcome === 'legend' ? clamp(state.finaleTime / 5, 0, .8) : clamp((RUN_DURATION - state.timeLeft - 85) / 90, 0, .3);
      skyMaterial.uniforms.dusk.value = dusk; waterUniforms.uDusk.value = dusk; sun.intensity = 3.7 - dusk * 1.4; sun.color.set(state.phase === 'disaster' || state.outcome === 'legend' ? '#ffc392' : '#fff0c8'); ambient.intensity = 2.2 - dusk * .6;
      const attributes = dustGeometry.attributes.position; for (let i = 0; i < attributes.count; i++) { const x = attributes.getX(i) + dt * .12, y = attributes.getY(i) - dt * .055; attributes.setX(i, x > 26 ? -26 : x); attributes.setY(i, y < .2 ? 14 : y); } attributes.needsUpdate = true;
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
      if (state.phase === 'ready') { const angle = .27 + Math.sin(visualTime * .07) * .06; cameraPosition.set(Math.sin(angle) * 44, 31, Math.cos(angle) * 42); camera.position.lerp(cameraPosition, 1 - Math.exp(-frameDelta * 2)); camera.lookAt(0, 1.2, 0); }
      else if (state.phase === 'disaster') { const angle = .23 + state.finaleTime * .105; cameraPosition.set(Math.sin(angle) * 39, 24, Math.cos(angle) * 39); camera.position.lerp(cameraPosition, 1 - Math.exp(-frameDelta * 1.4)); temp.set(0, 2, -3); camera.lookAt(temp); }
      else { temp.copy(hero.root.position).add(new THREE.Vector3(-Math.sin(yaw) * 1.6, 1.3, -Math.cos(yaw) * 1.6)); followTarget.lerp(temp, 1 - Math.exp(-frameDelta * 7)); cameraPosition.set(followTarget.x + Math.sin(yaw) * Math.cos(pitch) * distance, followTarget.y + Math.sin(pitch) * distance, followTarget.z + Math.cos(yaw) * Math.cos(pitch) * distance); camera.position.lerp(cameraPosition, 1 - Math.exp(-frameDelta * 6)); camera.lookAt(followTarget); }
    }
    renderer.render(scene, camera); updateElapsed += frameDelta; if (updateElapsed >= .1) { emit(); updateElapsed = 0; } frame = requestAnimationFrame(animate);
  };
  world.sync(state); camera.position.set(14, 31, 40); camera.lookAt(0, 1.2, 0); frame = requestAnimationFrame(animate);
  queueMicrotask(() => { if (!destroyed) { emit(); callbacks.onReady(); } });
  return { start, pause, resume, interact, attack, dodge, selectBuilding, cycleBuilding,
    // Advisors speak in a paused dialog; the reveal clock begins when play resumes.
    markSupplies: () => { if (destroyed || state.phase !== 'playing') return; markedUntil = elapsed + 10; showEvent('oracle', 'Resource deposits are marked for ten seconds.'); },
    setInput: (action, pressed) => { if (active() || !pressed) movement[action] = pressed; },
    setControllerInput: input => { const axis = (value: number) => Number.isFinite(value) ? clamp(value, -1, 1) : 0; controller = active() ? { x: axis(input.x), y: axis(input.y), lookX: axis(input.lookX), lookY: axis(input.lookY), sprint: Boolean(input.sprint) } : neutralController(); },
    setMuted: muted => { audioMuted = muted; if (muted && audio?.state === 'running') void audio.suspend(); else if (!muted && !paused && audio?.state === 'suspended') void audio.resume(); },
    destroy: () => {
      if (destroyed) return; destroyed = true; cancelAnimationFrame(frame); observer.disconnect(); clearInput(); clearEnemies(); clearArrows();
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', onBlur); document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', pointerdown); canvas.removeEventListener('pointermove', pointermove); canvas.removeEventListener('pointerup', pointerup); canvas.removeEventListener('pointercancel', pointerup); canvas.removeEventListener('wheel', wheel);
      disposeObject(scene); world.dispose(); marbleTexture.dispose(); skyTexture.dispose(); sun.shadow.map?.dispose(); renderer.dispose(); if (audio) void audio.close();
    }
  };
}
