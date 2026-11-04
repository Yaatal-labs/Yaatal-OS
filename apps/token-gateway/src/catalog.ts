import { availableModels, MODELS, type ModelOffer } from "./models.js";

const groups = [
  { key: "micro", label: "Micro", detail: "Pour le tri, les réponses courtes et les tâches répétitives." },
  { key: "standard", label: "Standard", detail: "Pour rédiger, résumer et construire au quotidien." },
  { key: "reasoning", label: "Raisonnement", detail: "Pour le code, l’analyse et les tâches en plusieurs étapes." },
  { key: "device", label: "Sur l’appareil", detail: "Pour exécuter le modèle directement sur un appareil compatible." },
] as const;

const names: Record<string, string> = {
  "kimi-k2.7-code": "Kimi K2.7 Code",
  "glm-5.3": "GLM 5.3",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
  "gpt-6.1-sol": "GPT 6.1 Sol",
  "claude-sonnet-5": "Claude Sonnet 5",
  "qwen3.8-max": "Qwen 3.8 Max",
  "gemini-3.8-flash": "Gemini 3.8 Flash",
  "deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
  "qwen3.8-flash": "Qwen 3.8 Flash",
  "gpt-6-luna": "GPT 6 Luna",
  "qwen3.8-27b": "Qwen 3.8 27B",
  "deepseek-v4-flash": "DeepSeek V4 Flash",
  "glm-5.3-flash": "GLM 5.3 Flash",
  "nemotron-3-super": "Nemotron 3 Super",
  "glm-4.7-flash": "GLM 4.7 Flash",
  "gemma-4-26b": "Gemma 4 26B",
  "llama-3.3-70b": "Llama 3.3 70B",
  "granite-4.0-micro": "Granite 4.0 Micro",
  "yaatal-front": "Yaatal Front",
  "yaatal-back": "Yaatal Back",
  "yaatal-tiny-device": "Yaatal Tiny",
  "claude-opus-5.5-demo": "Claude Opus 5.5",
  "claude-sonnet-5-demo": "Claude Sonnet 5",
};

const number = new Intl.NumberFormat("fr-FR");
const copyIcon = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M5 13H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';

function modelCard(model: ModelOffer, active: boolean, escape: (text: string) => string): string {
  const slug = model.id.replace(/^kairmel\//, "");
  const name = escape(names[slug] ?? slug.replaceAll("-", " "));
  const id = escape(model.id);
  const context = model.onDevice ? "Exécution locale" : model.residency === "controlled" ? "Infrastructure contrôlée" : "Cloud";
  const useCase = slug === "yaatal-front" ? "Dialogue en wolof et en français."
    : slug === "yaatal-back" ? "Actions métier sur la Yaatal AI Box." : "";
  return `<li class="model-card" data-model-card data-model-id="${id}">
    <div class="model-meta"><span>${context}</span>${active ? model.demo ? "<span>Démo</span>" : "" : '<span class="model-soon">Bientôt</span>'}</div>
    <h4>${name}</h4>
    <div class="model-id"><code>${id}</code>${active ? `<button type="button" data-copy-model hidden aria-label="Copier l’identifiant ${id}">${copyIcon}</button>` : ""}</div>
    ${useCase ? `<p class="model-use">${useCase}</p>` : ""}
    ${model.onDevice ? '<p class="model-device">Rapports d’usage via l’API</p>'
      : `<dl class="model-prices"><div><dt>Entrée</dt><dd>${number.format(model.inputXofPerMillion)} <small>FCFA</small></dd></div><div><dt>Sortie</dt><dd>${number.format(model.outputXofPerMillion)} <small>FCFA</small></dd></div></dl>`}
  </li>`;
}

export function catalog(env: Parameters<typeof availableModels>[0], escape: (text: string) => string): string {
  const live = new Set(availableModels(env).map(model => model.id));
  const listed = MODELS.filter(model => !model.demo || live.has(model.id));
  const sections = groups.map(({ key, label, detail }, index) => {
    const models = listed.filter(model => (model.onDevice ? "device" : model.tier) === key);
    if (!models.length) return "";
    return `<section class="model-group" data-model-group="${key}" aria-labelledby="group-${key}">
      <header><span class="model-group-index mono" aria-hidden="true">0${index + 1}</span>
        <div><h3 id="group-${key}">${label}</h3><p>${detail}</p></div></header>
      <ul class="model-grid">${models.map(model => modelCard(model, live.has(model.id), escape)).join("")}</ul>
    </section>`;
  }).join("");
  const count = live.size;
  return `<div class="catalog" id="catalogue">
    <div class="catalog-heading">
      <div><p class="kicker">Catalogue de modèles</p><h2>Choisissez votre modèle.</h2>
        <p>Tarifs en FCFA par million de tokens, à l’entrée et à la sortie.</p></div>
      <a class="catalog-endpoint mono" href="/v1/models"><span>GET</span> /v1/models <span aria-hidden="true">↗</span></a>
    </div>
    <div class="catalog-tools" data-catalog-tools hidden>
      <label><span>Rechercher un modèle</span><input type="search" placeholder="Qwen, Kimi, Yaatal…" autocomplete="off"></label>
      <div class="catalog-filters" role="group" aria-label="Filtrer par catégorie">
        <button type="button" data-model-filter="all" aria-pressed="true">Tous</button>
        ${groups.map(({ key, label }) => `<button type="button" data-model-filter="${key}" aria-pressed="false">${label}</button>`).join("")}
      </div>
    </div>
    <div class="catalog-summary"><span><strong>${count}</strong> modèles disponibles</span><a href="/usage">Voir ma consommation ↗</a></div>
    <p data-model-status class="catalog-status" role="status"></p>
    <p data-model-empty hidden>Aucun modèle trouvé. Essayez un autre nom ou une autre catégorie.</p>
    ${sections}
  </div>`;
}

export const CATALOG_SCRIPT = `
{
  const catalog = document.getElementById("catalogue");
  const tools = catalog.querySelector("[data-catalog-tools]");
  const search = tools.querySelector("input");
  const filters = [...tools.querySelectorAll("[data-model-filter]")];
  const groups = [...catalog.querySelectorAll("[data-model-group]")];
  const status = catalog.querySelector("[data-model-status]");
  const empty = catalog.querySelector("[data-model-empty]");
  let selected = "all";
  function filterModels() {
    const query = search.value.trim().toLowerCase();
    let total = 0;
    for (const group of groups) {
      let visible = 0;
      for (const card of group.querySelectorAll("[data-model-card]")) {
        card.hidden = !((selected === "all" || selected === group.dataset.modelGroup)
          && (card.dataset.modelId + " " + card.querySelector("h4").textContent).toLowerCase().includes(query));
        if (!card.hidden) visible++;
      }
      group.hidden = visible === 0;
      total += visible;
    }
    empty.hidden = total !== 0;
    status.textContent = total > 1 ? total + " résultats" : total + " résultat";
  }
  for (const button of filters) {
    button.addEventListener("click", () => {
      selected = button.dataset.modelFilter;
      for (const filter of filters) filter.setAttribute("aria-pressed", String(filter === button));
      filterModels();
    });
  }
  search.addEventListener("input", filterModels);
  tools.hidden = false;
  if (navigator.clipboard) {
    for (const button of catalog.querySelectorAll("[data-copy-model]")) {
      button.hidden = false;
      button.addEventListener("click", async () => {
        const id = button.closest("[data-model-card]").dataset.modelId;
        try {
          await navigator.clipboard.writeText(id);
          status.textContent = "Identifiant copié : " + id;
          button.animate([{ opacity: .35 }, { opacity: 1 }], {
            duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260,
          });
        } catch {
          status.textContent = "Copie indisponible. Sélectionnez l’identifiant du modèle.";
        }
      });
    }
  }
}
`;

export const CATALOG_STYLE = `
#tarifs,#api{scroll-margin-top:86px}
#tarifs{padding-top:36px}
.catalog{--catalog-accent:#9c2749;--catalog-green:#266852;--catalog-ochre:#805521;margin-bottom:56px}
@media (prefers-color-scheme:dark){.catalog{--catalog-accent:#f297ae;--catalog-green:#8bc8ab;--catalog-ochre:#e5b678}}
.catalog-heading{display:flex;justify-content:space-between;align-items:end;gap:24px;padding:0 0 26px;border-bottom:1px solid var(--line)}
.catalog-heading .kicker{color:var(--catalog-accent)}
.catalog-heading h2{margin:0;font-size:clamp(2.35rem,5.2vw,4.15rem);line-height:1}
.catalog-heading p:last-child{margin:12px 0 0;color:var(--muted)}
.catalog-endpoint{display:inline-flex;gap:9px;align-items:center;white-space:nowrap;min-height:44px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;text-decoration:none;background:var(--card);font-size:.76rem}
.catalog-endpoint span:first-child{color:var(--catalog-green)}
.catalog-endpoint:hover,.catalog-filters button:hover{border-color:var(--ink)}
.catalog-tools{display:flex;justify-content:space-between;align-items:end;gap:20px;margin:22px 0 14px}
.catalog-tools label{display:grid;gap:4px;flex:1;max-width:375px;font-size:.8rem;font-weight:650}
.catalog-tools input,.catalog-filters button{min-height:44px;color:var(--ink);background:var(--card);border:1px solid var(--line);font:inherit}
.catalog-tools input{width:100%;padding:8px 12px;border-radius:10px;font-size:1rem}
.catalog-filters{display:flex;flex-wrap:wrap;gap:6px}
.catalog-filters button{border-radius:999px;padding:6px 13px;cursor:pointer;font-size:.86rem}
.catalog-filters button[aria-pressed="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.catalog-summary{display:flex;justify-content:space-between;gap:12px;margin:16px 0 0;color:var(--muted);font-size:.85rem}
.catalog-summary strong{color:var(--ink)}
.catalog-summary a{text-underline-offset:3px}
.catalog-status{min-height:1.5em;margin:0;font-size:.82rem;color:var(--muted)}
.model-group{padding:26px 0 0}
.model-group>header{display:flex;gap:14px;align-items:flex-start;margin-bottom:14px}
.model-group h3{margin:0;font-size:1.44rem;line-height:1.2}
.model-group header p{margin:4px 0 0;color:var(--muted);font-size:.92rem}
.model-group-index{margin-top:1px;padding:3px 7px;border-radius:5px;font-size:.75rem;color:var(--group-color);background:color-mix(in srgb,var(--group-color) 10%,var(--paper))}
.model-group[data-model-group="micro"]{--group-color:var(--catalog-green)}
.model-group[data-model-group="standard"]{--group-color:var(--catalog-ochre)}
.model-group[data-model-group="reasoning"]{--group-color:var(--catalog-accent)}
.model-group[data-model-group="device"]{--group-color:var(--muted)}
.model-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;list-style:none;padding:0;margin:0}
.model-card{min-width:0;display:flex;flex-direction:column;min-height:168px;padding:14px 16px 12px;background:var(--card);border:1px solid var(--line);border-radius:14px;transition:border-color .2s,box-shadow .2s,transform .2s}
@media (hover:hover){.model-card:hover{border-color:color-mix(in srgb,var(--group-color) 48%,var(--line));box-shadow:var(--shadow);transform:translateY(-2px)}}
.model-meta{display:flex;justify-content:space-between;gap:6px;margin:0 0 6px;color:var(--group-color);font-size:.72rem;font-weight:700}
.model-meta .model-soon{color:var(--muted)}
.model-card h4{margin:0;font-size:1.18rem;line-height:1.15;letter-spacing:-.025em}
.model-id{display:flex;align-items:center;justify-content:space-between;gap:3px;min-height:44px;color:var(--muted)}
.model-id code{font-size:.72rem;overflow-wrap:anywhere}
.model-id button{display:grid;flex:none;place-items:center;width:44px;height:44px;margin-right:-8px;color:inherit;border:0;border-radius:7px;background:transparent;cursor:pointer}
.model-id button:hover{background:var(--paper-2);color:var(--ink)}
.model-prices{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:auto 0 0;padding:8px 0 0;border-top:1px solid var(--line)}
.model-prices dt,.model-prices small,.model-device,.model-use{color:var(--muted);font-size:.78rem}
.model-prices dd{margin:0;font-size:1.04rem;font-weight:700;font-variant-numeric:tabular-nums}
.model-prices small{font-weight:500}
.model-use{margin:0 0 8px}
.model-device{margin:auto 0 0;border-top:1px solid var(--line);padding-top:8px}
.catalog [hidden]{display:none}
@media (max-width:850px){.catalog-tools{flex-wrap:wrap}.catalog-tools label{flex-basis:100%;max-width:none}.model-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:900px){
  header.top nav{flex-wrap:wrap;gap:0 12px;padding-top:8px}
  header.top .links{display:flex;order:1;width:100%;gap:18px;font-size:.87rem}
  header.top .links a[href="/#modeles"],header.top .links a[href="/#comment"]{display:none}
  #tarifs,#api{scroll-margin-top:108px}
}
@media (max-width:540px){.catalog-heading{flex-direction:column;align-items:flex-start;gap:14px}.model-grid{grid-template-columns:1fr}.catalog-summary{flex-wrap:wrap}.model-card{min-height:0}}
`;
