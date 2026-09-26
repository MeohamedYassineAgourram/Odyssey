"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Building2, Castle, Check, ChevronRight, CircleHelp, Coins, Compass, Gamepad2, Landmark, LoaderCircle, MessageCircle, Mic, Pause, Play, ScrollText, Send, Shield, Sparkles, Sun, Swords, TreePine, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { startController, type ControllerFrame } from './oracle/gamepad';
import { activateControllerTarget, clearControllerFocus, controllerTargets, focusControllerTarget, navigateControllerMenu } from './oracle/controller-ui';
import { BLUEPRINTS, ENDINGS } from './troy/config';
import { createRun, getMissions } from './troy/rules';
import { createCityMap } from './troy/maps';
import { EMPTY_PROFILE, calculateXP, getRank, getRankLadder, type ProgressProfile } from './troy/progression';
import type { CharacterId, RunState, TroyEngine, TroySnapshot } from './troy/types';

const neutral = { x: 0, y: 0, lookX: 0, lookY: 0, sprint: false };
const initial: TroySnapshot = { ...createRun(1), phase: 'ready', paused: false, selected: 'house', nearest: null, player: { x: 0, z: 12 }, stamina: 100, enemies: 0, attackCooldown: 0, dodgeCooldown: 0, wave: 0, hint: '', nextRaid: 18, enemyPositions: [] };
const buildingIcons = { house: Building2, farm: TreePine, tower: Castle, temple: Landmark };
const people = { lyra: { name: 'Lyra', role: 'FOUNDER OF TROY', line: 'Give me two minutes, a hammer, and an unreasonable amount of ambition.' }, theron: { name: 'Theron', role: 'MASTER BUILDER', line: 'The first house is the hardest. Complete your contracts; the next foundations will follow.' }, mira: { name: 'Mira', role: 'KEEPER OF THE CITY', line: 'Build something worth protecting. Then keep yourself alive to protect it.' } };
type ChatLine = { role: 'user' | 'assistant'; text: string; source?: string };
type Recognition = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start(): void; stop(): void };
type XPBreakdown = ReturnType<typeof calculateXP>;
function PadKey({ name }: { name: string }) { return <kbd className={`pad-key pad-${name.toLowerCase()}`}>{name}</kbd>; }

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<TroyEngine | null>(null);
  const stateRef = useRef(initial);
  const progressRef = useRef<ProgressProfile>(EMPTY_PROFILE);
  const runId = useRef('');
  const pendingResult = useRef<{ runId: string; state: RunState } | null>(null);
  const settleResult = useRef<(state: RunState) => void>(() => {});
  const saveAbort = useRef<AbortController | null>(null);
  const [startingRank, setStartingRank] = useState(getRank(0).label);
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
  const dialogActions = useRef<{ open: (kind: 'guide' | 'missions' | 'ranks' | 'credits' | CharacterId) => void; close: () => void }>({ open: () => {}, close: () => {} });
  const controllerFrame = useRef<(frame: ControllerFrame) => void>(() => {});
  const menuNavigationArmed = useRef(false);
  const chatBottom = useRef<HTMLDivElement>(null);
  const [state, setState] = useState(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [progress, setProgress] = useState<ProgressProfile>(EMPTY_PROFILE);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveConflict, setSaveConflict] = useState(false);
  const [resultDiscarded, setResultDiscarded] = useState(false);
  const [earnedXP, setEarnedXP] = useState<XPBreakdown | null>(null);
  const [rankUp, setRankUp] = useState(false);
  const [controller, setController] = useState({ connected: false, name: '' });
  const [modal, setModal] = useState<'guide' | 'missions' | 'ranks' | 'credits' | null>(null);
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
  const city = useMemo(() => createCityMap(state.stage, state.seed), [state.stage, state.seed]);
  const rank = getRank(progress.xp);
  const nextCity = useMemo(() => createCityMap(progress.stage, state.seed + 1), [progress.stage, state.seed]);
  const mapPoint = (x: number, z: number) => ({ left: `${Math.max(1, Math.min(99, (x - city.bounds.minX) / (city.bounds.maxX - city.bounds.minX) * 100))}%`, top: `${Math.max(1, Math.min(99, (z - city.bounds.minZ) / (city.bounds.maxZ - city.bounds.minZ) * 100))}%` });
  const incompleteMissions = missions.filter(m => !m.completed);
  const bonusMission = incompleteMissions.find(m => ['explorer', 'vanguard', 'sacred-city', 'caravan'].includes(m.id));
  const coreMissions = incompleteMissions.filter(m => m.id !== bonusMission?.id);
  const activeMissions = [coreMissions[0], bonusMission, ...coreMissions.slice(1)].filter(mission => mission !== undefined).slice(0, 3);
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
  const loadProgress = useCallback(async () => {
    try {
      const response = await fetch('/api/troy/progress', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Campaign unavailable');
      const data = await response.json() as { profile: ProgressProfile };
      progressRef.current = data.profile; setProgress(data.profile); setProfileLoaded(true); setProfileError(''); return true;
    } catch { setProfileError('Your campaign could not load. Retry to continue with your saved rank.'); return false; }
  }, []);
  useEffect(() => {
    let disposed = false;
    void Promise.resolve().then(() => { if (!disposed) return loadProgress(); });
    return () => { disposed = true; saveAbort.current?.abort(); };
  }, [loadProgress]);
  async function saveResult() {
    if (!pendingResult.current) return;
    setSaving(true); setSaveError(''); setSaveConflict(false);
    saveAbort.current?.abort(); const request = new AbortController(); saveAbort.current = request;
    try {
      const response = await fetch('/api/troy/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pendingResult.current), signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]) });
      if (response.status === 409) { setSaveConflict(true); throw new Error('campaign-conflict'); }
      if (!response.ok) throw new Error('Campaign unavailable');
      const result = await response.json() as { profile: ProgressProfile; xpAwarded: XPBreakdown; rankUp: boolean };
      if (request.signal.aborted) return;
      progressRef.current = result.profile; setProgress(result.profile); setEarnedXP(result.xpAwarded); setRankUp(result.rankUp); pendingResult.current = null;
    } catch (cause) { if (!request.signal.aborted) setSaveError(cause instanceof Error && cause.message === 'campaign-conflict' ? 'Your campaign advanced in another tab. This older expedition cannot be saved. Load your latest progress to continue.' : 'Your result has not been saved yet. Retry before leaving to keep this XP.'); }
    finally { if (!request.signal.aborted) setSaving(false); }
  }
  async function syncCampaign() {
    if (await loadProgress()) { pendingResult.current = null; setEarnedXP({ buildings: 0, combat: 0, contracts: 0, exploration: 0, survival: 0, total: 0 }); setSaveConflict(false); setSaveError(''); setResultDiscarded(true); setRankUp(false); announce('Latest campaign loaded. This older run awarded no XP.'); }
  }
  useEffect(() => { settleResult.current = result => { pendingResult.current = { runId: runId.current, state: result }; void saveResult(); }; });
  useEffect(() => {
    if (!profileLoaded) return;
    let disposed = false;
    const request = new AbortController();
    void fetch('/api/status', { signal: request.signal }).then(r => r.json()).then(s => { if (!disposed) setServices(s); }).catch(() => {});
    import('./troy/engine').then(({ createTroyGame }) => {
      if (disposed || !canvas.current) return;
      engine.current = createTroyGame(canvas.current, {
        onReady: () => setReady(true),
        onUpdate: next => {
          if (next.phase === 'disaster' && stateRef.current.phase !== 'disaster') { changeMusic('sanctuary'); voice.current?.pause(); }
          if (next.phase === 'ended' && recorded.current !== next.seed) {
            recorded.current = next.seed; settleResult.current(next);
          }
          stateRef.current = next; setState(next);
        },
        onEvent: event => announce(event.message),
        onTalk: person => dialogueRequest.current(person),
      }, progressRef.current.lastEnding, progressRef.current.stage);
      engine.current.setMuted(mutedRef.current);
    }).catch(() => { if (!disposed) setError('The 3D city could not start. Enable hardware acceleration and reload in a recent desktop browser.'); });
    return () => {
      disposed = true; request.abort(); engine.current?.destroy(); engine.current = null;
      music.current?.pause(); voice.current?.pause(); speech.current?.stop(); voiceAbort.current?.abort(); chatAbort.current?.abort();
      if (voiceUrl.current) URL.revokeObjectURL(voiceUrl.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      window.speechSynthesis?.cancel();
    };
  }, [announce, changeMusic, profileLoaded]);
  function stopVoice() {
    voiceAbort.current?.abort(); voice.current?.pause(); window.speechSynthesis?.cancel();
    if (music.current) music.current.volume = .28;
  }
  function start() {
    if (!profileLoaded || saving || pendingResult.current || !engine.current) return;
    stopVoice(); chatAbort.current?.abort(); speech.current?.stop(); setBusy(false); setListening(false);
    setTalking(null); setModal(null); setMessages({ lyra: [], mira: [], theron: [] }); setToast(''); recorded.current = null;
    runId.current = crypto.randomUUID(); setStartingRank(getRank(progressRef.current.xp).label);
    setEarnedXP(null); setRankUp(false); setSaveError(''); setResultDiscarded(false);
    engine.current?.start(progressRef.current.stage); changeMusic('explore');
    if (!mutedRef.current && progressRef.current.runs === 0) {
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
  function openDialog(kind: 'guide' | 'missions' | 'ranks' | 'credits' | CharacterId) {
    if (!modal && !talking) resumeDialog.current = ['playing', 'disaster'].includes(stateRef.current.phase) && !stateRef.current.paused;
    engine.current?.pause();
    if (kind === 'guide' || kind === 'missions' || kind === 'ranks' || kind === 'credits') setModal(kind);
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
      const response = await fetch('/api/troy/converse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character: person, message, history, context: { phase: current.phase, timeLeft: current.timeLeft, health: current.health, materials: current.materials, buildings: current.buildings.length, missions: current.completedMissions.length, kills: current.kills, selected: current.selected, stage: current.stage, explored: current.explored.length, seed: current.seed } }), signal: request.signal });
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
  }, [controller.connected, scopeSelector, talking, modal, ready, busy, saving, earnedXP, saveError, profileError]);
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
    <header className="topbar"><Link className="brand troy-brand" href="/" aria-label="Troy home"><Landmark size={25} strokeWidth={1.3} /><span>TROY <b>120</b></span></Link><div className="chapter-label"><span className="gold-dot" />{state.phase === 'ready' ? 'TWO MINUTES TO LEGEND' : cinematic ? 'A GIFT AT THE GATES' : finished ? 'CITIES FALL. LEGENDS STAY.' : `CITY ${state.stage} · ${city.name.toUpperCase()}`}</div><div className="top-actions"><button className="rank-top-button" onClick={() => openDialog('ranks')} style={{ color: rank.color }} aria-label="View your XP and ranks"><Trophy size={16} /><span>{rank.label}</span></button>{controller.connected && <span className="controller-connected" title={controller.name}><Gamepad2 size={18} /></span>}<button className="icon-button" onClick={() => openDialog('guide')} aria-label="How to play"><CircleHelp size={19} /></button><button className="icon-button" onClick={toggleSound} aria-label={muted ? 'Enable sound' : 'Mute sound'}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>{playing || cinematic ? <button className="icon-button" onClick={() => state.paused ? engine.current?.resume() : engine.current?.pause()} aria-label={state.paused ? 'Resume' : 'Pause'}>{state.paused ? <Play size={18} /> : <Pause size={18} />}</button> : null}</div></header>

    {state.phase === 'ready' && <><section className="intro troy-intro"><div className="eyebrow"><span /> AN EMPIRE ON BORROWED TIME</div><h1>Build a city.<br />Defy the odds.<br /><em>Trust no horse.</em></h1><p>A new city. A fiercer siege. Explore distant districts, build your defenses, and survive two minutes to advance. Every battle earns XP. Every city raises the stakes.</p><button className="primary-button begin" disabled={!ready || !profileLoaded || Boolean(error)} onClick={start}>{ready ? <><span>{progress.stage > 1 ? `Continue · City ${progress.stage}` : 'Begin your campaign'}</span>{controller.connected ? <PadKey name="A" /> : <ArrowRight size={21} />}</> : <><LoaderCircle size={18} className="spin" /> {profileLoaded ? 'Preparing your city…' : 'Loading your campaign…'}</>}</button><p className="controller-welcome"><Gamepad2 size={15} />{controller.connected ? 'Controller ready · press A to begin' : 'Xbox controller supported · connect and press a button'}</p><div className="intro-caption"><span>EXPLORE · SURVIVE · RANK UP</span><i /> 120 SECONDS</div>{error && <p className="error" role="alert">{error}</p>}{profileError && <div className="campaign-error" role="alert"><p>{profileError}</p><button onClick={() => void loadProgress()}>Retry loading campaign</button></div>}</section><section className="campaign-card"><span className="eyebrow">YOUR CAMPAIGN</span><button className="campaign-rank" onClick={() => openDialog('ranks')}><div className="rank-emblem" style={{ color: rank.color, borderColor: rank.color }}><Trophy size={28} /></div><div><small>CURRENT RANK</small><strong style={{ color: rank.color }}>{rank.label}</strong><span>{progress.xp.toLocaleString()} TOTAL XP</span></div><ChevronRight size={15} /></button><div className="rank-meter"><i style={{ width: `${rank.progress * 100}%`, background: rank.color }} /></div><p>{rank.next === null ? 'Highest rank achieved. Your legend keeps growing.' : `${(rank.next - progress.xp).toLocaleString()} XP to your next promotion`}</p><div className="campaign-destination"><Compass size={20} /><div><small>NEXT EXPEDITION · CITY {progress.stage}</small><b>{city.name}</b><span>{city.subtitle}</span></div></div><div className="campaign-records"><span><b>{progress.clears}</b>CITIES SURVIVED</span><span><b>{progress.best.toLocaleString()}</b>BEST RENOWN</span></div><button className="text-button" onClick={() => openDialog('ranks')}>Explore the rank ladder <ArrowUpRight size={13} /></button></section><aside className="character-preview"><Image unoptimized width={640} height={640} src="/oracle/lyra.jpg" alt="Lyra, founder of Troy" /><div><span>YOUR CITY. YOUR LEGEND.</span><strong>Lyra, the founder</strong><p>New cities. New enemies. The same suspicious gift.</p></div><button onClick={() => openDialog('lyra')} aria-label="Talk to Lyra"><MessageCircle size={20} /></button></aside><footer className="landing-footer"><span>AN ORIGINAL CITY-BUILDING SURVIVAL GAME</span><button onClick={() => openDialog('credits')}>Behind the walls <ArrowUpRight size={13} /></button></footer></>}

    {playing && <>
      <section className="troy-resources" aria-label="Building materials"><div><TreePine size={19} /><span>TIMBER<b>{state.materials.wood}</b></span></div><div><Building2 size={19} /><span>STONE<b>{state.materials.stone}</b></span></div><div><Coins size={19} /><span>BRONZE<b>{state.materials.bronze}</b></span></div></section>
      <section className={`troy-clock ${state.timeLeft <= 25 ? 'urgent' : ''}`} aria-label="Time remaining"><span>TIME TO MAKE HISTORY</span><b>{Math.floor(Math.ceil(state.timeLeft) / 60)}<i>:</i>{String(Math.ceil(state.timeLeft) % 60).padStart(2, '0')}</b><div><i style={{ width: `${state.timeLeft / 120 * 100}%` }} /></div></section>
      <aside className="troy-score"><span>CITY RENOWN</span><strong>{state.score.toLocaleString()}</strong><p><Building2 size={13} /> {state.buildings.length} / {city.plots.length} built <i /> <Swords size={13} /> {state.kills} defeated</p></aside>
      <section className="troy-missions"><div className="mission-heading"><ScrollText size={15} /><span>EXPEDITION CONTRACTS</span><button onClick={() => openDialog('missions')} aria-label="View every mission">{state.completedMissions.length}/{missions.length}<ChevronRight size={13} /></button></div>{activeMissions.map(mission => <div className={`mission-preview ${bonusMission?.id === mission.id ? 'bonus-contract' : ''}`} key={mission.id}><div><h3>{mission.title}</h3><span>{mission.progress}/{mission.target}</span></div><p>{mission.description}</p><div className="mission-progress"><i style={{ width: `${mission.progress / mission.target * 100}%` }} /></div><small>REWARD <b>+{mission.reward.wood} timber</b> · +{mission.reward.stone} stone · +{mission.reward.bronze} bronze</small></div>)}{activeMissions.length === 0 && <div className="all-contracts"><Check size={23} /><p>Every contract fulfilled.<br />Make the remaining seconds count.</p></div>}<button className="text-button" onClick={() => engine.current?.markSupplies()}><Compass size={13} /> Reveal resource deposits</button></section>
      {<div className={`raid-alert ${state.enemies ? 'under-attack' : ''}`} role="status"><Shield size={19} /><div><span>{state.enemies ? `${state.enemies} ENEMIES · WAVE ${state.wave}` : `NEXT RAID IN ${Math.ceil(state.nextRaid)}s`}</span><p>{state.hint || (state.enemies ? 'Red blades rush. Purple brutes endure. Gold bows strike from afar.' : 'Explore the outer districts. Build towers before the siege.')}</p></div></div>}
      <aside className="troy-map campaign-map" aria-label="City map: plots, resources, landmarks and enemies"><span>N</span><div>{city.plots.map(plot => <i key={plot.id} className={state.buildings.some(b => b.plotId === plot.id) ? 'built' : ''} style={mapPoint(plot.x, plot.z)} />)}{city.resources.map(node => <b key={node.id} className={`map-node node-${node.resource}`} style={mapPoint(node.x, node.z)} />)}{city.landmarks.filter(point => !state.explored.includes(point.id)).map(point => <strong key={point.id} className="map-landmark" style={mapPoint(point.x, point.z)} title={point.name}>◆</strong>)}{state.enemyPositions.map((enemy, index) => <s key={index} className={`map-enemy enemy-${enemy.kind}`} style={mapPoint(enemy.x, enemy.z)} />)}<em style={mapPoint(state.player.x, state.player.z)} /></div><small>{city.name.toUpperCase()}</small><p>◆ {state.explored.length}/{city.landmarks.length} CACHES · <span>{state.enemies} HOSTILES</span></p></aside>
      <section className="founder-status"><button onClick={() => openDialog('lyra')} aria-label="Talk to Lyra"><Image unoptimized width={640} height={640} src="/oracle/lyra.jpg" alt="" /></button><div><span>LYRA <b>{Math.ceil(state.health)} / 100</b></span><div className={`founder-health ${state.health <= 30 ? 'critical' : ''}`}><i style={{ width: `${state.health}%` }} /></div><div className="founder-stamina"><i style={{ width: `${state.stamina}%` }} /></div><small>{state.enemies ? 'Defend your city. Dodge before the red ring strikes.' : state.buildings.length ? 'Explore gold beacons for supplies and bonus XP.' : 'Walk to a glowing plot. Lay your first foundation.'}</small></div></section>
      <section className="blueprint-dock" aria-label="Choose a building blueprint"><div className="blueprint-heading"><span>YOUR NEXT FOUNDATION</span><small>{controller.connected ? 'LB / RB' : 'Q / R'} TO CHOOSE · {controller.connected ? 'A' : 'E'} AT A PLOT TO BUILD</small></div><div>{BLUEPRINTS.map(plan => { const Icon = buildingIcons[plan.id]; return <button key={plan.id} className={state.selected === plan.id ? 'selected' : ''} onClick={() => engine.current?.selectBuilding(plan.id)} title={plan.description} aria-pressed={state.selected === plan.id}><div><Icon size={21} /><span>+{plan.points}</span></div><b>{plan.name}</b><p><span className={state.materials.wood < plan.cost.wood ? 'lacking' : ''}><TreePine size={10} />{plan.cost.wood}</span><span className={state.materials.stone < plan.cost.stone ? 'lacking' : ''}><Building2 size={10} />{plan.cost.stone}</span>{plan.cost.bronze > 0 && <span className={state.materials.bronze < plan.cost.bronze ? 'lacking' : ''}><Coins size={10} />{plan.cost.bronze}</span>}</p></button>; })}</div></section>
      {state.nearest && !talking && <button className={`interaction troy-interaction ${!state.nearest.available ? 'unavailable' : ''}`} onClick={() => engine.current?.interact()}>{controller.connected ? <PadKey name="A" /> : <kbd>E</kbd>}<span><b>{state.nearest.title}</b><small>{state.nearest.description}</small></span><ChevronRight size={17} /></button>}
      <div className="combat-buttons"><button onClick={() => engine.current?.attack()} className={state.attackCooldown > 0 ? 'cooling' : ''}><Swords size={20} /><span>{controller.connected ? 'X' : 'F'} <small>STRIKE</small></span><i style={{ transform: `scaleX(${state.attackCooldown})` }} /></button><button onClick={() => engine.current?.dodge()} className={state.dodgeCooldown > 0 ? 'cooling' : ''}><Shield size={20} /><span>{controller.connected ? 'B' : 'C'} <small>DODGE</small></span><i style={{ transform: `scaleX(${state.dodgeCooldown})` }} /></button></div>
      <div className="troy-control-hint">{controller.connected ? <><span>LS move · RS look · RT sprint</span><span>Y talk · ↑ contracts · ☰ pause</span></> : <><span>WASD move · Shift sprint · Drag to look</span><span>T talk · Tab contracts · Esc pause</span></>}</div>
      <div className="touch-controls">{[{ id: 'forward', icon: ArrowUp }, { id: 'left', icon: ArrowLeft }, { id: 'backward', icon: ArrowDown }, { id: 'right', icon: ArrowRight }].map(({ id, icon: Icon }) => <button key={id} className={`move-${id}`} aria-label={`Move ${id}`} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); engine.current?.setInput(id as 'forward', true); }} onPointerUp={() => engine.current?.setInput(id as 'forward', false)} onPointerCancel={() => engine.current?.setInput(id as 'forward', false)}><Icon size={20} /></button>)}</div>
    </>}

    {cinematic && <div className="troy-finale"><div className="finale-bars" /><section><span className="eyebrow">ANOTHER CITY FALLS. THE CAMPAIGN CONTINUES.</span><h1>{ENDINGS[state.ending].title}</h1><p>{ENDINGS[state.ending].subtitle}</p><small>SURVIVAL UNLOCKS A NEW CITY AND A HARDER SIEGE.</small></section></div>}
    {state.paused && !talking && !modal && <div className="pause-overlay"><section className="pause-card"><Landmark size={33} strokeWidth={1} /><span className="eyebrow">THE CLOCK IS STILL</span><h2>Troy can wait a moment.</h2><button className="primary-button" onClick={() => engine.current?.resume()}>{controller.connected ? <PadKey name="A" /> : <Play size={17} />} Continue building</button><div className="pause-links"><button onClick={toggleSound}>{muted ? 'Enable sound' : 'Mute sound'}</button><button onClick={() => openDialog('guide')}>Controls &amp; rules</button><button onClick={() => openDialog('ranks')}>Campaign ranks</button><button onClick={() => openDialog('credits')}>Credits</button></div></section></div>}
    {finished && <div className="ending-overlay troy-ending"><section className="ending-card"><div className="ending-symbol">{state.outcome === 'legend' ? <Trophy size={38} strokeWidth={1} /> : <Shield size={38} strokeWidth={1} />}</div><span className="eyebrow">{state.outcome === 'legend' ? `CITY ${state.stage} SURVIVED · EXPEDITION COMPLETE` : `CITY ${state.stage} · DEFENDER FALLEN`}</span><h1>{state.outcome === 'legend' ? <>A city falls.<br /><em>A legend rises.</em></> : <>The siege won.<br /><em>Learn. Return. Conquer.</em></>}</h1><div className="final-renown"><b>{state.outcome === 'legend' && !resultDiscarded ? state.score.toLocaleString() : '0'}</b><span>{state.outcome === 'legend' && !earnedXP ? 'RENOWN · SAVE PENDING' : 'RENOWN BANKED'}</span></div><p>{state.outcome === 'legend' ? ENDINGS[state.ending].subtitle : 'Your city is lost, but the experience stays with you. Keep the XP you earned and retry this expedition with a different plan.'}</p><div className="score-breakdown"><span>Buildings <b>{state.constructionScore}</b></span><span>Contracts <b>{state.missionScore}</b></span><span>Combat <b>{state.combatScore}</b></span><span>Exploration <b>{state.expeditionScore}</b></span><span>Survival <b>{state.survivalScore}</b></span></div><div className="ending-records"><span>{state.buildings.length} BUILDINGS RAISED</span><span>BEST {progress.best.toLocaleString()}</span><span>{progress.endings.length}/4 FATES FOUND</span></div><div className={`xp-results ${rankUp ? 'promoted' : ''}`}><div className="xp-result-top"><Trophy size={23} style={{ color: rank.color }} /><div><span>{resultDiscarded ? 'RESULT NOT SAVED' : rankUp ? 'RANK PROMOTION' : 'CAMPAIGN EXPERIENCE'}</span><b style={{ color: rank.color }}>{rankUp ? `${startingRank} → ${rank.label}` : rank.label}</b></div><strong>+{(earnedXP || calculateXP(state)).total}<small>XP{saving || saveError ? ' PENDING' : ''}</small></strong></div><div className="rank-meter"><i style={{ width: `${rank.progress * 100}%`, background: rank.color }} /></div><p>{rank.next === null ? 'Your legend grows beyond the highest rank.' : `${progress.xp.toLocaleString()} / ${rank.next.toLocaleString()} XP to the next rank`}</p><div className="xp-sources"><span>Build +{(earnedXP || calculateXP(state)).buildings}</span><span>Battle +{(earnedXP || calculateXP(state)).combat}</span><span>Contracts +{(earnedXP || calculateXP(state)).contracts}</span><span>Explore +{(earnedXP || calculateXP(state)).exploration}</span><span>Survive +{(earnedXP || calculateXP(state)).survival}</span></div></div>{saveError && <div className="campaign-error" role="alert"><p>{saveError}</p><button onClick={() => void (saveConflict ? syncCampaign() : saveResult())}>{saveConflict ? 'Load latest campaign' : 'Retry saving XP'}</button></div>}<button className="primary-button" disabled={saving || Boolean(saveError) || !earnedXP} onClick={start}>{saving ? <><LoaderCircle size={17} className="spin" /> Saving your progress…</> : <>{progress.stage > state.stage ? `Explore ${nextCity.name} · City ${progress.stage}` : `Retry ${city.name}`}{controller.connected ? <PadKey name="A" /> : <ArrowRight size={19} />}</>}</button><small className="reset-note">{state.outcome === 'legend' ? 'A new layout. More enemies. A harder siege.' : 'A fresh city and new contracts. Your XP and rank are kept.'}</small></section></div>}

    {talking && <div className="dialog-scrim" onClick={closeDialog}><aside className="conversation" role="dialog" aria-modal="true" aria-label={`Talk to ${people[talking].name}`} onClick={event => event.stopPropagation()}><div className="portrait-banner"><Image unoptimized width={640} height={640} src={`/oracle/${talking}.jpg`} alt={people[talking].name} /><div /><button className="icon-button close-chat" onClick={closeDialog} aria-label="Close conversation"><X size={20} /></button><section><span>{people[talking].role}</span><h2>{people[talking].name}</h2><p>Every great city begins with a conversation.</p></section></div><div className="chat-messages"><div className="chat-line assistant"><p>{people[talking].line}</p><small>THE CLOCK PAUSES WHILE YOU TALK</small></div>{messages[talking].map((line, index) => <div className={`chat-line ${line.role}`} key={index}><p>{line.text}</p>{line.source && <small>{line.source === 'gemini' ? 'GEMINI · IN CHARACTER' : 'LOCAL CITY GUIDE'}</small>}</div>)}{busy && <div className="chat-thinking"><i /><i /><i /><span>{people[talking].name} is thinking…</span></div>}<div ref={chatBottom} /></div><div className="chat-bottom"><div className="suggestions">{['What should I build?', 'Where are the resources?', 'How do I fight?'].map(text => <button key={text} disabled={busy} onClick={() => void converse(text)}>{text}</button>)}</div><form onSubmit={submit}><button type="button" className={`mic-button ${listening ? 'listening' : ''}`} onClick={listen} aria-label={listening ? 'Stop dictation' : 'Dictate a message'}><Mic size={19} /></button><input value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={500} placeholder={`Speak to ${people[talking].name}…`} aria-label="Your message" /><button className="send-button" disabled={busy || !prompt.trim()} aria-label="Send message">{busy ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}</button></form><p className="voice-status">{listening ? 'Listening… press the microphone to stop.' : voiceStatus || (controller.connected ? 'D-pad: choose · A: send · X: microphone · B: back' : 'Type or dictate · characters reply with a voice')}</p></div></aside></div>}
    {modal && <div className="dialog-scrim centered" onClick={closeDialog}><section className="info-modal troy-modal" role="dialog" aria-modal="true" aria-label={modal === 'missions' ? 'City contracts' : modal === 'guide' ? 'How to play' : modal === 'ranks' ? 'Campaign ranks' : 'Credits'} onClick={event => event.stopPropagation()}><button className="icon-button modal-close" onClick={closeDialog} aria-label="Close"><X size={21} /></button><span className="eyebrow">TROY · TWO MINUTES TO LEGEND</span><h2>{modal === 'guide' ? 'Build fast. Fight smart.' : modal === 'missions' ? 'New contracts. New possibilities.' : modal === 'ranks' ? 'Every expedition leaves its mark.' : 'Old myths. New possibilities.'}</h2>{modal === 'missions' ? <><p>Rewards are paid automatically when a contract is complete. Turn those materials into your next building.</p><div className="full-missions">{missions.map(m => <article key={m.id} className={m.completed ? 'complete' : ''}><div>{m.completed ? <Check size={17} /> : <ScrollText size={17} />}<h3>{m.title}</h3><b>{m.progress}/{m.target}</b></div><p>{m.description}</p><small>+{m.reward.wood} timber · +{m.reward.stone} stone · +{m.reward.bronze} bronze · +{m.points} renown</small></article>)}</div><button className="primary-button" onClick={closeDialog}>Back to the city <ArrowRight size={17} /></button></> : modal === 'ranks' ? <><p>Earn XP by building, fighting, completing contracts, finding caches, and surviving. Defeat keeps your earned XP. Each successful expedition unlocks the next city with tougher enemies.</p><div className="rank-summary"><Trophy size={34} style={{ color: rank.color }} /><div><b style={{ color: rank.color }}>{rank.label}</b><span>{progress.xp.toLocaleString()} XP · {progress.clears} cities survived</span></div></div><div className="rank-ladder">{getRankLadder().map(tier => <div key={tier.label} className={`${progress.xp >= tier.floor ? 'unlocked' : ''} ${rank.label === tier.label ? 'current-rank' : ''}`}><Trophy size={17} style={{ color: tier.color }} /><b>{tier.label}</b><span>{tier.floor.toLocaleString()} XP</span>{rank.label === tier.label && <small>YOU</small>}</div>)}</div><p className="rank-save-note">Your campaign saves automatically after each run. This is a personal progression rank.</p><button className="primary-button" onClick={closeDialog}>Back to the expedition <ArrowRight size={17} /></button></> : modal === 'guide' ? <><div className="guide-step"><span>01</span><div><h3>Make something from nothing.</h3><p>You have 120 seconds. Choose a blueprint, move beside an empty plot, and interact to construct it. Explore five districts for timber, stone, bronze, and four golden supply caches. Deposits refill after a short wait. Each expedition brings new bonus contracts; completed contracts award materials automatically.</p></div></div><div className="guide-step"><span>02</span><div><h3>Every building has a purpose.</h3><p>Houses earn 100 renown. Timber yards earn 140 and produce timber. Watchtowers earn 230 and shoot nearby raiders. Temples earn 400 and restore health. Construct as much as possible; your points survive the final catastrophe.</p></div></div><div className="guide-step"><span>03</span><div><h3>The city needs its founder alive.</h3><p>Raids keep coming. Quick skirmishers chase you, armored brutes absorb blows, and archers fire from range. Dodge telegraphed attacks and use watchtowers. Survive the bell and horse finale to unlock a different city with tougher raids. At zero health, retry the same expedition. Every finished attempt earns XP toward permanent rank promotions.</p></div></div><div className="controller-guide"><Gamepad2 size={21} /><div><h3>Xbox controls</h3><p>Left stick moves · Right stick looks · RT sprints · A interacts/builds · X attacks · B dodges · Y talks · LB/RB choose a blueprint · D-pad up opens contracts · Menu pauses. In menus, D-pad/left stick navigates, A selects, B goes back; right stick scrolls.</p></div></div><p className="keyboard-guide">KEYBOARD: WASD move · Shift sprint · E interact/build · F or Space attack · C dodge · Q/R choose blueprint · T talk · Tab contracts · Esc pause. Drag to orbit; scroll to zoom.</p><button className="primary-button" onClick={closeDialog}>Let’s make history <ArrowRight size={17} /></button></> : <><p>An original city-building campaign inspired by ancient Troy. Explore four city themes, survive escalating sieges, and rise through a personal XP rank ladder.</p><div className="credit-row"><Sparkles size={20} /><div><b>Google DeepMind</b><p>Gemini character dialogue and artwork. Lyria’s original exploration and sanctuary music.</p></div><span className={services.gemini ? 'connected' : ''}>{services.gemini ? 'CONNECTED' : 'LOCAL GUIDE'}</span></div><div className="credit-row"><Volume2 size={20} /><div><b>Gradium</b><p>Opening narration and spoken character replies.</p></div><span className={services.gradium ? 'connected' : ''}>{services.gradium ? 'CONNECTED' : 'BROWSER VOICE'}</span></div><div className="credit-row"><Landmark size={20} /><div><b>Made for the Paris AI Gaming Hack</b><p>Tech: Europe, Voodoo, Google DeepMind, Cognition, YG, and Gradium.</p></div></div><p className="credit-note">Google and Gradium power this build. The other event partners are credited without claiming an unconnected service integration.</p><a className="text-button" href="https://github.com/MeohamedYassineAgourram/Odyssey" target="_blank" rel="noreferrer">Explore the game’s source <ArrowUpRight size={14} /></a></>}</section></div>}
    {controller.connected && scopeSelector && <div className="controller-menu-hint"><span><PadKey name="✚" /> Navigate</span><span><PadKey name="A" /> Select</span>{!['.intro', '.ending-card'].includes(scopeSelector) && <span><PadKey name="B" /> Back</span>}{talking && <span><PadKey name="X" /> Speak</span>}</div>}
    {audioBlocked && !muted && <button className="audio-unlock" onClick={enableAudio}><Volume2 size={15} /> Click once to enable sound</button>}
    {toast && <div className="toast" role="status"><Sun size={15} />{toast}</div>}
  </main>;
}
