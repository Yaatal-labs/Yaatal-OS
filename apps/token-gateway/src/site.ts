// The customer-facing pages. The landing page sells one thing: build anything, from a merchant's
// website to a device's firmware, on one AI API billed in FCFA. Every idea goes straight to the
// Playground (the Yaatal OS) through its `/?prompt=` deep link. Prices are rendered from the model
// catalog so the page cannot drift from billing. No supplier or upstream model name appears here.
import { availableModels } from "./models.js";

export interface SiteEnv {
  /** "true" on Workers Paid: the page then lists the models that need it. */
  WORKERS_PAID?: string;
  /** Public origin of the Playground (the Yaatal OS). HTTPS, or HTTP on loopback. */
  PLAYGROUND_URL?: string;
  /** Blueprint id featured as a one-click template in the Playground. */
  FEATURED_BLUEPRINT_ID?: string;
  /** International number, digits only (e.g. 221770000000). Without it the WhatsApp button is hidden. */
  CONTACT_WHATSAPP?: string;
}

/** The Playground's own limit for a prefilled prompt. */
const MAX_PROMPT = 4000;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TIER_LABEL = { micro: "Micro", standard: "Standard", reasoning: "Reasoning" } as const;

interface Idea {
  tag: string;
  title: string;
  line: string;
  example: string;
  prompt: string;
}

const IDEAS: readonly Idea[] = [
  {
    tag: "Site · Commerce",
    title: "Site e-commerce pour votre boutique",
    line: "Catalogue, prix en FCFA, commande sur WhatsApp.",
    example: "un site pour ma boutique de bazin, avec commande sur WhatsApp",
    prompt:
      "Construis un site vitrine en marque blanche pour une boutique de Dakar : catalogue avec photos et prix en FCFA, bouton « Commander sur WhatsApp », en français et en wolof. Demande-moi d'abord le nom de la boutique et mes produits.",
  },
  {
    tag: "Outil · Live",
    title: "Prépa live TikTok",
    line: "Classer les produits et l'ordre de passage avant le live.",
    example: "une fiche pour préparer mon live TikTok de ce soir",
    prompt:
      "Construis une fiche de prépa pour un live de vente sur TikTok ou WhatsApp : je colle mes produits (nom, prix en FCFA, stock), tu les tries, signales les ruptures et proposes l'ordre de passage. N'invente aucun prix ni aucun stock.",
  },
  {
    tag: "WhatsApp · Clients",
    title: "Bot WhatsApp",
    line: "Répond aux clients depuis votre catalogue, vous validez les commandes.",
    example: "un bot WhatsApp qui répond à mes clients en wolof",
    prompt:
      "Crée un bot WhatsApp qui répond aux questions de mes clients sur WhatsApp à partir de mon catalogue, en français et en wolof, et me transmet les commandes pour validation. Il ne prend jamais de paiement lui-même.",
  },
  {
    tag: "Données · Ventes",
    title: "Dashboard des ventes",
    line: "Du fichier Excel aux chiffres du jour.",
    example: "un dashboard de mes ventes de la semaine",
    prompt:
      "Transforme un export de mes ventes (Excel ou CSV que je vais coller) en dashboard : ventes du jour, meilleurs produits, stocks à réapprovisionner et trois recommandations concrètes.",
  },
  {
    tag: "ESP32 · Paiements",
    title: "Soundbox qui annonce les paiements",
    line: "Firmware, câblage et liste des pièces.",
    example: "le firmware d'une Soundbox qui annonce les paiements reçus",
    prompt:
      "Conçois une Soundbox ESP32-S3 qui annonce à voix haute, en wolof et en français, les paiements reçus. Donne le firmware, le schéma de câblage et la liste des composants (BOM) avec un prix indicatif par pièce. Prototype virtuel uniquement.",
  },
  {
    tag: "ESP32 · Stock",
    title: "Balance connectée pour le stock",
    line: "Pèse le stock et vous prévient quand il faut recommander.",
    example: "une balance connectée qui suit mon stock de riz",
    prompt:
      "Conçois une balance connectée à base d'ESP32 et de capteur HX711 qui suit le stock d'un produit vendu au poids (riz, sucre) et envoie une alerte quand il passe sous un seuil. Donne le firmware, le câblage et la liste des composants. Prototype virtuel uniquement.",
  },
];

const FAQ: readonly [string, string][] = [
  ["C'est quoi, Yaatal ?",
    "Un espace où des agents d'IA construisent avec vous des sites, des outils, des assistants et des prototypes d'objets connectés. Tout ce qui est construit utilise la même API d'IA, que vous payez en FCFA."],
  ["Faut-il savoir coder ?",
    "Non. Vous décrivez ce que vous voulez en français, ou en français-wolof comme au quotidien ; l'agent pose ses questions, construit, et vous montre le résultat. Chaque changement attend votre accord avant d'être appliqué. Si vous codez, tout reste modifiable."],
  ["Comment je paie ?",
    "À la consommation, en FCFA, sans carte Visa ni Mastercard. Vous rechargez un solde, comme du crédit ; chaque appel d'IA en déduit le prix affiché dans les tarifs. Pendant la bêta, les recharges se font avec l'équipe."],
  ["Et pour les objets, vous fabriquez ?",
    "Le Playground produit le firmware, le schéma de câblage et la liste des pièces, que vous relisez avant tout achat. La fabrication se fait sur commande, avec nos partenaires : impression 3D, fournisseurs de composants, conseil technique."],
  ["Puis-je utiliser l'API dans mon propre code ?",
    "Oui. L'API Yaatal est compatible OpenAI : vous changez la base URL et la clé API, votre code et vos SDK restent les mêmes."],
  ["Que devient ce que j'envoie ?",
    "Yaatal ne garde ni vos prompts ni les réponses. Nous gardons seulement l'usage (modèle, tokens, montant, date), et nous supprimons votre compte et cet historique sur demande."],
];

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

const icon = {
  arrow: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>`,
  build: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`,
  chip: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>`,
};

// Narrow woven bands, after Senegalese strip-woven cloth.
const WEAVE =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='60'><rect width='120' height='60' fill='#15302c'/><g fill='#e85a25' fill-opacity='.9'><rect x='0' y='8' width='44' height='6' rx='3'/><rect x='56' y='8' width='64' height='6' rx='3'/><rect x='0' y='38' width='70' height='6' rx='3'/><rect x='82' y='38' width='38' height='6' rx='3'/></g><g fill='#f3dcc0' fill-opacity='.55'><rect x='20' y='23' width='36' height='4' rx='2'/><rect x='70' y='23' width='50' height='4' rx='2'/><rect x='0' y='52' width='28' height='4' rx='2'/><rect x='40' y='52' width='58' height='4' rx='2'/></g></svg>",
  );

const STYLE = `
:root{--paper:#f7f3ec;--paper-2:#efe8dc;--ink:#1b1813;--muted:#5f584d;--line:#e2d9c9;--card:#fffdf9;--accent:#e85a25;--accent-strong:#c2410c;--deep:#15302c;--deep-ink:#f3ead9;--code:#15171a;--code-ink:#e8e2d6;--shadow:0 1px 2px rgba(27,24,19,.06),0 12px 32px -12px rgba(27,24,19,.18)}
@media (prefers-color-scheme:dark){:root{--paper:#121312;--paper-2:#1a1b19;--ink:#f1ece2;--muted:#b3ab9d;--line:#2d2c28;--card:#191a18;--accent:#f06a35;--accent-strong:#e85a25;--deep:#0f2421;--shadow:0 1px 2px rgba(0,0,0,.4),0 16px 40px -16px rgba(0,0,0,.6)}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.6 "Instrument Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}.wrap{max-width:1140px;margin:0 auto;padding-left:16px;padding-right:16px}
h1,h2,h3,.display{font-family:"Bricolage Grotesque","Instrument Sans",sans-serif;letter-spacing:-.025em;font-weight:700}
code,pre,.mono{font-family:"JetBrains Mono",ui-monospace,monospace}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:6px}
.skip{position:absolute;left:-999px}.skip:focus{left:16px;top:12px;z-index:50;background:var(--card);padding:8px 12px}
header.top{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--paper) 88%,transparent);backdrop-filter:blur(10px)}
nav{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:68px}
.logo{display:flex;align-items:center;gap:10px;font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:1.25rem;text-decoration:none;letter-spacing:-.03em}
.links{display:flex;gap:26px;font-size:.95rem;color:var(--muted)}.links a{text-decoration:none;padding:10px 0}.links a:hover{color:var(--ink)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;background:var(--ink);color:var(--paper);border:0;border-radius:12px;padding:10px 18px;font:600 .98rem "Instrument Sans",sans-serif;text-decoration:none;cursor:pointer;transition:background-color .2s,color .2s,border-color .2s}
.btn:hover{background:var(--accent-strong);color:#fff}.btn.accent{background:var(--accent-strong);color:#fff}.btn.accent:hover{background:var(--ink);color:var(--paper)}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}.btn.ghost:hover{border-color:var(--ink);background:transparent;color:var(--ink)}
.hero>*{min-width:0}
.hero{display:grid;grid-template-columns:minmax(0,1.02fr) minmax(0,.98fr);gap:48px;align-items:center;padding-top:64px;padding-bottom:40px}
h1{font-size:clamp(2.5rem,5.6vw,4.6rem);line-height:1;margin:0 0 20px;max-width:11ch;text-wrap:balance}
h1 em{font-style:normal;color:var(--accent-strong)}
.fill{position:relative;color:var(--accent-strong);white-space:nowrap}
.fill::after{content:"";position:absolute;left:-.04em;right:-.04em;bottom:-.06em;height:.2em;border-radius:.1em;background:url(/img/wax.webp) 20% 45%/240% auto;transform-origin:left;animation:draw .9s .55s cubic-bezier(.6,0,.2,1) both,drift 18s 1.5s ease-in-out infinite alternate}
@keyframes draw{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes drift{to{background-position:80% 55%}}
.lede{font-size:1.15rem;color:var(--muted);max-width:36rem;margin:0}
.ask{max-width:780px;margin:30px 0 0;background:var(--card);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow);text-align:left;overflow:hidden}
.ask textarea{display:block;width:100%;min-height:132px;resize:vertical;border:0;background:transparent;color:var(--ink);font:1.08rem/1.55 "Instrument Sans",sans-serif;padding:20px 22px;outline:none}
.ask textarea::placeholder{color:color-mix(in srgb,var(--muted) 75%,transparent)}
.ask .bar{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid var(--line);padding:12px 12px 12px 22px;background:var(--paper-2)}
.ask small{color:var(--muted);font-size:.88rem}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0;max-width:820px}
.chip{min-height:40px;background:transparent;border:1px solid var(--line);color:var(--ink);border-radius:999px;padding:8px 14px;font:500 .9rem "Instrument Sans",sans-serif;cursor:pointer;transition:border-color .2s,background-color .2s}
.chip:hover{border-color:var(--accent);background:var(--card)}
.eyebrow{display:inline-block;font:600 .8rem "JetBrains Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--accent-strong);margin-bottom:18px}
.people{display:grid;grid-template-columns:1fr 1.5fr 1fr;gap:18px;align-items:end;margin-top:8px}
.people figure{margin:0;position:relative}
.people img{display:block;width:100%;height:100%;object-fit:cover;border-radius:18px;box-shadow:var(--shadow)}
.people figure:nth-child(1){transform:rotate(-2deg)}.people figure:nth-child(1) img{aspect-ratio:4/5}
.people figure:nth-child(2) img{aspect-ratio:16/10}
.people figure:nth-child(3){transform:rotate(2deg)}.people figure:nth-child(3) img{aspect-ratio:4/3}
.people figcaption{font-size:.82rem;color:var(--muted);margin-top:8px}
.pay{display:grid;grid-template-columns:1.1fr .9fr;gap:36px;align-items:center;margin-bottom:36px}
.pay img{display:block;width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:18px;box-shadow:var(--shadow)}
.pay figure{margin:0}.pay figcaption{font-size:.82rem;color:var(--muted);margin-top:8px}
.credits{font-size:.78rem;color:var(--muted);max-width:60rem}
@media (max-width:900px){.people{grid-template-columns:1fr 1fr}.people figure:nth-child(2){grid-column:1/-1;order:-1}.pay{grid-template-columns:1fr}}
@media (max-width:600px){.people figure{transform:none!important}}
.trust{display:flex;flex-wrap:wrap;gap:10px 24px;margin-top:28px;color:var(--muted);font-size:.92rem}
.trust span{display:inline-flex;align-items:center;gap:8px}.trust i{width:6px;height:6px;border-radius:50%;background:var(--accent);display:inline-block}
section{padding-top:88px;padding-bottom:88px}
.kicker{font:600 .78rem "JetBrains Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--accent-strong);margin:0 0 12px}
h2{font-size:clamp(1.9rem,4vw,3rem);line-height:1.05;margin:0 0 14px;max-width:18ch}
.sub{color:var(--muted);max-width:40rem;margin:0 0 40px;font-size:1.05rem}
.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.tile{display:flex;flex-direction:column;gap:8px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px;text-decoration:none;transition:border-color .2s,box-shadow .2s;min-height:190px}
.tile:hover{border-color:var(--accent);box-shadow:var(--shadow)}
.tile .tag{font:600 .72rem "JetBrains Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.tile h3{font-size:1.25rem;margin:4px 0 0;line-height:1.2}.tile p{margin:0;color:var(--muted);font-size:.97rem}
.tile .go{margin-top:auto;display:inline-flex;align-items:center;gap:6px;font-weight:600;color:var(--accent-strong)}
.flow{display:grid;grid-template-columns:.9fr 1.1fr;gap:40px;align-items:center}
.steps{display:flex;flex-direction:column;gap:6px}
.step{display:grid;grid-template-columns:44px 1fr;gap:14px;padding:16px;border-radius:16px}
.step:hover{background:var(--card)}
.step .ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--card);border:1px solid var(--line);color:var(--accent-strong)}
.step h3{margin:0 0 4px;font-size:1.15rem}.step p{margin:0;color:var(--muted);font-size:.97rem}
.frame{background:var(--deep) url("${WEAVE}");background-size:120px 60px;border-radius:24px;padding:28px}
.window{background:var(--card);border-radius:14px;box-shadow:0 24px 60px -20px rgba(0,0,0,.45);overflow:hidden;border:1px solid var(--line)}
.window .bar{display:flex;gap:6px;padding:10px 12px;border-bottom:1px solid var(--line);background:var(--paper-2)}
.window .bar i{width:10px;height:10px;border-radius:50%;background:var(--line);display:block}
.window .body{display:grid;grid-template-columns:1fr 1.2fr;min-height:280px}
.window .chat{padding:16px;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:10px;font-size:.84rem}
.bubble{padding:9px 12px;border-radius:12px;background:var(--paper-2);max-width:92%}.bubble.me{align-self:flex-end;background:var(--ink);color:var(--paper)}
.window .preview{padding:16px;display:flex;flex-direction:column;gap:10px}
.pv-title{font-family:"Bricolage Grotesque",sans-serif;font-weight:700;font-size:1.05rem}
.pv-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pv-item{border:1px solid var(--line);border-radius:10px;padding:8px;font-size:.78rem}
.pv-item b{display:block;height:44px;border-radius:6px;background:var(--paper-2);margin-bottom:6px}
.pv-cta{align-self:flex-start;background:#1f7a4d;color:#fff;border-radius:8px;padding:6px 10px;font-size:.78rem;font-weight:600}
.split{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start}
.boards{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}.boards span{border:1px solid var(--line);border-radius:10px;padding:6px 10px;font:500 .85rem "JetBrains Mono",monospace;background:var(--card)}
.partners{display:grid;gap:10px}.partner{display:grid;grid-template-columns:44px 1fr;gap:14px;align-items:start;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
.partner .ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--paper-2);color:var(--accent-strong)}
.partner h3{margin:0 0 2px;font-size:1.05rem}.partner p{margin:0;color:var(--muted);font-size:.95rem}
.band{background:var(--deep);color:var(--deep-ink);border-radius:28px;padding:48px}
.band h2{color:var(--deep-ink)}.band .sub{color:color-mix(in srgb,var(--deep-ink) 75%,transparent)}.band .kicker{color:#ff9a6a}
.tabs input{position:absolute;opacity:0;pointer-events:none}
.tabs label{display:inline-flex;align-items:center;min-height:40px;padding:8px 14px;border-radius:10px 10px 0 0;cursor:pointer;color:color-mix(in srgb,var(--deep-ink) 70%,transparent);font-size:.9rem}
.tabs input:checked+label{color:var(--code-ink);background:var(--code)}
.tabs input:focus-visible+label{outline:2px solid var(--accent)}
.tabs pre{display:none;margin:0;background:var(--code);color:var(--code-ink);border-radius:0 14px 14px 14px;padding:20px;overflow-x:auto;font-size:.84rem;line-height:1.65}
#t1:checked~.p1,#t2:checked~.p2,#t3:checked~.p3{display:block}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:18px;background:var(--card)}
table{width:100%;border-collapse:collapse;min-width:560px}
th,td{text-align:left;padding:15px 18px;border-bottom:1px solid var(--line)}tr:last-child td{border-bottom:0}
th{color:var(--muted);font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}td code{color:var(--accent-strong);font-size:.9rem}
.qa{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.qa .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px}
.qa h3{font-family:"Instrument Sans",sans-serif;font-size:1.02rem;margin:0 0 6px;letter-spacing:0}.qa p{margin:0;color:var(--muted)}
details{border-bottom:1px solid var(--line)}details:first-of-type{border-top:1px solid var(--line)}
summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:16px;padding:20px 4px;font-weight:600;font-size:1.05rem;min-height:44px}
summary::-webkit-details-marker{display:none}summary::after{content:"+";font-family:"JetBrains Mono",monospace;color:var(--accent-strong)}
details[open] summary::after{content:"−"}details p{margin:0 4px 20px;color:var(--muted);max-width:46rem}
.final{text-align:center}.final h2{margin-left:auto;margin-right:auto}.final .row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:26px}
footer{border-top:1px solid var(--line);padding-top:28px;padding-bottom:44px;color:var(--muted);font-size:.9rem;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
footer a{text-decoration:none}footer a:hover{color:var(--ink)}
.reveal{animation:rise .7s cubic-bezier(.2,.7,.2,1) both}.d1{animation-delay:.06s}.d2{animation-delay:.14s}.d3{animation-delay:.24s}.d4{animation-delay:.34s}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.stage{position:relative;background:var(--deep) url("${WEAVE}");background-size:120px 60px;border-radius:26px;padding:16px;box-shadow:0 30px 70px -30px rgba(21,48,44,.6)}
.st-win{background:var(--card);border-radius:16px;overflow:hidden;border:1px solid var(--line)}
.st-top{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);background:var(--paper-2);font:500 .74rem "JetBrains Mono",monospace;color:var(--muted)}
.st-top>i{width:9px;height:9px;border-radius:50%;background:var(--line);display:block}
.meter{margin-left:auto;display:inline-flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:4px 10px;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}
.meter b{width:7px;height:7px;border-radius:50%;background:#1f7a4d;animation:blink 1.2s ease-in-out infinite}
@keyframes blink{50%{opacity:.25}}
.st-body{padding:14px;height:376px;overflow:hidden}
.scene{display:none;flex-direction:column;gap:10px}
.stage[data-scene="1"] .s1,.stage[data-scene="2"] .s2,.stage[data-scene="3"] .s3{display:flex}
.prompt{font:500 .8rem "JetBrains Mono",monospace;background:var(--paper-2);border-radius:10px;padding:9px 12px;white-space:nowrap;overflow:hidden}
.prompt::before{content:"› ";color:var(--accent-strong)}
.prompt span{display:inline-block;animation:type 1.3s steps(34) both}
@keyframes type{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
.agent{font-size:.84rem;color:var(--muted);display:flex;align-items:center;gap:8px}
.agent::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent);flex:none}
.pop{animation:pop .55s cubic-bezier(.2,.8,.2,1.15) both;animation-delay:calc(var(--d,0) * 1s)}
@keyframes pop{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
.mini{border:1px solid var(--line);border-radius:12px;overflow:hidden}
.mini-h{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:#15302c;color:#f3ead9;font:700 .88rem "Bricolage Grotesque",sans-serif}
.mini-h small{font:500 .68rem "JetBrains Mono",monospace;opacity:.75}
.prods{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px}
.prod{font-size:.72rem;line-height:1.35}.prod em{font-style:normal;font-weight:600;display:block;color:var(--accent-strong)}
.prod b{display:block;aspect-ratio:1;border-radius:8px;margin-bottom:6px;background:url(/img/wax.webp) var(--x) 50%/420% auto}
.wa-btn{margin:0 10px 10px;background:#1f7a4d;color:#fff;border-radius:8px;padding:8px;text-align:center;font-weight:600;font-size:.76rem}
.wa{border:1px solid var(--line);border-radius:12px;overflow:hidden}
.wa-h{background:#1f5c45;color:#fff;padding:9px 12px;font-weight:600;font-size:.8rem}
.wa-b{background:color-mix(in srgb,#d9cfb8 30%,var(--card));padding:12px;display:flex;flex-direction:column;gap:8px;min-height:212px}
.msg{max-width:80%;padding:7px 10px;border-radius:10px;font-size:.79rem;background:#fffdf9;color:#1b1813;box-shadow:0 1px 0 rgba(0,0,0,.08)}
.msg.out{align-self:flex-end;background:#d7f5c8;color:#10251a}
.fw{display:grid;grid-template-columns:1.3fr .7fr;gap:12px;align-items:center}
.code{margin:0;background:var(--code);color:var(--code-ink);border-radius:10px;padding:12px;font-size:.7rem;line-height:1.65;overflow:hidden;white-space:pre}
.code span{display:block}.code .k{display:inline;color:#ff9a6a}.code .s{display:inline;color:#9fd8a8}.code .c{display:inline;color:#8a8478}
.box{position:relative;justify-self:center;width:112px;height:144px;border-radius:26px;background:linear-gradient(160deg,#2c2823,#131110);display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:16px 12px}
.grille{width:72px;height:56px;border-radius:12px;background:radial-gradient(circle,#4a443c 1.6px,transparent 2px) 0 0/9px 9px}
.lcd{background:#0d1f1b;color:#7ef0b0;font:600 .74rem "JetBrains Mono",monospace;padding:4px 8px;border-radius:6px;font-variant-numeric:tabular-nums}
.ring{position:absolute;inset:-4px;border:2px solid var(--accent);border-radius:30px;opacity:0;animation:ring 1.8s ease-out infinite;animation-delay:calc(var(--d,0) * 1s)}
@keyframes ring{from{opacity:.7;transform:scale(1)}to{opacity:0;transform:scale(1.4)}}
.said{justify-self:center;font-size:.78rem;background:var(--paper-2);border-radius:10px;padding:6px 10px;grid-column:1/-1;text-align:center}
.switch{display:flex;gap:6px;margin-top:12px}
.sw{flex:1;position:relative;overflow:hidden;min-height:44px;background:transparent;color:color-mix(in srgb,#f3ead9 72%,transparent);border:1px solid rgba(243,234,217,.22);border-radius:10px;font:500 .76rem "JetBrains Mono",monospace;cursor:pointer;transition:color .2s,border-color .2s}
.sw:hover{color:#fff}.sw[aria-pressed=true]{color:#fff;border-color:#ff9a6a}
.sw::after{content:"";position:absolute;left:0;bottom:0;height:2px;width:0;background:#ff9a6a}
.stage.auto .sw[aria-pressed=true]::after{animation:prog 6.5s linear both}
@keyframes prog{to{width:100%}}
.weave{height:34px;border-radius:10px;background:var(--deep) url("${WEAVE}") 0 -4px/120px 60px;animation:slide 40s linear infinite}
@keyframes slide{to{background-position:-1200px -4px}}
@keyframes inview{from{opacity:.25;translate:0 28px}to{opacity:1;translate:0 0}}
@supports (animation-timeline:view()){@media (prefers-reduced-motion:no-preference){
  .tile,.step,.partner,.people figure,.qa .card,.pay figure{animation:inview linear both;animation-timeline:view();animation-range:entry 0% entry 70%}
}}
@media (prefers-reduced-motion:reduce){.reveal,.stage *,.weave,.fill::after{animation:none!important}html{scroll-behavior:auto}*{transition:none!important}}
@media (max-width:900px){.hero{grid-template-columns:1fr;gap:36px}.gallery{grid-template-columns:1fr 1fr}.flow,.split{grid-template-columns:1fr}.links{display:none}.band{padding:28px}}
@media (max-width:460px){.st-body{height:auto;min-height:340px}.fw{grid-template-columns:1fr}.box{display:none}.meter span.l{display:none}}
@media (max-width:600px){.gallery,.qa{grid-template-columns:1fr}.window .body{grid-template-columns:1fr}.window .chat{border-right:0;border-bottom:1px solid var(--line)}.ask .bar{flex-direction:column;align-items:stretch}.hero{padding-top:44px}}
input[type=password]{width:100%;min-height:44px;padding:10px 14px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);font:inherit}
.row{display:flex;gap:10px;margin:18px 0}.row input{flex:1}
`;

const FONTS =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap";

function page(title: string, body: string, options: { script?: string; formAction?: string | null } = {}): Response {
  const scriptNonce = options.script ? nonce() : null;
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="Décrivez un site, un outil ou un objet connecté : Yaatal le construit avec vous. L'IA se paie en FCFA.">
<meta name="theme-color" content="#f7f3ec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#121312" media="(prefers-color-scheme: dark)">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${STYLE}</style>
</head>
<body><a class="skip" href="#main">Aller au contenu</a>${body}${scriptNonce ? `<script nonce="${scriptNonce}">${options.script}</script>` : ""}</body>
</html>`;
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
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

function topNav(playground: string | null, contact: string | null): string {
  const cta = playground
    ? `<a class="btn" href="${escape(playground)}/">Ouvrir le Playground</a>`
    : contact ? `<a class="btn" href="${escape(contact)}" rel="noopener">Accès bêta</a>` : "";
  return `<header class="top"><nav class="wrap" aria-label="Principale">
<a class="logo" href="/"><svg width='28' height='28' aria-hidden='true' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'><rect width='256' height='256' rx='56' fill='#15302c'/><rect x='52' y='74' width='66' height='20' rx='10' fill='#f3dcc0'/><rect x='136' y='74' width='68' height='20' rx='10' fill='#f3dcc0'/><rect x='52' y='115' width='116' height='26' rx='13' fill='#e85a25'/><rect x='186' y='115' width='18' height='26' rx='13' fill='#e85a25'/><rect x='52' y='162' width='32' height='20' rx='10' fill='#f3dcc0'/><rect x='102' y='162' width='102' height='20' rx='10' fill='#f3dcc0'/></svg>Yaatal</a>
<div class="links"><a href="/#modeles">Templates</a><a href="/#comment">Comment ça marche</a><a href="/#objets">Objets</a><a href="/#api">API</a><a href="/#tarifs">Tarifs</a></div>
${cta}</nav></header>`;
}

/**
 * The hero's motion moment: three builds play in turn (a shop site, a WhatsApp bot, a Soundbox
 * firmware) while a meter counts the tokens in FCFA at a real catalog price. Scene 1 is the resting
 * state without script; the script only cycles scenes and runs the meter.
 */
function stage(outputFcfaPerMillion: number): string {
  const prods = [["Grand boubou", "25 000 F", "8%"], ["Ensemble brodé", "18 500 F", "46%"], ["Wax 6 yards", "12 000 F", "88%"]]
    .map(([name, price, x], i) => `<div class="prod pop" style="--d:${1.9 + i * 0.18};--x:${x}"><b></b>${name}<em>${price}</em></div>`).join("");
  return `<div class="stage reveal d2" id="stage" data-scene="1" data-out="${outputFcfaPerMillion}">
  <div class="st-win" aria-hidden="true">
    <div class="st-top"><i></i><i></i><i></i>&nbsp;playground<span class="meter"><b></b><span id="tok">${fcfa(1840)}</span>&nbsp;<span class="l">tokens ·</span>&nbsp;≈&nbsp;<span id="fc">${(1840 * outputFcfaPerMillion / 1e6).toFixed(2).replace(".", ",")}</span>&nbsp;F</span></div>
    <div class="st-body">
      <div class="scene s1">
        <div class="prompt"><span>un site pour ma boutique de bazin, commande WhatsApp</span></div>
        <div class="agent pop" style="--d:1.4">Je construis : catalogue, prix en FCFA, bouton WhatsApp.</div>
        <div class="mini pop" style="--d:1.7"><div class="mini-h">Bazin Riche Médina<small>FR · WO</small></div>
          <div class="prods">${prods}</div>
          <div class="wa-btn pop" style="--d:2.6">Commander sur WhatsApp</div></div>
      </div>
      <div class="scene s2">
        <div class="prompt"><span>un bot WhatsApp qui répond à mes clients</span></div>
        <div class="wa pop" style="--d:1.4"><div class="wa-h">Bazin Riche Médina · bot</div>
          <div class="wa-b">
            <div class="msg pop" style="--d:1.8">Salam, le grand boubou est dispo ?</div>
            <div class="msg out pop" style="--d:2.5">Waaw ! Taille L et XL, 25 000 FCFA.</div>
            <div class="msg pop" style="--d:3.2">Ok, je prends le L.</div>
            <div class="msg out pop" style="--d:3.9">C'est noté. J'envoie la commande à la boutique pour validation.</div>
          </div></div>
      </div>
      <div class="scene s3">
        <div class="prompt"><span>le firmware d'une Soundbox qui annonce les paiements</span></div>
        <div class="fw">
<pre class="code"><span class="pop" style="--d:1.4"><span class="c">// Soundbox · ESP32-S3 + 4G</span></span><span class="pop" style="--d:1.6"><span class="k">void</span> setup() {</span><span class="pop" style="--d:1.8">  modem.attach4G();</span><span class="pop" style="--d:2.0">  audio.begin(I2S_SPEAKER);</span><span class="pop" style="--d:2.2">}</span><span class="pop" style="--d:2.4"><span class="k">void</span> onPayment(<span class="k">int</span> fcfa) {</span><span class="pop" style="--d:2.6">  say(<span class="s">"Paiement reçu"</span>, fcfa);</span><span class="pop" style="--d:2.8">  say_wo(<span class="s">"Xaalis bi agsi na"</span>);</span><span class="pop" style="--d:3.0">}</span></pre>
          <div class="box pop" style="--d:3.1"><span class="ring" style="--d:3.4"></span><span class="ring" style="--d:4.3"></span><div class="grille"></div><div class="lcd">+5 000 F</div></div>
          <div class="said pop" style="--d:3.6">« Paiement reçu : 5 000 FCFA »</div>
        </div>
      </div>
    </div>
  </div>
  <div class="switch" role="group" aria-label="Exemples de constructions">
    <button class="sw" type="button" data-scene="1" aria-pressed="true">Site</button>
    <button class="sw" type="button" data-scene="2" aria-pressed="false">WhatsApp</button>
    <button class="sw" type="button" data-scene="3" aria-pressed="false">Soundbox</button>
  </div>
</div>`;
}

const STAGE_SCRIPT = `
const stage = document.getElementById("stage");
if (stage) {
  const price = Number(stage.dataset.out) || 0;
  const tok = document.getElementById("tok"), fc = document.getElementById("fc");
  const targets = { 1: 1840, 2: 960, 3: 2310 };
  const buttons = [...stage.querySelectorAll(".sw")];
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const whole = new Intl.NumberFormat("fr-FR"), cents = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let frame = 0, timer = 0;
  const meter = n => {
    cancelAnimationFrame(frame);
    const start = performance.now(), length = still ? 0 : 3200;
    const tick = now => {
      const p = length ? Math.min(1, (now - start) / length) : 1, v = Math.round(n * (1 - Math.pow(1 - p, 3)));
      tok.textContent = whole.format(v); fc.textContent = cents.format(v * price / 1e6);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };
  const show = (n, byUser) => {
    stage.dataset.scene = String(n);
    stage.classList.toggle("auto", !still && !byUser);
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.scene === String(n)));
    meter(targets[n]);
    clearTimeout(timer);
    if (!still && !byUser) timer = setTimeout(() => show(n % 3 + 1, false), 6500);
  };
  for (const b of buttons) b.addEventListener("click", () => show(Number(b.dataset.scene), true));
  show(1, false);
}`;

function buildLink(playground: string, prompt: string): string {
  return `${playground}/?prompt=${encodeURIComponent(prompt)}`;
}

export function home(request: Request, env: SiteEnv): Response {
  const origin = new URL(request.url).origin;
  const contact = whatsappLink(env);
  const playground = playgroundOrigin(request, env);
  const featured = env.FEATURED_BLUEPRINT_ID?.trim();
  const featuredLink = playground && featured && /^[A-Za-z0-9_-]{8,64}$/.test(featured)
    ? `${playground}/blueprint/${featured}` : null;
  const models = availableModels(env);
  const example = models.find(model => model.tier === "standard") ?? models[0]!;
  const rows = models.map(model => `<tr><td><code>${escape(model.id)}</code></td><td>${TIER_LABEL[model.tier]}</td><td class="num">${fcfa(model.inputFcfaPerMillion)}</td><td class="num">${fcfa(model.outputFcfaPerMillion)}</td></tr>`).join("");
  const chips = IDEAS.map(idea =>
    `<button class="chip" type="button" data-prompt="${escape(idea.prompt)}" data-example="${escape(idea.example)}">${escape(idea.title)}</button>`).join("");
  const tiles = IDEAS.map(idea => {
    const inner = `<span class="tag">${escape(idea.tag)}</span><h3>${escape(idea.title)}</h3><p>${escape(idea.line)}</p>`;
    return playground
      ? `<a class="tile" href="${escape(buildLink(playground, idea.prompt))}">${inner}<span class="go">Construire ${icon.arrow}</span></a>`
      : `<div class="tile">${inner}</div>`;
  }).join("");

  const ask = playground
    ? `<form class="ask reveal d3" method="get" action="${escape(playground)}/">
<label class="skip" for="prompt">Décrivez ce que vous voulez construire</label>
<textarea id="prompt" name="prompt" maxlength="${MAX_PROMPT}" required placeholder="Ex. : ${escape(IDEAS[0]!.example)}…"></textarea>
<div class="bar"><small>Le Playground s'ouvre avec votre idée. Un compte est nécessaire.</small><button class="btn accent" type="submit">Construire ${icon.arrow}</button></div>
</form>
<div class="chips reveal d4" role="group" aria-label="Idées pour commencer">${chips}</div>`
    : `<p class="reveal d3" style="margin-top:32px">${contact ? `<a class="btn accent" href="${escape(contact)}" rel="noopener">Demander un accès bêta</a>` : "Le Playground ouvre bientôt au public."}</p>`;

  const body = `
${topNav(playground, contact)}
<main id="main">
<div class="wrap hero">
 <div>
  <span class="eyebrow reveal">Dalal ak jàmm · fait à Dakar</span>
  <h1 class="reveal d1">De l'idée à l'outil <em class="fill">qui tourne</em>.</h1>
  <p class="lede reveal d2">Site e-commerce, bot WhatsApp, dashboard ou Soundbox ESP32 : décrivez-le, Yaatal le construit avec vous. L'IA se paie en FCFA, au token près.</p>
  ${ask}
  <div class="trust reveal d4"><span><i></i>Français, wolof, ou les deux mélangés</span><span><i></i>Payé en FCFA, pas besoin de carte Visa</span><span><i></i>API compatible OpenAI</span></div>
 </div>
 ${stage(example.outputFcfaPerMillion)}
</div>

<div class="wrap"><div class="weave" aria-hidden="true"></div></div>

<section id="gens" style="padding-top:56px"><div class="wrap">
  <p class="kicker">Pour qui</p>
  <h2>Pour celles et ceux qui vendent déjà.</h2>
  <p class="sub">Couturières, commerçantes, vendeurs de rue : le travail se fait déjà sur WhatsApp et au marché. Yaatal part de là et en fait des outils, sans carte bancaire ni jargon.</p>
  <div class="people">
    <figure><img src="/img/market.webp" alt="Une commerçante trie des graines dans des paniers devant son étal." loading="lazy" width="1000" height="1153"><figcaption>Commerce de rue, Sénégal</figcaption></figure>
    <figure><img src="/img/wax.webp" alt="Des rouleaux de tissus wax aux motifs colorés empilés sur des étagères." loading="lazy" width="1400" height="786"><figcaption>Tissus wax</figcaption></figure>
    <figure><img src="/img/tailor.webp" alt="Une couturière coud un tissu wax orange et blanc à la machine." loading="lazy" width="1000" height="750"><figcaption>Couturière au Sénégal</figcaption></figure>
  </div>
</div></section>

<section id="modeles"><div class="wrap">
  <p class="kicker">Templates</p>
  <h2>Partez d'un template. Adaptez-le.</h2>
  <p class="sub">Chaque carte ouvre le Playground avec un prompt déjà écrit. Vous le modifiez, l'agent pose ses questions, puis construit.</p>
  <div class="gallery">${tiles}</div>
  ${featuredLink ? `<p style="margin-top:22px"><a class="btn ghost" href="${escape(featuredLink)}">Ouvrir un template déjà construit : prépa live TikTok ${icon.arrow}</a></p>` : ""}
</div></section>

<section id="comment"><div class="wrap flow">
  <div>
    <p class="kicker">Comment ça marche</p>
    <h2>Décrire. Construire. Publier.</h2>
    <div class="steps">
      <div class="step"><span class="ic">${icon.chat}</span><div><h3>Décrire</h3><p>En français, avec vos mots. L'agent demande ce qui manque : vos produits, vos prix, votre numéro.</p></div></div>
      <div class="step"><span class="ic">${icon.build}</span><div><h3>Construire</h3><p>L'agent écrit et teste le code dans une sandbox. Vous voyez le résultat en live.</p></div></div>
      <div class="step"><span class="ic">${icon.check}</span><div><h3>Valider et publier</h3><p>Aucun changement n'est appliqué sans votre accord. Ensuite, vous le partagez ou le gardez comme template.</p></div></div>
    </div>
  </div>
  <div class="frame" aria-hidden="true"><div class="window">
    <div class="bar"><i></i><i></i><i></i></div>
    <div class="body">
      <div class="chat">
        <div class="bubble me">Un site pour ma boutique de bazin, commande sur WhatsApp.</div>
        <div class="bubble">Quel est le nom de la boutique, et quels produits voulez-vous montrer en premier ?</div>
        <div class="bubble me">Bazin Riche Médina. Les grands boubous d'abord.</div>
      </div>
      <div class="preview">
        <div class="pv-title">Bazin Riche Médina</div>
        <div class="pv-grid"><div class="pv-item"><b></b>Grand boubou</div><div class="pv-item"><b></b>Ensemble brodé</div></div>
        <span class="pv-cta">Commander sur WhatsApp</span>
      </div>
    </div>
  </div></div>
</div></section>

<section id="objets"><div class="wrap split">
  <div>
    <p class="kicker">Objets connectés</p>
    <h2>Du prototype à l'objet fini.</h2>
    <p class="sub">Décrivez l'objet : le Playground produit le firmware, le schéma de câblage et la liste des pièces, que vous relisez avant d'acheter quoi que ce soit. On fabrique seulement ce qui est commandé.</p>
    <div class="boards" aria-label="Cartes courantes"><span>ESP32-S3</span><span>ESP32</span><span>Raspberry Pi Pico</span><span>Arduino</span><span>STM32</span></div>
  </div>
  <div class="partners">
    <div class="partner"><span class="ic">${icon.chip}</span><div><h3>Composants</h3><p>La liste des pièces avec des prix indicatifs, pour commander chez nos fournisseurs.</p></div></div>
    <div class="partner"><span class="ic">${icon.build}</span><div><h3>Coque en impression 3D</h3><p>La coque est imprimée par un atelier partenaire, sur commande.</p></div></div>
    <div class="partner"><span class="ic">${icon.check}</span><div><h3>Montage et conseil</h3><p>Des techniciens partenaires relisent le montage et accompagnent les séries.</p></div></div>
  </div>
</div></section>

<section id="api"><div class="wrap"><div class="band">
  <p class="kicker">API</p>
  <h2>Une API pour toute votre IA.</h2>
  <p class="sub">Le Playground, les sites qu'il construit, vos objets et votre propre code passent par la même API. Un solde en FCFA, une facture, et si un modèle ne répond pas, un autre prend le relais.</p>
  <div class="tabs">
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
<pre class="p3">import os
from openai import OpenAI

yaatal = OpenAI(base_url="${escape(origin)}/v1", api_key=os.environ["YAATAL_API_KEY"])
reply = yaatal.chat.completions.create(
    model="${escape(example.id)}",
    messages=[{"role": "user", "content": "Salaam!"}],
)</pre>
  </div>
</div></div></section>

<section id="tarifs"><div class="wrap">
  <p class="kicker">Tarifs</p>
  <div class="pay">
    <div>
      <h2>Vous payez ce que vous consommez, en FCFA.</h2>
      <p class="sub" style="margin-bottom:0">Recharger Yaatal, c'est comme acheter du crédit au coin de la rue. Le prix se compte en tokens (les bouts de texte que le modèle lit et écrit), et un appel qui échoue n'est pas facturé. Pendant la bêta, les recharges se font avec l'équipe.</p>
    </div>
    <figure><img src="/img/ngor.webp" alt="Deux jeunes vendeurs de recharges téléphoniques au bord d'une route." loading="lazy" width="1200" height="800"><figcaption>Vendeurs de recharges téléphoniques, Ngor, Dakar</figcaption></figure>
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th>Modèle</th><th>Tier</th><th class="num">Input · FCFA / 1M tokens</th><th class="num">Output · FCFA / 1M tokens</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
  <p class="sub" style="margin-top:16px;margin-bottom:0">Liste à jour : <a href="/v1/models">/v1/models</a> · Votre solde : <a href="/usage">/usage</a></p>
</div></section>

<section id="donnees"><div class="wrap">
  <p class="kicker">Données</p>
  <h2>Les quatre questions qu'on nous pose.</h2>
  <div class="qa">
    <div class="card"><h3>Où sont-elles traitées ?</h3><p>Chez le fournisseur cloud du modèle choisi, le temps de produire la réponse.</p></div>
    <div class="card"><h3>Combien de temps sont-elles gardées ?</h3><p>Yaatal ne garde ni vos prompts ni les réponses.</p></div>
    <div class="card"><h3>Y a-t-il des logs ?</h3><p>Seulement l'usage : modèle, tokens, montant, date.</p></div>
    <div class="card"><h3>Peut-on les supprimer ?</h3><p>Oui : sur demande, votre compte et son historique d'usage.</p></div>
  </div>
  <p class="sub" style="margin-top:18px;margin-bottom:0">Seul votre prompt part chez le fournisseur cloud, jamais votre clé API ni l'identifiant de votre compte. Évitez d'y mettre des données personnelles sensibles.</p>
</div></section>

<section id="faq"><div class="wrap" style="max-width:860px">
  <p class="kicker">Questions</p>
  <h2>Avant de commencer.</h2>
  ${FAQ.map(([q, a]) => `<details><summary>${escape(q)}</summary><p>${escape(a)}</p></details>`).join("")}
</div></section>

<section class="final"><div class="wrap">
  <h2>Votre prochaine idée, construite cette semaine.</h2>
  <div class="row">
    ${playground ? `<a class="btn accent" href="${escape(playground)}/signup">Créer un compte</a>` : ""}
    ${contact ? `<a class="btn ghost" href="${escape(contact)}" rel="noopener">Parler à l'équipe sur WhatsApp</a>` : ""}
  </div>
</div></section>
</main>
<footer class="wrap"><span>© Yaatal · Dakar</span><span><a href="/usage">Consommation</a> · <a href="/v1/models">Modèles</a> · Bêta</span>
<p class="credits">Photos, Wikimedia Commons : Sanghesenegalafrica (CC BY-SA 4.0), Lucas Takerkart (CC BY-SA 4.0), dimworld (CC BY 2.0), GuillaumeG (CC BY-SA 4.0).</p></footer>`;

  const script = STAGE_SCRIPT + (playground ? `
const box = document.getElementById("prompt");
for (const chip of document.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => { box.value = chip.dataset.prompt; box.focus(); });
}
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const ideas = [...document.querySelectorAll(".chip")].map(c => "Ex. : " + c.dataset.example + "…");
  let i = 0;
  setInterval(() => { if (!box.value && document.activeElement !== box) { i = (i + 1) % ideas.length; box.placeholder = ideas[i]; } }, 4000);
}` : "");

  return page("Yaatal · De l'idée à l'outil qui tourne. Facturé en FCFA.", body, {
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
  if (!res.ok) { out.textContent = res.status === 401 ? "Clé API invalide." : "Erreur " + res.status + "."; return; }
  const data = await res.json(); out.textContent = "";
  const h = document.createElement("h2"); h.textContent = money(data.balance_fcfa); out.appendChild(h);
  const table = document.createElement("table"), head = document.createElement("tr");
  for (const t of ["Date", "Opération", "Modèle", "Tokens", "Montant"]) { const th = document.createElement("th"); th.textContent = t; head.appendChild(th); }
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
  const body = `${topNav(playgroundOrigin(request, env), whatsappLink(env))}
<main id="main" class="wrap" style="padding-top:56px;padding-bottom:88px;max-width:860px">
<p class="kicker">Consommation</p>
<h2>Votre solde en FCFA</h2>
<p class="sub">Collez votre clé API pour voir votre solde et vos derniers appels. Elle n'est ni enregistrée ni envoyée ailleurs.</p>
<form id="f" class="row"><input id="k" type="password" autocomplete="off" placeholder="yk_…" required aria-label="Clé API Yaatal"><button class="btn accent" type="submit">Voir</button></form>
<div id="out" aria-live="polite"></div>
</main>`;
  return page("Yaatal · Consommation", body, { script });
}
