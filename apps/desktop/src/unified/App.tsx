import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Moon, Radio, ShoppingBag, Sun, UserRound } from "lucide-react";
import { type SidecarStatus } from "@yaatal/os-protocol";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./components/ui/dialog";
import { createNativeAdapter, createWorkspaceAdapter, signedOut, type NativeAdapter, type SanitizedSession, type RuntimeMode } from "./native";
import type { CommerceWorkspaceAdapter, StudioSessionState } from "./contracts";
import { SellWorkspace } from "./features/sell/SellWorkspace";
import { ShopWorkspace } from "./features/shop/ShopWorkspace";
import { ShareDialog } from "./features/commerce/ShareDialog";
import { initialThemePreference, readLocale, readPreference, resolveTheme, savePreference, systemTheme, LOCALE_KEY, RAIL_KEY, THEME_KEY, WORKSPACE_KEY, type Theme, type ThemePreference, type Workspace } from "./state";

const defaultAdapter = createNativeAdapter();
const defaultWorkspaceAdapter = createWorkspaceAdapter();
type Locale = "en" | "fr";
type ServiceRetry = "recovery" | "connect" | "initialize" | null;
const shellMessages = {
  en: {
    sell: "SELL", shop: "SHOP", sellerWorkspace: "Seller workspace", yourShop: "Your shop", workspaceCaption: "YOUR WORKSPACE", skipToWorkspace: "Skip to workspace", localeFrench: "FR", localeEnglish: "EN", navigation: "Yaatal navigation", workspaces: "Workspaces", browserPreview: "Browser preview", connecting: "Connecting", studioConnected: "Studio connected", studioOffline: "Studio offline", useDark: "Use dark theme", useLight: "Use light theme", useFrench: "Français", useEnglish: "English", collapse: "Collapse navigation", expand: "Expand navigation", account: "Account", signIn: "Sign in", yourAccount: "Your account", welcomeBack: "Welcome back", previewAccount: "This is a browser preview. Open the Yaatal desktop app to sign in and connect to your shop.", signedInAs: (merchant: string) => `Signed in as ${merchant}.`, signInDescription: "Sign in once to manage your live and your shop.", verified: "Verified account", verificationPending: "Account verification pending", signingOut: "Signing out…", signOut: "Sign out", email: "Email", password: "Password", signingIn: "Signing in…", signInFailed: "Sign-in failed. Please try again.", signInIncomplete: "Sign-in did not complete. Please try again.", signOutFailed: "Sign-out failed. Please try again.", signOutIncomplete: "Sign-out did not complete. Please try again.", runtimeUnavailable: "The desktop connection is unavailable.", connectFailed: "Could not connect to Studio.", sessionRefreshFailed: "Could not refresh Studio session. Try again.", retryStudio: "Retry Studio", checking: "Connecting to your workspace…", desktopConnection: "DESKTOP CONNECTION", cannotOpen: "Unable to open this workspace", restartDesktop: "Restart the desktop app with the unified runtime enabled.", previewNotice: "Browser preview · Sign-in, live sessions, and checkout require the desktop app.", connectStudio: "Connect Studio", connectingStudio: "Connecting…", sellIntroEyebrow: "SELL / LIVE STUDIO", shopIntroEyebrow: "SHOP / CATALOG", sellIntroTitle: "Your next live starts here.", shopIntroTitle: "A shop that feels like you.", sellIntroBody: "Bring your products and your customers together.", shopIntroBody: "Your products, ready for their next home.", welcome: "Make yourself at home", sellGettingReady: "Your live workspace is getting ready", shopGettingReady: "Your catalog is getting ready", signInToPrepare: "Sign in to connect your products and prepare your next live.", nativeIntegration: "This workspace is waiting for its native integration. Your existing products and live tools remain available in the original desktop view.", signInToContinue: "Sign in to continue", merchantFallback: "Merchant",
  },
  fr: {
    sell: "VENDRE", shop: "BOUTIQUE", sellerWorkspace: "Espace vendeur", yourShop: "Votre boutique", workspaceCaption: "VOTRE ESPACE", skipToWorkspace: "Aller à l’espace de travail", localeFrench: "FR", localeEnglish: "EN", navigation: "Navigation Yaatal", workspaces: "Espaces de travail", browserPreview: "Aperçu navigateur", connecting: "Connexion", studioConnected: "Studio connecté", studioOffline: "Studio hors ligne", useDark: "Utiliser le thème sombre", useLight: "Utiliser le thème clair", useFrench: "Français", useEnglish: "English", collapse: "Réduire la navigation", expand: "Développer la navigation", account: "Compte", signIn: "Se connecter", yourAccount: "Votre compte", welcomeBack: "Bon retour", previewAccount: "Ceci est un aperçu navigateur. Ouvrez l’application de bureau Yaatal pour vous connecter et relier votre boutique.", signedInAs: (merchant: string) => `Connecté en tant que ${merchant}.`, signInDescription: "Connectez-vous une fois pour gérer votre direct et votre boutique.", verified: "Compte vérifié", verificationPending: "Vérification du compte en attente", signingOut: "Déconnexion…", signOut: "Se déconnecter", email: "E-mail", password: "Mot de passe", signingIn: "Connexion…", signInFailed: "La connexion a échoué. Réessayez.", signInIncomplete: "La connexion n’a pas abouti. Réessayez.", signOutFailed: "La déconnexion a échoué. Réessayez.", signOutIncomplete: "La déconnexion n’a pas abouti. Réessayez.", runtimeUnavailable: "La connexion de bureau est indisponible.", connectFailed: "Impossible de connecter Studio.", sessionRefreshFailed: "Impossible d’actualiser la session Studio. Réessayez.", retryStudio: "Réessayer Studio", checking: "Connexion à votre espace…", desktopConnection: "CONNEXION BUREAU", cannotOpen: "Impossible d’ouvrir cet espace", restartDesktop: "Redémarrez l’application de bureau avec l’exécution unifiée activée.", previewNotice: "Aperçu navigateur · La connexion, les directs et le paiement nécessitent l’application de bureau.", connectStudio: "Connecter Studio", connectingStudio: "Connexion…", sellIntroEyebrow: "VENDRE / STUDIO DIRECT", shopIntroEyebrow: "BOUTIQUE / CATALOGUE", sellIntroTitle: "Votre prochain direct commence ici.", shopIntroTitle: "Une boutique qui vous ressemble.", sellIntroBody: "Rassemblez vos produits et vos clients.", shopIntroBody: "Vos produits sont prêts pour leur prochain foyer.", welcome: "Bienvenue chez vous", sellGettingReady: "Votre espace direct se prépare", shopGettingReady: "Votre catalogue se prépare", signInToPrepare: "Connectez-vous pour relier vos produits et préparer votre prochain direct.", nativeIntegration: "Cet espace attend son intégration native. Vos produits et outils de direct restent disponibles dans la vue de bureau d’origine.", signInToContinue: "Se connecter pour continuer", merchantFallback: "Marchand",
  },
} satisfies Record<Locale, Record<string, string | ((value: string) => string)>>;
const railMessages = {
  en: { connection: "Connection", openSell: "Open SELL workspace", openShop: "Open SHOP workspace" },
  fr: { connection: "Connexion", openSell: "Ouvrir l’espace VENDRE", openShop: "Ouvrir l’espace BOUTIQUE" },
} as const;
export interface WorkspaceContext {
  session: SanitizedSession;
  mode: RuntimeMode;
  selectedProductId: string | null;
  selectProduct: (id: string) => void;
  navigate: (workspace: Workspace) => void;
}
export interface AppProps {
  adapter?: NativeAdapter;
  workspaceAdapter?: CommerceWorkspaceAdapter;
  renderSell?: (context: WorkspaceContext) => ReactNode;
  renderShop?: (context: WorkspaceContext) => ReactNode;
}
function WorkspacePane({ active, children }: { active: boolean; children: ReactNode }) {
  const pane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const focusable = pane.current?.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]') || [];
    focusable.forEach(element => {
      if (!active) { if (!element.dataset.inactiveTabindex) element.dataset.inactiveTabindex = element.getAttribute("tabindex") ?? "__none__"; element.setAttribute("tabindex", "-1"); }
      else if (element.dataset.inactiveTabindex) { const previous = element.dataset.inactiveTabindex; delete element.dataset.inactiveTabindex; if (previous === "__none__") element.removeAttribute("tabindex"); else element.setAttribute("tabindex", previous); }
    });
  }, [active, children]);
  return <div ref={pane} className="workspace-pane" hidden={!active} aria-hidden={!active} inert={!active}>{children}</div>;
}
export function App({ adapter = defaultAdapter, workspaceAdapter = defaultWorkspaceAdapter, renderSell, renderShop }: AppProps) {
  const [mode, setMode] = useState<RuntimeMode | "checking" | "blocked">("checking");
  const [runtimeError, setRuntimeError] = useState("");
  const [session, setSession] = useState<SanitizedSession>(signedOut);
  const [sidecar, setSidecar] = useState<SidecarStatus | null>(null);
  const [serviceError, setServiceError] = useState("");
  const [serviceRetry, setServiceRetry] = useState<ServiceRetry>(null);
  const [initializationEpoch, setInitializationEpoch] = useState(0);
  const [initializing, setInitializing] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>(() => readPreference(WORKSPACE_KEY) === "shop" ? "shop" : "sell");
  const [themePreference, setThemePreference] = useState<ThemePreference>(initialThemePreference);
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(initialThemePreference()));
  const [locale, setLocale] = useState<"en" | "fr">(readLocale);
  const [collapsed, setCollapsed] = useState(() => readPreference(RAIL_KEY) === "collapsed");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [liveSession, setLiveSession] = useState<StudioSessionState | null>(null);
  const [shareProductId, setShareProductId] = useState<string | null>(null);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const [recoveryEpoch, setRecoveryEpoch] = useState(0);
  const [studioResetEpoch, setStudioResetEpoch] = useState(0);
  const [conversionInvalidation, setConversionInvalidation] = useState<{ liveSessionId: string; epoch: number } | null>(null);
  const main = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const mounted = useRef(true);
  const accountOperation = useRef(0);
  const accountPending = useRef(false);
  const recoveryRequest = useRef(0);
  const accountRef = useRef({ authenticated: false, merchant: null as string | null, epoch: 0 });
  const sidecarRef = useRef<SidecarStatus | null>(null);
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const copy = shellMessages[locale];
  const applySession = useCallback((next: SanitizedSession) => {
    const current = accountRef.current;
    const changed = current.authenticated !== next.authenticated || (next.authenticated && current.merchant !== next.merchant_name);
    if (changed) { const epoch = current.epoch + 1; accountRef.current = { authenticated: next.authenticated, merchant: next.merchant_name, epoch }; setSelectedProductId(null); setLiveSession(null); setShareProductId(null); setConversionInvalidation(null); setAccountEpoch(epoch); }
    setSession(next);
  }, []);
  const applySidecar = useCallback((next: SidecarStatus) => {
    const previous = sidecarRef.current;
    const becameReady = next.state === "ready" && previous?.state !== "ready";
    if (next.state !== "ready") { recoveryRequest.current += 1; setConversionInvalidation(null); if (previous?.state === "ready") setStudioResetEpoch(value => value + 1); }
    sidecarRef.current = next; setSidecar(next);
    return becameReady;
  }, []);
  const refreshRecovery = useCallback(async () => {
    if (!accountRef.current.authenticated || sidecarRef.current?.state !== "ready") return;
    const request = ++recoveryRequest.current; const epoch = accountRef.current.epoch; const operation = accountOperation.current;
    setServiceError(""); setServiceRetry(null);
    try {
      const next = await adapter.sessionStatus();
      if (!mounted.current || recoveryRequest.current !== request || sidecarRef.current?.state !== "ready" || accountOperation.current !== operation || accountRef.current.epoch !== epoch) return;
      applySession(next); setRecoveryEpoch(value => value + 1);
    } catch (failure) {
      if (mounted.current && recoveryRequest.current === request && sidecarRef.current?.state === "ready" && accountOperation.current === operation && accountRef.current.epoch === epoch) {
        setServiceError(failure instanceof Error && failure.message ? failure.message : shellMessages[localeRef.current].sessionRefreshFailed);
        setServiceRetry("recovery");
      }
    }
  }, [adapter, applySession]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { document.documentElement.lang = locale; savePreference(LOCALE_KEY, locale); }, [locale]);
  useEffect(() => {
    if (themePreference !== "system" || typeof window === "undefined") return;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const update = () => setTheme(systemTheme());
    update(); media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [themePreference]);
  useEffect(() => { savePreference(RAIL_KEY, collapsed ? "collapsed" : "expanded"); }, [collapsed]);
  useEffect(() => { savePreference(WORKSPACE_KEY, workspace); }, [workspace]);
  useEffect(() => { if (accountError) errorRef.current?.focus(); }, [accountError]);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    let nativeConfirmed = false;
    let cleanup: (() => void) | undefined;
    async function initialize() {
      setInitializing(true);
      try {
        const runtime = await adapter.runtimeMode();
        if (!active) return;
        if (runtime === "preview") { setMode(runtime); setInitializing(false); return; }
        nativeConfirmed = true;
        setMode(runtime);
        const restoreOperation = accountOperation.current;
        const restoreEpoch = accountRef.current.epoch;
        const restored = await adapter.sessionStatus();
        if (!active) return;
        if (!accountPending.current && accountOperation.current === restoreOperation && accountRef.current.epoch === restoreEpoch) applySession(restored);
        const status = await adapter.sidecarStatus();
        if (!active) return;
        applySidecar(status);
        cleanup = await adapter.subscribe(status => {
          if (!active) return;
          const becameReady = applySidecar(status);
          if (becameReady) void refreshRecovery();
        }, event => {
          if (active && accountRef.current.authenticated) { selectProduct(event.productId); setWorkspace("shop"); }
        }, event => {
          if (!active || !accountRef.current.authenticated || sidecarRef.current?.state !== "ready") return;
          if (event.kind === "conversions-changed") setConversionInvalidation(current => ({ liveSessionId: event.liveSessionId, epoch: (current?.epoch ?? 0) + 1 }));
          else setRecoveryEpoch(value => value + 1);
        });
        if (!active) cleanup();
        else { setServiceError(""); setServiceRetry(null); setInitializing(false); }
      } catch (failure) {
        if (!active) return;
        const message = failure instanceof Error && failure.message ? failure.message : shellMessages[readLocale()].runtimeUnavailable;
        // Native mode must be explicitly confirmed before any usable workspace.
        if (!nativeConfirmed) { setRuntimeError(message); setMode("blocked"); }
        else { setServiceError(message); setServiceRetry("initialize"); }
        setInitializing(false);
      }
    }
    void initialize();
    return () => { active = false; mounted.current = false; recoveryRequest.current += 1; cleanup?.(); };
  }, [adapter, applySession, applySidecar, initializationEpoch, refreshRecovery]);

  const selectProduct = useCallback((id: string | null) => setSelectedProductId(id), []);
  const navigate = useCallback((next: Workspace) => { setWorkspace(next); requestAnimationFrame(() => main.current?.focus()); }, []);
  const toggleTheme = useCallback(() => {
    setTheme(current => { const next: Theme = current === "light" ? "dark" : "light"; setThemePreference(next); savePreference(THEME_KEY, next); return next; });
  }, []);
  const toggleLocale = useCallback(() => setLocale(current => current === "en" ? "fr" : "en"), []);
  async function authenticate(event: FormEvent) {
    event.preventDefault();
    if (mode !== "native" || pending) return;
    const operation = ++accountOperation.current; const operationEpoch = accountRef.current.epoch;
    accountPending.current = true; setPending(true); setAccountError("");
    try {
      const next = await adapter.login(email.trim(), password);
      if (!mounted.current || accountOperation.current !== operation || accountRef.current.epoch !== operationEpoch) return;
      if (!next.authenticated) throw new Error(copy.signInIncomplete);
      selectProduct(null); setLiveSession(null); setShareProductId(null); applySession(next); setAccountOpen(false); setEmail(""); setRecoveryEpoch(value => value + 1);
    } catch (failure) { if (mounted.current && accountOperation.current === operation && accountRef.current.epoch === operationEpoch) setAccountError(failure instanceof Error && failure.message ? failure.message : copy.signInFailed); }
    finally { if (mounted.current && accountOperation.current === operation) { accountPending.current = false; setPassword(""); setPending(false); } }
  }
  async function logout() {
    const operation = ++accountOperation.current;
    accountPending.current = true; setPending(true); setAccountError("");
    const previous = session;
    const revokedEpoch = accountRef.current.epoch + 1;
    accountRef.current = { authenticated: false, merchant: null, epoch: revokedEpoch };
    setAccountEpoch(revokedEpoch); setSession(signedOut); selectProduct(null); setLiveSession(null); setShareProductId(null); setConversionInvalidation(null); setWorkspace("sell");
    try {
      const next = await adapter.logout();
      if (!mounted.current || accountOperation.current !== operation || accountRef.current.epoch !== revokedEpoch) return;
      if (next.authenticated) throw new Error(copy.signOutIncomplete);
      applySession(next); selectProduct(null); setLiveSession(null); setShareProductId(null); setAccountOpen(false); setWorkspace("sell");
    } catch (failure) { if (mounted.current && accountOperation.current === operation && accountRef.current.epoch === revokedEpoch) { applySession(previous); setAccountError(failure instanceof Error && failure.message ? failure.message : copy.signOutFailed); } }
    finally { if (mounted.current && accountOperation.current === operation) { accountPending.current = false; setPending(false); } }
  }
  async function connect() {
    setConnecting(true); setServiceError(""); setServiceRetry(null);
    try { const status = await adapter.startSidecar(); if (mounted.current) { const becameReady = applySidecar(status); if (becameReady) await refreshRecovery(); } }
    catch (failure) { if (mounted.current) { setServiceError(failure instanceof Error && failure.message ? failure.message : copy.connectFailed); setServiceRetry("connect"); } }
    finally { if (mounted.current) setConnecting(false); }
  }
  function retryService() {
    if (serviceRetry === "recovery") void refreshRecovery();
    else if (serviceRetry === "connect") void connect();
    else if (serviceRetry === "initialize") { setServiceError(""); setServiceRetry(null); setInitializationEpoch(value => value + 1); }
  }
  const workspaceMode: RuntimeMode = mode === "native" || mode === "preview" ? mode : "preview";
  const context: WorkspaceContext | null = useMemo(() => !initializing && (mode === "native" || mode === "preview") ? { session, mode, selectedProductId, selectProduct, navigate } : null, [initializing, mode, navigate, selectedProductId, selectProduct, session]);
  const openShop = useCallback(() => navigate("shop"), [navigate]);
  const returnToLive = useCallback(() => navigate("sell"), [navigate]);
  const openShare = useCallback((productId: string) => setShareProductId(productId), []);
  const sessionChanged = useCallback((next: StudioSessionState | null) => setLiveSession(next), []);
  const closeShare = useCallback((open: boolean) => { if (!open) setShareProductId(null); }, []);
  const canShare = mode === "native" && session.authenticated && Boolean(liveSession?.isLive);
  const sellView = context && <SellWorkspace adapter={workspaceAdapter} authenticated={session.authenticated} accountEpoch={accountEpoch} recoveryEpoch={recoveryEpoch} studioResetEpoch={studioResetEpoch} studioReady={sidecar?.state === "ready"} conversionInvalidation={conversionInvalidation} mode={workspaceMode} selectedProductId={selectedProductId} onSelectProduct={selectProduct} onOpenShop={openShop} onShare={openShare} onSessionChange={sessionChanged} locale={locale} />;
  const shopView = context && <ShopWorkspace catalog={workspaceAdapter.catalog} authenticated={session.authenticated} accountEpoch={accountEpoch} selectedProductId={selectedProductId} onSelectProduct={selectProduct} onReturnToLive={returnToLive} onShare={openShare} canShare={canShare} mode={workspaceMode} locale={locale} />;
  return <div className="unified-app" data-rail={collapsed ? "collapsed" : "expanded"}>
    <a className="skip-link" href="#workspace">{copy.skipToWorkspace}</a>
    <aside className="unified-rail" aria-label={copy.navigation}>
      <div className="brand"><span className="brand-mark" aria-hidden="true">Y</span><span className="rail-label">YAATAL <strong>OS</strong></span></div>
      <p className="rail-caption rail-label">{copy.workspaceCaption}</p>
      <nav aria-label={copy.workspaces} className="rail-workspaces">{(["sell", "shop"] as const).map(item => <Button key={item} variant="ghost" className="workspace-link" aria-label={item === "sell" ? railMessages[locale].openSell : railMessages[locale].openShop} aria-current={workspace === item ? "page" : undefined} data-current={workspace === item || undefined} onClick={() => navigate(item)}>{item === "sell" ? <Radio size={20} /> : <ShoppingBag size={20} />}<span className="rail-label">{item === "sell" ? copy.sell : copy.shop}</span></Button>)}</nav>
      <p className="rail-note rail-label">{railMessages[locale].connection} · {mode === "preview" ? copy.browserPreview : sidecar?.state === "ready" ? copy.studioConnected : copy.studioOffline}</p>
      <div className="rail-footer"><Button variant="ghost" size="icon" aria-label={collapsed ? copy.expand : copy.collapse} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</Button></div>
    </aside>
    <div className="unified-workspace">
      <header className="unified-header"><span className="workspace-name">{workspace === "sell" ? copy.sellerWorkspace : copy.yourShop}</span><nav className="workspace-switch" aria-label={copy.workspaces}><Button variant="ghost" aria-current={workspace === "sell" ? "page" : undefined} onClick={() => navigate("sell")}>{copy.sell}</Button><Button variant="ghost" aria-current={workspace === "shop" ? "page" : undefined} onClick={() => navigate("shop")}>{copy.shop}</Button></nav><div className="header-actions"><span className="connection" role="status"><i data-state={sidecar?.state} />{mode === "preview" ? copy.browserPreview : mode === "checking" || initializing ? copy.connecting : sidecar?.state === "ready" ? copy.studioConnected : copy.studioOffline}</span><Button variant="ghost" size="icon" aria-label={theme === "light" ? copy.useDark : copy.useLight} onClick={toggleTheme}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</Button><Button variant="ghost" size="icon" aria-label={locale === "en" ? copy.useFrench : copy.useEnglish} onClick={toggleLocale}>{locale === "en" ? copy.localeFrench : copy.localeEnglish}</Button>
      <Dialog open={accountOpen} onOpenChange={open => { if (!pending) { setAccountOpen(open); setPassword(""); setAccountError(""); } }}><DialogTrigger asChild><Button variant="outline" className="account-button" disabled={initializing || mode === "checking" || mode === "blocked"}><UserRound size={18} /><span>{session.authenticated ? session.merchant_name || copy.account : copy.signIn}</span></Button></DialogTrigger><DialogContent onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onInteractOutside={event => { if (pending) event.preventDefault(); }}>
        <p className="eyebrow">YAATAL OS</p><DialogTitle>{session.authenticated ? copy.yourAccount : copy.welcomeBack}</DialogTitle><DialogDescription>{mode === "preview" ? copy.previewAccount : session.authenticated ? copy.signedInAs(session.merchant_name || copy.merchantFallback) : copy.signInDescription}</DialogDescription>
        {accountError && <p className="notice error" role="alert" tabIndex={-1} ref={errorRef}>{accountError}</p>}
        {mode === "native" && (session.authenticated ? <div className="account-details"><p>{session.verified ? copy.verified : copy.verificationPending}</p><Button disabled={pending} onClick={() => void logout()}>{pending ? copy.signingOut : copy.signOut}</Button></div> : <form onSubmit={event => void authenticate(event)} className="account-form"><div><Label htmlFor="account-email">{copy.email}</Label><Input id="account-email" type="email" autoComplete="username" required value={email} disabled={pending} onChange={event => setEmail(event.target.value)} /></div><div><Label htmlFor="account-password">{copy.password}</Label><Input id="account-password" type="password" autoComplete="current-password" required value={password} disabled={pending} onChange={event => setPassword(event.target.value)} /></div><Button type="submit" disabled={pending}>{pending ? copy.signingIn : copy.signIn}<ArrowRight size={16} /></Button></form>)}
      </DialogContent></Dialog></div></header>
      <main id="workspace" ref={main} tabIndex={-1} className="unified-content">
        {mode === "checking" || initializing ? <p role="status">{copy.checking}</p> : mode === "blocked" ? <section className="empty-state"><p className="eyebrow">{copy.desktopConnection}</p><h1>{copy.cannotOpen}</h1><p role="alert">{runtimeError}</p><p>{copy.restartDesktop}</p></section> : <>
          {mode === "preview" && <p className="preview-notice">{copy.previewNotice}</p>}
          {serviceError && <div className="notice error" role="alert"><p>{serviceError}</p>{serviceRetry && <Button variant="outline" disabled={connecting} onClick={retryService}>{copy.retryStudio}</Button>}</div>}
          {mode === "native" && sidecar?.state !== "ready" && <Button disabled={connecting} onClick={() => void connect()}>{connecting ? copy.connectingStudio : copy.connectStudio}</Button>}
          {context ? <>
            <WorkspacePane active={workspace === "sell"}>{renderSell?.(context) ?? sellView}</WorkspacePane>
            <WorkspacePane active={workspace === "shop"}>{renderShop?.(context) ?? shopView}</WorkspacePane>
          </> : <>
            <div className="workspace-intro"><p className="eyebrow">{workspace === "sell" ? copy.sellIntroEyebrow : copy.shopIntroEyebrow}</p><h1>{workspace === "sell" ? copy.sellIntroTitle : copy.shopIntroTitle}</h1><p>{workspace === "sell" ? copy.sellIntroBody : copy.shopIntroBody}</p></div>
            <section className="empty-state"><div className="empty-icon">{workspace === "sell" ? <Radio size={28} /> : <ShoppingBag size={28} />}</div><h2>{!session.authenticated ? copy.welcome : workspace === "sell" ? copy.sellGettingReady : copy.shopGettingReady}</h2><p>{!session.authenticated ? copy.signInToPrepare : copy.nativeIntegration}</p>{!session.authenticated ? <Button disabled={mode !== "native"} onClick={() => setAccountOpen(true)}>{copy.signInToContinue}<ArrowRight size={16} /></Button> : mode === "native" && sidecar?.state !== "ready" ? <Button disabled={connecting} onClick={() => void connect()}>{connecting ? copy.connectingStudio : copy.connectStudio}</Button> : null}</section>
          </>}
        </>}
      </main>
    </div>
    <ShareDialog adapter={workspaceAdapter} productId={shareProductId} accountEpoch={accountEpoch} open={shareProductId !== null} onOpenChange={closeShare} locale={locale} />
  </div>;
}
