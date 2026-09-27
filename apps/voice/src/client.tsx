import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useVoiceAgent } from "agents/voice/react";
import { installAudioTaps, startVisualizer, type VisualState } from "./visualizer.ts";
import "./styles.css";

type Brief = { brief: string; url?: string };

const STATUS_LABEL: Record<string, string> = {
  idle: "Appuyez pour parler",
  listening: "Je vous écoute…",
  thinking: "Je réfléchis…",
  speaking: "Je réponds…",
};

function sessionId(): string {
  try {
    const saved = sessionStorage.getItem("yaatal-voice-session");
    if (saved) return saved;
    const id = crypto.randomUUID();
    sessionStorage.setItem("yaatal-voice-session", id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function isBrief(value: unknown): value is Brief & { type: "playground_brief" } {
  // A brief comes with a Playground link only when a public Playground is configured.
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.type !== "playground_brief" || typeof v.brief !== "string") return false;
  if (v.url === undefined) return true;
  if (typeof v.url !== "string") return false;
  try {
    const url = new URL(v.url);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch {
    return false;
  }
}

function Mark() {
  // Two cloth strips woven into a Y: the orange one tucks under the cream one, which becomes the stem.
  return (
    <svg width="30" height="30" viewBox="0 0 256 256" aria-hidden="true">
      <clipPath id="ym"><rect width="256" height="256" rx="56" /></clipPath>
      <rect width="256" height="256" rx="56" fill="#15302c" />
      <g clipPath="url(#ym)" fill="none" strokeLinejoin="round">
        <path d="M30 -8 L128 118" stroke="#e85a25" strokeWidth="40" />
        <path d="M226 -8 L128 118 L128 272" stroke="#15302c" strokeWidth="56" />
        <path d="M226 -8 L128 118 L128 272" stroke="#f3dcc0" strokeWidth="40" />
        <path d="M108 190 H148 M108 206 H148" stroke="#e85a25" strokeWidth="6" />
      </g>
    </svg>
  );
}

function Wordmark() {
  return (
    <svg viewBox="-4 -4 492 108" height="16" aria-hidden="true">
      <g fill="currentColor">
        <path d="M0 0H22L35 30L48 0H70L45 54V100H25V54Z" />
        <path d="M86 100L113 0H129L156 100H136L121 42L106 100Z" />
        <path d="M172 100L199 0H215L242 100H222L207 42L192 100Z" />
        <path d="M258 0H322V20H300V100H280V20H258Z" />
        <path d="M338 100L365 0H381L408 100H388L373 42L358 100Z" />
        <path d="M424 0H444V80H484V100H424Z" />
      </g>
    </svg>
  );
}

const icon = {
  mic: <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  micOff: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M19 11a7 7 0 0 1-1.2 3.9M5 11a7 7 0 0 0 10.7 5.9M12 18v3" /></svg>,
  micOn: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  hangUp: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.6 14.4c4.7-4.5 12.1-4.5 16.8 0l-1.9 2.3-3.4-1.2-.3-2.4a10 10 0 0 0-5.6 0l-.3 2.4-3.4 1.2z" /></svg>,
  keyboard: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></svg>,
};

const LABEL: Record<VisualState, string> = {
  connecting: "Connexion…",
  idle: "Appuyez pour parler",
  listening: "À l'écoute",
  thinking: "Je réfléchis…",
  speaking: "Yaatal parle",
};

function App() {
  const name = useMemo(sessionId, []);
  const {
    status, transcript, interimTranscript, audioLevel, connected, error, metrics, isMuted,
    startCall, endCall, toggleMute, sendText, lastCustomMessage,
  } = useVoiceAgent({ agent: "yaatal-voice", name });
  const [brief, setBrief] = useState<Brief | null>(null);
  const [text, setText] = useState("");
  const [inCall, setInCall] = useState(false);
  const [typing, setTyping] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  // Typed turns think and speak too, so the ring follows the agent even outside a call.
  const visual: VisualState = !connected ? "connecting" : status;
  const live = useRef({ visual, level: audioLevel });
  live.current = { visual, level: isMuted ? 0 : audioLevel };

  useEffect(() => {
    if (!canvas.current) return;
    return startVisualizer(canvas.current, () => live.current.visual, () => live.current.level);
  }, []);
  useEffect(() => {
    if (isBrief(lastCustomMessage)) setBrief({ brief: lastCustomMessage.brief, url: lastCustomMessage.url });
  }, [lastCustomMessage]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [transcript.length, interimTranscript]);

  const toggleCall = async () => {
    if (inCall) { endCall(); setInCall(false); return; }
    await startCall();
    setInCall(true);
  };
  const label = inCall && isMuted && visual === "listening" ? "Micro coupé" : LABEL[visual];

  return (
    <div className="page">
      <header className="top">
        <a className="logo" href="/" aria-label="Yaatal"><Mark /><Wordmark /></a>
        <span className={`dot ${connected ? "on" : ""}`}>{connected ? "Connecté" : "Connexion…"}</span>
      </header>

      <main className="call">
        <section className={`stage is-${visual}`} aria-label="Appel vocal">
          <div className="ring">
            <canvas ref={canvas} aria-hidden="true" />
            <button
              type="button"
              className={`core ${inCall ? "live" : ""}`}
              onClick={toggleCall}
              disabled={!connected}
              aria-pressed={inCall}
              aria-label={inCall ? "Terminer l'appel" : "Commencer à parler"}
            >
              {inCall ? <Mark /> : icon.mic}
            </button>
          </div>
          <p className="state" aria-live="polite">{label}</p>
          <p className="interim">{interimTranscript ? `« ${interimTranscript} »` : inCall ? "Parlez en français, Yaatal vous répond." : "Un appel, quelques questions, et votre brief est prêt."}</p>

          <div className="controls" role="group" aria-label="Commandes de l'appel">
            <button type="button" className="ctl" onClick={toggleMute} disabled={!inCall} aria-pressed={isMuted} aria-label={isMuted ? "Réactiver le micro" : "Couper le micro"}>
              {isMuted ? icon.micOff : icon.micOn}
            </button>
            <button type="button" className="ctl end" onClick={toggleCall} disabled={!inCall} aria-label="Raccrocher">{icon.hangUp}</button>
            <button type="button" className="ctl" onClick={() => setTyping(v => !v)} aria-pressed={typing} aria-label="Écrire au lieu de parler">{icon.keyboard}</button>
          </div>
          {metrics && metrics.first_audio_ms > 0 && (
            <p className="latency"><b />1er son en {Math.round(metrics.first_audio_ms)} ms</p>
          )}
        </section>

        <section className="side" aria-label="Conversation">
          <h1>Dites ce que vous voulez construire.</h1>
          <p className="lede">Yaatal vous pose quelques questions, puis prépare le brief pour le Playground.</p>

          {error && <p className="error" role="alert">{error}</p>}

          <div className="log">
            {transcript.length === 0 && !interimTranscript && (
              <p className="empty">La conversation s'affiche ici, en direct.</p>
            )}
            {transcript.map((m, i) => (
              <div key={i} className={`bubble ${m.role === "user" ? "me" : ""}`}>{m.text}</div>
            ))}
            <div ref={bottom} />
          </div>

          {brief && (
            <section className="brief" aria-label="Brief prêt">
              <p className="kicker">Brief prêt</p>
              <p className="brief-text">{brief.brief}</p>
              {brief.url
                ? <a className="btn" href={brief.url}>Ouvrir dans le Playground</a>
                : <button type="button" className="btn" onClick={() => { void navigator.clipboard?.writeText(brief.brief); }}>Copier le brief</button>}
            </section>
          )}

          {typing && (
            <form className="type" onSubmit={e => { e.preventDefault(); if (text.trim()) { sendText(text.trim()); setText(""); } }}>
              <input
                autoFocus
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Écrivez votre message…"
                aria-label="Écrire un message"
                disabled={!connected || status === "thinking"}
              />
              <button className="btn ghost" type="submit" disabled={!connected || !text.trim()}>Envoyer</button>
            </form>
          )}
          <p className="note">Prototype : STT et voix en français. Chaque réponse est décomptée en FCFA sur l'API Yaatal.</p>
        </section>
      </main>
    </div>
  );
}

installAudioTaps();
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
