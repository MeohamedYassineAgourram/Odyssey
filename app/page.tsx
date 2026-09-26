"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, AudioLines, ChevronRight, Cpu, Crosshair, Diamond, Flag, Heart, Info, LoaderCircle, Mic, Pause, Play, Radio, RotateCcw, Sparkles, Volume2, VolumeX, X, Zap } from "lucide-react";
import type { GameHandle, GameSnapshot } from "./game/engine";

type Directive = { event: "calm" | "storm" | "riches" | "turbo" | "repair"; message: string; source: "local" | "gemini" | "devin"; reason?: string };
type Services = { gemini: boolean; gradium: boolean; devin: boolean };
type VoiceRecognition = { lang: string; interimResults: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start(): void; stop(): void; };
const initial: GameSnapshot = { phase: "ready", score: 0, shards: 0, shield: 100, speed: 0, distance: 0, timeLeft: 90, combo: 1, event: "Open water", boost: 100 };
const suggestions = [ { text: "More crystals", icon: Diamond }, { text: "Bring the storm", icon: Zap }, { text: "Repair my shield", icon: Heart } ];

export default function Home() {
  const scene = useRef<HTMLDivElement>(null);
  const game = useRef<GameHandle | null>(null);
  const snapshotRef = useRef(initial);
  const mutedRef = useRef(true);
  const servicesRef = useRef<Services>({ gemini: false, gradium: false, devin: false });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const voiceController = useRef<AbortController | null>(null);
  const recognition = useRef<VoiceRecognition | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const workshopController = useRef<AbortController | null>(null);
  const directiveRef = useRef<Directive | null>(null);
  const [snapshot, setSnapshot] = useState(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(true);
  const [modal, setModal] = useState<"help" | "tech" | null>(null);
  const [services, setServices] = useState<Services>({ gemini: false, gradium: false, devin: false });
  const [serviceLoaded, setServiceLoaded] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [director, setDirector] = useState<Directive>({ event: "calm", message: "The ocean is yours, pilot. Collect 12 energy shards and survive until extraction. I’ll be on your frequency.", source: "local" });
  const [toast, setToast] = useState("");
  const [best, setBest] = useState(0);
  const bestRef = useRef(0);
  const [workshopBrief, setWorkshopBrief] = useState("A high-speed crystal run through an electric storm");
  const [workshop, setWorkshop] = useState<{ busy: boolean; text: string; url?: string; mission?: { title: string; briefing: string; event: Directive["event"] } }>({ busy: false, text: "" });
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const resumeAfterModal = useRef(false);
  const running = snapshot.phase === "playing";
  const started = snapshot.phase !== "ready";
  const finished = snapshot.phase === "won" || snapshot.phase === "lost";

  const announce = useCallback((message: string) => {
    setToast(message);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(""), 3200);
  }, []);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    fetch("/api/status", { signal: controller.signal }).then(r => r.json() as Promise<Services>).then(s => { if (!disposed) { servicesRef.current = s; setServices(s); setServiceLoaded(true); } }).catch(() => { if (!disposed) setServiceLoaded(true); });
    import("./game/engine").then(({ createGame }) => {
      if (disposed || !scene.current) return;
      game.current = createGame(scene.current, {
        onReady: () => {
          setReady(true);
          try { bestRef.current = Number(localStorage.getItem("echo-shift-best")) || 0; setBest(bestRef.current); } catch {}
          const voiceWindow = window as unknown as { SpeechRecognition?: new () => VoiceRecognition; webkitSpeechRecognition?: new () => VoiceRecognition };
          setVoiceAvailable(Boolean(voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition));
        },
        onUpdate: next => {
          if ((next.phase === "won" || next.phase === "lost") && next.score > bestRef.current) {
            bestRef.current = next.score; setBest(next.score);
            try { localStorage.setItem("echo-shift-best", String(next.score)); } catch {}
          }
          snapshotRef.current = next; setSnapshot(next);
        },
        onEvent: event => announce(event.message),
      });
      game.current.setMuted(mutedRef.current);
    }).catch(() => { if (!disposed) setError("Your browser couldn’t start the 3D world. Enable hardware acceleration or try a recent Chrome, Edge, Firefox, or Safari browser."); });
    return () => {
      disposed = true; controller.abort(); game.current?.destroy(); game.current = null;
      recognition.current?.stop(); requestController.current?.abort(); workshopController.current?.abort(); voiceController.current?.abort();
      audioRef.current?.pause(); if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
      window.speechSynthesis?.cancel();
    };
  }, [announce]);

  const closeModal = useCallback(() => { setModal(null); if (resumeAfterModal.current) game.current?.resume(); resumeAfterModal.current = false; }, []);
  useEffect(() => {
    if (!modal) return;
    const oldFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); closeModal(); }
      if (event.key === "Tab") {
        const items = dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],input:not(:disabled),textarea");
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener("keydown", handleKey, true);
    return () => { window.removeEventListener("keydown", handleKey, true); oldFocus?.focus(); };
  }, [modal, closeModal]);

  function openModal(value: "help" | "tech") { resumeAfterModal.current = snapshotRef.current.phase === "playing"; game.current?.pause(); setModal(value); }
  function startRun() {
    voiceController.current?.abort(); audioRef.current?.pause(); window.speechSynthesis?.cancel();
    requestController.current?.abort(); setBusy(false); setToast("");
    game.current?.restart();
    if (directiveRef.current) game.current?.applyDirective(directiveRef.current);
    announce("Signal acquired. Collect 12 shards. Survive 90 seconds.");
  }
  function toggleMute() {
    const next = !mutedRef.current; mutedRef.current = next; setMuted(next); game.current?.setMuted(next);
    if (next) { voiceController.current?.abort(); audioRef.current?.pause(); window.speechSynthesis?.cancel(); }
  }
  async function speak(text: string) {
    if (mutedRef.current) return;
    voiceController.current?.abort(); const controller = new AbortController(); voiceController.current = controller;
    audioRef.current?.pause(); window.speechSynthesis?.cancel();
    if (servicesRef.current.gradium) {
      try {
        const response = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(18000)]) });
        if (!response.ok) throw new Error("voice");
        const blob = await response.blob(); if (mutedRef.current || controller.signal.aborted) return;
        if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
        audioUrl.current = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl.current); audioRef.current = audio; await audio.play(); setVoiceNotice("Gradium voice"); return;
      } catch { if (controller.signal.aborted) return; setVoiceNotice("Gradium unavailable · browser voice"); }
    } else setVoiceNotice("Browser voice · Gradium not connected");
    if ("speechSynthesis" in window && !mutedRef.current) { const utterance = new SpeechSynthesisUtterance(text); utterance.rate = 1.03; utterance.pitch = .9; window.speechSynthesis.speak(utterance); }
    else setVoiceNotice("Audio unavailable · read the director message");
  }
  async function askDirector(message: string) {
    if (!message.trim() || busy) return;
    setBusy(true); setPrompt("");
    requestController.current?.abort(); const controller = new AbortController(); requestController.current = controller;
    try {
      const state = snapshotRef.current;
      const response = await fetch("/api/director", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, context: { shards: state.shards, shield: state.shield, timeLeft: state.timeLeft, score: state.score, event: directiveRef.current?.event ?? "calm" } }), signal: controller.signal });
      if (!response.ok) throw new Error("director");
      const directive: Directive = await response.json(); if (controller.signal.aborted) return;
      setDirector(directive); directiveRef.current = directive; game.current?.applyDirective(directive);
      announce(snapshotRef.current.phase === "ready" ? "Directive armed for your next run" : "World shifted · " + directive.event);
      void speak(directive.message);
    } catch { if (!controller.signal.aborted) announce("Radio interference. Try your request again."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void askDirector(prompt); }
  function listen() {
    if (listening) { recognition.current?.stop(); return; }
    const voiceWindow = window as unknown as { SpeechRecognition?: new () => VoiceRecognition; webkitSpeechRecognition?: new () => VoiceRecognition };
    const Recognition = voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition;
    if (!Recognition) { announce("Voice input isn’t supported here. Type your request instead."); return; }
    const recognizer = new Recognition(); recognition.current = recognizer; recognizer.lang = "en-US"; recognizer.interimResults = false;
    recognizer.onresult = event => { const text = event.results[0]?.[0]?.transcript; if (text) { setPrompt(text); setVoiceNotice("Voice request ready · press send"); } };
    recognizer.onerror = () => { setListening(false); announce("Microphone unavailable. You can type your request."); };
    recognizer.onend = () => setListening(false);
    try { recognizer.start(); setListening(true); } catch { setListening(false); announce("Microphone unavailable. You can type your request."); }
  }
  async function createMission() {
    if (workshop.busy) return;
    workshopController.current?.abort(); const controller = new AbortController(); workshopController.current = controller;
    setWorkshop({ busy: true, text: "Devin is designing your mission…" });
    try {
      const response = await fetch("/api/workshop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: workshopBrief }), signal: controller.signal });
      const data = await response.json() as { error?: string; sessionId: string; url?: string }; if (!response.ok) throw new Error(data.error || "Could not start the workshop.");
      setWorkshop({ busy: true, text: "Mission in progress. This can take a few minutes.", url: data.url });
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise<void>((resolve, reject) => { const cancel = () => { clearTimeout(timeout); reject(new DOMException("Aborted", "AbortError")); }; const timeout = setTimeout(() => { controller.signal.removeEventListener("abort", cancel); resolve(); }, 5000); controller.signal.addEventListener("abort", cancel, { once: true }); });
        const progress = await fetch(`/api/workshop?sessionId=${encodeURIComponent(data.sessionId)}`, { signal: controller.signal });
        const result = await progress.json() as { error?: string; status: string; url?: string; mission?: { title: string; briefing: string; event: Directive["event"] } }; if (!progress.ok) throw new Error(result.error || "Mission status unavailable.");
        if (result.mission) { setWorkshop({ busy: false, text: "Your mission is ready to fly.", url: result.url || data.url, mission: result.mission }); return; }
        if (["failed", "error", "stopped", "expired", "finished", "blocked"].includes(result.status)) { setWorkshop({ busy: false, text: "Devin needs attention. Open the session to review its progress.", url: data.url }); return; }
      }
      setWorkshop({ busy: false, text: "Still working. Follow your mission in Devin.", url: data.url });
    } catch (cause) { if (!controller.signal.aborted) setWorkshop({ busy: false, text: cause instanceof Error ? cause.message : "Workshop unavailable." }); }
  }
  const seconds = Math.ceil(Math.max(0, snapshot.timeLeft));
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return <main className={`game-shell ${started ? "in-game" : "in-lobby"}`}>
    <div className="world" ref={scene} aria-label="3D hovercraft game world" />
    <div className="world-vignette" />
    <header className="topbar">
      <Link className="wordmark" href="/" aria-label="Echo Shift home"><span className="brand-symbol">{"//"}</span> ECHO<span className="wordmark-light">SHIFT</span><span className="beta">01</span></Link>
      <nav aria-label="Main navigation"><button className="nav-active" onClick={closeModal}>The experience<span /></button><button onClick={() => openModal("help")}>Flight manual</button><button onClick={() => openModal("tech")}>Behind the signal <ArrowUpRight size={13} /></button></nav>
      <div className="header-actions"><span className="edition">PARIS ’26 <span>EXPERIMENTAL BUILD</span></span><button className="icon-button sound-button" onClick={toggleMute} aria-label={muted ? "Enable sound" : "Mute sound"} title={muted ? "Enable sound" : "Mute sound"}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button></div>
    </header>
    {started && <section className="flight-hud" aria-label="Flight status">
      <div className="hud-cell"><span className="micro">ENERGY SHARDS</span><div className="shard-number"><Diamond size={19} />{String(snapshot.shards).padStart(2, "0")}<span>/ 12</span></div><div className="tiny-track"><i style={{ width: `${Math.min(100, snapshot.shards / 12 * 100)}%` }} /></div></div>
      <div className="hud-cell timer"><span className="micro">EXTRACTION IN</span><strong className={snapshot.timeLeft < 20 ? "danger-text" : ""}>{time}</strong></div>
      <div className="hud-cell score"><span className="micro">SCORE</span><strong>{snapshot.score.toLocaleString().padStart(5, "0")}</strong></div>
      <button className="icon-button pause-button" disabled={finished} onClick={() => running ? game.current?.pause() : game.current?.resume()} aria-label={running ? "Pause game" : "Resume game"}>{running ? <Pause size={18} /> : <Play size={18} />}</button>
    </section>}
    {!started && <section className="hero">
      <div className="eyebrow"><span className="live-dot" /> AN AI-ALTERED REALITY <span className="eyebrow-line" /></div>
      <h1>ECHO<br /><span>SHIFT</span><span className="title-asterisk">✳</span></h1>
      <p className="hero-subtitle">The world listens.<br />Make your move.</p>
      <p className="hero-description">Skim an infinite ocean. Chase the signal.<br />Tell your AI director what happens next.</p>
      <button className="launch-button" disabled={!ready || Boolean(error)} onClick={startRun}>{!ready && !error ? <LoaderCircle className="spin" size={19} /> : <Play size={18} fill="currentColor" />}<span>{error ? "3D unavailable" : ready ? "Enter the simulation" : "Tuning your signal…"}</span><ArrowUpRight size={21} /></button>
      <div className="launch-meta"><span>90 SECONDS</span><i /> <span>ONE PILOT</span><i /><span>INFINITE POSSIBILITIES</span></div>
      {error && <p className="error-message" role="alert">{error}</p>}
    </section>}
    {!started && <aside className="world-caption"><div className="coordinate"><Crosshair size={15} /> 48°51′ N / 02°20′ E</div><span className="caption-rule" /><span className="micro">YOUR NEXT DESTINATION</span><h2>The Drift</h2><p>Somewhere beyond the ordinary.</p><span className="sector-tag">SECTOR 001 <span>↗</span></span></aside>}
    {started && <div className="pilot-telemetry"><div className="telemetry-heading"><span className="live-dot" /><span>PILOT SYSTEMS</span><span>{snapshot.combo > 1 ? `×${snapshot.combo} COMBO` : "ECHO–01"}</span></div><div className="meter"><span><Heart size={12} /> SHIELD</span><div><i style={{ width: `${snapshot.shield}%`, background: snapshot.shield < 30 ? "#ff775f" : undefined }} /></div><b>{Math.round(snapshot.shield)}%</b></div><div className="meter"><span><Zap size={12} /> BOOST</span><div><i style={{ width: `${snapshot.boost}%` }} /></div><b>{Math.round(snapshot.boost)}%</b></div><div className="speed"><strong>{Math.round(snapshot.speed)}</strong><span>KM/H</span><em>{snapshot.event}</em></div></div>}
    <section className="director-dock" aria-label="AI mission director">
      <div className="director-heading"><div className={`echo-orb ${busy || listening ? "thinking" : ""}`}><AudioLines size={20} /></div><div><span className="micro">YOUR CO-PILOT</span><h2>ECHO <span>/ MISSION DIRECTOR</span></h2></div><span className="source-badge"><i className={director.source !== "local" ? "connected" : ""} />{busy ? "THINKING" : director.source === "gemini" ? "GEMINI LIVE" : director.source === "devin" ? "DEVIN MISSION" : "LOCAL DEMO"}</span></div>
      <p className="director-message" aria-live="polite">“{director.message}”</p>
      <form onSubmit={submit} className="director-form"><label className="sr-only" htmlFor="director-prompt">Tell the director how to change the world</label><input id="director-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={240} placeholder={listening ? "Listening…" : "What if the world could hear you?"} autoComplete="off" disabled={busy} /><button type="button" className={`mic-button ${listening ? "listening" : ""}`} onClick={listen} disabled={busy || !voiceAvailable} aria-label={listening ? "Stop listening" : "Dictate a request"} title={voiceAvailable ? "Dictate a request" : "Voice input unavailable in this browser"}><Mic size={17} /></button><button type="submit" className="send-button" disabled={busy || !prompt.trim()} aria-label="Send director request">{busy ? <LoaderCircle className="spin" size={16} /> : <ArrowUpRight size={18} />}</button></form>
      <div className="prompt-suggestions">{suggestions.map(({ text, icon: Icon }) => <button key={text} disabled={busy} onClick={() => void askDirector(text)}><Icon size={11} />{text}</button>)}</div>
      {voiceNotice && <span className="voice-notice">{voiceNotice}</span>}
    </section>
    <div className="touch-controls" aria-label="Touch flight controls">{(["left", "right", "boost"] as const).map(action => <button key={action} className={action === "boost" ? "touch-boost" : ""} aria-label={action === "boost" ? "Hold to boost" : `Steer ${action}`} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); game.current?.setInput(action, true); }} onPointerUp={() => game.current?.setInput(action, false)} onPointerCancel={() => game.current?.setInput(action, false)} onLostPointerCapture={() => game.current?.setInput(action, false)}>{action === "left" ? <ArrowLeft size={24} /> : action === "right" ? <ArrowRight size={24} /> : <Zap size={24} />}</button>)}</div>
    {toast && <div className="game-toast" role="status"><Radio size={15} />{toast}</div>}
    <footer className="bottom-bar"><div className="keyboard-hint"><kbd>A</kbd><kbd>D</kbd><span>STEER</span><kbd className="space-key">SPACE</kbd><span>BOOST</span><button onClick={() => openModal("help")} aria-label="View flight manual"><Info size={14} /></button></div><div className="event-credit"><span>BUILT FOR</span> {"{Tech: Europe}"}<span>AI GAMING HACK</span></div><button className="sponsor-link" onClick={() => openModal("tech")}>MEET THE TECHNOLOGY <ArrowUpRight size={13} /></button></footer>
    {(snapshot.phase === "paused" || finished) && !modal && <div className="overlay"><section className="result-card"><span className="eyebrow">{finished ? "FLIGHT RECORDER / 001" : "SIGNAL ON HOLD"}</span><div className={`result-icon ${snapshot.phase === "lost" ? "failed" : ""}`}>{snapshot.phase === "paused" ? <Pause size={30} /> : snapshot.phase === "won" ? <Flag size={30} /> : <Radio size={30} />}</div><h2>{snapshot.phase === "paused" ? "Take a breath." : snapshot.phase === "won" ? "Signal secured." : "Signal lost."}</h2><p>{snapshot.phase === "paused" ? "The ocean will wait. Resume when you’re ready." : snapshot.phase === "won" ? "You made it through the drift. The next run is a whole new world." : snapshot.shield <= 0 ? "Your shield ran out. Steer clear of the coral hazards and ask Echo for a repair." : "Extraction arrived before you collected 12 shards. Ask Echo for more crystals and try again."}</p>{finished && <div className="results"><div><span>SCORE</span><strong>{snapshot.score.toLocaleString()}</strong></div><div><span>SHARDS</span><strong>{snapshot.shards}<small> / 12</small></strong></div><div><span>PERSONAL BEST</span><strong>{best.toLocaleString()}</strong></div></div>}<button className="launch-button" onClick={() => snapshot.phase === "paused" ? game.current?.resume() : startRun()}>{snapshot.phase === "paused" ? <Play size={17} /> : <RotateCcw size={17} />}{snapshot.phase === "paused" ? "Back to the drift" : "One more run"}<ArrowUpRight size={19} /></button>{snapshot.phase === "paused" && <button className="text-button" onClick={startRun}>Restart this run</button>}</section></div>}
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) closeModal(); }}><div className={`modal ${modal === "tech" ? "tech-modal" : ""}`} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1}><button className="icon-button modal-close" onClick={closeModal} aria-label="Close dialog"><X size={20} /></button><span className="eyebrow">ECHO SHIFT / {modal === "help" ? "FLIGHT MANUAL" : "BEHIND THE SIGNAL"}</span><h2 id="modal-title">{modal === "help" ? "Find your flow." : "Built to listen."}</h2>
      {modal === "help" ? <><p className="modal-intro">A little instinct. A little intelligence. Ninety seconds to make it home.</p><div className="manual-steps"><div><span>01</span><div><h3>Chase the energy</h3><p>Collect at least 12 cyan crystals, then survive until the 90-second extraction. Every crystal adds to your score.</p></div><Diamond /></div><div><span>02</span><div><h3>Stay in one piece</h3><p>Steer with A / D or ← / →. Avoid the coral hazards. Hold Space to boost; release to recharge. Escape pauses your flight.</p></div><Zap /></div><div><span>03</span><div><h3>Change the world</h3><p>Ask Echo for a storm, more crystals, a shield repair, calmer skies, or extra speed. You can type, dictate, or tap a suggestion.</p></div><AudioLines /></div></div><div className="manual-note"><Info size={17} /><p>On a phone or tablet, use the on-screen steering and boost buttons. Enable sound in the top right to hear Echo. Best scores stay on this device.</p></div><button className="launch-button" onClick={closeModal}>Ready, pilot <ArrowUpRight size={20} /></button></> : <>
        <p className="modal-intro">A playable experiment for the {"{Tech: Europe}"} AI Gaming Hack. Real integrations, with a local mode so you can always fly.</p>
        <div className="integration-list"><div><Sparkles /><section><h3>Google DeepMind <span>GEMINI</span></h3><p>Turns your requests and live flight telemetry into changes to the world. Built with the Gemini skills and cookbook.</p></section><span className={`integration-status ${services.gemini ? "online" : ""}`}>{serviceLoaded ? services.gemini ? "Configured" : "Local demo" : "Checking…"}</span></div><div><AudioLines /><section><h3>Gradium <span>VOICE</span></h3><p>Speaks your director’s responses. Browser speech is a labeled fallback; microphone dictation uses your browser.</p></section><span className={`integration-status ${services.gradium ? "online" : ""}`}>{services.gradium ? "Configured" : "Not connected"}</span></div><div><Cpu /><section><h3>Cognition <span>DEVIN</span></h3><p>Designs a custom mission in the optional workshop below. Each request starts a real, bounded Devin session.</p></section><span className={`integration-status ${services.devin ? "online" : ""}`}>{services.devin ? "Configured" : "Not connected"}</span></div><div><Crosshair /><section><h3>Voodoo <span>CO-HOST</span></h3><p>Short runs and one-more-try play inspired by arcade games. No Voodoo service is connected; event-specific tools are needed.</p></section><span className="integration-status">Acknowledged</span></div><div><span className="yg-mark">YG</span><section><h3>YG <span>EVENT PARTNER</span></h3><p>The event names YG without a developer resource. Its integration is pending the sponsor’s identity and API documentation.</p></section><span className="integration-status">Resources needed</span></div></div>
        <section className="workshop"><div className="workshop-heading"><Cpu size={18} /><h3>The mission workshop</h3><span>POWERED BY DEVIN</span></div><p>Describe a flight. Devin writes a mission and chooses a world modifier for your next run.</p><label className="sr-only" htmlFor="workshop-brief">Custom mission description</label><input id="workshop-brief" value={workshopBrief} maxLength={500} onChange={e => setWorkshopBrief(e.target.value)} disabled={workshop.busy || !services.devin} /><button className="workshop-button" onClick={() => void createMission()} disabled={!services.devin || workshop.busy || !workshopBrief.trim()}>{workshop.busy ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}{services.devin ? "Create mission · up to 1 ACU" : "Connect Devin to enable"}<ArrowUpRight size={16} /></button>{workshop.text && <p className="workshop-message" role="status">{workshop.text} {workshop.url && <a href={workshop.url} target="_blank" rel="noreferrer">Open Devin <ArrowUpRight size={12} /></a>}</p>}{workshop.mission && <div className="custom-mission"><h4>{workshop.mission.title}</h4><p>{workshop.mission.briefing}</p><button onClick={() => { const mission = workshop.mission!; const directive: Directive = { event: mission.event, message: mission.briefing, source: "devin" }; directiveRef.current = directive; setDirector(directive); closeModal(); startRun(); }}>Fly this mission <ChevronRight size={16} /></button></div>}</section>
        <p className="connection-note">Sponsor services need server-side credentials. See the project’s setup guide. “Configured” means a key is present; live requests still depend on your account and credits.</p><div className="resource-links"><a href="https://github.com/google-gemini/gemini-skills" target="_blank" rel="noreferrer">Gemini skills <ArrowUpRight size={13} /></a><a href="https://github.com/google-gemini/cookbook" target="_blank" rel="noreferrer">Gemini cookbook <ArrowUpRight size={13} /></a></div>
      </>}
    </div></div>}
  </main>;
}
