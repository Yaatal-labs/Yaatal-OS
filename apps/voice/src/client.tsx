import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useVoiceAgent } from "agents/voice/react";
import "./styles.css";

type Brief = { brief: string; url: string };

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
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.type !== "playground_brief" || typeof v.brief !== "string" || typeof v.url !== "string") return false;
  try {
    const url = new URL(v.url);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch {
    return false;
  }
}

function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 256 256" aria-hidden="true">
      <rect width="256" height="256" rx="56" fill="#15302c" />
      <rect x="52" y="74" width="66" height="20" rx="10" fill="#f3dcc0" />
      <rect x="136" y="74" width="68" height="20" rx="10" fill="#f3dcc0" />
      <rect x="52" y="115" width="116" height="26" rx="13" fill="#e85a25" />
      <rect x="186" y="115" width="18" height="26" rx="9" fill="#e85a25" />
      <rect x="52" y="162" width="32" height="20" rx="10" fill="#f3dcc0" />
      <rect x="102" y="162" width="102" height="20" rx="10" fill="#f3dcc0" />
    </svg>
  );
}

function MicIcon({ off }: { off?: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {off ? <path d="M6 6l12 12M6 18L18 6" /> : (
        <>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </>
      )}
    </svg>
  );
}

function App() {
  const name = useMemo(sessionId, []);
  const {
    status, transcript, interimTranscript, audioLevel, connected, error,
    startCall, endCall, sendText, lastCustomMessage,
  } = useVoiceAgent({ agent: "yaatal-voice", name });
  const [brief, setBrief] = useState<Brief | null>(null);
  const [text, setText] = useState("");
  const [inCall, setInCall] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isBrief(lastCustomMessage)) setBrief({ brief: lastCustomMessage.brief, url: lastCustomMessage.url });
  }, [lastCustomMessage]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [transcript.length, interimTranscript]);

  const toggle = async () => {
    if (inCall) { endCall(); setInCall(false); return; }
    await startCall();
    setInCall(true);
  };
  const label = inCall ? STATUS_LABEL[status] ?? STATUS_LABEL.idle : STATUS_LABEL.idle;
  const ring = inCall && status === "listening" ? Math.min(audioLevel * 6, 1) : 0;

  return (
    <div className="page">
      <header className="top">
        <a className="logo" href="/"><Mark />Yaatal</a>
        <span className={`dot ${connected ? "on" : ""}`}>{connected ? "Connecté" : "Connexion…"}</span>
      </header>

      <main className="main">
        <h1>Dites ce que vous voulez construire.</h1>
        <p className="lede">Parlez en français. Yaatal vous pose quelques questions, puis prépare la consigne pour le Playground.</p>

        <div className="call">
          <button
            type="button"
            className={`mic ${inCall ? "live" : ""}`}
            style={{ boxShadow: `0 0 0 ${8 + ring * 22}px rgba(232,90,37,${0.12 + ring * 0.2})` }}
            onClick={toggle}
            disabled={!connected}
            aria-pressed={inCall}
            aria-label={inCall ? "Terminer la conversation" : "Commencer à parler"}
          >
            <MicIcon off={inCall && status !== "listening"} />
          </button>
          <p className="status" aria-live="polite">{label}</p>
          {interimTranscript && <p className="interim">« {interimTranscript} »</p>}
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        <section className="log" aria-label="Conversation">
          {transcript.map((m, i) => (
            <div key={i} className={`bubble ${m.role === "user" ? "me" : ""}`}>{m.text}</div>
          ))}
          <div ref={bottom} />
        </section>

        {brief && (
          <section className="brief" aria-label="Consigne prête">
            <p className="kicker">Consigne prête</p>
            <p className="brief-text">{brief.brief}</p>
            <a className="btn" href={brief.url}>Ouvrir dans le Playground</a>
          </section>
        )}

        <form
          className="type"
          onSubmit={e => { e.preventDefault(); if (text.trim()) { sendText(text.trim()); setText(""); } }}
        >
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Ou écrivez ici…"
            aria-label="Écrire un message"
            disabled={!connected || status === "thinking"}
          />
          <button className="btn ghost" type="submit" disabled={!connected || !text.trim()}>Envoyer</button>
        </form>
        <p className="note">Prototype : écoute et voix en français. Chaque réponse est décomptée en FCFA sur l'API Yaatal.</p>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
