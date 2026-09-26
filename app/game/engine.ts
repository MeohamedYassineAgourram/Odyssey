import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  clamp,
  DIRECTIVE_LABELS,
  HAZARD_DAMAGE,
  initialSnapshot,
  LANES,
  missionOutcome,
  SHARD_TARGET,
  type DirectiveEvent,
  type GameDirective,
  type GameSnapshot,
} from "./rules";

export type { GameDirective, GameSnapshot, GamePhase, DirectiveEvent } from "./rules";

export type GameCallbacks = {
  onUpdate(snapshot: GameSnapshot): void;
  onEvent(event: { type: string; message: string }): void;
  onReady(): void;
};

export type GameHandle = {
  start(): void;
  pause(): void;
  resume(): void;
  restart(): void;
  destroy(): void;
  setInput(action: "left" | "right" | "boost", pressed: boolean): void;
  applyDirective(directive: GameDirective): void;
  setMuted(muted: boolean): void;
};

type WorldItem = { group: THREE.Group; kind: "shard" | "hazard"; lane: number; taken: boolean; spin: number };
type Burst = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number };

const PLAYER_Z = 7;
const CYAN = 0x74fce0;
const LIME = 0xe0ff81;
const CORAL = 0xff7775;

/** Everything in the world is procedural; no network or asset loading is needed. */
export function createGame(container: HTMLElement, callbacks: GameCallbacks): GameHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.setAttribute("aria-label", "Echo Shift: 3D ocean expedition. Steer with A and D or the arrow keys. Hold Space to boost.");
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none;";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x55787c, 0.0061);
  const camera = new THREE.PerspectiveCamera(57, 1, 0.1, 600);
  camera.position.set(0, 7.8, 20);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(800, 500), 0.58, 0.65, 0.88);
  composer.addPass(bloom);
  const output = new OutputPass();
  composer.addPass(output);

  const ambient = new THREE.HemisphereLight(0xcbe9e0, 0x172c3f, 2.3);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffd4b0, 3.1);
  sun.position.set(-35, 55, -65);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x61e4da, 1.7);
  fill.position.set(10, 10, 20);
  scene.add(fill);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec3 vDirection;
        void main(){
          vec3 d=normalize(vDirection);
          vec3 horizon=vec3(0.70,0.65,0.57);
          vec3 upper=vec3(0.075,0.17,0.225);
          vec3 col=mix(horizon,upper,smoothstep(-0.08,0.72,d.y));
          float glow=pow(max(0.0,dot(d,normalize(vec3(-0.18,0.07,-1.0)))),28.0);
          col+=vec3(0.17,0.10,0.055)*glow;
          gl_FragColor=vec4(col,1.0);
        }`,
    }),
  );
  scene.add(sky);

  const glowMaterial = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
  const basalt = new THREE.MeshStandardMaterial({ color: 0x203945, roughness: 0.9, metalness: 0.22, flatShading: true });
  const basaltLight = new THREE.MeshStandardMaterial({ color: 0x365962, roughness: 0.85, metalness: 0.12, flatShading: true });
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x192c39, roughness: 0.36, metalness: 0.78 });
  const mint = glowMaterial(CYAN);
  const lime = glowMaterial(LIME);
  const coral = glowMaterial(CORAL);
  const dimMint = glowMaterial(0x3b8c85, 0.5);

  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(17, 64), glowMaterial(0xf1d3aa));
  sunDisc.position.set(-53, 33, -310);
  scene.add(sunDisc);
  const sunHalo = new THREE.Mesh(new THREE.RingGeometry(20, 20.18, 64), glowMaterial(0xe4cba7, 0.28));
  sunHalo.position.copy(sunDisc.position);
  scene.add(sunHalo);

  const oceanMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uDistance: { value: 0 }, uStorm: { value: 0 } },
    vertexShader: `uniform float uTime; varying vec3 vWorld; varying float vWave;
      void main(){ vec3 p=position;
        float w=sin(p.x*0.2+uTime*0.7)*cos(p.y*0.13+uTime*0.45);
        p.z=w*0.25;
        vWave=w; vWorld=(modelMatrix*vec4(p,1.0)).xyz;
        gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);
      }`,
    fragmentShader: `uniform float uTime; uniform float uDistance; uniform float uStorm; varying vec3 vWorld; varying float vWave;
      void main(){
        float depth=smoothstep(15.0,270.0,-vWorld.z);
        vec3 col=mix(vec3(0.035,0.115,0.145),vec3(0.30,0.43,0.43),depth);
        col+=vWave*0.015;
        float ripple=pow(max(0.0,sin(vWorld.z*1.65+vWorld.x*0.35+uDistance*1.65)),22.0);
        float reflection=exp(-abs(vWorld.x+15.0)*0.11)*depth;
        col+=vec3(0.24,0.23,0.17)*ripple*reflection;
        float lane=exp(-pow((abs(vWorld.x)-8.8)*4.0,2.0));
        col+=vec3(0.05,0.40,0.35)*lane*(0.65+0.35*sin(vWorld.z*0.4+uDistance*0.4));
        col=mix(col,col*vec3(0.68,0.7,0.9),uStorm*0.65);
        gl_FragColor=vec4(col,1.0);
      }`,
  });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(420, 700, 100, 150), oceanMaterial);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.9, -215);
  scene.add(ocean);

  // Low, broken guide rails make the traversable corridor readable without a road.
  const rails: THREE.Mesh[] = [];
  const railGeometry = new THREE.BoxGeometry(0.07, 0.045, 5);
  for (let i = 0; i < 48; i++) {
    const rail = new THREE.Mesh(railGeometry, i % 6 === 0 ? lime : dimMint);
    rail.position.set(i % 2 ? -8.8 : 8.8, -0.47, 25 - Math.floor(i / 2) * 13);
    scene.add(rail);
    rails.push(rail);
  }

  const islands: THREE.Group[] = [];
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  const peakGeometry = new THREE.ConeGeometry(1, 1, 5);
  for (let i = 0; i < 26; i++) {
    const island = new THREE.Group();
    const side = i % 2 ? -1 : 1;
    const size = 3 + ((i * 17) % 9);
    const base = new THREE.Mesh(rockGeometry, i % 3 ? basalt : basaltLight);
    base.scale.set(size, size * 0.56, size * 0.85);
    island.add(base);
    const crown = new THREE.Mesh(peakGeometry, basalt);
    crown.scale.set(size * 0.78, size * (1.3 + (i % 3) * 0.55), size * 0.7);
    crown.position.y = size * 0.7;
    crown.rotation.y = i * 0.73;
    island.add(crown);
    if (i % 3 === 0) {
      const spire = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), lime);
      spire.scale.y = 3.2;
      spire.position.set(size * 0.35, size + 2, 0);
      island.add(spire);
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.09, size * 2.6, 0.09), mint);
      line.position.set(size * 0.35, size * 0.4, 0);
      island.add(line);
    }
    island.position.set(side * (20 + ((i * 7) % 23)), -1.5 + Math.sin(i * 3) * 3, 15 - i * 14);
    island.rotation.z = Math.sin(i) * 0.12;
    scene.add(island);
    islands.push(island);
  }

  const monuments: THREE.Group[] = [];
  const portalGeometry = new THREE.TorusGeometry(14, 0.72, 8, 80);
  const portalLightGeometry = new THREE.TorusGeometry(14, 0.075, 5, 100);
  for (let i = 0; i < 3; i++) {
    const portal = new THREE.Group();
    const body = new THREE.Mesh(portalGeometry, gunmetal);
    portal.add(body);
    for (const z of [-0.66, 0.66]) {
      const edge = new THREE.Mesh(portalLightGeometry, i === 1 ? lime : mint);
      edge.position.z = z;
      portal.add(edge);
    }
    const outerArc = new THREE.Mesh(new THREE.TorusGeometry(15.1, 0.13, 5, 80, Math.PI * 1.48), basaltLight);
    outerArc.rotation.z = i + 0.4;
    portal.add(outerArc);
    for (let j = 0; j < 32; j++) {
      const angle = (j / 32) * Math.PI * 2;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.12, j % 4 ? 0.5 : 1.05, 0.2), j % 4 ? dimMint : lime);
      tick.position.set(Math.sin(angle) * 14, Math.cos(angle) * 14, 0.79);
      tick.rotation.z = -angle;
      portal.add(tick);
    }
    portal.position.set(i === 1 ? 3 : -2, 12.2, -80 - i * 125);
    portal.rotation.y = i === 0 ? -0.12 : 0.16;
    portal.rotation.z = i * 0.2 - 0.12;
    scene.add(portal);
    monuments.push(portal);
  }

  // Faceted triangular hull, long outriggers, and emissive electric thrusters.
  const craft = new THREE.Group();
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, -2.2);
  hullShape.lineTo(1.1, 1.4);
  hullShape.lineTo(0.48, 1.1);
  hullShape.lineTo(0, 1.5);
  hullShape.lineTo(-0.48, 1.1);
  hullShape.lineTo(-1.1, 1.4);
  hullShape.closePath();
  const hullGeometry = new THREE.ExtrudeGeometry(hullShape, { depth: 0.27, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.15, bevelThickness: 0.12 });
  hullGeometry.rotateX(Math.PI / 2);
  const hull = new THREE.Mesh(hullGeometry, new THREE.MeshStandardMaterial({ color: 0xd2e0dc, roughness: 0.28, metalness: 0.64, flatShading: true }));
  craft.add(hull);
  const cockpit = new THREE.Mesh(new THREE.OctahedronGeometry(0.66, 0), new THREE.MeshStandardMaterial({ color: 0x173748, emissive: 0x24706b, emissiveIntensity: 0.4, metalness: 0.9, roughness: 0.17 }));
  cockpit.scale.set(0.65, 0.43, 1.35);
  cockpit.position.set(0, 0.3, -0.32);
  craft.add(cockpit);
  const thrusters: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 1.4), gunmetal);
    wing.position.set(side * 1.45, -0.06, 0.73);
    wing.rotation.y = side * -0.24;
    craft.add(wing);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.11, 2.2), lime);
    edge.position.set(side * 1.95, 0.01, 0.4);
    edge.rotation.y = side * -0.2;
    craft.add(edge);
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.3, 1.5, 8), gunmetal);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 0.75, -0.12, 1.1);
    craft.add(engine);
    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.23, 2.3, 8, 1, true), glowMaterial(0xa7ffde, 0.78));
    jet.rotation.x = Math.PI / 2;
    jet.position.set(side * 0.75, -0.12, 2.9);
    craft.add(jet);
    thrusters.push(jet);
  }
  const craftLight = new THREE.PointLight(CYAN, 7, 12, 2);
  craftLight.position.y = 0.5;
  craft.add(craftLight);
  craft.position.set(0, 1.45, PLAYER_Z);
  scene.add(craft);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(2.9, 32), new THREE.MeshBasicMaterial({ color: 0x050f18, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.y = 0.65;
  shadow.position.set(0, -0.45, PLAYER_Z);
  scene.add(shadow);
  const hoverGlow = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.21, 48), glowMaterial(CYAN, 0.22));
  hoverGlow.rotation.x = -Math.PI / 2;
  hoverGlow.position.set(0, -0.4, PLAYER_Z);
  scene.add(hoverGlow);

  const shardGeometry = new THREE.OctahedronGeometry(0.7, 0);
  const collectibleRing = new THREE.TorusGeometry(1.35, 0.055, 5, 28);
  const hazardGeometry = new THREE.IcosahedronGeometry(1.05, 0);
  const hazardMaterial = new THREE.MeshStandardMaterial({ color: 0x453346, emissive: 0xc64451, emissiveIntensity: 0.4, roughness: 0.5, metalness: 0.65, flatShading: true });
  const items: WorldItem[] = [];
  let sequence = 0;
  let mode: DirectiveEvent | null = null;
  let modeTime = 0;
  const chooseLane = (index: number) => LANES[(Math.floor((index % 15) / 3) + 1) % 3];
  function makeItem(index: number) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(collectibleRing, lime);
    ring.name = "ring";
    group.add(ring);
    const gem = new THREE.Mesh(shardGeometry, mint);
    gem.name = "gem";
    gem.scale.y = 1.3;
    group.add(gem);
    const hazard = new THREE.Mesh(hazardGeometry, hazardMaterial);
    hazard.name = "hazard";
    hazard.scale.set(1.35, 1.25, 1.3);
    group.add(hazard);
    const warning = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.075, 5, 24), coral);
    warning.name = "warning";
    warning.rotation.x = Math.PI / 2;
    warning.position.y = -1.15;
    group.add(warning);
    const item: WorldItem = { group, kind: "shard", lane: 0, taken: false, spin: index * 0.73 };
    scene.add(group);
    items.push(item);
    recycle(item, -22 - index * 15);
  }
  function recycle(item: WorldItem, z: number) {
    const n = sequence++;
    item.kind = mode === "calm" || mode === "riches" ? "shard" : (n % (mode === "storm" ? 3 : 5) === 4 % (mode === "storm" ? 3 : 5) ? "hazard" : "shard");
    item.lane = item.kind === "hazard" ? LANES[(Math.floor(n / 2) + 1) % 3] : chooseLane(n);
    item.taken = false;
    item.group.visible = true;
    item.group.position.set(item.lane, item.kind === "shard" ? 1.75 : 1.35, z);
    item.group.getObjectByName("ring")!.visible = item.kind === "shard";
    item.group.getObjectByName("gem")!.visible = item.kind === "shard";
    item.group.getObjectByName("hazard")!.visible = item.kind === "hazard";
    item.group.getObjectByName("warning")!.visible = item.kind === "hazard";
  }
  for (let i = 0; i < 21; i++) makeItem(i);

  const particleCount = 280;
  const particlePositions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3] = (Math.random() - 0.5) * 160;
    particlePositions[i * 3 + 1] = Math.random() * 35 + 0.5;
    particlePositions[i * 3 + 2] = -Math.random() * 280;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({ color: 0xc5f2e0, size: 0.095, transparent: true, opacity: 0.68, sizeAttenuation: true, depthWrite: false }));
  scene.add(particles);

  const bursts: Burst[] = [];
  const burstGeometry = new THREE.OctahedronGeometry(0.13, 0);
  let state = initialSnapshot();
  let disposed = false;
  let frame = 0;
  let lastTime = performance.now();
  let worldTime = 0;
  let gameElapsed = 0;
  let travel = 0;
  let uiTime = 0;
  let invulnerable = 0;
  let hitShake = 0;
  let playerX = 0;
  let currentSpeed = 0;
  let muted = false;
  let audio: AudioContext | null = null;
  const input = { left: false, right: false, boost: false };
  const lookTarget = new THREE.Vector3(0, 3, -43);
  function emit() { callbacks.onUpdate({ ...state }); }
  function announce(type: string, message: string) { callbacks.onEvent({ type, message }); }
  function initAudio() {
    if (muted) return;
    try {
      audio ??= new AudioContext();
      if (audio.state === "suspended") void audio.resume().catch(() => {});
    } catch { /* The game remains fully playable if audio is unavailable. */ }
  }
  function tone(frequency: number, duration: number, volume = 0.035, type: OscillatorType = "sine") {
    if (muted || !audio || audio.state !== "running") return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.55, audio.currentTime + duration);
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  function burst(position: THREE.Vector3, hazard: boolean) {
    for (let i = 0; i < 13; i++) {
      const mesh = new THREE.Mesh(burstGeometry, hazard ? coral : lime);
      mesh.position.copy(position);
      scene.add(mesh);
      bursts.push({ mesh, velocity: new THREE.Vector3((Math.random() - 0.5) * 11, Math.random() * 6 - 1, Math.random() * 9 + 1), life: 0.7 });
    }
  }
  function clearInput() { input.left = false; input.right = false; input.boost = false; }
  function reset() {
    state = initialSnapshot();
    sequence = 0;
    mode = null;
    modeTime = 0;
    playerX = 0;
    gameElapsed = 0;
    travel = 0;
    invulnerable = 0;
    currentSpeed = 0;
    hitShake = 0;
    clearInput();
    items.forEach((item, i) => recycle(item, -22 - i * 15));
    bursts.forEach(({ mesh }) => scene.remove(mesh));
    bursts.length = 0;
    craft.visible = true;
    craft.position.x = 0;
    monuments.forEach((portal, i) => { portal.position.z = -80 - i * 125; });
  }
  function start() {
    if (disposed) return;
    reset();
    initAudio();
    state.phase = "playing";
    announce("start", "Collect 12 echo shards. Stay in the light.");
    tone(360, 0.4);
    emit();
  }
  function pause() {
    if (state.phase !== "playing" || disposed) return;
    state.phase = "paused";
    clearInput();
    emit();
  }
  function resume() {
    if (state.phase !== "paused" || disposed) return;
    state.phase = "playing";
    lastTime = performance.now();
    initAudio();
    emit();
  }
  function applyDirective(directive: GameDirective) {
    if (disposed || !(directive.event in DIRECTIVE_LABELS)) return;
    mode = directive.event;
    modeTime = 15;
    state.event = DIRECTIVE_LABELS[mode];
    if (mode === "repair") {
      state.shield = clamp(state.shield + 35, 0, 100);
      state.boost = clamp(state.boost + 25, 0, 100);
      invulnerable = 2;
    }
    if (mode === "storm") {
      // Shift the visible approach now, leaving nearby obstacles unchanged so
      // the pilot has time to react. Spatial order survives pool recycling.
      const approach = items.filter((item) => !item.taken && item.group.position.z < -25)
        .sort((a, b) => b.group.position.z - a.group.position.z);
      let lastHazardZ = Math.min(...items
        .filter((item) => !item.taken && item.kind === "hazard" && item.group.position.z >= -25)
        .map((item) => item.group.position.z));
      approach.forEach((item, index) => {
        const isHazard = index % 3 === 0 && lastHazardZ - item.group.position.z >= 40;
        if (isHazard) lastHazardZ = item.group.position.z;
        item.kind = isHazard ? "hazard" : "shard";
        item.group.position.y = isHazard ? 1.35 : 1.75;
        item.group.getObjectByName("ring")!.visible = !isHazard;
        item.group.getObjectByName("gem")!.visible = !isHazard;
        item.group.getObjectByName("hazard")!.visible = isHazard;
        item.group.getObjectByName("warning")!.visible = isHazard;
      });
    }
    if (mode === "calm" || mode === "riches") {
      items.forEach((item) => {
        if (item.kind === "hazard" && item.group.position.z < -12) {
          item.kind = "shard";
          item.group.position.y = 1.75;
          item.group.getObjectByName("ring")!.visible = true;
          item.group.getObjectByName("gem")!.visible = true;
          item.group.getObjectByName("hazard")!.visible = false;
          item.group.getObjectByName("warning")!.visible = false;
        }
      });
    }
    tone(mode === "storm" ? 140 : 640, 0.4);
    announce("directive", directive.message || `${state.event} — the world is shifting.`);
    emit();
  }

  function finish(phase: "won" | "lost") {
    state.phase = phase;
    state.speed = 0;
    clearInput();
    announce(phase, phase === "won" ? "Expedition complete. Your echoes made it home." : state.shield <= 0 ? "Signal lost. Your next expedition is waiting." : "The gate needs 12 shards. Take another flight.");
    tone(phase === "won" ? 880 : 130, 0.8, 0.07);
    emit();
  }

  function update(dt: number) {
    const playing = state.phase === "playing";
    const paused = state.phase === "paused";
    const attract = state.phase === "ready";
    if (!paused) worldTime += dt;
    const boostActive = playing && input.boost && state.boost > 0.5;
    const targetSpeed = playing ? (mode === "calm" ? 21 : mode === "turbo" ? 39 : 29) + (boostActive ? 20 : 0) : attract ? 3.4 : 0;
    currentSpeed = THREE.MathUtils.damp(currentSpeed, targetSpeed, 2.2, dt);
    const movement = paused ? 0 : currentSpeed * dt;
    travel += movement;
    oceanMaterial.uniforms.uTime.value = worldTime;
    oceanMaterial.uniforms.uDistance.value = travel;
    oceanMaterial.uniforms.uStorm.value = THREE.MathUtils.damp(oceanMaterial.uniforms.uStorm.value, mode === "storm" ? 1 : 0, 1, dt);
    if (playing) {
      gameElapsed += dt;
      state.timeLeft = Math.max(0, 90 - gameElapsed);
      state.distance += movement;
      state.speed = Math.round(currentSpeed * 7);
      state.boost = clamp(state.boost + (boostActive ? -31 : 12) * dt, 0, 100);
      playerX = clamp(playerX + ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 12 * dt, -6.8, 6.8);
      invulnerable = Math.max(0, invulnerable - dt);
      if (modeTime > 0) {
        modeTime -= dt;
        if (modeTime <= 0) { mode = null; state.event = "Open water"; announce("sector", "The current settles. Keep chasing the echoes."); }
      }
      if (gameElapsed > 30 && gameElapsed - dt <= 30 && !mode) {
        state.event = "The glass horizon";
        announce("sector", "You’re entering the glass horizon. Trust your line.");
      }
      if (gameElapsed > 60 && gameElapsed - dt <= 60) {
        announce("sector", `${Math.max(0, SHARD_TARGET - state.shards)} shards to the objective. Thirty seconds to extraction.`);
      }
    }
    if (attract) playerX = Math.sin(worldTime * 0.2) * 0.4;
    const previousX = craft.position.x;
    craft.position.x = THREE.MathUtils.damp(craft.position.x, playerX, 11, dt);
    craft.position.y = 1.45 + Math.sin(worldTime * 3.2) * 0.085;
    craft.rotation.z = THREE.MathUtils.damp(craft.rotation.z, -(craft.position.x - previousX) * 2.4, 8, dt);
    craft.rotation.x = -0.045 + Math.sin(worldTime * 2) * 0.018 - (boostActive ? 0.045 : 0);
    craft.rotation.y = THREE.MathUtils.damp(craft.rotation.y, (craft.position.x - previousX) * 1.0, 5, dt);
    craft.visible = invulnerable > 0 && mode !== "repair" ? Math.floor(worldTime * 18) % 3 !== 0 : true;
    shadow.position.x = craft.position.x;
    hoverGlow.position.x = craft.position.x;
    hoverGlow.scale.setScalar(1 + Math.sin(worldTime * 4) * 0.06);
    for (const jet of thrusters) {
      jet.scale.y = (boostActive ? 2.0 : 0.7) + Math.sin(worldTime * 30) * 0.12;
      jet.position.z = 2.3 + jet.scale.y * 0.55;
    }

    for (const rail of rails) {
      rail.position.z += movement;
      if (rail.position.z > 30) rail.position.z -= 312;
    }
    for (let i = 0; i < islands.length; i++) {
      islands[i].position.z += movement;
      if (islands[i].position.z > 45) islands[i].position.z -= 364;
      islands[i].rotation.y = Math.sin(worldTime * 0.05 + i) * 0.04;
    }
    for (const portal of monuments) {
      portal.position.z += movement;
      if (portal.position.z > 52) portal.position.z -= 375;
    }
    for (const item of items) {
      const oldZ = item.group.position.z;
      item.group.position.z += movement;
      const gem = item.group.getObjectByName("gem")!;
      gem.rotation.y = worldTime * 1.8 + item.spin;
      gem.rotation.z = Math.sin(worldTime + item.spin) * 0.2;
      item.group.getObjectByName("ring")!.rotation.z = worldTime * 0.3 + item.spin;
      const hazard = item.group.getObjectByName("hazard")!;
      hazard.rotation.y = worldTime * 0.5 + item.spin;
      hazard.rotation.z = worldTime * 0.32;
      if (playing && !item.taken && oldZ < PLAYER_Z + 0.5 && item.group.position.z >= PLAYER_Z - 1.2) {
        if (Math.abs(craft.position.x - item.lane) < (item.kind === "shard" ? 1.9 : 1.65)) {
          item.taken = true;
          item.group.visible = false;
          if (item.kind === "shard") {
            const amount = mode === "riches" ? 2 : 1;
            state.shards += amount;
            state.score += 100 * amount * state.combo;
            state.combo = Math.min(5, state.combo + 1);
            state.boost = clamp(state.boost + 8, 0, 100);
            burst(item.group.position, false);
            tone(560 + state.combo * 100, 0.13, 0.035, "triangle");
            if (state.shards >= SHARD_TARGET && state.shards - amount < SHARD_TARGET) announce("objective", "12 echoes secured. Survive until extraction!");
          } else if (invulnerable <= 0) {
            state.shield = Math.max(0, state.shield - HAZARD_DAMAGE);
            state.combo = 1;
            invulnerable = 1.1;
            hitShake = 0.65;
            burst(item.group.position, true);
            tone(90, 0.28, 0.07, "sawtooth");
            announce("hit", state.shield <= 25 ? "Shield critical. Avoid the red anomalies." : "Anomaly impact. Shield reduced.");
          }
        }
      }
      if (item.group.position.z > PLAYER_Z + 2 && !item.taken && item.kind === "shard" && playing) {
        state.combo = 1;
        item.taken = true;
      }
      if (item.group.position.z > 27) recycle(item, item.group.position.z - items.length * 15);
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const bit = bursts[i];
      if (paused) continue;
      bit.life -= dt;
      bit.mesh.position.addScaledVector(bit.velocity, dt);
      bit.mesh.scale.setScalar(Math.max(0.01, bit.life / 0.7));
      bit.mesh.rotation.x += dt * 3;
      if (bit.life <= 0) { scene.remove(bit.mesh); bursts.splice(i, 1); }
    }
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3 + 2] += movement * 0.75;
      if (particlePositions[i * 3 + 2] > 30) particlePositions[i * 3 + 2] -= 300;
    }
    particleGeometry.attributes.position.needsUpdate = true;
    hitShake = Math.max(0, hitShake - dt * 1.8);
    camera.position.x = THREE.MathUtils.damp(camera.position.x, craft.position.x * 0.25, 2.8, dt) + (Math.random() - 0.5) * hitShake * 0.35;
    const portrait = camera.aspect < 1.25;
    camera.position.y = (portrait ? 9.6 : 7.8) + Math.sin(worldTime * 0.4) * 0.1;
    camera.position.z = portrait ? 26 : 20;
    camera.fov = THREE.MathUtils.damp(camera.fov, (portrait ? 65 : 57) + (boostActive ? 8 : 0), 3, dt);
    camera.updateProjectionMatrix();
    lookTarget.set(craft.position.x * 0.35, 3.1, -43);
    camera.lookAt(lookTarget);
    if (playing) {
      const outcome = missionOutcome(state.shield, state.timeLeft, state.shards);
      if (outcome) finish(outcome);
      else {
        uiTime += dt;
        if (uiTime > 0.1) { uiTime = 0; emit(); }
      }
    }
  }

  function animate(time: number) {
    if (disposed) return;
    const dt = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;
    update(dt);
    composer.render();
    frame = requestAnimationFrame(animate);
  }
  function resize() {
    if (disposed) return;
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    bloom.resolution.set(width * 0.6, height * 0.6);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const keyToInput: Record<string, keyof typeof input> = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", Space: "boost" };
  function onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[role="dialog"]')) return;
    if (target?.matches("input,textarea,select,[contenteditable='true']")) return;
    if (event.code === "Space" && target?.closest("button,a[href]")) return;
    if (event.code === "Escape" || event.code === "KeyP") {
      if (!event.repeat) { if (state.phase === "playing") pause(); else if (state.phase === "paused") resume(); }
      return;
    }
    const action = keyToInput[event.code];
    if (action && state.phase === "playing") { event.preventDefault(); input[action] = true; }
  }
  function onKeyUp(event: KeyboardEvent) { const action = keyToInput[event.code]; if (action) input[action] = false; }
  function onBlur() { clearInput(); pause(); }
  function onVisibility() { if (document.hidden) onBlur(); }
  function onContextLost(event: Event) { event.preventDefault(); pause(); announce("error", "The graphics connection was interrupted. Reload to restore the expedition."); }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVisibility);
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);
  frame = requestAnimationFrame(animate);
  emit();
  callbacks.onReady();

  return {
    start, pause, resume,
    restart: start,
    applyDirective,
    setInput(action, pressed) { if (!disposed && (state.phase === "playing" || !pressed)) input[action] = pressed; },
    setMuted(value) { muted = value; if (!muted) initAudio(); },
    destroy() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      if (audio) void audio.close().catch(() => {});
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          geometries.add(object.geometry);
          if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
          else materials.add(object.material);
        }
      });
      geometries.add(burstGeometry);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      bloom.dispose();
      output.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
