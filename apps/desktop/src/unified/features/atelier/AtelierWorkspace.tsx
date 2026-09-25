import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, WandSparkles } from "lucide-react";
import { Button } from "../../components/ui/button";
import "./AtelierWorkspace.css";

type Locale = "en" | "fr";
type Reachability = "checking" | "ready" | "unreachable";

const messages = {
  en: {
    title: "Yaatal Atelier", frameTitle: "Yaatal Atelier: create and review tools with the agent",
    eyebrow: "ATELIER / CREATE", checking: "Opening the Atelier…",
    notConfigured: "The Atelier address is not valid", notConfiguredBody: "Set VITE_YAATAL_OS_ATELIER_URL to an https address, or to http on this computer.",
    unreachable: "The Atelier is not running", unreachableBody: "Start it with pnpm run-local in apps/cloudflare-os, then try again.",
    retry: "Try again",
  },
  fr: {
    title: "Atelier Yaatal", frameTitle: "Atelier Yaatal : créer et relire des outils avec l’agent",
    eyebrow: "ATELIER / CRÉER", checking: "Ouverture de l’Atelier…",
    notConfigured: "L’adresse de l’Atelier n’est pas valide", notConfiguredBody: "Définissez VITE_YAATAL_OS_ATELIER_URL avec une adresse https, ou http sur cet ordinateur.",
    unreachable: "L’Atelier n’est pas démarré", unreachableBody: "Lancez-le avec pnpm run-local dans apps/cloudflare-os, puis réessayez.",
    retry: "Réessayer",
  },
} as const;

/** Resolves when something answers at the address; rejects on a network failure or timeout. */
export type AtelierProbe = (url: string) => Promise<void>;

export const probeAtelier: AtelierProbe = async url => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    // no-cors: the response is opaque, but a resolved fetch proves the server is listening.
    await fetch(url, { mode: "no-cors", cache: "no-store", credentials: "omit", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export interface AtelierWorkspaceProps {
  /** Output of resolveAtelierUrl; null when the configured address was rejected. */
  url: string | null;
  locale?: Locale;
  probe?: AtelierProbe;
}

// The embedded OS keeps its own session and gets no Tauri IPC: it is a cross-origin frame and no
// capability grants a remote origin. The sandbox still blocks top-level navigation of the shell.
const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals";

export function AtelierWorkspace({ url, locale = "en", probe = probeAtelier }: AtelierWorkspaceProps) {
  const copy = messages[locale];
  const [state, setState] = useState<Reachability>("checking");
  const attempt = useRef(0);

  const check = useCallback(async () => {
    if (!url) return;
    const current = ++attempt.current;
    setState("checking");
    try {
      await probe(url);
      if (attempt.current === current) setState("ready");
    } catch {
      if (attempt.current === current) setState("unreachable");
    }
  }, [probe, url]);

  useEffect(() => {
    void check();
    return () => { attempt.current += 1; };
  }, [check]);

  if (!url) {
    return <section className="empty-state atelier-state" role="alert"><div className="empty-icon"><WandSparkles size={28} /></div><h2>{copy.notConfigured}</h2><p>{copy.notConfiguredBody}</p></section>;
  }
  if (state === "unreachable") {
    return <section className="empty-state atelier-state"><div className="empty-icon"><WandSparkles size={28} /></div><h2>{copy.unreachable}</h2><p>{copy.unreachableBody}</p><Button variant="outline" onClick={() => void check()}><RefreshCw size={16} />{copy.retry}</Button></section>;
  }
  return (
    <section className="atelier-workspace" aria-label={copy.title}>
      {state === "checking" && <p role="status" className="atelier-status">{copy.checking}</p>}
      {state === "ready" && <iframe className="atelier-frame" src={url} title={copy.frameTitle} referrerPolicy="no-referrer" sandbox={SANDBOX} allow="clipboard-write" />}
    </section>
  );
}
