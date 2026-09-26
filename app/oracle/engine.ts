import * as THREE from 'three';
import type { CharacterId, GatherResult, Nearby, OracleCallbacks, OracleEngine, Resource, WorldPhase } from './types';
import { createWorld } from './world';
import { createCharacter } from './characters';

const AMOUNTS: Record<Resource, number> = { food: 3, water: 3, herbs: 1, wood: 2 };
const RESOURCE_NAMES: Record<Resource, string> = { food: 'Gather bread & olives', water: 'Take fresh water', herbs: 'Gather healing herbs', wood: 'Collect olive wood' };
const RESOURCE_DESCRIPTIONS: Record<Resource, string> = { food: 'Three food rations for the days ahead.', water: 'Three waterskins of clean spring water.', herbs: 'Wild thyme and medicine for the shelter.', wood: 'Two bundles for warmth and a rescue signal.' };
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

export function createOracleGame(canvas: HTMLCanvasElement, callbacks: OracleCallbacks): OracleEngine {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c8d8d4'); scene.fog = new THREE.FogExp2('#ccdad2', .0057);
  const camera = new THREE.PerspectiveCamera(47, 1, .15, 420);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.18;
  const ambient = new THREE.HemisphereLight('#cee8ed', '#a99472', 2.3); scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff0c7', 3.9); sun.position.set(-26, 42, 18); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -35; sun.shadow.camera.right = 35; sun.shadow.camera.top = 33; sun.shadow.camera.bottom = -32; sun.shadow.camera.near = .5; sun.shadow.camera.far = 120; sun.shadow.normalBias = .055; sun.shadow.bias = -.00015;
  scene.add(sun); const fill = new THREE.DirectionalLight('#a5cfd8', .4); fill.position.set(15, 15, -20); scene.add(fill);
  const world = createWorld(); scene.add(world.root);
  const hero = createCharacter('lyra'); hero.root.position.set(0, 0, 10.6); scene.add(hero.root);
  const companionStarts: Record<'mira' | 'theron', THREE.Vector3> = { mira: new THREE.Vector3(-5.3, 0, -.6), theron: new THREE.Vector3(9.6, 0, 12.3) };
  const actors = { mira: createCharacter('mira'), theron: createCharacter('theron') };
  for (const id of ['mira', 'theron'] as const) { actors[id].root.position.copy(companionStarts[id]); actors[id].root.rotation.y = id === 'mira' ? .9 : -.5; scene.add(actors[id].root); }
  const markers: Record<string, THREE.Group> = {};
  for (const id of ['mira', 'theron'] as const) {
    const g = new THREE.Group(); const marker = new THREE.Mesh(new THREE.OctahedronGeometry(.16), new THREE.MeshBasicMaterial({ color: id === 'mira' ? '#bce8c9' : '#efc38b' })); marker.position.y = 3.05; g.add(marker);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.63, .68, 32), new THREE.MeshBasicMaterial({ color: '#f8dda0', transparent: true, opacity: .6, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .07; g.add(ring); g.position.copy(companionStarts[id]); scene.add(g); markers[id] = g;
  }

  // A hand-painted looking sea shader adds sun glints, long swells, and shallow turquoise.
  const waterUniforms = { uTime: { value: 0 }, uDusk: { value: 0 } };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(650, 650, 80, 80), new THREE.ShaderMaterial({
    uniforms: waterUniforms, vertexShader: `varying vec3 vWorld; uniform float uTime;
      void main(){vec3 p=position; p.z+=sin(p.x*.19+uTime*.7)*.10+sin(p.y*.28+uTime*.5)*.07; vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `varying vec3 vWorld; uniform float uTime; uniform float uDusk;
      void main(){vec2 p=vWorld.xz;float w=sin(p.x*.8+p.y*.31+uTime)*sin(p.y*.64-p.x*.12-uTime*.6);float w2=sin(p.x*2.1+p.y*1.4+uTime*1.3)*sin(p.y*1.7-uTime*.8);float shore=1.-smoothstep(25.,80.,length(p)); vec3 col=mix(vec3(.12,.36,.43),vec3(.17,.64,.65),shore);col+=w*.018;float glint=pow(max(0.,w2),19.)*.12;col+=glint;float haze=smoothstep(75.,240.,length(p));col=mix(col,vec3(.66,.77,.75),haze);col=mix(col,col*vec3(.55,.55,.63),uDusk*.65);gl_FragColor=vec4(col,1.);}`
  })); water.rotation.x = -Math.PI / 2; water.position.y = -5.4; scene.add(water);
  // Shore foam is broken into soft white arcs, never a solid artificial border.
  const foamMaterial = new THREE.MeshBasicMaterial({ color: '#d4f1df', transparent: true, opacity: .36, depthWrite: false });
  const foam: THREE.Mesh[] = [];
  for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; const m = new THREE.Mesh(new THREE.PlaneGeometry(2.7 + Math.random() * 4, .12 + Math.random() * .18), foamMaterial); m.rotation.set(-Math.PI / 2, 0, a); m.position.set(Math.sin(a) * 30, -5.17, Math.cos(a) * 27); scene.add(m); foam.push(m); }

  const sky = new THREE.Mesh(new THREE.SphereGeometry(330, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { dusk: { value: 0 }, panorama: { value: null }, hasPanorama: { value: 0 } }, vertexShader: 'varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'varying vec3 vPos; uniform float dusk; uniform sampler2D panorama; uniform float hasPanorama; void main(){vec3 direction=normalize(vPos);float h=clamp(direction.y,0.,1.); vec3 c=mix(vec3(.83,.85,.75),vec3(.41,.66,.73),pow(h,.65));vec2 uv=vec2((atan(direction.z,direction.x)/6.2831853+.5)*2.,clamp(h*1.1,0.,1.));vec3 painted=texture2D(panorama,uv).rgb;c=mix(c,painted,hasPanorama*.48);vec3 twilight=mix(vec3(.56,.40,.32),vec3(.17,.22,.29),h);twilight=mix(twilight,painted*vec3(.6,.52,.5),hasPanorama*.3);c=mix(c,twilight,dusk);gl_FragColor=vec4(c,1.);}' })); scene.add(sky);
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff0c8', fog: false })); sunDisc.position.set(-130, 103, -155); scene.add(sunDisc);
  const mountainMat = new THREE.MeshStandardMaterial({ color: '#849b96', roughness: 1 });
  for (let i = 0; i < 10; i++) { const mountain = new THREE.Mesh(new THREE.ConeGeometry(22 + Math.random() * 20, 12 + Math.random() * 19, 7), mountainMat); mountain.position.set(-180 + i * 37, -1, -125 - Math.random() * 24); mountain.rotation.y = i * 1.3; mountain.scale.z = .55; scene.add(mountain); }
  const volcano = new THREE.Group(); volcano.position.set(-49, -5.4, -100); scene.add(volcano);
  const volcanoGeo = new THREE.CylinderGeometry(4.3, 29, 28, 18, 5, true); const volcanoPositions = volcanoGeo.attributes.position;
  for (let i = 0; i < volcanoPositions.count; i++) { const y = volcanoPositions.getY(i); const jitter = 1 + Math.sin(volcanoPositions.getX(i) * 1.7 + volcanoPositions.getZ(i) * .8) * .07; volcanoPositions.setX(i, volcanoPositions.getX(i) * jitter); volcanoPositions.setZ(i, volcanoPositions.getZ(i) * jitter); if (y < 13) volcanoPositions.setY(i, y + Math.sin(i * 12.3) * .8); } volcanoGeo.computeVertexNormals();
  const cone = new THREE.Mesh(volcanoGeo, new THREE.MeshStandardMaterial({ color: '#687d77', roughness: 1 })); cone.position.y = 14; volcano.add(cone);
  const crater = new THREE.Mesh(new THREE.CircleGeometry(4.3, 18), new THREE.MeshBasicMaterial({ color: '#a86541' })); crater.rotation.x = -Math.PI / 2; crater.position.y = 28.1; volcano.add(crater);
  const smokeCanvas = document.createElement('canvas'); smokeCanvas.width = smokeCanvas.height = 128; const smokeContext = smokeCanvas.getContext('2d')!; const smokeGradient = smokeContext.createRadialGradient(64, 64, 0, 64, 64, 64); smokeGradient.addColorStop(0, 'rgba(255,255,255,.6)'); smokeGradient.addColorStop(.45, 'rgba(255,255,255,.36)'); smokeGradient.addColorStop(1, 'rgba(255,255,255,0)'); smokeContext.fillStyle = smokeGradient; smokeContext.fillRect(0, 0, 128, 128); const smokeTexture = new THREE.CanvasTexture(smokeCanvas);
  const smoke: THREE.Sprite[] = [];
  for (let i = 0; i < 26; i++) { const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture, color: '#686e66', opacity: .17 + i * .006, depthWrite: false })); sprite.position.set(i * .45, 28 + i * 1.5, 0); sprite.scale.setScalar(4 + i * .56); volcano.add(sprite); smoke.push(sprite); }
  const dustGeometry = new THREE.BufferGeometry(); const dustPositions = new Float32Array(270 * 3); for (let i = 0; i < 270; i++) { dustPositions[i * 3] = (Math.random() - .5) * 50; dustPositions[i * 3 + 1] = 1 + Math.random() * 15; dustPositions[i * 3 + 2] = (Math.random() - .5) * 43; } dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: '#ffebc9', transparent: true, opacity: .43, size: .055, depthWrite: false })); scene.add(dust);
  const birds: THREE.Group[] = [];
  const birdMat = new THREE.MeshBasicMaterial({ color: '#687978', side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) { const bird = new THREE.Group(); for (const side of [-1, 1]) { const wing = new THREE.Mesh(new THREE.PlaneGeometry(.8, .15), birdMat); wing.position.x = side * .37; wing.rotation.z = side * .22; bird.add(wing); } scene.add(bird); birds.push(bird); }

  let phase: WorldPhase = 'ready', timeLeft = 60, inventory = { food: 0, water: 0, herbs: 0, wood: 0 }, companions: CharacterId[] = [], paused = false, ended = false, destroyed = false;
  const marbleTexture = new THREE.TextureLoader().load('/oracle/marble.jpg', texture => {
    if (destroyed) { texture.dispose(); return; }
    texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(8, 7); texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    world.root.traverse(object => { if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial && object.material.name === 'Asteria paving') { object.material.map?.dispose(); object.material.map = texture; object.material.needsUpdate = true; } });
  }, undefined, () => { /* The procedural paving is already visible. */ });
  const skyTexture = new THREE.TextureLoader().load('/oracle/sky.jpg', texture => {
    if (destroyed) { texture.dispose(); return; }
    texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = THREE.MirroredRepeatWrapping; const uniforms = (sky.material as THREE.ShaderMaterial).uniforms; uniforms.panorama.value = texture; uniforms.hasPanorama.value = 1;
  }, undefined, () => { /* The gradient sky is already visible. */ });
  let nearest: Nearby | null = null, stamina = 1, markedUntil = 0, elapsed = 0, lastFrame = performance.now(), updateElapsed = 0, day = 0, audioMuted = true;
  let yaw = .37, pitch = .62, distance = 23, drag = false, dragPointer = -1, dragX = 0, dragY = 0, walking = 0;
  const movement = { forward: false, backward: false, left: false, right: false, sprint: false };
  const followTarget = hero.root.position.clone().add(new THREE.Vector3(0, 1.3, -1.9));
  const cameraPosition = new THREE.Vector3();
  let audio: AudioContext | null = null;
  const sound = (kind: 'pickup' | 'rescue' | 'step' | 'start') => {
    if (audioMuted || destroyed) return;
    try { audio ??= new AudioContext(); if (audio.state === 'suspended') void audio.resume(); const osc = audio.createOscillator(), gain = audio.createGain(); osc.connect(gain); gain.connect(audio.destination); const t = audio.currentTime; osc.type = kind === 'step' ? 'triangle' : 'sine'; const base = kind === 'pickup' ? 560 : kind === 'rescue' ? 380 : kind === 'start' ? 180 : 85; osc.frequency.setValueAtTime(base, t); osc.frequency.exponentialRampToValueAtTime(kind === 'step' ? 45 : base * 1.5, t + .16); gain.gain.setValueAtTime(kind === 'step' ? .026 : .085, t); gain.gain.exponentialRampToValueAtTime(.001, t + .25); osc.start(t); osc.stop(t + .27); } catch { /* Audio is an optional enhancement. */ }
  };
  const clearInput = () => { for (const key of Object.keys(movement) as (keyof typeof movement)[]) movement[key] = false; drag = false; dragPointer = -1; };
  const emit = () => callbacks.onUpdate({ phase, timeLeft, inventory: { ...inventory }, companions: [...companions], nearest, player: { x: hero.root.position.x, z: hero.root.position.z }, stamina: stamina * 100, paused });
  const showEvent = (type: string, message: string) => callbacks.onEvent({ type, message });
  const updateNearest = () => {
    nearest = null;
    if (phase !== 'scavenge') return;
    const x = hero.root.position.x, z = hero.root.position.z;
    let best = 2.05;
    for (const s of world.supplies) if (!s.taken) { const d = Math.hypot(x - s.x, z - s.z); if (d < best) { best = d; nearest = { id: s.id, label: RESOURCE_NAMES[s.resource], kind: 'resource', resource: s.resource, description: RESOURCE_DESCRIPTIONS[s.resource] }; } }
    for (const id of ['mira', 'theron'] as const) if (!companions.includes(id)) { const p = actors[id].root.position; const d = Math.hypot(x - p.x, z - p.z); if (d < best) { best = d; nearest = { id, label: id === 'mira' ? 'Rescue Mira' : 'Rescue Theron', kind: 'companion', description: id === 'mira' ? 'The village healer. Her knowledge could save you.' : 'A shipwright. He knows how to be seen from the sea.' }; } }
    const shelterDistance = Math.hypot(x - world.sanctuary.x, z - world.sanctuary.z);
    if (shelterDistance < 3 && (nearest === null || shelterDistance < best)) nearest = { id: 'sanctuary', label: 'Enter the sanctuary', kind: 'shelter', description: 'End your gathering and shelter from the eruption.' };
  };
  const finishGather = () => {
    if (ended || phase !== 'scavenge') return; ended = true;
    const escaped = hero.root.position.distanceTo(world.sanctuary) < 4.2; clearInput(); phase = escaped ? 'shelter' : 'lost'; nearest = null;
    const result: GatherResult = { escaped, inventory: { ...inventory }, companions: [...companions] }; emit(); callbacks.onGatherEnd(result);
  };
  const interact = () => {
    if (paused || phase !== 'scavenge') return; updateNearest(); if (!nearest) return;
    if (nearest.kind === 'shelter') { sound('rescue'); finishGather(); return; }
    if (nearest.kind === 'companion') { const id = nearest.id as 'mira' | 'theron'; if (companions.includes(id)) return; companions.push(id); markers[id].visible = false; showEvent('rescue', id === 'mira' ? 'Mira is with you. “I can help. Let’s get to the temple.”' : 'Theron is with you. “We’ll make a signal they can see.”'); sound('rescue'); }
    else { const supply = world.supplies.find(s => s.id === nearest?.id); if (!supply || supply.taken) return; supply.taken = true; supply.mesh.visible = false; inventory[supply.resource] += AMOUNTS[supply.resource]; showEvent('pickup', `+${AMOUNTS[supply.resource]} ${supply.resource} added to your supplies`); sound('pickup'); }
    updateNearest(); emit();
  };
  const pause = () => { if (phase !== 'scavenge' && phase !== 'shelter') return; paused = true; clearInput(); emit(); };
  const resume = () => { paused = false; lastFrame = performance.now(); emit(); };
  const start = () => {
    phase = 'scavenge'; timeLeft = 60; inventory = { food: 0, water: 0, herbs: 0, wood: 0 }; companions = []; paused = false; ended = false; stamina = 1; day = 0; markedUntil = 0; lastUrgency = 61; clearInput();
    hero.root.position.set(0, 0, 10.6); hero.root.rotation.y = Math.PI; yaw = .16; pitch = .62; distance = 22; followTarget.copy(hero.root.position).add(new THREE.Vector3(0, 1.3, -2));
    for (const s of world.supplies) { s.taken = false; s.mesh.visible = true; }
    for (const id of ['mira', 'theron'] as const) { actors[id].root.position.copy(companionStarts[id]); actors[id].root.visible = true; markers[id].visible = true; }
    world.setDay(0); (sky.material as THREE.ShaderMaterial).uniforms.dusk.value = 0; waterUniforms.uDusk.value = 0; ambient.intensity = 2.3; sun.intensity = 3.9; sun.color.set('#fff0c7'); scene.fog = new THREE.FogExp2('#ccdad2', .0057); renderer.toneMappingExposure = 1.18; dust.material.color.set('#ffebc9'); dust.material.size = .055;
    updateNearest(); emit(); sound('start'); lastFrame = performance.now();
  };
  const setShelter = (nextDay: number, rescued: CharacterId[]) => {
    const entering = day === 0; day = nextDay; phase = 'shelter'; paused = false; companions = [...rescued]; nearest = null; clearInput();
    if (entering) { hero.root.position.set(0, 0, -5.7); hero.root.rotation.y = Math.PI; yaw = .25; pitch = .45; distance = 15; }
    for (const s of world.supplies) s.mesh.visible = false;
    for (const id of ['mira', 'theron'] as const) { actors[id].root.visible = companions.includes(id); actors[id].root.position.set(id === 'mira' ? -2.5 : 2.5, 0, -8); actors[id].root.rotation.y = id === 'mira' ? .7 : -.7; markers[id].visible = false; }
    const dusk = clamp(.52 + nextDay * .055, .5, .88); (sky.material as THREE.ShaderMaterial).uniforms.dusk.value = dusk; waterUniforms.uDusk.value = dusk; sun.intensity = 2.2 - nextDay * .16; sun.color.set('#ffd5a3'); ambient.intensity = 1.4; world.setDay(nextDay); scene.fog = new THREE.FogExp2('#8c8980', .01 + nextDay * .001); dust.material.color.set('#b7b3a7'); dust.material.size = .055 + nextDay * .007; renderer.toneMappingExposure = 1.04; emit();
  };
  const setOutcome = (won: boolean) => { phase = won ? 'won' : 'lost'; paused = false; nearest = null; clearInput(); world.setDay(Math.max(1, day), won); if (won) { (sky.material as THREE.ShaderMaterial).uniforms.dusk.value = .35; sun.intensity = 3; sun.color.set('#ffe3aa'); } else { (sky.material as THREE.ShaderMaterial).uniforms.dusk.value = .92; ambient.intensity = 1; sun.intensity = 1.1; } emit(); };

  const keyMap: Record<string, keyof typeof movement> = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'backward', ArrowDown: 'backward', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'sprint', ShiftRight: 'sprint' };
  const keydown = (event: KeyboardEvent) => { if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]')) return; if (event.code === 'Escape' && !event.repeat) { if (paused) resume(); else pause(); event.preventDefault(); return; } if (event.code === 'KeyE' && !event.repeat) { interact(); if (phase === 'scavenge') event.preventDefault(); return; } if (paused) return; const key = keyMap[event.code]; if (key && (phase === 'scavenge' || phase === 'shelter')) { movement[key] = true; event.preventDefault(); } };
  const keyup = (event: KeyboardEvent) => { const key = keyMap[event.code]; if (key) movement[key] = false; };
  const pointerdown = (event: PointerEvent) => { if (event.button !== 0 || paused) return; drag = true; dragPointer = event.pointerId; dragX = event.clientX; dragY = event.clientY; canvas.setPointerCapture(event.pointerId); };
  const pointermove = (event: PointerEvent) => { if (!drag || event.pointerId !== dragPointer) return; yaw -= (event.clientX - dragX) * .006; pitch = clamp(pitch + (event.clientY - dragY) * .004, .28, .95); dragX = event.clientX; dragY = event.clientY; };
  const pointerup = () => { drag = false; dragPointer = -1; };
  const wheel = (event: WheelEvent) => { event.preventDefault(); distance = clamp(distance + event.deltaY * .015, 10, 34); };
  const onBlur = () => { if (phase === 'scavenge' || phase === 'shelter') pause(); };
  const onVisibility = () => { if (document.hidden) onBlur(); };
  window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', onBlur); document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('pointerdown', pointerdown); canvas.addEventListener('pointermove', pointermove); canvas.addEventListener('pointerup', pointerup); canvas.addEventListener('pointercancel', pointerup); canvas.addEventListener('wheel', wheel, { passive: false });
  const resize = () => { const r = canvas.getBoundingClientRect(); const width = Math.max(1, r.width), height = Math.max(1, r.height); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  const canMove = (x: number, z: number) => { if (phase === 'shelter' && (Math.abs(x) > 7.4 || z > -4.4 || z < -15.7)) return false; if (x < -23.3 || x > 23.3 || z < -19.2 || z > 19.9) return false; const radius = .32; return !world.colliders.some(c => Math.abs(x - c.x) < c.w / 2 + radius && Math.abs(z - c.z) < c.d / 2 + radius); };
  const temp = new THREE.Vector3(); let stepTime = 0, lastUrgency = 61;
  let frame = 0;
  const animate = (now: number) => {
    if (destroyed) return;
    const realDt = Math.max(0, (now - lastFrame) / 1000); const dt = Math.min(realDt, .05); lastFrame = now; elapsed += paused ? 0 : dt; updateElapsed += dt;
    if (!paused) {
      if (phase === 'scavenge' || phase === 'shelter') {
        let horizontal = Number(movement.right) - Number(movement.left), vertical = Number(movement.forward) - Number(movement.backward); const length = Math.hypot(horizontal, vertical); const moving = length > 0;
        if (moving) { horizontal /= length; vertical /= length; }
        const sprinting = moving && movement.sprint && stamina > .04 && phase === 'scavenge'; stamina = clamp(stamina + dt * (sprinting ? -.2 : .14), 0, 1);
        const speed = sprinting ? 8.2 : phase === 'shelter' ? 2.8 : 5.4;
        const dx = (horizontal * Math.cos(yaw) - vertical * Math.sin(yaw)) * dt * speed, dz = (-horizontal * Math.sin(yaw) - vertical * Math.cos(yaw)) * dt * speed;
        if (moving) { const p = hero.root.position; if (canMove(p.x + dx, p.z)) p.x += dx; if (canMove(p.x, p.z + dz)) p.z += dz; const desired = Math.atan2(dx, dz); let delta = desired - hero.root.rotation.y; delta = Math.atan2(Math.sin(delta), Math.cos(delta)); hero.root.rotation.y += delta * Math.min(1, dt * 14); stepTime += dt; if (stepTime > (sprinting ? .24 : .34)) { sound('step'); stepTime = 0; } }
        walking = THREE.MathUtils.damp(walking, moving ? 1 : 0, 10, dt); hero.root.position.y = THREE.MathUtils.damp(hero.root.position.y, world.groundHeight(hero.root.position.x, hero.root.position.z), 14, dt); hero.animate(elapsed, walking, sprinting);
        if (phase === 'scavenge') {
          timeLeft = Math.max(0, timeLeft - realDt); const rounded = Math.ceil(timeLeft); if (rounded <= 15 && rounded < lastUrgency) { if (rounded === 15) showEvent('warning', 'The mountain is breaking. Return to the sanctuary!'); if (rounded === 5) showEvent('warning', 'Get inside the sanctuary. Now.'); } lastUrgency = rounded;
          updateNearest(); if (timeLeft <= 0) finishGather();
        }
      } else { hero.animate(elapsed, 0, false); }
      for (const id of ['mira', 'theron'] as const) {
        let actorMoving = 0;
        if (phase === 'scavenge' && companions.includes(id)) { const p = actors[id].root.position; const offset = id === 'mira' ? -1.25 : 1.25; temp.copy(hero.root.position).add(new THREE.Vector3(offset, 0, 1.6)); const d = Math.hypot(temp.x - p.x, temp.z - p.z); if (d > .75) { const speed = Math.min(d, 7.7) * dt; const dx = (temp.x - p.x) / d * speed, dz = (temp.z - p.z) / d * speed; p.x += dx; p.z += dz; const desired = Math.atan2(dx, dz); actors[id].root.rotation.y += Math.atan2(Math.sin(desired - actors[id].root.rotation.y), Math.cos(desired - actors[id].root.rotation.y)) * Math.min(1, dt * 8); actorMoving = 1; } p.y = world.groundHeight(p.x, p.z); }
        actors[id].animate(elapsed + (id === 'mira' ? 1 : 2.5), actorMoving, false); const marker = markers[id]; marker.children[0].rotation.y += dt; marker.children[0].position.y = 3.05 + Math.sin(elapsed * 2.1) * .12;
      }
      world.update(elapsed, dt, elapsed < markedUntil); waterUniforms.uTime.value = elapsed;
      for (let i = 0; i < smoke.length; i++) { const s = smoke[i]; const age = ((elapsed * 1.35 + i * 1.5) % 42); s.position.set(age * .29 + Math.sin(age * .21 + i) * .7, 28 + age * .73, Math.sin(age * .16 + i) * 1.3); s.scale.setScalar(4 + age * .54); (s.material as THREE.SpriteMaterial).opacity = (.21 + Math.min(.16, day * .04)) * Math.min(1, age / 5) * (1 - age / 46); }
      for (let i = 0; i < birds.length; i++) { const a = elapsed * .065 + i * .72; birds[i].position.set(Math.cos(a) * (34 + i * 2), 15 + i * .8 + Math.sin(a * 2), Math.sin(a) * 23 - 7); birds[i].rotation.y = -a; birds[i].children[0].rotation.z = -.16 + Math.sin(elapsed * 4 + i) * .21; birds[i].children[1].rotation.z = .16 - Math.sin(elapsed * 4 + i) * .21; }
      const attr = dustGeometry.attributes.position; for (let i = 0; i < attr.count; i++) { let y = attr.getY(i) - dt * (day ? .5 : .055); let x = attr.getX(i) + dt * .11; if (y < .2) y = 16; if (x > 26) x = -26; attr.setY(i, y); attr.setX(i, x); } attr.needsUpdate = true;
      for (let i = 0; i < foam.length; i++) foam[i].scale.y = .8 + Math.sin(elapsed * .6 + i) * .3;
    }
    if (phase === 'ready') {
      const angle = .31 + Math.sin(elapsed * .06) * .06; cameraPosition.set(Math.sin(angle) * 43 + 2, 24, Math.cos(angle) * 39); camera.position.lerp(cameraPosition, 1 - Math.exp(-dt * 2)); temp.set(-2.1, 1.7, -1.3); camera.lookAt(temp);
    } else {
      temp.copy(hero.root.position).add(new THREE.Vector3(-Math.sin(yaw) * 1.6, phase === 'shelter' ? 1.35 : 1.45, -Math.cos(yaw) * 1.6)); followTarget.lerp(temp, 1 - Math.exp(-dt * 7)); const currentDistance = phase === 'won' || phase === 'lost' ? Math.max(18, distance) : distance;
      cameraPosition.set(followTarget.x + Math.sin(yaw) * Math.cos(pitch) * currentDistance, followTarget.y + Math.sin(pitch) * currentDistance, followTarget.z + Math.cos(yaw) * Math.cos(pitch) * currentDistance); camera.position.lerp(cameraPosition, 1 - Math.exp(-dt * 6)); camera.lookAt(followTarget);
    }
    renderer.render(scene, camera); if (updateElapsed > .095) { emit(); updateElapsed = 0; } frame = requestAnimationFrame(animate);
  };
  camera.position.set(16, 24, 38); camera.lookAt(-2, 1.7, -1); frame = requestAnimationFrame(animate); queueMicrotask(() => { if (!destroyed) { emit(); callbacks.onReady(); } });

  return { start, pause, resume, interact, setShelter, setOutcome,
    setInput: (action, pressed) => { if (!paused || !pressed) movement[action] = pressed; },
    markSupplies: () => { markedUntil = elapsed + 10; showEvent('oracle', 'The oracle reveals nearby supplies for ten seconds.'); },
    setMuted: muted => { audioMuted = muted; if (muted && audio?.state === 'running') void audio.suspend(); else if (!muted && audio?.state === 'suspended') void audio.resume(); },
    destroy: () => {
      if (destroyed) return; destroyed = true; cancelAnimationFrame(frame); observer.disconnect(); clearInput();
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', onBlur); document.removeEventListener('visibilitychange', onVisibility); canvas.removeEventListener('pointerdown', pointerdown); canvas.removeEventListener('pointermove', pointermove); canvas.removeEventListener('pointerup', pointerup); canvas.removeEventListener('pointercancel', pointerup); canvas.removeEventListener('wheel', wheel);
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      scene.traverse(obj => { if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) geometries.add(obj.geometry); if ('material' in obj) { const mat = obj.material as THREE.Material | THREE.Material[]; for (const m of Array.isArray(mat) ? mat : [mat]) { materials.add(m); for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value); } } });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.add(smokeTexture); textures.add(marbleTexture); textures.add(skyTexture); textures.forEach(t => t.dispose()); sun.shadow.map?.dispose(); renderer.dispose(); if (audio) void audio.close();
    }
  };
}
