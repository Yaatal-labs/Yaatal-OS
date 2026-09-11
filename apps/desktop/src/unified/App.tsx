import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Moon, Radio, ShoppingBag, Sun, UserRound } from "lucide-react";
import { type SidecarStatus } from "@yaatal/os-protocol";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./components/ui/dialog";
import { createNativeAdapter, signedOut, type NativeAdapter, type SanitizedSession, type RuntimeMode } from "./native";
import { initialTheme, readPreference, savePreference, THEME_KEY, RAIL_KEY, WORKSPACE_KEY, type Workspace } from "./state";

const defaultAdapter = createNativeAdapter();
export interface WorkspaceContext {
  session: SanitizedSession;
  mode: RuntimeMode;
  selectedProductId: string | null;
  selectProduct: (id: string) => void;
  navigate: (workspace: Workspace) => void;
}
export interface AppProps {
  adapter?: NativeAdapter;
  renderSell?: (context: WorkspaceContext) => ReactNode;
  renderShop?: (context: WorkspaceContext) => ReactNode;
}
export function App({ adapter = defaultAdapter, renderSell, renderShop }: AppProps) {
  const [mode, setMode] = useState<RuntimeMode | "checking" | "blocked">("checking");
  const [runtimeError, setRuntimeError] = useState("");
  const [session, setSession] = useState<SanitizedSession>(signedOut);
  const [sidecar, setSidecar] = useState<SidecarStatus | null>(null);
  const [serviceError, setServiceError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>(() => readPreference(WORKSPACE_KEY) === "shop" ? "shop" : "sell");
  const [theme, setTheme] = useState(initialTheme);
  const [collapsed, setCollapsed] = useState(() => readPreference(RAIL_KEY) === "collapsed");
  const [selectedProductId, selectProduct] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const main = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const mounted = useRef(true);

  useEffect(() => { document.documentElement.dataset.theme = theme; savePreference(THEME_KEY, theme); }, [theme]);
  useEffect(() => { savePreference(RAIL_KEY, collapsed ? "collapsed" : "expanded"); }, [collapsed]);
  useEffect(() => { savePreference(WORKSPACE_KEY, workspace); }, [workspace]);
  useEffect(() => { if (accountError) errorRef.current?.focus(); }, [accountError]);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    let cleanup: (() => void) | undefined;
    async function initialize() {
      try {
        const runtime = await adapter.runtimeMode();
        if (!active) return;
        if (runtime === "preview") { setMode(runtime); return; }
        const restored = await adapter.sessionStatus();
        if (!active) return;
        setSession(restored);
        setMode(runtime);
        const status = await adapter.sidecarStatus();
        if (!active) return;
        setSidecar(status);
        cleanup = await adapter.subscribe(status => { if (active) setSidecar(status); }, event => {
          if (active) { selectProduct(event.productId); setWorkspace("shop"); }
        });
        if (!active) cleanup();
      } catch (failure) {
        if (!active) return;
        const message = failure instanceof Error ? failure.message : "The desktop connection is unavailable.";
        // Native mode must be explicitly confirmed before any usable workspace.
        setMode(previous => {
          if (previous === "checking") { setRuntimeError(message); return "blocked"; }
          setServiceError(message); return previous;
        });
      }
    }
    void initialize();
    return () => { active = false; mounted.current = false; cleanup?.(); };
  }, [adapter]);

  function navigate(next: Workspace) { setWorkspace(next); requestAnimationFrame(() => main.current?.focus()); }
  async function authenticate(event: FormEvent) {
    event.preventDefault();
    if (mode !== "native" || pending) return;
    setPending(true); setAccountError("");
    try {
      const next = await adapter.login(email.trim(), password);
      if (!mounted.current) return;
      if (!next.authenticated) throw new Error("Sign-in did not complete. Please try again.");
      setSession(next); setAccountOpen(false); setEmail("");
    } catch (failure) { if (mounted.current) setAccountError(failure instanceof Error ? failure.message : "Sign-in failed. Please try again."); }
    finally { if (mounted.current) { setPassword(""); setPending(false); } }
  }
  async function logout() {
    setPending(true); setAccountError("");
    try {
      const next = await adapter.logout();
      if (!mounted.current) return;
      if (next.authenticated) throw new Error("Sign-out did not complete. Please try again.");
      setSession(next); selectProduct(null); setAccountOpen(false);
    } catch (failure) { if (mounted.current) setAccountError(failure instanceof Error ? failure.message : "Sign-out failed. Please try again."); }
    finally { if (mounted.current) setPending(false); }
  }
  async function connect() {
    setConnecting(true); setServiceError("");
    try { const status = await adapter.startSidecar(); if (mounted.current) setSidecar(status); }
    catch (failure) { if (mounted.current) setServiceError(failure instanceof Error ? failure.message : "Could not connect to Studio."); }
    finally { if (mounted.current) setConnecting(false); }
  }
  const context: WorkspaceContext | null = mode === "native" || mode === "preview" ? { session, mode, selectedProductId, selectProduct, navigate } : null;
  return <div className="unified-app" data-rail={collapsed ? "collapsed" : "expanded"}>
    <a className="skip-link" href="#workspace">Skip to workspace</a>
    <aside className="unified-rail" aria-label="Yaatal navigation">
      <div className="brand"><span className="brand-mark">Y</span><span className="rail-label">YAATAL <strong>OS</strong></span></div>
      <p className="rail-caption rail-label">YOUR WORKSPACE</p>
      <nav aria-label="Workspaces">{(["sell", "shop"] as const).map(item => <Button key={item} variant="ghost" className="workspace-link" aria-label={item.toUpperCase()} aria-current={workspace === item ? "page" : undefined} onClick={() => navigate(item)}>{item === "sell" ? <Radio size={20} /> : <ShoppingBag size={20} />}<span className="rail-label">{item.toUpperCase()}</span></Button>)}</nav>
      <div className="rail-footer"><Button variant="ghost" size="icon" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</Button></div>
    </aside>
    <div className="unified-workspace">
      <header className="unified-header"><span className="workspace-name">{workspace === "sell" ? "Seller workspace" : "Your shop"}</span><div className="header-actions"><span className="connection" role="status"><i data-state={sidecar?.state} />{mode === "preview" ? "Browser preview" : mode === "checking" ? "Connecting" : sidecar?.state === "ready" ? "Studio connected" : "Studio offline"}</span><Button variant="ghost" size="icon" aria-label={theme === "light" ? "Use dark theme" : "Use light theme"} onClick={() => setTheme(value => value === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</Button>
      <Dialog open={accountOpen} onOpenChange={open => { if (!pending) { setAccountOpen(open); setPassword(""); setAccountError(""); } }}><DialogTrigger asChild><Button variant="outline" className="account-button" disabled={mode === "checking" || mode === "blocked"}><UserRound size={18} /><span>{session.authenticated ? session.merchant_name || "Account" : "Sign in"}</span></Button></DialogTrigger><DialogContent onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onInteractOutside={event => { if (pending) event.preventDefault(); }}>
        <p className="eyebrow">YAATAL OS</p><DialogTitle>{session.authenticated ? "Your account" : "Welcome back"}</DialogTitle><DialogDescription>{mode === "preview" ? "This is a browser preview. Open the Yaatal desktop app to sign in and connect to your shop." : session.authenticated ? `Signed in as ${session.merchant_name || "Merchant"}.` : "Sign in once to manage your live and your shop."}</DialogDescription>
        {accountError && <p className="notice error" role="alert" tabIndex={-1} ref={errorRef}>{accountError}</p>}
        {mode === "native" && (session.authenticated ? <div className="account-details"><p>{session.verified ? "Verified account" : "Account verification pending"}</p><Button disabled={pending} onClick={() => void logout()}>{pending ? "Signing out…" : "Sign out"}</Button></div> : <form onSubmit={event => void authenticate(event)} className="account-form"><div><Label htmlFor="account-email">Email</Label><Input id="account-email" type="email" autoComplete="username" required value={email} disabled={pending} onChange={event => setEmail(event.target.value)} /></div><div><Label htmlFor="account-password">Password</Label><Input id="account-password" type="password" autoComplete="current-password" required value={password} disabled={pending} onChange={event => setPassword(event.target.value)} /></div><Button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}<ArrowRight size={16} /></Button></form>)}
      </DialogContent></Dialog></div></header>
      <main id="workspace" ref={main} tabIndex={-1} className="unified-content">
        {mode === "checking" ? <p role="status">Connecting to your workspace…</p> : mode === "blocked" ? <section className="empty-state"><p className="eyebrow">DESKTOP CONNECTION</p><h1>Unable to open this workspace</h1><p role="alert">{runtimeError}</p><p>Restart the desktop app with the unified runtime enabled.</p></section> : <>
          {mode === "preview" && <p className="preview-notice">Browser preview · Sign-in, live sessions, and checkout require the desktop app.</p>}
          {serviceError && <p className="notice error" role="alert">{serviceError}</p>}
          {context && (workspace === "sell" ? renderSell?.(context) : renderShop?.(context)) || <>
            <div className="workspace-intro"><p className="eyebrow">{workspace === "sell" ? "SELL / LIVE STUDIO" : "SHOP / CATALOG"}</p><h1>{workspace === "sell" ? "Your next live starts here." : "A shop that feels like you."}</h1><p>{workspace === "sell" ? "Bring your products and your customers together." : "Your products, ready for their next home."}</p></div>
            <section className="empty-state"><div className="empty-icon">{workspace === "sell" ? <Radio size={28} /> : <ShoppingBag size={28} />}</div><h2>{!session.authenticated ? "Make yourself at home" : workspace === "sell" ? "Your live workspace is getting ready" : "Your catalog is getting ready"}</h2><p>{!session.authenticated ? "Sign in to connect your products and prepare your next live." : "This workspace is waiting for its native integration. Your existing products and live tools remain available in the original desktop view."}</p>{!session.authenticated ? <Button disabled={mode !== "native"} onClick={() => setAccountOpen(true)}>Sign in to continue<ArrowRight size={16} /></Button> : mode === "native" && sidecar?.state !== "ready" ? <Button disabled={connecting} onClick={() => void connect()}>{connecting ? "Connecting…" : "Connect Studio"}</Button> : null}</section>
          </>}
        </>}
      </main>
    </div>
  </div>;
}
