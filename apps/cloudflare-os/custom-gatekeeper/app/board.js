// The control board, running inside the sandboxed iframe the Workshop hosts for startAppUi().
//
// build-app.mjs prepends capnweb's own source into this same module and wraps this file in an
// IIFE, so: no imports here, and RpcTarget / newMessagePortRpcSession are already in scope.
//
// Everything this file displays arrives over the capnweb port from ControlBoardImpl, which holds
// the admin token and does the upstream reads. The frame has an opaque origin and no credentials,
// so it cannot reach the gateway or PostHog on its own, by design.

(() => {
  "use strict";

  const WINDOWS = [7, 30, 90];
  const DEFAULT_DAYS = 30;

  /** @type {any} */ let api = null;
  let days = DEFAULT_DAYS;
  let busy = false;

  // --- theme -----------------------------------------------------------------

  function applyTheme(theme) {
    if (!theme || typeof theme !== "object") return;
    const root = document.documentElement;
    if (theme.mode === "light" || theme.mode === "dark") root.dataset.theme = theme.mode;

    const accent = typeof theme.accentColor === "string" ? theme.accentColor : "";
    if (!accent) {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-soft");
      return;
    }
    root.style.setProperty("--accent", accent);
    // Only soften the tint where the browser can actually mix the colour; elsewhere the per-theme
    // default tint stays, which is a smaller wrong than an invalid value blanking every tinted box.
    if (CSS.supports("color", "color-mix(in srgb, red 10%, blue)")) {
      root.style.setProperty("--accent-soft", `color-mix(in srgb, ${accent} 14%, transparent)`);
    }
  }

  // --- formatting ------------------------------------------------------------

  const nf = new Intl.NumberFormat("fr-FR");

  function n(value) {
    return nf.format(Number(value ?? 0));
  }
  function fcfa(value) {
    return n(Number(value ?? 0)) + " FCFA";
  }
  function tokens(value) {
    const v = Number(value ?? 0);
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1) + " M";
    if (v >= 1_000) return (v / 1_000).toFixed(v >= 10_000 ? 0 : 1) + " k";
    return n(v);
  }
  function share(value) {
    return (Number(value ?? 0) * 100).toFixed(1).replace(".", ",") + " %";
  }
  /** "2026-10-07" -> "07/10". The year is in the window header, so the row keeps it short. */
  function shortDay(value) {
    const text = String(value ?? "");
    return text.length >= 10 ? text.slice(8, 10) + "/" + text.slice(5, 7) : text;
  }
  function clock(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  function reason(err) {
    const text = err instanceof Error ? err.message : String(err ?? "");
    return text || "lecture impossible";
  }

  // --- tiny DOM helpers ------------------------------------------------------
  //
  // Every value from upstream goes in through textContent, never innerHTML. A model id or a health
  // detail is data from another service; it must not be able to become markup in the operator's page.

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function tiles(pairs) {
    const box = el("div", "tiles");
    for (const [label, value, note] of pairs) {
      const tile = el("div", "tile");
      tile.append(el("div", "tile-v", value), el("div", "tile-k", label));
      if (note) tile.append(el("div", "tile-n", note));
      box.append(tile);
    }
    return box;
  }

  function table(headers, rows, className) {
    const node = el("table");
    if (className) node.className = className;
    const thead = el("thead");
    const headRow = el("tr");
    for (const header of headers) {
      headRow.append(el("th", header.numeric ? "num" : null, header.label));
    }
    thead.append(headRow);
    const tbody = el("tbody");
    for (const row of rows) {
      const tr = el("tr");
      row.forEach((cell, index) => {
        // The first cell is a row header. Everything else is numeric in the tables we draw.
        tr.append(el(index === 0 ? "th" : "td", headers[index]?.numeric ? "num" : null, String(cell)));
      });
      tbody.append(tr);
    }
    node.append(thead, tbody);
    return node;
  }

  /** A proportional bar list. The number is always printed, so a zero-length bar still reads. */
  function series(points, format) {
    const box = el("div", "series");
    const max = points.reduce((peak, point) => Math.max(peak, Number(point.value) || 0), 0);
    for (const point of points) {
      const row = el("div", "series-row");
      const track = el("div", "series-track");
      const bar = el("div", "series-bar");
      bar.style.width = max > 0 ? ((Number(point.value) || 0) / max) * 100 + "%" : "0%";
      track.append(bar);
      row.append(el("div", "series-day", point.label), track, el("div", "series-val", format(point.value)));
      if (point.title) row.title = point.title;
      box.append(row);
    }
    return box;
  }

  function note(text, kind) {
    return el("div", "note" + (kind ? " " + kind : ""), text);
  }

  function empty(text) {
    return el("div", "empty", text);
  }

  function panelBlock(title, ...children) {
    const box = el("div", "panel");
    if (title) box.append(el("h3", null, title));
    // append(null) would stringify to a "null" text node, so skip the empties.
    for (const child of children) if (child) box.append(child);
    return box;
  }

  function twoColumns(...children) {
    const grid = el("div", "panels");
    for (const child of children) if (child) grid.append(child);
    return grid;
  }

  // --- panels ----------------------------------------------------------------

  function renderToken(target, report) {
    clear(target);
    const refusedTotal =
      (report.refused.insufficient_balance?.count ?? 0) +
      (report.refused.upstream_error?.count ?? 0) +
      (report.refused.no_upstream?.count ?? 0);

    target.append(
      tiles([
        ["Crédit vendu", fcfa(report.credits.xof), n(report.credits.count) + " versement(s)"],
        ["Crédit consommé", fcfa(report.usage.spendXof), share(report.usage.estimatedShare) + " estimé"],
        ["Comptes actifs", n(report.accounts.active), "sur " + n(report.accounts.total)],
        ["Nouveaux comptes", n(report.accounts.new), n(report.accounts.toppedUp) + " ont rechargé"],
        ["Requêtes refusées", n(refusedTotal), "avant facturation"],
      ]),
    );

    const refusals = [
      ["insufficient_balance", "Solde insuffisant"],
      ["upstream_error", "Erreur amont"],
      ["no_upstream", "Aucun fournisseur"],
    ].map(([key, label]) => [
      label,
      n(report.refused[key]?.count ?? 0),
      n(report.refused[key]?.accounts ?? 0),
    ]);

    // Credit sold is money in; credit consumed is money recognised. They sit in separate tables on
    // purpose, because adding them would invent a revenue figure neither source reports.
    const modelRows = (report.byModel ?? []).map((row) => [
      row.model,
      n(row.requests),
      tokens(row.inputTokens),
      tokens(row.outputTokens),
      fcfa(row.spendFcfa),
    ]);

    const daily = report.daily ?? [];

    target.append(
      twoColumns(
        panelBlock(
          "Consommation par jour",
          daily.length
            ? el(
                "div",
                "scroller",
                series(
                  daily.map((row) => ({
                    label: shortDay(row.day),
                    value: row.spendFcfa,
                    title: row.day + " · " + n(row.requests) + " requête(s) · " + fcfa(row.creditsFcfa) + " crédité",
                  })),
                  fcfa,
                ),
              )
            : empty("Aucune activité sur la fenêtre."),
        ),
        panelBlock(
          "Refus, par motif",
          table(
            [{ label: "Motif" }, { label: "Requêtes", numeric: true }, { label: "Comptes", numeric: true }],
            refusals,
          ),
        ),
        modelRows.length
          ? panelBlock(
              "Par modèle",
              table(
                [
                  { label: "Modèle" },
                  { label: "Requêtes", numeric: true },
                  { label: "Entrée", numeric: true },
                  { label: "Sortie", numeric: true },
                  { label: "Dépense", numeric: true },
                ],
                modelRows,
              ),
            )
          : panelBlock("Par modèle", empty("Aucune requête facturée sur la fenêtre.")),
      ),
    );
  }

  function renderCommerce(target, report) {
    clear(target);
    const total =
      report.registrations + report.escrowTransitions.confirmDelivery + report.escrowTransitions.dispute + report.payments.wave;

    target.append(
      tiles([
        ["Inscriptions", n(report.registrations), "marchands"],
        ["Livraisons confirmées", n(report.escrowTransitions.confirmDelivery), "séquestre libéré"],
        ["Litiges", n(report.escrowTransitions.dispute), "séquestre gelé"],
        ["Paiements Wave", n(report.payments.wave), "encaissements"],
      ]),
    );

    if (total === 0) {
      target.append(
        note(
          "Aucun événement commerce sur la fenêtre. Le moteur n'émet rien si POSTHOG_API_KEY est absente : " +
            "c'est la première chose à vérifier avant de conclure à une absence d'activité.",
        ),
      );
      return;
    }

    const daily = report.daily ?? [];
    if (daily.length) {
      const rows = daily.map((row) => [
        row.day,
        n(row.registrations),
        n(row.confirmDelivery),
        n(row.dispute),
        n(row.payments),
      ]);
      target.append(
        panelBlock(
          "Par jour",
          el(
            "div",
            "scroller",
            table(
              [
                { label: "Jour" },
                { label: "Inscr.", numeric: true },
                { label: "Livr.", numeric: true },
                { label: "Litige", numeric: true },
                { label: "Paiem.", numeric: true },
              ],
              rows,
            ),
          ),
        ),
      );
    }
  }

  function healthRow(label, host, health) {
    const row = el("div", "status");
    const dot = el("span", "dot " + (health.ok ? "ok" : "bad"));
    dot.title = health.ok ? "en ligne" : "hors ligne";
    row.append(dot, el("strong", null, label));
    const bits = [host];
    if (typeof health.ms === "number") bits.push(health.ms + " ms");
    if (health.detail) bits.push(health.detail);
    row.append(el("span", "status-detail", bits.join(" · ")));
    return row;
  }

  function renderHealth(target, report) {
    clear(target);
    target.append(
      healthRow("Moteur Yaatal", "engine.njooba.com", report.engine),
      healthRow("Passerelle de jetons", "api.kairmel.com", report.gateway),
    );
  }

  function errorInto(target, message) {
    clear(target);
    target.append(note(message, "error"));
  }

  // --- loading ---------------------------------------------------------------

  function setBusy(next) {
    busy = next;
    document.getElementById("refresh").disabled = next;
    for (const button of document.querySelectorAll("[data-days]")) button.disabled = next;
  }

  function markWindow() {
    for (const button of document.querySelectorAll("[data-days]")) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.days) === days));
    }
  }

  function stamp(viewer) {
    // The read time is stamped when the board opens. Each panel's report carries its own `window.at`
    // for the figures inside it, which is the one that matters once the page has been left open.
    const parts = [
      "lu à " + clock(new Date().toISOString()),
      "jetons " + (viewer.configured.gateway ? "configuré" : "absent"),
      "PostHog " + (viewer.configured.posthog ? "configuré" : "absent"),
    ];
    document.getElementById("stamp").textContent = parts.join(" · ");
  }

  async function load() {
    if (busy || !api) return;
    setBusy(true);
    markWindow();

    // Independent reads, independent failures: a PostHog outage must not blank the token figures,
    // and a gateway that is refusing our token must not make the Engine look down.
    const [token, commerce, health] = await Promise.allSettled([
      api.tokenRail(days),
      api.commerce(days),
      api.health(),
    ]);

    if (token.status === "fulfilled") renderToken(document.getElementById("token"), token.value);
    else errorInto(document.getElementById("token"), "Rail jetons : " + reason(token.reason));

    if (commerce.status === "fulfilled") renderCommerce(document.getElementById("commerce"), commerce.value);
    else errorInto(document.getElementById("commerce"), "Rail commerce : " + reason(commerce.reason));

    if (health.status === "fulfilled") renderHealth(document.getElementById("health"), health.value);
    else errorInto(document.getElementById("health"), "Services : " + reason(health.reason));

    setBusy(false);
  }

  function refuseMain(message) {
    document.getElementById("main").hidden = true;
    document.getElementById("badge").hidden = true;
    const box = document.getElementById("refusal");
    box.hidden = false;
    if (message) box.appendChild(note(message, "quiet"));
  }

  function wireControls() {
    document.getElementById("refresh").addEventListener("click", () => void load());
    for (const button of document.querySelectorAll("[data-days]")) {
      button.addEventListener("click", () => {
        const next = Number(button.dataset.days);
        if (!WINDOWS.includes(next) || next === days) return;
        days = next;
        void load();
      });
    }
  }

  async function start() {
    // The handshake comes first: the parent accepts it only from this frame at a null origin, and
    // anything it does not recognise is dropped.
    const { port1, port2 } = new MessageChannel();
    window.parent.postMessage({ type: "handshake" }, "*", [port2]);

    const frame = new (class extends RpcTarget {
      setTheme(theme) {
        applyTheme(theme);
      }
    })();
    const host = newMessagePortRpcSession(port1, frame);
    host.subscribeTheme(frame).then(applyTheme).catch(() => {});

    api = host.ui;

    wireControls();
    markWindow();

    let viewer;
    try {
      viewer = await api.getViewerInfo();
    } catch (err) {
      refuseMain("Impossible de vérifier votre compte : " + reason(err));
      return;
    }

    if (!viewer.isAdmin) {
      // The nav entry is visible to everyone (the account is auto-provisioned), so this check is the
      // control, not the listing. Every method on the other side repeats it.
      refuseMain("");
      return;
    }

    document.getElementById("badge").hidden = false;
    document.getElementById("main").hidden = false;
    stamp(viewer);

    const notices = document.getElementById("notice");
    if (!viewer.configured.gateway) {
      notices.append(
        note(
          "Rail jetons non configuré : le secret TOKEN_GATEWAY_ADMIN_TOKEN est absent de ce déploiement. " +
            "Posez-le avec `wrangler secret put` sur le Worker de la passerelle custom.",
        ),
      );
    }
    if (!viewer.configured.posthog) {
      notices.append(
        note(
          "Rail commerce non configuré : POSTHOG_PERSONAL_API_KEY ou POSTHOG_PROJECT_ID est absent. " +
            "La clé attendue est une clé personnelle (`phx_…`, portée query:read), pas la clé de projet du moteur.",
        ),
      );
    }

    await load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void start());
  } else {
    void start();
  }
})();
