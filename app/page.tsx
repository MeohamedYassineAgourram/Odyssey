"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Building2, Castle, Check, ChevronRight, CircleHelp, Coins, Compass, Flame, Gamepad2, Landmark, LoaderCircle, MessageCircle, Mic, Pause, Play, ScrollText, Send, Shield, Sparkles, Sun, Swords, TreePine, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { startController, type ControllerFrame } from './oracle/gamepad';
import { activateControllerTarget, clearControllerFocus, controllerTargets, focusControllerTarget, navigateControllerMenu } from './oracle/controller-ui';
import { BLUEPRINTS, ENDINGS, MISSIONS, PLOTS, RESOURCE_NODES } from './troy/config';
import { createRun, getMissions } from './troy/rules';
import type { CharacterId, EndingKind, TroyEngine, TroySnapshot } from './troy/types';

const neutral = { x: 0, y: 0, lookX: 0, lookY: 0, sprint: false };
const initial: TroySnapshot = { ...createRun(1), phase: 'ready', paused: false, selected: 'house', nearest: null, player: { x: 0, z: 12 }, stamina: 100, enemies: 0, attackCooldown: 0, dodgeCooldown: 0, wave: 0, hint: '' };
const buildingIcons = { house: Building2, farm: TreePine, tower: Castle, temple: Landmark };
const people = { lyra: { name: 'Lyra', role: 'FOUNDER OF TROY', line: 'Give me two minutes, a hammer, and an unreasonable amount of ambition.' }, theron: { name: 'Theron', role: 'MASTER BUILDER', line: 'The first house is the hardest. Complete your contracts; the next foundations will follow.' }, mira: { name: 'Mira', role: 'KEEPER OF THE CITY', line: 'Build something worth protecting. Then keep yourself alive to protect it.' } };
type ChatLine = { role: 'user' | 'assistant'; text: string; source?: string };
type Recognition = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start(): void; stop(): void };
type Legacy = { best: number; total: number; runs: number; endings: EndingKind[]; lastEnding?: EndingKind };
const emptyLegacy: Legacy = { best: 0, total: 0, runs: 0, endings: [] };
function PadKey({ name }: { name: string }) { return <kbd className={`pad-key pad-${name.toLowerCase()}`}>{name}</kbd>; }
function readLegacy(): Legacy {
  try {
    const data = JSON.parse(localStorage.getItem('troy-legacy-v1') || '{}');
    const valid = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(Math.min(n, 1e12)) : 0;
    const endings = Array.isArray(data.endings) ? [...new Set(data.endings.filter((s: unknown) => typeof s === 'string' && Object.hasOwn(ENDINGS, s)))] as EndingKind[] : [];
    return { best: valid(data.best), total: valid(data.total), runs: valid(data.runs), endings, lastEnding: typeof data.lastEnding === 'string' && Object.hasOwn(ENDINGS, data.lastEnding) ? data.lastEnding : undefined };
  } catch { return { ...emptyLegacy }; }
}

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<TroyEngine | null>(null);
  const stateRef = useRef(initial);
  const legacyRef = useRef<Legacy>(emptyLegacy);
  const recorded = useRef<number | null>(null);
  const mutedRef = useRef(false);
  const music = useRef<HTMLAudioElement | null>(null);
  const voice = useRef<HTMLAudioElement | null>(null);
  const voiceUrl = useRef<string | null>(null);
  const voiceAbort = useRef<AbortController | null>(null);
  const chatAbort = useRef<AbortController | null>(null);
  const speech = useRef<Recognition | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeDialog = useRef(false);
  const dialogueRequest = useRef<(person: CharacterId) => void>(() => {});
  const dialogActions = useRef<{ open: (kind: 'guide' | 'missions' | 'credits' | CharacterId) => void; close: () => void }>({ open: () => {}, close: () => {} });
  const controllerFrame = useRef<(frame: ControllerFrame) => void>(() => {});
  const menuNavigationArmed = useRef(false);
  const chatBottom = useRef<HTMLDivElement>(null);
  const [state, setState] = useState(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [legacy, setLegacy] = useState<Legacy>(emptyLegacy);
  const [controller, setController] = useState({ connected: false, name: '' });
  const [modal, setModal] = useState<'guide' | 'missions' | 'credits' | null>(null);
  const [talking, setTalking] = useState<CharacterId | null>(null);
  const [messages, setMessages] = useState<Record<CharacterId, ChatLine[]>>({ lyra: [], mira: [], theron: [] });
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [services, setServices] = useState({ gemini: false, gradium: false });
  const playing = state.phase === 'playing';
  const finished = state.phase === 'ended';
  const cinematic = state.phase === 'disaster';
  const missions = getMissions(state);
  const activeMissions = missions.filter(m => !m.completed).slice(0, 3);
  const scopeSelector = talking ? '.conversation' : modal ? '.info-modal' : state.paused ? '.pause-card' : finished ? '.ending-card' : state.phase === 'ready' ? '.intro' : null;

  const announce = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3300);
  }, []);
  const changeMusic = useCallback((track: 'explore' | 'sanctuary') => {
    music.current?.pause(); const next = new Audio(`/oracle/music-${track}.mp3`);
    next.loop = true; next.volume = .28; next.muted = mutedRef.current; music.current = next;
    void next.play().then(() => setAudioBlocked(false)).catch((cause: unknown) => { if (cause instanceof DOMException && cause.name === 'NotAllowedError' && !mutedRef.current) setAudioBlocked(true); });
  }, []);
  useEffect(() => {
    let disposed = false;
    const request = new AbortController();
    legacyRef.current = readLegacy(); setLegacy(legacyRef.current);
    void fetch('/api/status', { signal: request.signal }).then(r => r.json()).then(s => { if (!disposed) setServices(s); }).catch(() => {});
    import('./troy/engine').then(({ createTroyGame }) => {
      if (disposed || !canvas.current) return;
      engine.current = createTroyGame(canvas.current, {
        onReady: () => setReady(true),
        onUpdate: next => {
          if (next.phase === 'disaster' && stateRef.current.phase !== 'disaster') { changeMusic('sanctuary'); voice.current?.pause(); }
          if (next.phase === 'ended' && next.outcome === 'legend' && recorded.current !== next.seed) {
            recorded.current = next.seed;
            const old = legacyRef.current;
            const saved: Legacy = { best: Math.max(old.best, next.score), total: old.total + next.score, runs: old.runs + 1, endings: [...new Set([...old.endings, next.ending])], lastEnding: next.ending };
            legacyRef.current = saved; setLegacy(saved);
            try { localStorage.setItem('troy-legacy-v1', JSON.stringify(saved)); } catch {}
          }
          stateRef.current = next; setState(next);
        },
        onEvent: event => announce(event.message),
        onTalk: person => dialogueRequest.current(person),
      }, legacyRef.current.lastEnding);
      engine.current.setMuted(mutedRef.current);
    }).catch(() => { if (!disposed) setError('The 3D city could not start. Enable hardware acceleration and reload in a recent desktop browser.'); });
    return () => {
      disposed = true; request.abort(); engine.current?.destroy(); engine.current = null;
      music.current?.pause(); voice.current?.pause(); speech.current?.stop(); voiceAbort.current?.abort(); chatAbort.current?.abort();
      if (voiceUrl.current) URL.revokeObjectURL(voiceUrl.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      window.speechSynthesis?.cancel();
    };
  }, [announce, changeMusic]);
  function stopVoice() {
    voiceAbort.current?.abort(); voice.current?.pause(); window.speechSynthesis?.cancel();
    if (music.current) music.current.volume = .28;
  }
  function start() {
    stopVoice(); chatAbort.current?.abort(); speech.current?.stop(); setBusy(false); setListening(false);
    setTalking(null); setModal(null); setMessages({ lyra: [], mira: [], theron: [] }); setToast(''); recorded.current = null;
    engine.current?.start(); changeMusic('explore');
    if (!mutedRef.current) {
      const intro = new Audio('/troy/intro.wav'); voice.current = intro;
      if (music.current) music.current.volume = .1;
      intro.onended = () => { if (music.current) music.current.volume = .28; };
      void intro.play().catch(() => { if (music.current) music.current.volume = .28; });
    }
  }
  function toggleSound() {
    const next = !mutedRef.current; mutedRef.current = next; setMuted(next); engine.current?.setMuted(next);
    if (music.current) { music.current.muted = next; if (!next) void music.current.play().catch(() => setAudioBlocked(true)); }
    if (next) stopVoice();
  }
  function enableAudio() {
    mutedRef.current = false; setMuted(false); engine.current?.setMuted(false);
    if (music.current) { music.current.muted = false; void music.current.play().then(() => setAudioBlocked(false)).catch(() => {}); }
    if (voice.current?.paused && voice.current.currentTime === 0) void voice.current.play().catch(() => {});
  }
  function openDialog(kind: 'guide' | 'missions' | 'credits' | CharacterId) {
    resumeDialog.current = ['playing', 'disaster'].includes(stateRef.current.phase) && !stateRef.current.paused;
    engine.current?.pause();
    if (kind === 'guide' || kind === 'missions' || kind === 'credits') setModal(kind);
    else { setTalking(kind); setPrompt(''); setVoiceStatus(''); }
  }
  function closeDialog() {
    setModal(null); setTalking(null); speech.current?.stop(); setListening(false); stopVoice(); chatAbort.current?.abort(); setBusy(false);
    if (resumeDialog.current) engine.current?.resume(); resumeDialog.current = false;
  }
  async function speak(text: string) {
    if (mutedRef.current) return;
    stopVoice(); const request = new AbortController(); voiceAbort.current = request;
    if (music.current) music.current.volume = .09;
    try {
      const response = await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]) });
      if (!response.ok) throw new Error('voice');
      const blob = await response.blob(); if (request.signal.aborted || mutedRef.current) return;
      if (voiceUrl.current) URL.revokeObjectURL(voiceUrl.current);
      voiceUrl.current = URL.createObjectURL(blob); const audio = new Audio(voiceUrl.current); voice.current = audio;
      audio.onended = () => { if (music.current) music.current.volume = .28; };
      await audio.play(); setVoiceStatus('Gradium voice');
    } catch (cause) {
      if (request.signal.aborted || mutedRef.current) return;
      if (cause instanceof DOMException && cause.name === 'NotAllowedError') { setAudioBlocked(true); setVoiceStatus('Voice ready · click Enable sound'); }
      else if ('speechSynthesis' in window) {
        const line = new SpeechSynthesisUtterance(text); line.rate = .97;
        line.onend = () => { if (music.current) music.current.volume = .28; };
        window.speechSynthesis.speak(line); setVoiceStatus('Browser voice · Gradium unavailable');
      }
      if (music.current) music.current.volume = .28;
    }
  }
  async function converse(message: string) {
    const person = talking; message = message.trim().slice(0, 500);
    if (!person || !message || busy) return;
    const history = messages[person].slice(-8); setPrompt(''); setBusy(true);
    setMessages(previous => ({ ...previous, [person]: [...previous[person], { role: 'user', text: message }] }));
    const request = new AbortController(); chatAbort.current = request;
    try {
      const current = stateRef.current;
      const response = await fetch('/api/troy/converse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character: person, message, history, context: { phase: current.phase, timeLeft: current.timeLeft, health: current.health, materials: current.materials, buildings: current.buildings.length, missions: current.completedMissions.length, kills: current.kills, selected: current.selected } }), signal: request.signal });
      if (!response.ok) throw new Error('connection');
      const reply = await response.json() as { text: string; source: string; action: string };
      if (request.signal.aborted) return;
      setMessages(previous => ({ ...previous, [person]: [...previous[person], { role: 'assistant', text: reply.text, source: reply.source }] }));
      if (reply.action === 'mark_supplies') engine.current?.markSupplies();
      void speak(reply.text);
    } catch { if (!request.signal.aborted) announce('The conversation was interrupted. Try again.'); }
    finally { if (!request.signal.aborted) setBusy(false); }
  }
  function listen() {
    if (listening) { speech.current?.stop(); return; }
    const speechWindow = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Speech = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Speech) { announce('Dictation is unavailable here. Choose a suggested reply or type your message.'); return; }
    stopVoice(); const recognition = new Speech(); speech.current = recognition; recognition.lang = 'en-US'; recognition.interimResults = false;
    recognition.onresult = event => { const text = event.results[0]?.[0]?.transcript; if (text) { setPrompt(text.slice(0, 500)); setVoiceStatus('Your words are ready. Select Send.'); } };
    recognition.onerror = () => { setListening(false); announce('Microphone unavailable. Choose a suggested reply or type.'); };
    recognition.onend = () => setListening(false);
    try { recognition.start(); setListening(true); } catch { setListening(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void converse(prompt); }

  useEffect(() => { dialogueRequest.current = person => openDialog(person); dialogActions.current = { open: openDialog, close: closeDialog }; });
  useEffect(() => { chatBottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages, busy]);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    if (talking || modal) document.querySelector<HTMLElement>('[role=dialog] button')?.focus();
    function keydown(event: KeyboardEvent) {
      if (talking || modal) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); dialogActions.current.close(); }
        if (event.key === 'Tab') {
          const dialog = document.querySelector<HTMLElement>('[role=dialog]');
          const items = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]');
          if (!items?.length) return;
          const first = items[0], last = items[items.length - 1];
          if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
        }
        return;
      }
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]') || event.repeat) return;
      if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (stateRef.current.paused) engine.current?.resume(); else engine.current?.pause(); }
      if (event.code === 'KeyT' && stateRef.current.phase === 'playing') { event.preventDefault(); dialogActions.current.open('lyra'); }
      if (event.code === 'Tab' && stateRef.current.phase === 'playing') { event.preventDefault(); dialogActions.current.open('missions'); }
    }
    window.addEventListener('keydown', keydown, true);
    return () => { window.removeEventListener('keydown', keydown, true); if (talking || modal) previousFocus?.focus(); };
  }, [talking, modal]);
  useEffect(() => startController({
    onFrame: frame => controllerFrame.current(frame),
    onConnection: next => { setController(next); if (next.connected) announce(`${next.name} connected · A build · X fight · B dodge`); else clearControllerFocus(); },
    onDisconnect: () => { resumeDialog.current = false; engine.current?.setControllerInput(neutral); engine.current?.pause(); announce('Controller disconnected. Reconnect, then press Menu to continue.'); },
  }), [announce]);
  useEffect(() => {
    menuNavigationArmed.current = false;
    if (!controller.connected || !scopeSelector) { clearControllerFocus(); return; }
    const scope = document.querySelector<HTMLElement>(scopeSelector); if (!scope) return;
    focusControllerTarget(scope.querySelector<HTMLElement>(talking ? '.suggestions button:not(:disabled)' : '.primary-button:not(:disabled)') || controllerTargets(scope)[0]);
    return clearControllerFocus;
  }, [controller.connected, scopeSelector, talking, modal, ready, busy]);
  useEffect(() => {
    controllerFrame.current = frame => {
      const scope = scopeSelector ? document.querySelector<HTMLElement>(scopeSelector) : null;
      engine.current?.setControllerInput(scope ? neutral : { x: frame.moveX, y: frame.moveY, lookX: frame.lookX, lookY: frame.lookY, sprint: frame.sprint });
      const has = (button: ControllerFrame['pressed'][number]) => frame.pressed.includes(button);
      if (has('menu') || has('b') && scope) {
        if (talking || modal) closeDialog();
        else if (stateRef.current.paused) engine.current?.resume();
        else if (['playing', 'disaster'].includes(stateRef.current.phase)) engine.current?.pause();
        return;
      }
      if (has('view') && !talking && !modal) { openDialog('guide'); return; }
      if (talking && (has('lb') || has('rb'))) {
        const ids: CharacterId[] = ['lyra', 'theron', 'mira']; const next = ids[(ids.indexOf(talking) + (has('rb') ? 1 : 2)) % 3];
        stopVoice(); speech.current?.stop(); setListening(false); chatAbort.current?.abort(); setBusy(false); setTalking(next); setPrompt(''); return;
      }
      if (talking && has('x') && !busy) { listen(); return; }
      if (scope) {
        if (!frame.navigationActive) menuNavigationArmed.current = true;
        if (frame.navigate && menuNavigationArmed.current) navigateControllerMenu(scope, frame.navigate);
        if (Math.abs(frame.lookY) > .1) (scope.querySelector<HTMLElement>('.chat-messages') || scope).scrollTop += frame.lookY * 10;
        if (has('a')) activateControllerTarget(scope);
        return;
      }
      if (stateRef.current.phase !== 'playing') return;
      if (has('a')) engine.current?.interact();
      if (has('x')) engine.current?.attack();
      if (has('b')) engine.current?.dodge();
      if (has('y')) { openDialog(stateRef.current.nearest?.character || 'lyra'); return; }
      if (has('lb')) engine.current?.cycleBuilding(-1);
      if (has('rb')) engine.current?.cycleBuilding(1);
      if (has('up')) openDialog('missions');
    };
  });

  return <main className={`oracle-app troy-app troy-${state.phase} ${controller.connected ? 'controller-active' : ''}`}>
    <canvas ref={canvas} className="world-canvas" aria-label="3D Troy city building game. Move, gather materials, construct buildings and fight raiders." />
    {state.phase === 'ready' && <div className="title-art troy-title-art" />}
    <div className="scene-shade" />
    <header className="topbar"><Link className="brand troy-brand" href="/" aria-label="Troy home"><Landmark size={25} strokeWidth={1.3} /><span>TROY <b>120</b></span></Link><div className="chapter-label"><span className="gold-dot" />{state.phase === 'ready' ? 'TWO MINUTES TO LEGEND' : cinematic ? 'A GIFT AT THE GATES' : finished ? 'CITIES FALL. LEGENDS STAY.' : 'BUILD SOMETHING WORTH REMEMBERING'}</div><div className="top-actions">{controller.connected && <span className="controller-connected" title={controller.name}><Gamepad2 size={18} /></span>}<button className="icon-button" onClick={() => openDialog('guide')} aria-label="How to play"><CircleHelp size={19} /></button><button className="icon-button" onClick={toggleSound} aria-label={muted ? 'Enable sound' : 'Mute sound'}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>{playing || cinematic ? <button className="icon-button" onClick={() => state.paused ? engine.current?.resume() : engine.current?.pause()} aria-label={state.paused ? 'Resume' : 'Pause'}>{state.paused ? <Play size={18} /> : <Pause size={18} />}</button> : null}</div></header>

    {state.phase === 'ready' && <><section className="intro troy-intro"><div className="eyebrow"><span /> AN EMPIRE ON BORROWED TIME</div><h1>Build a city.<br />Defy the odds.<br /><em>Trust no horse.</em></h1><p>Two minutes. An empty stretch of coast. Turn contracts into resources, raise the walls of Troy, and fight for every last second.</p><button className="primary-button begin" disabled={!ready || Boolean(error)} onClick={start}>{ready ? <><span>Found your Troy</span>{controller.connected ? <PadKey name="A" /> : <ArrowRight size={21} />}</> : <><LoaderCircle size={18} className="spin" /> Preparing your foundations…</>}</button><p className="controller-welcome"><Gamepad2 size={15} />{controller.connected ? 'Controller ready · press A to begin' : 'Xbox controller supported · connect and press a button'}</p><div className="intro-caption"><span>BUILD · BATTLE · BEGIN AGAIN</span><i /> 120 SECONDS</div>{error && <p className="error" role="alert">{error}</p>}</section><div className="troy-lobby-stats"><div><Trophy size={19} /><span>PERSONAL BEST<b>{legacy.best.toLocaleString()}</b></span></div><div><Flame size={19} /><span>FATES DISCOVERED<b>{legacy.endings.length}<small> / 4</small></b></span></div><small>YOUR CITY STARTS FROM SCRATCH EVERY RUN</small></div><aside className="character-preview"><Image unoptimized width={640} height={640} src="/oracle/lyra.jpg" alt="Lyra, founder of Troy" /><div><span>YOUR CITY. YOUR LEGEND.</span><strong>Lyra, the founder</strong><p>The gods admire ambition. Probably.</p></div><button onClick={() => openDialog('lyra')} aria-label="Talk to Lyra"><MessageCircle size={20} /></button></aside><footer className="landing-footer"><span>AN ORIGINAL CITY-BUILDING SURVIVAL GAME</span><button onClick={() => openDialog('credits')}>Behind the walls <ArrowUpRight size={13} /></button></footer></>}

    {playing && <>
      <section className="troy-resources" aria-label="Building materials"><div><TreePine size={19} /><span>TIMBER<b>{state.materials.wood}</b></span></div><div><Building2 size={19} /><span>STONE<b>{state.materials.stone}</b></span></div><div><Coins size={19} /><span>BRONZE<b>{state.materials.bronze}</b></span></div></section>
      <section className={`troy-clock ${state.timeLeft <= 25 ? 'urgent' : ''}`} aria-label="Time remaining"><span>TIME TO MAKE HISTORY</span><b>{Math.floor(Math.ceil(state.timeLeft) / 60)}<i>:</i>{String(Math.ceil(state.timeLeft) % 60).padStart(2, '0')}</b><div><i style={{ width: `${state.timeLeft / 120 * 100}%` }} /></div></section>
      <aside className="troy-score"><span>CITY RENOWN</span><strong>{state.score.toLocaleString()}</strong><p><Building2 size={13} /> {state.buildings.length} / 12 built <i /> <Swords size={13} /> {state.kills} defeated</p></aside>
      <section className="troy-missions"><div className="mission-heading"><ScrollText size={15} /><span>CITY CONTRACTS</span><button onClick={() => openDialog('missions')} aria-label="View every mission">{state.completedMissions.length}/{MISSIONS.length}<ChevronRight size={13} /></button></div>{activeMissions.map(mission => <div className="mission-preview" key={mission.id}><div><h3>{mission.title}</h3><span>{mission.progress}/{mission.target}</span></div><p>{mission.description}</p><div className="mission-progress"><i style={{ width: `${mission.progress / mission.target * 100}%` }} /></div><small>REWARD <b>+{mission.reward.wood} timber</b> · +{mission.reward.stone} stone · +{mission.reward.bronze} bronze</small></div>)}{activeMissions.length === 0 && <div className="all-contracts"><Check size={23} /><p>Every contract fulfilled.<br />Make the remaining seconds count.</p></div>}<button className="text-button" onClick={() => engine.current?.markSupplies()}><Compass size={13} /> Reveal resource deposits</button></section>
      {state.hint && <div className={`raid-alert ${state.enemies ? 'under-attack' : ''}`} role="status"><Shield size={19} /><div><span>{state.enemies ? `${state.enemies} RAIDERS IN THE CITY` : 'WATCH THE STREETS'}</span><p>{state.hint}</p></div></div>}
      <aside className="troy-map" aria-label="City map"><span>N</span><div>{PLOTS.map(plot => <i key={plot.id} className={state.buildings.some(b => b.plotId === plot.id) ? 'built' : ''} style={{ left: `${(plot.x + 24) / 48 * 100}%`, top: `${(plot.z + 18) / 39 * 100}%` }} />)}{RESOURCE_NODES.map(node => <b key={node.id} className={`map-node node-${node.resource}`} style={{ left: `${(node.x + 24) / 48 * 100}%`, top: `${(node.z + 18) / 39 * 100}%` }} />)}<em style={{ left: `${Math.max(1, Math.min(99, (state.player.x + 24) / 48 * 100))}%`, top: `${Math.max(1, Math.min(99, (state.player.z + 18) / 39 * 100))}%` }} /></div><small>THE FOUNDATIONS OF TROY</small></aside>
      <section className="founder-status"><button onClick={() => openDialog('lyra')} aria-label="Talk to Lyra"><Image unoptimized width={640} height={640} src="/oracle/lyra.jpg" alt="" /></button><div><span>LYRA <b>{Math.ceil(state.health)} / 100</b></span><div className={`founder-health ${state.health <= 30 ? 'critical' : ''}`}><i style={{ width: `${state.health}%` }} /></div><div className="founder-stamina"><i style={{ width: `${state.stamina}%` }} /></div><small>{state.enemies ? 'Defend your city. Dodge before the red ring strikes.' : 'Walk to a glowing plot. Lay your first foundation.'}</small></div></section>
      <section className="blueprint-dock" aria-label="Choose a building blueprint"><div className="blueprint-heading"><span>YOUR NEXT FOUNDATION</span><small>{controller.connected ? 'LB / RB' : 'Q / R'} TO CHOOSE · {controller.connected ? 'A' : 'E'} AT A PLOT TO BUILD</small></div><div>{BLUEPRINTS.map(plan => { const Icon = buildingIcons[plan.id]; return <button key={plan.id} className={state.selected === plan.id ? 'selected' : ''} onClick={() => engine.current?.selectBuilding(plan.id)} title={plan.description} aria-pressed={state.selected === plan.id}><div><Icon size={21} /><span>+{plan.points}</span></div><b>{plan.name}</b><p><span className={state.materials.wood < plan.cost.wood ? 'lacking' : ''}><TreePine size={10} />{plan.cost.wood}</span><span className={state.materials.stone < plan.cost.stone ? 'lacking' : ''}><Building2 size={10} />{plan.cost.stone}</span>{plan.cost.bronze > 0 && <span className={state.materials.bronze < plan.cost.bronze ? 'lacking' : ''}><Coins size={10} />{plan.cost.bronze}</span>}</p></button>; })}</div></section>
      {state.nearest && !talking && <button className={`interaction troy-interaction ${!state.nearest.available ? 'unavailable' : ''}`} onClick={() => engine.current?.interact()}>{controller.connected ? <PadKey name="A" /> : <kbd>E</kbd>}<span><b>{state.nearest.title}</b><small>{state.nearest.description}</small></span><ChevronRight size={17} /></button>}
      <div className="combat-buttons"><button onClick={() => engine.current?.attack()} className={state.attackCooldown > 0 ? 'cooling' : ''}><Swords size={20} /><span>{controller.connected ? 'X' : 'F'} <small>STRIKE</small></span><i style={{ transform: `scaleX(${state.attackCooldown})` }} /></button><button onClick={() => engine.current?.dodge()} className={state.dodgeCooldown > 0 ? 'cooling' : ''}><Shield size={20} /><span>{controller.connected ? 'B' : 'C'} <small>DODGE</small></span><i style={{ transform: `scaleX(${state.dodgeCooldown})` }} /></button></div>
      <div className="troy-control-hint">{controller.connected ? <><span>LS move · RS look · RT sprint</span><span>Y talk · ↑ contracts · ☰ pause</span></> : <><span>WASD move · Shift sprint · Drag to look</span><span>T talk · Tab contracts · Esc pause</span></>}</div>
      <div className="touch-controls">{[{ id: 'forward', icon: ArrowUp }, { id: 'left', icon: ArrowLeft }, { id: 'backward', icon: ArrowDown }, { id: 'right', icon: ArrowRight }].map(({ id, icon: Icon }) => <button key={id} className={`move-${id}`} aria-label={`Move ${id}`} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); engine.current?.setInput(id as 'forward', true); }} onPointerUp={() => engine.current?.setInput(id as 'forward', false)} onPointerCancel={() => engine.current?.setInput(id as 'forward', false)}><Icon size={20} /></button>)}</div>
    </>}

    {cinematic && <div className="troy-finale"><div className="finale-bars" /><section><span className="eyebrow">THE BELL TOLLS. THE GATE OPENS.</span><h1>{ENDINGS[state.ending].title}</h1><p>{ENDINGS[state.ending].subtitle}</p><small>YOUR RENOWN IS SAFE. YOUR CITY… LESS SO.</small></section></div>}
    {state.paused && !talking && !modal && <div className="pause-overlay"><section className="pause-card"><Landmark size={33} strokeWidth={1} /><span className="eyebrow">THE CLOCK IS STILL</span><h2>Troy can wait a moment.</h2><button className="primary-button" onClick={() => engine.current?.resume()}>{controller.connected ? <PadKey name="A" /> : <Play size={17} />} Continue building</button><div className="pause-links"><button onClick={toggleSound}>{muted ? 'Enable sound' : 'Mute sound'}</button><button onClick={() => openDialog('guide')}>Controls &amp; rules</button><button onClick={() => openDialog('credits')}>Credits</button></div></section></div>}
    {finished && <div className="ending-overlay troy-ending"><section className="ending-card"><div className="ending-symbol">{state.outcome === 'legend' ? <Trophy size={38} strokeWidth={1} /> : <Shield size={38} strokeWidth={1} />}</div><span className="eyebrow">{state.outcome === 'legend' ? 'TROY FELL. YOUR LEGEND DIDN’T.' : 'THE CITY LOST ITS DEFENDER'}</span><h1>{state.outcome === 'legend' ? <>Nothing lasts.<br /><em>Except your score.</em></> : <>A brave beginning.<br /><em>An early ending.</em></>}</h1><div className="final-renown"><b>{state.outcome === 'legend' ? state.score.toLocaleString() : '0'}</b><span>RENOWN BANKED</span></div><p>{state.outcome === 'legend' ? ENDINGS[state.ending].subtitle : 'The raiders overran you before the bell. No renown is banked. Your next Troy begins with empty plots and fresh supplies.'}</p><div className="score-breakdown"><span>Buildings <b>{state.constructionScore}</b></span><span>Contracts <b>{state.missionScore}</b></span><span>Combat <b>{state.combatScore}</b></span><span>Survival <b>{state.survivalScore}</b></span></div><div className="ending-records"><span>{state.buildings.length} BUILDINGS RAISED</span><span>BEST {legacy.best.toLocaleString()}</span><span>{legacy.endings.length}/4 FATES FOUND</span></div><button className="primary-button" onClick={start}>Build a greater Troy {controller.connected ? <PadKey name="A" /> : <ArrowRight size={19} />}</button><small className="reset-note">A fresh city. A fresh timer. A different kind of trouble.</small></section></div>}

    {talking && <div className="dialog-scrim" onClick={closeDialog}><aside className="conversation" role="dialog" aria-modal="true" aria-label={`Talk to ${people[talking].name}`} onClick={event => event.stopPropagation()}><div className="portrait-banner"><Image unoptimized width={640} height={640} src={`/oracle/${talking}.jpg`} alt={people[talking].name} /><div /><button className="icon-button close-chat" onClick={closeDialog} aria-label="Close conversation"><X size={20} /></button><section><span>{people[talking].role}</span><h2>{people[talking].name}</h2><p>Every great city begins with a conversation.</p></section></div><div className="chat-messages"><div className="chat-line assistant"><p>{people[talking].line}</p><small>THE CLOCK PAUSES WHILE YOU TALK</small></div>{messages[talking].map((line, index) => <div className={`chat-line ${line.role}`} key={index}><p>{line.text}</p>{line.source && <small>{line.source === 'gemini' ? 'GEMINI · IN CHARACTER' : 'LOCAL CITY GUIDE'}</small>}</div>)}{busy && <div className="chat-thinking"><i /><i /><i /><span>{people[talking].name} is thinking…</span></div>}<div ref={chatBottom} /></div><div className="chat-bottom"><div className="suggestions">{['What should I build?', 'Where are the resources?', 'How do I fight?'].map(text => <button key={text} disabled={busy} onClick={() => void converse(text)}>{text}</button>)}</div><form onSubmit={submit}><button type="button" className={`mic-button ${listening ? 'listening' : ''}`} onClick={listen} aria-label={listening ? 'Stop dictation' : 'Dictate a message'}><Mic size={19} /></button><input value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={500} placeholder={`Speak to ${people[talking].name}…`} aria-label="Your message" /><button className="send-button" disabled={busy || !prompt.trim()} aria-label="Send message">{busy ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}</button></form><p className="voice-status">{listening ? 'Listening… press the microphone to stop.' : voiceStatus || (controller.connected ? 'D-pad: choose · A: send · X: microphone · B: back' : 'Type or dictate · characters reply with a voice')}</p></div></aside></div>}
    {modal && <div className="dialog-scrim centered" onClick={closeDialog}><section className="info-modal troy-modal" role="dialog" aria-modal="true" aria-label={modal === 'missions' ? 'City contracts' : modal === 'guide' ? 'How to play' : 'Credits'} onClick={event => event.stopPropagation()}><button className="icon-button modal-close" onClick={closeDialog} aria-label="Close"><X size={21} /></button><span className="eyebrow">TROY · TWO MINUTES TO LEGEND</span><h2>{modal === 'guide' ? 'Build fast. Fight smart.' : modal === 'missions' ? 'A little work. A lot of possibility.' : 'Old myths. New possibilities.'}</h2>{modal === 'missions' ? <><p>Rewards are paid automatically when a contract is complete. Turn those materials into your next building.</p><div className="full-missions">{missions.map(m => <article key={m.id} className={m.completed ? 'complete' : ''}><div>{m.completed ? <Check size={17} /> : <ScrollText size={17} />}<h3>{m.title}</h3><b>{m.progress}/{m.target}</b></div><p>{m.description}</p><small>+{m.reward.wood} timber · +{m.reward.stone} stone · +{m.reward.bronze} bronze · +{m.points} renown</small></article>)}</div><button className="primary-button" onClick={closeDialog}>Back to the city <ArrowRight size={17} /></button></> : modal === 'guide' ? <><div className="guide-step"><span>01</span><div><h3>Make something from nothing.</h3><p>You have 120 seconds. Choose a blueprint, move beside an empty plot, and interact to construct it. Gather timber, stone, and bronze from glowing deposits; they refill after a short wait. Completed contracts award extra materials automatically.</p></div></div><div className="guide-step"><span>02</span><div><h3>Every building has a purpose.</h3><p>Houses earn 100 renown. Timber yards earn 140 and produce timber. Watchtowers earn 230 and shoot nearby raiders. Temples earn 400 and restore health. Construct as much as possible; your points survive the final catastrophe.</p></div></div><div className="guide-step"><span>03</span><div><h3>The city needs its founder alive.</h3><p>Raiding parties can end your run early. Strike nearby enemies with your sword and dodge the red attack warning. Survive until the bell to bank your renown and earn 200 bonus points. At zero health, the run ends and the next city starts from scratch.</p></div></div><div className="controller-guide"><Gamepad2 size={21} /><div><h3>Xbox controls</h3><p>Left stick moves · Right stick looks · RT sprints · A interacts/builds · X attacks · B dodges · Y talks · LB/RB choose a blueprint · D-pad up opens contracts · Menu pauses. In menus, D-pad/left stick navigates, A selects, B goes back; right stick scrolls.</p></div></div><p className="keyboard-guide">KEYBOARD: WASD move · Shift sprint · E interact/build · F or Space attack · C dodge · Q/R choose blueprint · T talk · Tab contracts · Esc pause. Drag to orbit; scroll to zoom.</p><button className="primary-button" onClick={closeDialog}>Let’s make history <ArrowRight size={17} /></button></> : <><p>An original, short city-building adventure inspired by ancient Troy and mischievous games that turn expectations upside down.</p><div className="credit-row"><Sparkles size={20} /><div><b>Google DeepMind</b><p>Gemini character dialogue and artwork. Lyria’s original exploration and sanctuary music.</p></div><span className={services.gemini ? 'connected' : ''}>{services.gemini ? 'CONNECTED' : 'LOCAL GUIDE'}</span></div><div className="credit-row"><Volume2 size={20} /><div><b>Gradium</b><p>Opening narration and spoken character replies.</p></div><span className={services.gradium ? 'connected' : ''}>{services.gradium ? 'CONNECTED' : 'BROWSER VOICE'}</span></div><div className="credit-row"><Landmark size={20} /><div><b>Made for the Paris AI Gaming Hack</b><p>Tech: Europe, Voodoo, Google DeepMind, Cognition, YG, and Gradium.</p></div></div><p className="credit-note">Google and Gradium power this build. The other event partners are credited without claiming an unconnected service integration.</p><a className="text-button" href="https://github.com/MeohamedYassineAgourram/Odyssey" target="_blank" rel="noreferrer">Explore the game’s source <ArrowUpRight size={14} /></a></>}</section></div>}
    {controller.connected && scopeSelector && <div className="controller-menu-hint"><span><PadKey name="✚" /> Navigate</span><span><PadKey name="A" /> Select</span>{!['.intro', '.ending-card'].includes(scopeSelector) && <span><PadKey name="B" /> Back</span>}{talking && <span><PadKey name="X" /> Speak</span>}</div>}
    {audioBlocked && !muted && <button className="audio-unlock" onClick={enableAudio}><Volume2 size={15} /> Click once to enable sound</button>}
    {toast && <div className="toast" role="status"><Sun size={15} />{toast}</div>}
  </main>;
}
