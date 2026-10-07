// The control board's capability types.
//
// This file is deliberately NOT ./types.d.ts. The agent-facing declaration lives there and is
// returned verbatim by getTypeScriptTypes(); anything added here would be handed to every agent
// that binds this gatekeeper. The board is operator-only, so its API stays in a separate file that
// no getTypeScriptTypes() references and no describe() advertises. An agent therefore cannot learn
// that the board exists, let alone be granted it.
//
// The capability is handed out from exactly one place: GatekeeperUser.startAppUi(). That path
// carries no ApprovalQueue (AppUiContext is { isAdmin } only), so there is no gadget session, no
// binding and no observer surface here. The gate is isAdmin, checked on every call.

/**
 * Read-only operator view over this deployment's own operations.
 *
 * Every figure is an aggregate over a time window. There are no per-merchant, per-customer or
 * per-ledger-line reads in this interface, and none should be added: the internal OS is shared
 * "Sur invitation, sans données clients réelles ni paiement", and a revenue board must not quietly
 * contradict that. Adding a per-account shape here is a boundary change, not an enhancement.
 *
 * Every method except getViewerInfo() throws "Admin access required." unless the caller opened the
 * board as an admin.
 */
export interface ControlBoard {
  /**
   * Who is opening the board, and which legs have the secrets they need. Call this first: render a
   * refusal when isAdmin is false rather than letting each panel fail separately, and show a
   * "not configured yet" notice for a leg whose flag is false instead of an error.
   */
  getViewerInfo(): Promise<BoardViewerInfo>;

  /**
   * Token rail: money in, credit consumed, and the requests that were turned away.
   *
   * One window, one reading. Credits and spend are served together on purpose: they come from one
   * report at one instant, so the two figures on screen always reconcile against each other.
   */
  tokenRail(days?: number): Promise<TokenRailReport>;

  /** Commerce rail: what the Engine recorded, as event counts over the window. */
  commerce(days?: number): Promise<CommerceReport>;

  /** Liveness of the two live services. Cheap, and independent of the two reports above. */
  health(): Promise<HealthReport>;
}

/**
 * The window a report covers and when it was read. Pass the same `days` to two reports and they can
 * still hold different `since` values, because each is resolved when that report is produced.
 */
export interface ReportWindow {
  /** Whole days back from `since`. Requests are clamped to 1..90 and default to 30. */
  days: number;
  /** ISO 8601 instant the window starts at. */
  since: string;
  /** ISO 8601 instant the report was produced. */
  at: string;
}

/** Who opened the board, and which legs are wired. */
export interface BoardViewerInfo {
  isAdmin: boolean;
  /** False means the corresponding secret is absent, so that report will refuse rather than guess. */
  configured: {
    /** The gateway admin token, which tokenRail() needs and health() deliberately does not. */
    gateway: boolean;
    /** The PostHog personal key and project id, which commerce() needs. */
    posthog: boolean;
  };
}

/** Why a request was refused before it could be billed. */
export type RefusalKind = "insufficient_balance" | "upstream_error" | "no_upstream";

/** One model's billed usage. */
export interface ModelUsage {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  /** FCFA billed to accounts for this model over the window. Whole francs. */
  spendFcfa: number;
}

/** One day of the token rail. Days with no activity at all are absent. */
export interface TokenRailDay {
  /** ISO 8601 date, UTC. */
  day: string;
  newAccounts: number;
  requests: number;
  spendFcfa: number;
  creditsFcfa: number;
}

/** The token rail over one window. */
export interface TokenRailReport {
  window: ReportWindow;
  accounts: {
    /** Accounts that exist, including ones created before the window. */
    total: number;
    /** Accounts created inside the window. */
    new: number;
    /** Accounts with at least one billed request inside the window. */
    active: number;
    /** Accounts credited inside the window. This is the paying-account count, not the active count. */
    toppedUp: number;
  };
  /**
   * Credit sold, which is money received. `credits.xof` is the window's revenue; `usage.spendXof`
   * is credit consumed, which is revenue recognised later. Do not add them together.
   */
  credits: { count: number; xof: number };
  usage: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    /** Credit consumed, in XOF. */
    spendXof: number;
    /**
     * Share of billed rows (0..1) whose token count was estimated from text length instead of
     * reported by the upstream. A high share means the upstream is not returning usage, so the
     * spend figure is approximate. Worth a glance before trusting a small spend number.
     */
    estimatedShare: number;
  };
  /**
   * Refused requests by kind. Always has all three keys. `no_upstream` climbing is the
   * early-warning line: it means no supplier could serve the model that was asked for.
   */
  refused: Record<RefusalKind, { count: number; accounts: number }>;
  /** Ordered by spend, highest first. */
  byModel: ModelUsage[];
  /** Ordered by day, oldest first. */
  daily: TokenRailDay[];
}

/** One day of the commerce rail. */
export interface CommerceDay {
  /** ISO 8601 date, UTC. */
  day: string;
  registrations: number;
  confirmDelivery: number;
  dispute: number;
  payments: number;
}

/**
 * The commerce rail over one window, as event counts from the Engine's PostHog project.
 *
 * The counts are of events the Engine actually emits. There is no "intent" or "checkout" event in
 * the Engine today, so none is reported here.
 */
export interface CommerceReport {
  window: ReportWindow;
  /** `user.registered`. */
  registrations: number;
  /** `bobo.escrow.transitioned`, split by the trigger that caused the transition. */
  escrowTransitions: { confirmDelivery: number; dispute: number };
  /** `payment.webhook_received`. Wave is the only rail the Engine accepts today. */
  payments: { wave: number };
  /** Ordered by day, oldest first. */
  daily: CommerceDay[];
}

/** Liveness of one service. */
export interface ServiceHealth {
  ok: boolean;
  /** Round-trip milliseconds, or null when the probe did not complete. */
  ms: number | null;
  /** Short human-readable reason when `ok` is false. Never a raw upstream body or stack trace. */
  detail?: string;
}

/** Liveness of both live services, probed when the call is made. */
export interface HealthReport {
  at: string;
  /** The Engine at engine.njooba.com. */
  engine: ServiceHealth;
  /** The token gateway at api.kairmel.com. */
  gateway: ServiceHealth;
}
