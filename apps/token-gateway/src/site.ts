// The customer-facing pages. The landing page sells one thing — build anything, from a merchant's
// website to a device's firmware, on one AI API billed in FCFA — and hands every idea straight to
// the Playground (the Yaatal OS) through its `/?prompt=` deep link. Prices are rendered from the model
// catalog so the page cannot drift from billing. No supplier or upstream model name appears here.
import { MODELS } from "./models.js";

export interface SiteEnv {
  /** Public origin of the Playground (the Yaatal OS). HTTPS, or HTTP on loopback. */
  PLAYGROUND_URL?: string;
  /** Blueprint id featured as a one-click template in the Playground. */
  FEATURED_BLUEPRINT_ID?: string;
  /** International number, digits only (e.g. 221770000000). Without it the access button is hidden. */
  CONTACT_WHATSAPP?: string;
}

/** The Playground's own limit for a prefilled prompt. */
const MAX_PROMPT = 4000;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TIER_LABEL = { micro: "Micro", standard: "Standard", reasoning: "Raisonnement" } as const;

const IDEAS = [
  {
    label: "Site marchand en marque blanche",
    example: "un site vitrine pour ma boutique de bazin, avec commande sur WhatsApp",
    hint: "Catalogue, prix en FCFA, commande sur WhatsApp",
    prompt:
      "Construis un site vitrine en marque blanche pour une boutique de Dakar : catalogue avec photos et prix en FCFA, bouton « Commander sur WhatsApp », en français et en wolof. Demande-moi d'abord le nom de la boutique et mes produits.",
  },
  {
    label: "Fiche de préparation live",
    example: "une fiche pour préparer mon live TikTok de ce soir",
    hint: "Trier les produits avant une vente en direct",
    prompt:
      "Construis une fiche de préparation pour une vente en direct sur TikTok ou WhatsApp : je colle mes produits (nom, prix en FCFA, stock), tu les tries, signales les ruptures et proposes l'ordre de passage. N'invente aucun prix ni aucun stock.",
  },
  {
    label: "Assistant WhatsApp",
    example: "un assistant qui répond à mes clients en wolof",
    hint: "Répond aux clients depuis votre catalogue",
    prompt:
      "Crée un assistant qui répond aux questions de mes clients sur WhatsApp à partir de mon catalogue, en français et en wolof, et me transmet les commandes pour validation. Il ne prend jamais de paiement lui-même.",
  },
  {
    label: "Tableau de bord des ventes",
    example: "un tableau de bord de mes ventes de la semaine",
    hint: "Du fichier CSV aux décisions du jour",
    prompt:
      "Transforme un export de mes ventes (CSV que je vais coller) en tableau de bord : chiffre du jour, meilleurs produits, stocks à réapprovisionner et trois recommandations concrètes.",
  },
  {
    label: "Boîtier sonore ESP32",
    example: "le firmware d'un boîtier qui annonce les paiements reçus",
    hint: "Firmware, schéma et composants",
    prompt:
      "Conçois le firmware d'un boîtier sonore ESP32-S3 qui annonce à voix haute, en wolof et en français, les paiements reçus. Donne aussi la liste des composants (BOM) et le schéma de câblage. Prototype virtuel uniquement.",
  },
] as const;

function escape(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const fcfa = (value: number) => new Intl.NumberFormat("fr-FR").format(value).replace(/ | /g, " ");

function whatsappLink(env: SiteEnv): string | null {
  const number = env.CONTACT_WHATSAPP?.trim();
  if (!number || !/^[1-9][0-9]{7,14}$/.test(number)) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent("Bonjour, je souhaite un accès bêta à Yaatal.")}`;
}

/** The Playground origin: configured (HTTPS, or HTTP on loopback), else the local OS when served locally. */
function playgroundOrigin(request: Request, env: SiteEnv): string | null {
  const raw = env.PLAYGROUND_URL?.trim();
  if (raw) {
    try {
      const url = new URL(raw);
      const ok = url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK.has(url.hostname));
      return ok && !url.username && !url.password ? url.origin : null;
    } catch {
      return null;
    }
  }
  return LOOPBACK.has(new URL(request.url).hostname) ? "http://localhost:8787" : null;
}

function nonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

// A strip-weave texture, after the narrow bands of Senegalese woven cloth.
const WEAVE =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><g fill='none' stroke='%23e85a25' stroke-opacity='.10'><path d='M0 6h48M0 18h48M0 30h48M0 42h48'/></g><g fill='none' stroke='%23d9c7a8' stroke-opacity='.07'><path d='M6 0v48M30 0v48'/></g></svg>",
  ).replace(/%2523/g, "%23");

const STYLE = `
:root{--ink:#10181a;--ink-2:#172326;--sand:#f2e8d8;--sand-2:#d9c7a8;--muted:#9fb0ad;--accent:#e85a25;--accent-2:#ff8a55;--teal:#1f6f6a;--line:rgba(242,232,216,.14);--card:rgba(255,255,255,.03);--code:#0b1113}
:root[data-theme=light]{--ink:#f4ecdf;--ink-2:#ebe0cd;--sand:#1a1715;--sand-2:#5b4f40;--muted:#6d665b;--line:rgba(26,23,21,.14);--card:rgba(255,255,255,.55);--code:#1a1715}
@media (prefers-color-scheme:light){:root:not([data-theme=dark]){--ink:#f4ecdf;--ink-2:#ebe0cd;--sand:#1a1715;--sand-2:#5b4f40;--muted:#6d665b;--line:rgba(26,23,21,.14);--card:rgba(255,255,255,.55);--code:#1a1715}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--ink) url("${WEAVE}");color:var(--sand);font:17px/1.6 "Instrument Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(1200px 600px at 85% -10%,rgba(232,90,37,.22),transparent 60%),radial-gradient(900px 500px at -10% 30%,rgba(31,111,106,.20),transparent 60%);z-index:-1}
a{color:inherit}.wrap{max-width:1120px;margin:0 auto;padding:0 16px}
.display{font-family:Unbounded,"Instrument Sans",sans-serif;letter-spacing:-.02em}
code,pre,.mono{font-family:"JetBrains Mono",ui-monospace,monospace}
nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:20px;padding-bottom:20px}
.logo{display:flex;align-items:center;gap:10px;font-family:Unbounded,sans-serif;font-weight:700;font-size:1.15rem;text-decoration:none}
.logo i{width:26px;height:26px;border-radius:7px;background:conic-gradient(from 200deg,var(--accent),var(--accent-2),var(--teal),var(--accent));display:inline-block}
.links{display:flex;gap:22px;font-size:.95rem;color:var(--muted)}.links a{text-decoration:none}.links a:hover{color:var(--sand)}
.btn{display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:#fff;border:0;border-radius:12px;padding:12px 20px;font:600 1rem "Instrument Sans",sans-serif;text-decoration:none;cursor:pointer;transition:transform .15s,background .15s}
.btn:hover{background:var(--accent-2);transform:translateY(-1px)}.btn.ghost{background:transparent;color:var(--sand);border:1px solid var(--line)}
.hero{padding-top:48px;padding-bottom:40px;display:grid;grid-template-columns:1.1fr .9fr;gap:48px;align-items:center}
.eyebrow{display:inline-block;font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-2);border:1px solid rgba(232,90,37,.4);border-radius:999px;padding:5px 12px;margin-bottom:22px}
h1{font-size:clamp(2.1rem,5vw,3.7rem);line-height:1.04;margin:0 0 22px;font-weight:800}
h1 em{font-style:normal;color:var(--accent)}
.lede{font-size:1.15rem;color:var(--sand-2);max-width:34em;margin:0}
.ask{background:var(--ink-2);border:1px solid var(--line);border-radius:20px;padding:16px;box-shadow:0 30px 80px -30px rgba(0,0,0,.6)}
.ask label{display:block;font-size:.85rem;color:var(--muted);margin:2px 4px 8px}
textarea{width:100%;min-height:150px;resize:vertical;background:transparent;border:0;color:var(--sand);font:1.05rem/1.5 "Instrument Sans",sans-serif;outline:none;padding:4px}
.ask .bar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:8px;flex-wrap:wrap}
.ask small{color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0}
.chip{background:var(--card);border:1px solid var(--line);color:var(--sand);border-radius:999px;padding:8px 14px;font:500 .9rem "Instrument Sans",sans-serif;cursor:pointer;transition:border-color .15s,transform .15s}
.chip:hover{border-color:var(--accent);transform:translateY(-1px)}
section{padding:72px 0;border-top:1px solid var(--line)}
h2{font-size:clamp(1.6rem,3.6vw,2.5rem);margin:0 0 14px;line-height:1.1}
.sub{color:var(--sand-2);max-width:40em;margin:0 0 36px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:24px;position:relative;overflow:hidden}
.card h3{font-family:Unbounded,sans-serif;font-size:1.05rem;margin:14px 0 8px}.card p{margin:0;color:var(--sand-2);font-size:.97rem}
.card .n{font-family:"JetBrains Mono",monospace;color:var(--accent);font-size:.8rem}
.card .tag{display:inline-block;margin-top:14px;font-size:.78rem;color:var(--muted);border:1px dashed var(--line);border-radius:8px;padding:3px 8px}
.flow{display:grid;grid-template-columns:1fr auto 1fr;gap:20px;align-items:center}
.hub{font-family:Unbounded,sans-serif;text-align:center;border:1px solid var(--accent);border-radius:20px;padding:26px 18px;background:rgba(232,90,37,.08)}
.hub b{display:block;font-size:1.35rem}.hub span{color:var(--sand-2);font-family:"Instrument Sans",sans-serif;font-size:.92rem}
.stack{display:flex;flex-direction:column;gap:10px}.stack div{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--card);font-size:.95rem}
.tabs{margin-top:8px}.tabs input{position:absolute;opacity:0;pointer-events:none}
.tabs label{display:inline-block;padding:8px 14px;border-radius:10px 10px 0 0;cursor:pointer;color:var(--muted);font-size:.9rem;border:1px solid transparent}
.tabs input:checked+label{color:var(--sand);border-color:var(--line);border-bottom-color:var(--code);background:var(--code)}
.tabs input:focus-visible+label{outline:2px solid var(--accent)}
.tabs pre{display:none;margin:-1px 0 0;background:var(--code);color:#e9e2d4;border:1px solid var(--line);border-radius:0 14px 14px 14px;padding:18px;overflow-x:auto;font-size:.84rem;line-height:1.6}
#t1:checked~.p1,#t2:checked~.p2,#t3:checked~.p3{display:block}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:16px}
table{width:100%;border-collapse:collapse;min-width:520px}
th,td{text-align:left;padding:14px 16px;border-bottom:1px solid var(--line)}tr:last-child td{border-bottom:0}
th{color:var(--muted);font-weight:600;font-size:.85rem;text-transform:uppercase;letter-spacing:.06em}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}td code{color:var(--accent-2)}
.qa{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.qa h3{font-family:"Instrument Sans",sans-serif;font-size:1.02rem;margin:0 0 6px}
.cta{text-align:center;padding:88px 0}.cta .row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:26px}
footer{border-top:1px solid var(--line);padding-top:28px;padding-bottom:40px;color:var(--muted);font-size:.9rem;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.reveal{animation:rise .8s cubic-bezier(.2,.7,.2,1) both}.d1{animation-delay:.08s}.d2{animation-delay:.18s}.d3{animation-delay:.3s}.d4{animation-delay:.42s}
@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.reveal{animation:none}html{scroll-behavior:auto}.btn,.chip{transition:none}}
@media (max-width:860px){.hero,.flow{grid-template-columns:1fr}.grid3,.qa{grid-template-columns:1fr}.links{display:none}.flow .arrow{transform:rotate(90deg);justify-self:center}}
input[type=password]{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--ink-2);color:var(--sand);font:inherit}
.row{display:flex;gap:10px;margin:18px 0}.row input{flex:1}
`;

const FONTS = "https://fonts.googleapis.com/css2?family=Unbounded:wght@600;700;800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";

function page(title: string, body: string, options: { script?: string; formAction?: string | null } = {}): Response {
  const scriptNonce = options.script ? nonce() : null;
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="Yaatal : construisez tout, du site marchand au firmware, sur une seule API d'IA facturée en FCFA.">
<meta name="theme-color" content="#10181a">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${STYLE}</style>
</head>
<body>${body}${scriptNonce ? `<script nonce="${scriptNonce}">${options.script}</script>` : ""}</body>
</html>`;
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src data:",
    "connect-src 'self'",
    scriptNonce ? `script-src 'nonce-${scriptNonce}'` : "",
    `form-action ${options.formAction ?? "'none'"}`,
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].filter(Boolean).join("; ");
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": csp,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function nav(playground: string | null, contact: string | null): string {
  const cta = playground
    ? `<a class="btn" href="${escape(playground)}/">Ouvrir le Playground</a>`
    : contact ? `<a class="btn" href="${escape(contact)}" rel="noopener">Accès bêta</a>` : "";
  return `<nav class="wrap reveal"><a class="logo" href="/"><i aria-hidden="true"></i>Yaatal</a>
<div class="links"><a href="#construire">Construire</a><a href="#api">API</a><a href="#tarifs">Tarifs</a><a href="#donnees">Données</a></div>${cta}</nav>`;
}

export function home(request: Request, env: SiteEnv): Response {
  const origin = new URL(request.url).origin;
  const contact = whatsappLink(env);
  const playground = playgroundOrigin(request, env);
  const featured = env.FEATURED_BLUEPRINT_ID?.trim();
  const featuredLink = playground && featured && /^[A-Za-z0-9_-]{8,64}$/.test(featured)
    ? `${playground}/blueprint/${featured}` : null;
  const example = MODELS.find(model => model.tier === "standard") ?? MODELS[0]!;
  const rows = MODELS.map(model => `<tr><td><code>${escape(model.id)}</code></td><td>${TIER_LABEL[model.tier]}</td><td class="num">${fcfa(model.inputFcfaPerMillion)}</td><td class="num">${fcfa(model.outputFcfaPerMillion)}</td></tr>`).join("");
  const chips = IDEAS.map(idea =>
    `<button class="chip" type="button" data-prompt="${escape(idea.prompt)}" data-example="${escape(idea.example)}" title="${escape(idea.hint)}">${escape(idea.label)}</button>`).join("");

  const ask = playground
    ? `<form class="ask reveal d2" method="get" action="${escape(playground)}/">
<label for="prompt">Décrivez ce que vous voulez construire</label>
<textarea id="prompt" name="prompt" maxlength="${MAX_PROMPT}" required placeholder="Ex. : ${escape(IDEAS[0]!.example)}…"></textarea>
<div class="bar"><small>Ouvre le Playground avec votre idée. Connexion requise.</small><button class="btn" type="submit">Construire →</button></div>
</form>`
    : `<div class="ask reveal d2"><p class="lede">Le Playground ouvre bientôt au public.</p>${contact ? `<p><a class="btn" href="${escape(contact)}" rel="noopener">Demander un accès bêta</a></p>` : ""}</div>`;

  const body = `
${nav(playground, contact)}
<header class="wrap hero">
  <div>
    <span class="eyebrow reveal">Dakar · Plateforme de création IA</span>
    <h1 class="display reveal d1">Construisez tout.<br>Du site marchand<br>au <em>firmware</em>.</h1>
    <p class="lede reveal d2">Décrivez votre idée : les agents Yaatal la construisent avec vous dans le Playground.
    Chaque appel d'IA passe par une seule API, <strong>facturée en FCFA</strong>.</p>
    ${playground ? `<div class="chips reveal d3" role="group" aria-label="Idées pour commencer">${chips}</div>` : ""}
  </div>
  ${ask}
</header>

<section id="construire"><div class="wrap">
  <h2 class="display">Un seul espace, du web au silicium</h2>
  <p class="sub">Le Playground est un espace de travail où des agents écrivent, testent et publient avec vous.
  Vous validez chaque changement avant qu'il ne soit appliqué.</p>
  <div class="grid3">
    <div class="card"><span class="n">01 · Logiciel</span><h3>Sites et outils</h3>
      <p>Sites marchands en marque blanche, applications web, tableaux de bord, assistants WhatsApp.</p>
      <span class="tag">Disponible dans le Playground</span></div>
    <div class="card"><span class="n">02 · Objets</span><h3>Du prototype au boîtier</h3>
      <p>Firmware ESP32, schémas et liste de composants, testés en virtuel. La fabrication se fait sur commande
      avec nos partenaires : impression 3D, fournisseurs de composants, conseil technique.</p>
      <span class="tag">Prototype virtuel · fabrication sur commande</span></div>
    <div class="card"><span class="n">03 · API</span><h3>Vos propres applications</h3>
      <p>La même IA dans votre code, avec une clé Yaatal : compatible OpenAI, un changement d'une ligne.</p>
      <span class="tag">Compatible OpenAI</span></div>
  </div>
  ${featuredLink ? `<p style="margin-top:22px"><a class="btn ghost" href="${escape(featuredLink)}">Essayer un modèle prêt à l'emploi : fiche de préparation live →</a></p>` : ""}
</div></section>

<section id="api"><div class="wrap">
  <h2 class="display">Une API. Tous vos besoins en IA.</h2>
  <p class="sub">Tout ce qui est construit sur Yaatal — et vos propres applications — utilise la même API.
  Un seul solde en FCFA, une seule facture, et une bascule automatique si un modèle est indisponible.</p>
  <div class="flow">
    <div class="stack"><div>Playground et agents</div><div>Sites et applications générés</div><div>Objets connectés</div><div>Votre code</div></div>
    <div class="arrow display" aria-hidden="true" style="font-size:1.6rem;color:var(--accent)">→</div>
    <div class="hub"><b>API Yaatal</b><span>Compatible OpenAI · facturée en FCFA · sans carte bancaire internationale</span></div>
  </div>
  <div class="tabs" style="margin-top:36px">
    <input type="radio" name="t" id="t1" checked><label for="t1">curl</label>
    <input type="radio" name="t" id="t2"><label for="t2">JavaScript</label>
    <input type="radio" name="t" id="t3"><label for="t3">Python</label>
<pre class="p1">curl ${escape(origin)}/v1/chat/completions \\
  -H "Authorization: Bearer VOTRE_CLE_YAATAL" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${escape(example.id)}", "messages": [{"role": "user", "content": "Salaam!"}]}'</pre>
<pre class="p2">import OpenAI from "openai";

const yaatal = new OpenAI({ baseURL: "${escape(origin)}/v1", apiKey: process.env.YAATAL_API_KEY });
const reply = await yaatal.chat.completions.create({
  model: "${escape(example.id)}",
  messages: [{ role: "user", content: "Salaam!" }],
});</pre>
<pre class="p3">from openai import OpenAI

yaatal = OpenAI(base_url="${escape(origin)}/v1", api_key=os.environ["YAATAL_API_KEY"])
reply = yaatal.chat.completions.create(
    model="${escape(example.id)}",
    messages=[{"role": "user", "content": "Salaam!"}],
)</pre>
  </div>
</div></section>

<section id="tarifs"><div class="wrap">
  <h2 class="display">Tarifs en FCFA</h2>
  <p class="sub">Vous payez les jetons consommés, décomptés à l'appel. Un appel qui échoue n'est pas facturé.
  Rechargez en FCFA ; pendant la bêta, les recharges se font avec notre équipe.</p>
  <div class="table-wrap"><table>
    <thead><tr><th>Modèle</th><th>Gamme</th><th class="num">Entrée · FCFA / 1M jetons</th><th class="num">Sortie · FCFA / 1M jetons</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
  <p class="sub" style="margin-top:16px">Liste à jour : <a href="/v1/models">/v1/models</a> · Votre solde : <a href="/usage">/usage</a></p>
</div></section>

<section id="donnees"><div class="wrap">
  <h2 class="display">Vos données</h2>
  <p class="sub">Les quatre questions que tout client pose, et nos réponses.</p>
  <div class="qa">
    <div class="card"><h3>Où sont-elles traitées ?</h3><p>Par le fournisseur de calcul du modèle choisi, le temps de produire la réponse.</p></div>
    <div class="card"><h3>Combien de temps sont-elles gardées ?</h3><p>Yaatal ne conserve ni vos requêtes ni les réponses.</p></div>
    <div class="card"><h3>Sont-elles journalisées ?</h3><p>Nous gardons seulement le décompte : modèle, jetons, montant, date.</p></div>
    <div class="card"><h3>Peut-on les supprimer ?</h3><p>Oui : sur demande, votre compte et son historique de consommation.</p></div>
  </div>
  <p class="sub" style="margin-top:18px">Seul le contenu de votre requête part chez le fournisseur de calcul : jamais votre clé ni l'identifiant
  de votre compte. Évitez d'y mettre des données personnelles sensibles.</p>
</div></section>

<section class="cta"><div class="wrap">
  <h2 class="display">Votre prochaine idée,<br>construite cette semaine.</h2>
  <div class="row">
    ${playground ? `<a class="btn" href="${escape(playground)}/signup">Créer un compte Playground</a>` : ""}
    ${contact ? `<a class="btn ghost" href="${escape(contact)}" rel="noopener">Parler à l'équipe sur WhatsApp</a>` : ""}
  </div>
</div></section>

<footer class="wrap"><span>© Yaatal · Dakar</span><span>Bêta · <a href="/usage">Consommation</a> · <a href="/v1/models">Modèles</a></span></footer>`;

  const script = playground ? `
const box = document.getElementById("prompt");
for (const chip of document.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => { box.value = chip.dataset.prompt; box.focus(); });
}
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const ideas = [...document.querySelectorAll(".chip")].map(c => "Ex. : " + c.dataset.example + "…");
  let i = 0;
  setInterval(() => { if (!box.value && document.activeElement !== box) { i = (i + 1) % ideas.length; box.placeholder = ideas[i]; } }, 4000);
}` : undefined;

  return page("Yaatal — Construisez tout. Facturé en FCFA.", body, {
    script,
    formAction: playground ? playground : null,
  });
}

export function usage(request: Request, env: SiteEnv): Response {
  const script = `
const form = document.getElementById("f"), out = document.getElementById("out"), key = document.getElementById("k");
const money = v => new Intl.NumberFormat("fr-FR", {maximumFractionDigits: 2}).format(v) + " FCFA";
function cell(tr, text, cls) { const td = document.createElement("td"); td.textContent = text; if (cls) td.className = cls; tr.appendChild(td); }
form.addEventListener("submit", async e => {
  e.preventDefault(); out.textContent = "Chargement…";
  let res;
  try { res = await fetch("/v1/balance", {headers: {authorization: "Bearer " + key.value.trim()}}); }
  catch { out.textContent = "Réseau indisponible."; return; }
  if (!res.ok) { out.textContent = res.status === 401 ? "Clé invalide." : "Erreur " + res.status + "."; return; }
  const data = await res.json(); out.textContent = "";
  const h = document.createElement("h2"); h.className = "display"; h.textContent = money(data.balance_fcfa); out.appendChild(h);
  const table = document.createElement("table"), head = document.createElement("tr");
  for (const t of ["Date", "Opération", "Modèle", "Jetons", "Montant"]) { const th = document.createElement("th"); th.textContent = t; head.appendChild(th); }
  table.appendChild(head);
  for (const r of data.recent) {
    const tr = document.createElement("tr");
    cell(tr, new Date(r.at).toLocaleString("fr-FR"));
    cell(tr, r.kind === "credit" ? "Recharge" : "Consommation" + (r.estimated ? " (estimée)" : ""));
    cell(tr, r.model ?? "—");
    cell(tr, r.kind === "usage" ? String((r.input_tokens ?? 0) + (r.output_tokens ?? 0)) : "—", "num");
    cell(tr, money(r.amount_fcfa), "num");
    table.appendChild(tr);
  }
  const wrap = document.createElement("div"); wrap.className = "table-wrap"; wrap.appendChild(table); out.appendChild(wrap);
});`;
  const body = `${nav(playgroundOrigin(request, env), whatsappLink(env))}
<main class="wrap" style="padding:40px 16px 80px;max-width:820px">
<span class="eyebrow">Consommation</span>
<h1 class="display" style="font-size:clamp(2rem,5vw,3rem)">Votre solde en FCFA</h1>
<p class="lede">Collez votre clé pour voir votre solde et vos derniers appels. La clé n'est ni enregistrée ni envoyée ailleurs.</p>
<form id="f" class="row"><input id="k" type="password" autocomplete="off" placeholder="yk_…" required aria-label="Clé Yaatal"><button class="btn" type="submit">Voir</button></form>
<div id="out" aria-live="polite"></div>
</main>`;
  return page("Yaatal — Consommation", body, { script });
}
