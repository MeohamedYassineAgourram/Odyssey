"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Check, ChevronRight, CircleHelp, Compass, Gamepad2, Flame, Hammer, Heart, Leaf, LoaderCircle, MessageCircle, Mic, Moon, Pause, Play, Send, Shield, Sparkles, Sun, Volume2, VolumeX, Waves, Wheat, Wind, X } from 'lucide-react';
import type { CampState, CharacterId, OracleEngine, Resource, WorldSnapshot } from './oracle/types';
import { startController, type ControllerFrame } from './oracle/gamepad';
import { activateControllerTarget, clearControllerFocus, controllerTargets, focusControllerTarget, navigateControllerMenu } from './oracle/controller-ui';
import { canChoose, chooseCamp, createCamp, endDay, performCampAction } from './oracle/rules';

function PadKey({ name }: { name: string }) { return <kbd className={`pad-key pad-${name.toLowerCase()}`}>{name}</kbd>; }

const neutralController = { x: 0, y: 0, lookX: 0, lookY: 0, sprint: false };
const initial: WorldSnapshot = { phase: 'ready', timeLeft: 60, inventory: { food: 0, water: 0, herbs: 0, wood: 0 }, companions: [], nearest: null, player: { x: 0, z: 0 }, stamina: 100, paused: false };
const characters = {
  lyra: { name: 'Lyra', role: 'THE COURIER', line: 'The mountain is waking. We still have time to save each other.' },
  mira: { name: 'Mira', role: 'THE HEALER', line: 'Bring me herbs, and I will do everything I can.' },
  theron: { name: 'Theron', role: 'THE SHIPWRIGHT', line: 'A beacon needs good timber. A rescue needs a little hope.' },
};
const resources = [{ id: 'food', name: 'Food', icon: Wheat }, { id: 'water', name: 'Water', icon: Waves }, { id: 'herbs', name: 'Herbs', icon: Leaf }, { id: 'wood', name: 'Timber', icon: Hammer }] as const;
type ChatLine = { role: 'user' | 'assistant'; text: string; source?: string };
type Recognition = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start(): void; stop(): void };

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controllerFrame = useRef<(frame: ControllerFrame) => void>(() => {});
  const menuNavigationArmed = useRef(false);
  const engine = useRef<OracleEngine | null>(null);
  const worldRef = useRef(initial);
  const campRef = useRef<CampState | null>(null);
  const music = useRef<HTMLAudioElement | null>(null);
  const voice = useRef<HTMLAudioElement | null>(null);
  const voiceUrl = useRef<string | null>(null);
  const mutedRef = useRef(false);
  const speech = useRef<Recognition | null>(null);
  const chatAbort = useRef<AbortController | null>(null);
  const voiceAbort = useRef<AbortController | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeDialog = useRef(false);
  const chatBottom = useRef<HTMLDivElement>(null);
  const [world, setWorld] = useState(initial);
  const [camp, setCamp] = useState<CampState | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState('');
  const [journal, setJournal] = useState(true);
  const [modal, setModal] = useState<'guide' | 'credits' | null>(null);
  const [talking, setTalking] = useState<CharacterId | null>(null);
  const [messages, setMessages] = useState<Record<CharacterId, ChatLine[]>>({ lyra: [], mira: [], theron: [] });
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [rations, setRations] = useState({ food: true, water: true });
  const [controller, setController] = useState({ connected: false, name: '' });
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterId>('lyra');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [services, setServices] = useState({ gemini: false, gradium: false, devin: false });
  const started = world.phase !== 'ready';
  const finished = world.phase === 'won' || world.phase === 'lost';
  const inventory = camp?.inventory || world.inventory;
  const companions = camp?.companions || world.companions;
  const controllerScope = talking ? '.conversation' : modal ? '.info-modal' : world.paused && started && !finished ? '.pause-card' : finished ? '.ending-card' : world.phase === 'ready' ? '.intro' : camp && journal ? '.journal-panel' : null;

  const announce = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3700);
  }, []);

  const changeMusic = useCallback((track: 'explore' | 'sanctuary') => {
    music.current?.pause();
    const next = new Audio(`/oracle/music-${track}.mp3`);
    next.loop = true; next.volume = .27; next.muted = mutedRef.current;
    music.current = next;
    void next.play().then(() => setAudioBlocked(false)).catch((cause: unknown) => { if (cause instanceof DOMException && cause.name === 'NotAllowedError' && !mutedRef.current) setAudioBlocked(true); });
  }, []);

  useEffect(() => {
    let disposed = false;
    const request = new AbortController();
    void fetch('/api/status', { signal: request.signal }).then(r => r.json()).then(s => { if (!disposed) setServices(s); }).catch(() => {});
    import('./oracle/engine').then(({ createOracleGame }) => {
      if (disposed || !canvas.current) return;
      engine.current = createOracleGame(canvas.current, {
        onReady: () => setReady(true),
        onUpdate: next => { worldRef.current = next; setWorld(next); },
        onEvent: event => announce(event.message),
        onGatherEnd: result => {
          if (!result.escaped) { engine.current?.setOutcome(false); return; }
          const next = createCamp(result); campRef.current = next; setCamp(next);
          setJournal(true); setRations({ food: true, water: true });
          engine.current?.setShelter(next.day, next.companions); changeMusic('sanctuary');
          announce('You reached the sanctuary. Keep the flame alive for five days.');
        },
      });
      engine.current.setMuted(mutedRef.current);
    }).catch(() => { if (!disposed) setError('The 3D world could not start. Please enable hardware acceleration and reload in a recent desktop browser.'); });
    return () => {
      disposed = true; request.abort(); engine.current?.destroy(); engine.current = null;
      music.current?.pause(); voice.current?.pause(); speech.current?.stop();
      chatAbort.current?.abort(); voiceAbort.current?.abort();
      if (voiceUrl.current) URL.revokeObjectURL(voiceUrl.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      window.speechSynthesis?.cancel();
    };
  }, [announce, changeMusic]);

  useEffect(() => { chatBottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, busy]);
  useEffect(() => {
    if (!talking && !modal) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role=dialog]');
    const focusables = () => dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],summary') || [];
    const first = focusables()[0]; first?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Tab') {
        const items = focusables(); if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopImmediatePropagation(); setTalking(null); setModal(null);
      speech.current?.stop(); setListening(false); chatAbort.current?.abort(); setBusy(false);
      voiceAbort.current?.abort(); voice.current?.pause(); window.speechSynthesis?.cancel();
      if (music.current) music.current.volume = .27;
      if (resumeDialog.current) engine.current?.resume(); resumeDialog.current = false;
    }
    window.addEventListener('keydown', closeOnEscape, true);
    return () => { window.removeEventListener('keydown', closeOnEscape, true); previousFocus?.focus(); };
  }, [talking, modal]);

  function stopVoice() {
    voiceAbort.current?.abort(); voice.current?.pause(); window.speechSynthesis?.cancel();
    if (music.current) music.current.volume = .27;
  }
  function start() {
    stopVoice(); chatAbort.current?.abort(); setBusy(false); setTalking(null); setModal(null);
    setCamp(null); campRef.current = null; setMessages({ lyra: [], mira: [], theron: [] });
    setToast(''); setJournal(true); setSelectedCharacter('lyra'); engine.current?.start(); changeMusic('explore');
    if (!mutedRef.current) {
      const intro = new Audio('/oracle/intro.wav'); voice.current = intro;
      if (music.current) music.current.volume = .11;
      intro.onended = () => { if (music.current) music.current.volume = .27; };
      void intro.play().catch(() => { if (music.current) music.current.volume = .27; });
    }
  }
  function toggleSound() {
    const next = !mutedRef.current; mutedRef.current = next; setMuted(next); engine.current?.setMuted(next);
    if (music.current) { music.current.muted = next; if (!next) void music.current.play().catch(() => {}); }
    if (next) stopVoice();
  }
  function enableAudio() {
    mutedRef.current = false; setMuted(false); engine.current?.setMuted(false);
    if (music.current) { music.current.muted = false; void music.current.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true)); }
    if (voice.current?.paused) void voice.current.play().catch(() => {});
  }
  function openDialog(kind: 'guide' | 'credits' | CharacterId) {
    resumeDialog.current = ['scavenge', 'shelter'].includes(worldRef.current.phase) && !worldRef.current.paused;
    engine.current?.pause();
    if (kind === 'guide' || kind === 'credits') setModal(kind); else { setTalking(kind); setPrompt(''); setVoiceStatus(''); }
  }
  function closeDialog() {
    setTalking(null); setModal(null); speech.current?.stop(); setListening(false);
    chatAbort.current?.abort(); setBusy(false); stopVoice();
    if (resumeDialog.current) engine.current?.resume(); resumeDialog.current = false;
  }
  function updateCamp(next: CampState) {
    campRef.current = next; setCamp(next);
    if (next.outcome !== 'playing') { engine.current?.setOutcome(next.outcome === 'won'); setJournal(false); }
    else if (next.day !== camp?.day) engine.current?.setShelter(next.day, next.companions);
  }
  async function speak(text: string) {
    if (mutedRef.current) return;
    stopVoice(); const controller = new AbortController(); voiceAbort.current = controller;
    if (music.current) music.current.volume = .09;
    try {
      const response = await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
      if (!response.ok) throw new Error('voice');
      const blob = await response.blob(); if (controller.signal.aborted || mutedRef.current) return;
      if (voiceUrl.current) URL.revokeObjectURL(voiceUrl.current);
      voiceUrl.current = URL.createObjectURL(blob); const next = new Audio(voiceUrl.current); voice.current = next;
      next.onended = () => { if (music.current) music.current.volume = .27; };
      await next.play(); setVoiceStatus('Gradium voice');
    } catch {
      if (controller.signal.aborted || mutedRef.current) return;
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text); utterance.rate = .93;
        utterance.onend = () => { if (music.current) music.current.volume = .27; };
        window.speechSynthesis.speak(utterance); setVoiceStatus('Browser voice · Gradium unavailable');
      } else { setVoiceStatus('Read the reply below'); if (music.current) music.current.volume = .27; }
    }
  }
  async function converse(message: string) {
    const character = talking;
    if (!character || !message.trim() || busy) return;
    message = message.trim().slice(0, 500);
    const history = messages[character].slice(-8); setPrompt(''); setBusy(true);
    setMessages(previous => ({ ...previous, [character]: [...previous[character], { role: 'user', text: message }] }));
    const controller = new AbortController(); chatAbort.current = controller;
    const state = campRef.current; const current = worldRef.current;
    try {
      const response = await fetch('/api/converse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character, message, history, context: { phase: current.phase, day: state?.day || 0, inventory: state?.inventory || current.inventory, companions: state?.companions || current.companions, health: state?.health ?? 100, morale: state?.morale ?? 70, signal: state?.signal || 0 } }), signal: controller.signal });
      if (!response.ok) throw new Error('connection');
      const result = await response.json() as { text: string; source: string; action: string };
      if (controller.signal.aborted) return;
      setMessages(previous => ({ ...previous, [character]: [...previous[character], { role: 'assistant', text: result.text, source: result.source }] }));
      if (result.action === 'mark_supplies') { engine.current?.markSupplies(); announce('Lyra has marked nearby supplies.'); }
      void speak(result.text);
    } catch { if (!controller.signal.aborted) announce('The conversation was interrupted. Please try again.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  function listen() {
    if (listening) { speech.current?.stop(); return; }
    const speechWindow = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Speech = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Speech) { announce('This browser does not support dictation. You can type to every character.'); return; }
    stopVoice(); const recognition = new Speech(); speech.current = recognition;
    recognition.lang = 'en-US'; recognition.interimResults = false;
    recognition.onresult = e => { const text = e.results[0]?.[0]?.transcript; if (text) { setPrompt(text.slice(0, 500)); setVoiceStatus('Your words are ready. Press send.'); } };
    recognition.onerror = () => { setListening(false); announce('Microphone unavailable. Type your message below.'); };
    recognition.onend = () => setListening(false);
    try { recognition.start(); setListening(true); } catch { setListening(false); announce('Microphone unavailable.'); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void converse(prompt); }


  // Poll the browser's standard controller mapping independently of React renders.
  useEffect(() => startController({
    onFrame: frame => controllerFrame.current(frame),
    onConnection: state => {
      setController(state);
      if (state.connected) announce(`${state.name} connected · A to confirm, Menu to pause`);
      else clearControllerFocus();
    },
    onDisconnect: () => {
      resumeDialog.current = false;
      engine.current?.setControllerInput(neutralController); engine.current?.pause();
      announce('Controller disconnected. Reconnect, then press Menu to continue.');
    },
  }), [announce]);

  useEffect(() => {
    menuNavigationArmed.current = false;
    if (!controller.connected || !controllerScope) { clearControllerFocus(); return; }
    const scope = document.querySelector<HTMLElement>(controllerScope);
    if (!scope) return;
    const preferred = talking ? '.suggestions button:not(:disabled)' : controllerScope === '.journal-panel' ? (camp?.chosen ? '.rest:not(:disabled)' : '.choices button:not(:disabled)') : '.primary-button:not(:disabled)';
    focusControllerTarget(scope.querySelector<HTMLElement>(preferred) || controllerTargets(scope)[0]);
    return clearControllerFocus;
  }, [controller.connected, controllerScope, talking, modal, camp?.day, camp?.chosen, busy, ready]);

  useEffect(() => {
    controllerFrame.current = frame => {
      const scope = controllerScope ? document.querySelector<HTMLElement>(controllerScope) : null;
      engine.current?.setControllerInput(scope ? neutralController : { x: frame.moveX, y: frame.moveY, lookX: frame.lookX, lookY: frame.lookY, sprint: frame.sprint });
      const has = (button: ControllerFrame['pressed'][number]) => frame.pressed.includes(button);
      if (has('b') || has('menu')) {
        if (talking || modal) { closeDialog(); return; }
        if (worldRef.current.paused) { engine.current?.resume(); return; }
        if (has('menu') && ['scavenge', 'shelter'].includes(worldRef.current.phase)) { engine.current?.pause(); return; }
        if (has('b') && camp && journal && !finished) { setJournal(false); return; }
      }
      if (has('view') && !talking && !modal) { openDialog('guide'); return; }
      if ((has('lb') || has('rb')) && !modal && !finished) {
        const available: CharacterId[] = ['lyra', ...companions];
        const index = Math.max(0, available.indexOf(talking || selectedCharacter));
        const next = available[(index + (has('rb') ? 1 : available.length - 1)) % available.length];
        setSelectedCharacter(next);
        if (talking) {
          chatAbort.current?.abort(); setBusy(false); stopVoice(); speech.current?.stop(); setListening(false);
          setTalking(next); setPrompt(''); setVoiceStatus('');
        } else announce(`${characters[next].name} selected · Press X to talk`);
        return;
      }
      if (has('x') && !talking && !modal && !finished && !worldRef.current.paused) { openDialog(selectedCharacter); return; }
      if (has('x') && talking && !busy) { listen(); return; }
      if (has('y') && !talking && !modal && !worldRef.current.paused) {
        if (worldRef.current.phase === 'scavenge') engine.current?.markSupplies();
        else if (camp && !finished) setJournal(!journal);
        return;
      }
      if (scope) {
        if (!frame.navigationActive) menuNavigationArmed.current = true;
        if (frame.navigate && menuNavigationArmed.current) navigateControllerMenu(scope, frame.navigate);
        if (Math.abs(frame.lookY) > .1) {
          const scrollable = scope.querySelector<HTMLElement>('.journal-content,.chat-messages') || scope;
          scrollable.scrollTop += frame.lookY * 10;
        }
        if (has('a')) activateControllerTarget(scope);
        return;
      }
      if (has('a')) engine.current?.interact();
    };
  });

  return <main className={`oracle-app phase-${world.phase} ${controller.connected ? 'controller-active' : ''}`}>
    <canvas ref={canvas} className="world-canvas" aria-label="Playable 3D ancient Greek island. Use the left stick or WASD to move, and controller A or keyboard E to interact." />
    {world.phase === 'ready' && <div className="title-art" />}
    <div className="scene-shade" />
    <header className="topbar">
      <Link className="brand" href="/" aria-label="The Last Oracle home"><Sun size={25} strokeWidth={1.2} /><span>THE LAST <b>ORACLE</b></span></Link>
      <div className="chapter-label"><span className="gold-dot" />{world.phase === 'ready' ? 'AN AEGEAN SURVIVAL STORY' : world.phase === 'scavenge' ? 'CHAPTER I  /  THE LAST MINUTE' : 'CHAPTER II  /  KEEPERS OF THE FLAME'}</div>
      <div className="top-actions">{controller.connected && <span className="controller-connected" title={controller.name}><Gamepad2 size={18} /><span>CONTROLLER</span></span>}<button className="icon-button" onClick={() => openDialog('guide')} title="How to play" aria-label="How to play"><CircleHelp size={19} /></button><button className="icon-button" onClick={toggleSound} title={muted ? 'Enable sound' : 'Mute sound'} aria-label={muted ? 'Enable sound' : 'Mute sound'}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>{started && !finished && <button className="icon-button" onClick={() => world.paused ? engine.current?.resume() : engine.current?.pause()} aria-label={world.paused ? 'Resume' : 'Pause'}>{world.paused ? <Play size={18} /> : <Pause size={18} />}</button>}</div>
    </header>

    {world.phase === 'ready' && <>
      <section className="intro">
        <div className="eyebrow"><span /> THE ISLAND REMEMBERS</div>
        <h1>One minute.<br />Five days.<br /><em>A final hope.</em></h1>
        <p>The mountain has awakened. Gather what you can, save who you can, and guide your people through the ashes.</p>
        <button className="primary-button begin" disabled={!ready || Boolean(error)} onClick={start}>{ready ? <><span>Begin your odyssey</span>{controller.connected ? <PadKey name="A" /> : <ArrowRight size={21} />}</> : <><LoaderCircle className="spin" size={18} /> Awakening the island…</>}</button>
        <p className="controller-welcome"><Gamepad2 size={15} />{controller.connected ? "Controller ready · press A to begin" : "Xbox controller supported · connect and press a button"}</p>
        <div className="intro-caption"><span>3D SURVIVAL ADVENTURE</span><i /> HEADPHONES RECOMMENDED</div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <div className="location"><Compass size={21} strokeWidth={1.2} /><div><span>ISLE OF KALLISTE</span><p>The Aegean Sea · An age of myth</p></div></div>
      <aside className="character-preview"><Image unoptimized width={640} height={640} src="/oracle/lyra.jpg" alt="Lyra, your playable hero" /><div><span>YOUR STORY BEGINS WITH</span><strong>Lyra, the courier</strong><p>One life. An island’s fate.</p></div><button onClick={() => openDialog('lyra')} aria-label="Talk to Lyra"><MessageCircle size={20} /></button></aside>
      <footer className="landing-footer"><span>AN ORIGINAL GAME · PARIS AI GAMING HACK</span><button onClick={() => openDialog('credits')}>The art of the oracle <ArrowUpRight size={13} /></button></footer>
    </>}

    {started && <>
      <section className="supply-bar" aria-label="Supplies">{resources.map(({ id, name, icon: Icon }) => <div className={`resource resource-${id}`} key={id}><Icon size={19} strokeWidth={1.6} /><div><span>{name}</span><b>{inventory[id]}</b></div></div>)}<div className="supply-divider" /><div className="saved-people"><Shield size={18} /><span>{companions.length}<small> / 2 saved</small></span></div></section>
      {world.phase === 'scavenge' && <>
        <section className={`countdown ${world.timeLeft < 16 ? 'urgent' : ''}`}><span>BEFORE THE ASH</span><strong>{String(Math.ceil(world.timeLeft)).padStart(2, '0')}<small>s</small></strong><div className="timer-track"><i style={{ width: `${world.timeLeft / 60 * 100}%` }} /></div></section>
        <aside className="quest-card"><span className="eyebrow">I · THE LAST MINUTE</span><h2>Leave no hope behind.</h2><p>Gather supplies and rescue Mira &amp; Theron. Return to the glowing sanctuary.</p><div className="quest-target"><Wheat size={14} /> Aim for 5 food · 5 water · 6 timber</div><button className="text-button" onClick={() => { engine.current?.markSupplies(); announce('Supply markers revealed for a few moments.'); }}><Compass size={14} /> Reveal supplies</button></aside>
        <div className="island-map" aria-label="Island map. Sanctuary is north of the village."><span className="map-north">N</span><div className="map-land"><span className="map-temple" style={{left:'50%',top:'30%'}}><Sun size={14} /><small>SANCTUARY</small></span>{!companions.includes('mira') && <span className="map-person" style={{left:'39%',top:'44%'}} title="Mira" />}{!companions.includes('theron') && <span className="map-person" style={{left:'70%',top:'72%'}} title="Theron" />}<span className="map-hero" style={{left:`${Math.max(5,Math.min(95,(world.player.x+24)/48*100))}%`,top:`${Math.max(5,Math.min(95,(world.player.z+21)/46*100))}%`}} /></div><span className="map-caption">THE VILLAGE OF KALLISTE</span></div>
        <div className="stamina"><span>SPRINT</span><div><i style={{ width: `${Math.max(0, Math.min(100, world.stamina))}%` }} /></div>{controller.connected ? <PadKey name="RT" /> : <kbd>SHIFT</kbd>}</div>
      </>}
      {camp && !finished && <>
        <aside className="camp-stats"><div className="day-title"><Sun size={19} /><span>DAY <b>{camp.day}</b> OF 5</span><button onClick={() => setJournal(!journal)}>{journal ? 'Explore sanctuary' : 'Open journal'} <ChevronRight size={14} /></button></div><div className="vital"><Heart size={15} /><span>Health</span><div><i style={{ width: `${camp.health}%` }} /></div><b>{camp.health}</b></div><div className="vital morale"><Flame size={15} /><span>Hope</span><div><i style={{ width: `${camp.morale}%` }} /></div><b>{camp.morale}</b></div><div className="beacon"><span>RESCUE BEACON</span><div>{[1, 2, 3].map(i => <i key={i} className={camp.signal >= i ? 'lit' : ''}><Flame size={13} /></i>)}</div><b>{camp.signal}/3</b></div></aside>
        {journal && <section className="journal-panel"><div className="journal-heading"><span>THE SANCTUARY JOURNAL</span><button className="icon-button" onClick={() => setJournal(false)} aria-label="Close journal"><X size={15} /></button></div><div className="journal-content"><span className="chapter-number">DAY {String(camp.day).padStart(2, '0')}</span><h2>{camp.event.title}</h2><p className="event-text">{camp.event.text}</p><div className="choices">{camp.event.choices.map(choice => <button key={choice.id} disabled={camp.chosen || !canChoose(camp, choice)} onClick={() => updateCamp(chooseCamp(camp, choice.id))}><span><b>{choice.label}</b><small>{choice.description}</small></span>{camp.chosen ? <Check size={16} /> : <ChevronRight size={17} />}</button>)}</div>{camp.chosen && <p className="decision-made"><Check size={13} /> Your choice is written into the island’s story.</p>}<div className="camp-actions"><button disabled={camp.inventory.wood < 2 || camp.signal >= 3} onClick={() => updateCamp(performCampAction(camp, 'repair'))}><Hammer size={16} /><span>Build beacon<small>2 timber · +1 flame</small></span></button><button disabled={camp.inventory.herbs < 1 || camp.health >= 100} onClick={() => updateCamp(performCampAction(camp, 'heal'))}><Leaf size={16} /><span>Tend wounds<small>1 herb · restore health</small></span></button></div><div className="ration-title">TONIGHT’S RATIONS <span>1 serving feeds your party</span></div><div className="rations">{(['food', 'water'] as Resource[]).map(id => <label key={id}><input type="checkbox" checked={rations[id as 'food' | 'water'] && inventory[id] > 0} disabled={inventory[id] < 1} onChange={event => setRations(previous => ({ ...previous, [id]: event.target.checked }))} />{id === 'food' ? <Wheat size={15} /> : <Waves size={15} />}<span>{id === 'food' ? 'Share food' : 'Share water'}</span><small>{inventory[id] ? '−1' : 'empty'}</small></label>)}</div><button className="primary-button rest" disabled={!camp.chosen} onClick={() => { updateCamp(endDay(camp, rations)); setRations({ food: true, water: true }); }}><Moon size={17} /><span>{camp.day === 5 ? 'Light the final signal' : 'Rest until dawn'}</span><ArrowRight size={17} /></button><p className="rest-hint">{!camp.chosen ? 'Make today’s decision before resting.' : 'Survive five days. Light all three beacon flames.'}</p>{camp.log.length > 0 && <details className="chronicle"><summary>Our story so far</summary>{camp.log.slice(-8).map((line, i) => <p key={i}>{line}</p>)}</details>}</div></section>}
      </>}
      {!finished && <>
        <div className="companion-dock"><button className={`hero-avatar ${controller.connected && selectedCharacter === 'lyra' ? 'pad-character-selected' : ''}`} onClick={() => openDialog('lyra')} title="Talk to your hero, Lyra"><Image unoptimized width={640} height={640} src="/oracle/lyra.jpg" alt="" /><span>LYRA <MessageCircle size={10} /></span></button>{(['mira', 'theron'] as CharacterId[]).map(id => <button key={id} className={`${companions.includes(id) ? '' : 'not-saved'} ${controller.connected && selectedCharacter === id ? 'pad-character-selected' : ''}`} disabled={!companions.includes(id)} onClick={() => openDialog(id)} title={companions.includes(id) ? `Talk to ${characters[id].name}` : `Find ${characters[id].name} in the village`}><Image unoptimized width={640} height={640} src={`/oracle/${id}.jpg`} alt="" /><span>{characters[id].name.toUpperCase()} {companions.includes(id) ? <Check size={10} /> : '· ?'}</span></button>)}</div>
        {world.nearest && !talking && <button className="interaction" onClick={() => engine.current?.interact()}>{controller.connected ? <PadKey name="A" /> : <kbd>E</kbd>}<span><b>{world.nearest.label}</b><small>{world.nearest.description}</small></span><ChevronRight size={18} /></button>}
        {controller.connected ? <div className="controls-hint controller-hints"><span><PadKey name="LS" /> Move</span><span><PadKey name="RS" /> Look</span><span><PadKey name="RT" /> Sprint</span><span><PadKey name="A" /> Interact</span><span><PadKey name="X" /> Talk</span><span><PadKey name="Y" /> {camp ? 'Journal' : 'Reveal'}</span><span><PadKey name="☰" /> Pause</span></div> : <div className="controls-hint"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</span><span><kbd>SHIFT</kbd> Sprint</span><span>Drag to look</span><span><kbd>E</kbd> Interact</span></div>}
        <div className="touch-controls">{[{ id: 'forward', icon: ArrowUp }, { id: 'left', icon: ArrowLeft }, { id: 'backward', icon: ArrowDown }, { id: 'right', icon: ArrowRight }].map(({ id, icon: Icon }) => <button key={id} className={`move-${id}`} aria-label={`Move ${id}`} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); engine.current?.setInput(id as 'forward', true); }} onPointerUp={() => engine.current?.setInput(id as 'forward', false)} onPointerCancel={() => engine.current?.setInput(id as 'forward', false)}><Icon size={20} /></button>)}</div>
      </>}
    </>}

    {world.paused && started && !finished && !talking && !modal && <div className="pause-overlay"><div className="pause-card"><Sun size={34} strokeWidth={1} /><span className="eyebrow">A MOMENT OF STILLNESS</span><h2>The island can wait.</h2><button className="primary-button" onClick={() => engine.current?.resume()}>{controller.connected ? <PadKey name="A" /> : <Play size={17} />} Continue your story</button><button className="text-button" onClick={toggleSound}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}{muted ? 'Enable sound' : 'Mute sound'}</button><button className="text-button" onClick={() => openDialog('guide')}>View controls</button><button className="text-button" onClick={() => openDialog('credits')}>Game credits</button></div></div>}
    {finished && <div className="ending-overlay"><section className="ending-card"><div className="ending-symbol">{world.phase === 'won' ? <Sun size={45} strokeWidth={1} /> : <Wind size={45} strokeWidth={1} />}</div><span className="eyebrow">{world.phase === 'won' ? 'THE ISLAND WILL REMEMBER' : 'A STORY LOST TO THE ASH'}</span><h1>{world.phase === 'won' ? <>Beyond the ash,<br /><em>a new dawn.</em></> : <>Even hope<br /><em>casts a shadow.</em></>}</h1><p>{world.phase === 'won' ? `A sail appears on the horizon. Your beacon has been seen. ${companions.length === 2 ? 'Mira and Theron stand beside you. You brought everyone home.' : companions.length ? 'One companion shares your passage to a new life.' : 'You have survived, carrying the memory of those left behind.'}` : camp && camp.health <= 0 ? 'The party could not survive another night. Protect your food and water, and use herbs to heal before you rest.' : camp ? 'The rescue fleet passed beyond the mist. Keep your people alive and build all three beacon flames before the fifth night.' : 'The ash reached the village before you returned. Gather quickly, then interact at the glowing sanctuary before the final second.'}</p><div className="ending-stats"><div><b>{camp?.day || 0}/5</b><span>DAYS ENDURED</span></div><div><b>{companions.length}/2</b><span>SOULS SAVED</span></div><div><b>{camp?.signal || 0}/3</b><span>BEACON FLAMES</span></div></div><button className="primary-button" onClick={start}>Write another story {controller.connected ? <PadKey name="A" /> : <ArrowRight size={19} />}</button></section></div>}

    {talking && <div className="dialog-scrim" onClick={closeDialog}><aside className="conversation" role="dialog" aria-modal="true" aria-label={`Conversation with ${characters[talking].name}`} onClick={event => event.stopPropagation()}><div className="portrait-banner"><Image unoptimized width={640} height={640} src={`/oracle/${talking}.jpg`} alt={characters[talking].name} /><div /><button className="icon-button close-chat" onClick={closeDialog} aria-label="Close conversation"><X size={20} /></button><section><span>{characters[talking].role}</span><h2>{characters[talking].name}</h2><p>{talking === 'lyra' ? 'Your courage. Your voice. Your story.' : 'A life bound to yours.'}</p></section></div><div className="chat-messages"><div className="chat-line assistant"><p>{characters[talking].line}</p><small>THE CONVERSATION BEGINS</small></div>{messages[talking].map((message, i) => <div className={`chat-line ${message.role}`} key={i}><p>{message.text}</p>{message.source && <small>{message.source === 'gemini' ? 'GEMINI · IN CHARACTER' : 'LOCAL STORY GUIDE'}</small>}</div>)}{busy && <div className="chat-thinking"><i /><i /><i /><span>{characters[talking].name} considers your words…</span></div>}<div ref={chatBottom} /></div><div className="chat-bottom"><div className="suggestions">{(camp ? ['How do we survive?', 'What does the beacon need?'] : ['Where are the supplies?', 'Tell me your story.']).map(text => <button key={text} disabled={busy} onClick={() => void converse(text)}>{text}</button>)}</div><form onSubmit={submit}><button type="button" className={`mic-button ${listening ? 'listening' : ''}`} onClick={listen} aria-label={listening ? 'Stop dictation' : 'Dictate a message'}><Mic size={19} /></button><input autoFocus value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={500} placeholder={`Speak to ${characters[talking].name}…`} aria-label={`Message to ${characters[talking].name}`} /><button className="send-button" disabled={busy || !prompt.trim()} aria-label="Send message">{busy ? <LoaderCircle size={18} className="spin" /> : <Send size={18} />}</button></form><p className="voice-status">{listening ? 'Listening… press the microphone to stop.' : voiceStatus || (controller.connected ? 'D-pad: choose a reply · A: send · X: microphone · B: back' : 'Type or dictate · characters reply with a voice')}</p></div></aside></div>}

    {modal && <div className="dialog-scrim centered" onClick={closeDialog}><section className="info-modal" role="dialog" aria-modal="true" aria-label={modal === 'guide' ? 'How to play' : 'Game credits'} onClick={event => event.stopPropagation()}><button className="icon-button modal-close" onClick={closeDialog} aria-label="Close"><X size={21} /></button><span className="eyebrow">THE LAST ORACLE</span><h2>{modal === 'guide' ? 'A little courage goes a long way.' : 'An ancient world. A new kind of story.'}</h2>{modal === 'guide' ? <><div className="controller-guide"><Gamepad2 size={21} /><div><h3>Play with your Xbox controller</h3><p>Pair through Bluetooth or connect by USB, then press a controller button with the game open. Left stick moves, right stick looks, RT or left-stick click sprints. A interacts; X talks; Y reveals supplies or toggles the journal. LB / RB select a companion. Menu pauses; View opens this guide.</p><p>In menus, use the D-pad or left stick, then A to choose. B goes back. The right stick scrolls longer panels. In conversations, choose a suggested reply or press X for microphone dictation.</p></div></div><div className="guide-step"><span>01</span><div><h3>One minute to gather.</h3><p>Move with WASD or arrow keys. Hold Shift to sprint. Drag to orbit the camera, scroll to zoom. Press E beside supplies, companions, or the sanctuary. Aim for at least 5 food, 5 water, and 6 timber. Return to the glowing temple before the ash arrives.</p></div></div><div className="guide-step"><span>02</span><div><h3>Five days to endure.</h3><p>Make one story decision each day. Share a food and water ration each night. Herbs restore health; two timber build one beacon flame. Light three flames and survive the fifth night to signal the rescue ship.</p></div></div><div className="guide-step"><span>03</span><div><h3>No one survives alone.</h3><p>Rescue Mira and Theron to earn their help. Click a portrait to talk, type, or use microphone dictation. Lyra can help you find supplies. Conversations pause the supply run. Escape pauses the game.</p></div></div><button className="primary-button" onClick={closeDialog}>I’m ready <ArrowRight size={17} /></button></> : <><p>An original, playable survival tale inspired by the urgency of scavenging games and the beauty of the ancient Mediterranean.</p><div className="credit-row"><Sparkles size={20} /><div><b>Google DeepMind</b><p>Gemini character conversations, original artwork, and Lyria music.</p></div><span className={services.gemini ? 'connected' : ''}>{services.gemini ? 'CONNECTED' : 'LOCAL GUIDE'}</span></div><div className="credit-row"><Volume2 size={20} /><div><b>Gradium</b><p>Generated narration and spoken character responses.</p></div><span className={services.gradium ? 'connected' : ''}>{services.gradium ? 'CONNECTED' : 'BROWSER VOICE'}</span></div><div className="credit-row"><Compass size={20} /><div><b>Built for the Paris AI Gaming Hack</b><p>Hosted by Tech: Europe, Voodoo &amp; Google DeepMind. Event partners: Cognition, YG &amp; Gradium.</p></div></div><p className="credit-note">This build actively uses Google and Gradium. Cognition and YG are acknowledged as event partners; their services are not connected to this game.</p><a className="text-button" href="https://github.com/google-gemini/cookbook" target="_blank" rel="noreferrer">Built with the Gemini API resources <ArrowUpRight size={14} /></a></>}</section></div>}
    {controller.connected && controllerScope && <div className="controller-menu-hint"><span><PadKey name="✚" /> Navigate</span><span><PadKey name="A" /> Select</span>{controllerScope !== '.intro' && controllerScope !== '.ending-card' && <span><PadKey name="B" /> Back</span>}{talking && <span><PadKey name="X" /> Speak</span>}</div>}
    {audioBlocked && !muted && <button className="audio-unlock" onClick={enableAudio}><Volume2 size={15} /> Click once to enable sound</button>}
    {toast && <div className="toast" role="status"><Sun size={15} />{toast}</div>}
  </main>;
}
