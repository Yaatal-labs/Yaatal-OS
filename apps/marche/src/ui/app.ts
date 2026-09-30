import { BRAND_NAME } from "../brand";
import { filterByCategory, listCategories, loadCatalogue, searchApps } from "../catalogue/catalogue";
import { resolveCatalogueSource } from "../catalogue/source";
import type { AppManifest } from "../manifest/types";
import { attachBridgeHost } from "../host/bridge-host";
import { LocalStorageConsentStore, type ConsentStore } from "../host/consent";
import { getOrCreateDeviceId, type KeyValueStorage } from "../host/identity";
import { PERMISSION_LABELS_FR } from "./labels";

/** Build-time catalogue source (see src/vite-env.d.ts and src/catalogue/source.ts). Unset ->
 *  the bundled catalogue.json is used, same as before this was configurable. */
const CATALOGUE_URL = import.meta.env.VITE_CATALOGUE_URL;

/** Permissions this iframe sandbox grants, and why each one is needed:
 *   - allow-scripts       the mini-app is a web app; it needs to run JS at all.
 *   - allow-same-origin   without it, the framed document gets an opaque ("null") origin,
 *                         which breaks the bridge's origin checks on both sides. Combining
 *                         allow-scripts + allow-same-origin is only a sandbox-escape risk
 *                         when the framed document shares the *host's* origin — `openApp`
 *                         below refuses to frame anything that does.
 *   - allow-forms          basic forms (checkout, search) should work inside the app.
 *   - allow-popups          lets the app open an external auth/payment tab if it needs to.
 *  Deliberately excluded: allow-top-navigation, allow-modals, allow-pointer-lock.
 */
const IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups";

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

function safeLocalStorage(): KeyValueStorage {
  try {
    const probe = "__kairmel_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryStorage();
  }
}

export function initMarcheApp(root: HTMLElement): void {
  const deviceStorage = safeLocalStorage();
  const deviceId = getOrCreateDeviceId(deviceStorage);
  const consent: ConsentStore = new LocalStorageConsentStore(deviceStorage);

  let apps: AppManifest[] = [];
  let query = "";
  let category: string | null = null;
  let detachRunner: (() => void) | null = null;

  root.innerHTML = `
    <header class="marche-header">
      <h1>${BRAND_NAME} Marché</h1>
      <div class="marche-controls">
        <input type="search" id="marche-search" placeholder="Rechercher une app..." aria-label="Rechercher une app" />
        <div id="marche-categories"></div>
      </div>
    </header>
    <main class="marche-grid" id="marche-grid"></main>
    <section class="marche-detail marche-hidden" id="marche-detail"></section>
    <section class="marche-runner marche-hidden" id="marche-runner"></section>
  `;

  const searchInput = root.querySelector<HTMLInputElement>("#marche-search")!;
  const categoriesEl = root.querySelector<HTMLDivElement>("#marche-categories")!;
  const gridEl = root.querySelector<HTMLElement>("#marche-grid")!;
  const detailEl = root.querySelector<HTMLElement>("#marche-detail")!;
  const runnerEl = root.querySelector<HTMLElement>("#marche-runner")!;

  searchInput.addEventListener("input", () => {
    query = searchInput.value;
    renderGrid();
  });

  function renderCategories(): void {
    const categories = listCategories(apps);
    categoriesEl.innerHTML = "";
    const all = document.createElement("button");
    all.type = "button";
    all.className = "marche-category";
    all.textContent = "Tous";
    all.setAttribute("aria-pressed", String(category === null));
    all.addEventListener("click", () => {
      category = null;
      renderCategories();
      renderGrid();
    });
    categoriesEl.appendChild(all);

    for (const c of categories) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "marche-category";
      btn.textContent = c;
      btn.setAttribute("aria-pressed", String(category === c));
      btn.addEventListener("click", () => {
        category = c;
        renderCategories();
        renderGrid();
      });
      categoriesEl.appendChild(btn);
    }
  }

  function renderGrid(): void {
    const visible = filterByCategory(searchApps(apps, query), category);
    gridEl.innerHTML = "";
    for (const app of visible) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "marche-card";
      card.innerHTML = `<img src="${escapeHtml(app.icon)}" alt="" /><h2>${escapeHtml(app.name)}</h2><p>${escapeHtml(app.description)}</p>`;
      card.addEventListener("click", () => openDetail(app));
      gridEl.appendChild(card);
    }
  }

  function openDetail(app: AppManifest): void {
    const permissionRows = app.permissions
      .map((p) => {
        const label = PERMISSION_LABELS_FR[p];
        return `<div class="marche-permission"><strong>${escapeHtml(label.title)}</strong><p>${escapeHtml(label.detail)}</p></div>`;
      })
      .join("");

    detailEl.innerHTML = `
      <div class="marche-detail-bar">
        <button type="button" id="marche-detail-close">← Retour</button>
        <strong>${escapeHtml(app.name)}</strong>
      </div>
      <div class="marche-detail-body">
        <p>${escapeHtml(app.description)}</p>
        <p>Par ${escapeHtml(app.author)}</p>
        <h3>Autorisations demandées</h3>
        ${permissionRows || "<p>Vous n'avez rien à autoriser : cette app ne demande aucune permission.</p>"}
        <button type="button" class="marche-primary" id="marche-detail-open">Ouvrir</button>
        <p id="marche-detail-error" role="alert"></p>
      </div>
    `;
    detailEl.classList.remove("marche-hidden");

    detailEl.querySelector("#marche-detail-close")!.addEventListener("click", () => {
      detailEl.classList.add("marche-hidden");
    });
    detailEl.querySelector("#marche-detail-open")!.addEventListener("click", () => {
      const error = openApp(app);
      if (error) {
        detailEl.querySelector("#marche-detail-error")!.textContent = error;
      }
    });
  }

  function openApp(app: AppManifest): string | null {
    let appUrl: URL;
    try {
      appUrl = new URL(app.url);
    } catch {
      return "L'adresse de cette app n'est pas valide.";
    }
    if (appUrl.origin === window.location.origin) {
      // See IFRAME_SANDBOX above: framing our own origin with allow-same-origin would let
      // the framed page reach back into the host document. Refuse rather than risk it.
      return "Cette app ne peut pas être ouverte depuis Marché.";
    }

    appUrl.searchParams.set("kairmelHost", window.location.origin);

    runnerEl.innerHTML = `
      <div class="marche-runner-bar">
        <button type="button" id="marche-runner-close">← ${BRAND_NAME} Marché</button>
        <strong>${escapeHtml(app.name)}</strong>
      </div>
    `;
    const iframe = document.createElement("iframe");
    iframe.src = appUrl.toString();
    iframe.setAttribute("sandbox", IFRAME_SANDBOX);
    iframe.title = app.name;
    runnerEl.appendChild(iframe);

    detailEl.classList.add("marche-hidden");
    runnerEl.classList.remove("marche-hidden");

    iframe.addEventListener("load", () => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) return;
      detachRunner = attachBridgeHost({
        manifest: app,
        frameWindow,
        appOrigin: appUrl.origin,
        deviceId,
        consent,
        requestIdentityConsent: (m) =>
          // window.confirm shows plain text, not HTML — no escaping needed (or wanted) here.
          Promise.resolve(
            window.confirm(
              `${m.name} demande à vous reconnaître d'une visite à l'autre, sans voir votre numéro. Autoriser ?`,
            ),
          ),
        shareWindow: window,
        hostWindow: window,
      });
    });

    runnerEl.querySelector("#marche-runner-close")!.addEventListener("click", closeRunner);
    return null;
  }

  function closeRunner(): void {
    detachRunner?.();
    detachRunner = null;
    runnerEl.classList.add("marche-hidden");
    runnerEl.innerHTML = "";
  }

  resolveCatalogueSource(fetch, CATALOGUE_URL)
    .then((raw) => {
      const result = loadCatalogue(raw);
      apps = result.apps;
      if (result.rejected.length > 0) {
        console.warn(`${BRAND_NAME} Marché : ${result.rejected.length} entrée(s) de catalogue invalide(s)`, result.rejected);
      }
      renderCategories();
      renderGrid();
    })
    .catch((error: unknown) => {
      gridEl.textContent = "Le catalogue n'a pas pu être chargé.";
      console.error(error);
    });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
