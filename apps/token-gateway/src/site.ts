// The customer-facing pages. The landing page sells one thing: build anything, from a merchant's
// website to a device's firmware, on one AI API billed in FCFA. Every idea goes straight to the
// builder (kairmel.com) through its `/?prompt=` deep link. Prices are rendered from the model
// catalog so the page cannot drift from billing. No supplier or upstream model name appears here.
import { availableModels, MODELS } from "./models.js";

export interface SiteEnv {
  /** The yaatal-voice Worker. When bound, the hero's main action is a voice call. */
  VOICE?: Fetcher;
  /** "true" on Workers Paid: the page then lists the models that need it. */
  WORKERS_PAID?: string;
  /** Public origin of the builder (kairmel.com). HTTPS, or HTTP on loopback. */
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
  ["C'est quoi, Kairmel ?",
    "Un espace où des agents d'IA construisent avec vous des sites, des outils, des assistants et des prototypes d'objets connectés. Tout ce qui est construit utilise la même API d'IA, que vous payez en FCFA."],
  ["Faut-il savoir coder ?",
    "Non. Vous décrivez ce que vous voulez en français, ou en français-wolof comme au quotidien ; l'agent pose ses questions, construit, et vous montre le résultat. Chaque changement attend votre accord avant d'être appliqué. Si vous codez, tout reste modifiable."],
  ["Comment je paie ?",
    "À la consommation, en FCFA, dans les 8 pays de l'UEMOA, sans carte Visa ni Mastercard. Vous rechargez un solde, comme du crédit ; chaque appel d'IA en déduit le prix affiché dans les tarifs. Les recharges se font depuis Kairmel (Ventes, puis Recharger), sur la fiche de paiement."],
  ["Et pour les objets, vous fabriquez ?",
    "Kairmel produit le firmware, le schéma de câblage et la liste des pièces, que vous relisez avant tout achat. La fabrication se fait sur commande, avec nos partenaires : impression 3D, fournisseurs de composants, conseil technique."],
  ["Puis-je utiliser l'API dans mon propre code ?",
    "Oui. L'API Kairmel est compatible OpenAI : vous changez la base URL et la clé API, votre code et vos SDK restent les mêmes."],
  ["Que devient ce que j'envoie ?",
    "Kairmel ne garde ni vos prompts ni les réponses. Nous gardons seulement l'usage (modèle, tokens, montant, date), et nous supprimons votre compte et cet historique sur demande."],
];

function escape(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const num = (value: number) => new Intl.NumberFormat("fr-FR").format(value).replace(/ | /g, " ");

function whatsappLink(env: SiteEnv): string | null {
  const number = env.CONTACT_WHATSAPP?.trim();
  if (!number || !/^[1-9][0-9]{7,14}$/.test(number)) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent("Bonjour, je souhaite un accès bêta à Kairmel.")}`;
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
  mic: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`,
  play: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>`,
  build: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`,
  chip: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>`,
};

// Kairmel's door, as in the app (kairmel-platform public/favicon.svg, 120 grid scaled to 256).
// The dot is the voice, so it is bissap. Yaatal (the company) keeps its woven-Y mark for its own pages.
const MARK_INNER =
  "<rect width='256' height='256' rx='56' fill='#1a1514'/>" +
  "<rect x='60' y='85' width='34' height='124' rx='17' fill='#ffffff'/>" +
  "<rect x='162' y='85' width='34' height='124' rx='17' fill='#ffffff'/>" +
  "<circle cx='128' cy='154' r='26' fill='#e5476a'/>";
const MARK = `<svg class="mark" width="30" height="30" viewBox="0 0 256 256" aria-hidden="true">${MARK_INNER}</svg>`;
const WORDMARK = `<span class="word" style="font-weight:700;font-size:19px;letter-spacing:-.01em">Kairmel</span>`;
const FAVICON = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'>${MARK_INNER}</svg>`);

const STYLE = `
@font-face{font-family:"Departure Mono";src:url(/fonts/DepartureMono-Regular.woff2) format("woff2");font-display:swap}
:root{--paper:#f5f4f2;--paper-2:#ecebe8;--ink:#1a1514;--muted:#6e6866;--line:#e7e4e1;--card:#fffdfb;--accent:#1a1514;--accent-strong:#1a1514;--deep:#1a1514;--deep-ink:#f5f4f2;--code:#1a1514;--code-ink:#efebe8;--shadow:0 1px 2px rgba(26,21,20,.06),0 12px 32px -12px rgba(26,21,20,.18);--talk-bg:#a61e3d;--talk-ink:#ffffff;--talk-hover:#8c1833;--glow-warm:rgba(166,30,61,.07);--glow-deep:rgba(26,21,20,.05)}
@media (prefers-color-scheme:dark){:root{--paper:#1a1514;--paper-2:#221c1b;--ink:#efebe8;--muted:#a8a19e;--line:#3a3433;--card:#211b1a;--accent:#efebe8;--accent-strong:#efebe8;--deep:#262120;--deep-ink:#efebe8;--shadow:0 1px 2px rgba(0,0,0,.4),0 16px 40px -16px rgba(0,0,0,.6);--talk-bg:#c7294c;--talk-ink:#ffffff;--talk-hover:#b0223f;--glow-warm:rgba(199,41,76,.10);--glow-deep:rgba(0,0,0,.2)}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:radial-gradient(900px 620px at 78% -80px,var(--glow-warm),transparent 70%) no-repeat,radial-gradient(760px 560px at 6% 0,var(--glow-deep),transparent 72%) no-repeat,var(--paper);color:var(--ink);font:17px/1.6 "Hanken Grotesk",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}.wrap{max-width:1140px;margin:0 auto;padding-left:16px;padding-right:16px}
h1,h2,h3,.display{font-family:"Hanken Grotesk",sans-serif;letter-spacing:-.025em;font-weight:700}
code,pre,.mono{font-family:"Departure Mono",ui-monospace,monospace}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:6px}
.skip{position:absolute;left:-999px}.skip:focus{left:16px;top:12px;z-index:50;background:var(--card);padding:8px 12px}
header.top{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--paper) 88%,transparent);backdrop-filter:blur(10px)}
nav{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:68px}
.logo{display:flex;align-items:center;gap:11px;color:var(--ink);text-decoration:none}.logo .mark{display:block;flex:none}.logo .word{display:block;width:auto}
.links{display:flex;gap:26px;font-size:.95rem;color:var(--muted)}.links a{text-decoration:none;padding:10px 0}.links a:hover{color:var(--ink)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;background:var(--ink);color:var(--paper);border:0;border-radius:12px;padding:10px 18px;font:600 .98rem "Hanken Grotesk",sans-serif;text-decoration:none;cursor:pointer;transition:background-color .2s,color .2s,border-color .2s}
.btn:hover{background:color-mix(in srgb,var(--accent-strong) 82%,var(--paper));color:var(--paper)}.btn.accent{background:var(--accent-strong);color:var(--paper)}.btn.accent:hover{background:color-mix(in srgb,var(--ink) 82%,var(--paper));color:var(--paper)}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}.btn.ghost:hover{border-color:var(--ink);background:transparent;color:var(--ink)}
.hero>*{min-width:0}
.hero{display:grid;grid-template-columns:minmax(0,1.02fr) minmax(0,.98fr);gap:48px;align-items:center;padding-top:64px;padding-bottom:40px}
h1{font-size:clamp(2.5rem,5.6vw,4.6rem);line-height:1;margin:0 0 20px;max-width:11ch;text-wrap:balance}
h1 em{font-style:normal;color:var(--accent-strong)}
.fill{color:var(--accent-strong);white-space:nowrap}
.lede{font-size:1.15rem;color:var(--muted);max-width:36rem;margin:0}
.ask{max-width:780px;margin:30px 0 0;background:var(--card);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow);text-align:left;overflow:hidden}
.ask textarea{display:block;width:100%;min-height:132px;resize:vertical;border:0;background:transparent;color:var(--ink);font:1.08rem/1.55 "Hanken Grotesk",sans-serif;padding:20px 22px;outline:none}
.ask textarea::placeholder{color:color-mix(in srgb,var(--muted) 75%,transparent)}
.ask .bar{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid var(--line);padding:12px 12px 12px 22px;background:var(--paper-2)}
.ask small{color:var(--muted);font-size:.88rem}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0;max-width:820px}
.chip{min-height:40px;background:transparent;border:1px solid var(--line);color:var(--ink);border-radius:999px;padding:8px 14px;font:500 .9rem "Hanken Grotesk",sans-serif;cursor:pointer;transition:border-color .2s,background-color .2s}
.chip:hover{border-color:var(--accent);background:var(--card)}
.eyebrow{display:inline-block;font:600 .8rem "Departure Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--accent-strong);margin-bottom:18px}
.people{display:grid;grid-template-columns:1fr 1.5fr 1fr;gap:18px;align-items:end;margin-top:8px}
.people figure{margin:0;position:relative}
.people img{display:block;width:100%;height:100%;object-fit:cover;border-radius:18px;box-shadow:var(--shadow)}
.people figure:nth-child(1){transform:rotate(-2deg)}.people figure:nth-child(1) img{aspect-ratio:4/5}
.people figure:nth-child(2) img{aspect-ratio:16/10}
.people figure:nth-child(3){transform:rotate(2deg)}.people figure:nth-child(3) img{aspect-ratio:4/3}
.people figcaption{font-size:.82rem;color:var(--muted);margin-top:8px}
.pay{display:grid;grid-template-columns:1.1fr .9fr;gap:36px;align-items:center;margin-bottom:36px}
.pay img{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;border-radius:18px;box-shadow:var(--shadow)}
.pay figure{margin:0}.pay figcaption{font-size:.82rem;color:var(--muted);margin-top:8px}
.credits{font-size:.78rem;color:var(--muted);max-width:60rem}
@media (max-width:900px){.people{grid-template-columns:1fr 1fr}.people figure:nth-child(2){grid-column:1/-1;order:-1}.pay{grid-template-columns:1fr}}
@media (max-width:600px){.people figure{transform:none!important}}
.call-sheet{width:min(1120px,calc(100vw - 32px));max-height:calc(100dvh - 32px);padding:0;border:0;border-radius:24px;background:var(--paper);color:var(--ink);box-shadow:0 30px 80px -20px rgba(0,0,0,.5);overflow:auto}
.call-sheet::backdrop{background:rgba(10,12,11,.55);backdrop-filter:blur(4px)}
.call-wait{padding:48px;text-align:center;color:var(--muted)}
section{padding-top:88px;padding-bottom:88px}
.kicker{font:600 .78rem "Departure Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--accent-strong);margin:0 0 12px}
h2{font-size:clamp(1.9rem,4vw,3rem);line-height:1.05;margin:0 0 14px;max-width:18ch}
.sub{color:var(--muted);max-width:40rem;margin:0 0 40px;font-size:1.05rem}
.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.tile{display:flex;flex-direction:column;gap:8px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px;text-decoration:none;transition:border-color .2s,box-shadow .2s;min-height:190px}
.tile:hover{border-color:var(--accent);box-shadow:var(--shadow)}
.tile .tag{font:600 .72rem "Departure Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.tile h3{font-size:1.25rem;margin:4px 0 0;line-height:1.2}.tile p{margin:0;color:var(--muted);font-size:.97rem}
.tile .go{margin-top:auto;display:inline-flex;align-items:center;gap:6px;font-weight:600;color:var(--accent-strong)}
.split{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start}
.boards{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}.boards span{border:1px solid var(--line);border-radius:10px;padding:6px 10px;font:500 .85rem "Departure Mono",monospace;background:var(--card)}
.partners{display:grid;gap:10px}.partner{display:grid;grid-template-columns:44px 1fr;gap:14px;align-items:start;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
.partner .ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--paper-2);color:var(--accent-strong)}
.partner h3{margin:0 0 2px;font-size:1.05rem}.partner p{margin:0;color:var(--muted);font-size:.95rem}
.band{background:var(--deep);color:var(--deep-ink);border-radius:28px;padding:48px;--af-paper:var(--deep);--af-muted:color-mix(in srgb,var(--deep-ink) 70%,transparent)}
.flowfig{margin:28px 0 32px;padding:20px;border:1px solid color-mix(in srgb,var(--deep-ink) 18%,transparent);border-radius:20px}
.band h2{color:var(--deep-ink)}.band .sub{color:color-mix(in srgb,var(--deep-ink) 75%,transparent)}.band .kicker{color:color-mix(in srgb,var(--deep-ink) 70%,transparent)}
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
.soon{font:600 .68rem "Departure Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:2px 7px;margin-left:6px;white-space:nowrap}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}td code{color:var(--accent-strong);font-size:.9rem}
.qa{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.qa .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px}
.qa h3{font-family:"Hanken Grotesk",sans-serif;font-size:1.02rem;margin:0 0 6px;letter-spacing:0}.qa p{margin:0;color:var(--muted)}
details{border-bottom:1px solid var(--line)}details:first-of-type{border-top:1px solid var(--line)}
summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:16px;padding:20px 4px;font-weight:600;font-size:1.05rem;min-height:44px}
summary::-webkit-details-marker{display:none}summary::after{content:"+";font-family:"Departure Mono",monospace;color:var(--accent-strong)}
details[open] summary::after{content:"−"}details p{margin:0 4px 20px;color:var(--muted);max-width:46rem}
.final{text-align:center}.final h2{margin-left:auto;margin-right:auto}.final .row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:26px}
footer{border-top:1px solid var(--line);padding-top:28px;padding-bottom:44px;color:var(--muted);font-size:.9rem;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
footer a{text-decoration:none}footer a:hover{color:var(--ink)}
.reveal{animation:rise .7s cubic-bezier(.2,.7,.2,1) both}.d1{animation-delay:.06s}.d2{animation-delay:.14s}.d3{animation-delay:.24s}.d4{animation-delay:.34s}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes blink{50%{opacity:.25}}
.pop{animation:pop .55s cubic-bezier(.2,.8,.2,1.15) both;animation-delay:calc(var(--d,0) * 1s)}
@keyframes pop{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
.mini{border:1px solid var(--line);border-radius:12px;overflow:hidden}
.mini-h{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:#1a1514;color:#f5f4f2;font:700 .88rem "Hanken Grotesk",sans-serif}
.mini-h small{font:500 .68rem "Departure Mono",monospace;opacity:.75}
.prods{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px}
.prod{font-size:.72rem;line-height:1.35}.prod em{font-style:normal;font-weight:600;display:block;color:var(--accent-strong)}
.prod b{display:block;aspect-ratio:1;border-radius:8px;margin-bottom:6px;background:url(/img/wax.webp) var(--x) 50%/420% auto}
.wa-btn{margin:0 10px 10px;background:#1f7a4d;color:#fff;border-radius:8px;padding:8px;text-align:center;font-weight:600;font-size:.76rem}
.code{margin:0;background:var(--code);color:var(--code-ink);border-radius:10px;padding:12px;font-size:.7rem;line-height:1.65;overflow:hidden;white-space:pre}
.code span{display:block}.code .k{display:inline;color:#ff9a6a}.code .s{display:inline;color:#9fd8a8}.code .c{display:inline;color:#8a8478}
@keyframes inview{from{opacity:.25;translate:0 28px}to{opacity:1;translate:0 0}}
.w{display:inline-block;overflow:hidden;vertical-align:bottom;padding:0 .02em .14em;margin-bottom:-.14em}
.w>*{display:inline-block;animation:up .95s cubic-bezier(.2,.7,.1,1) both;animation-delay:calc(.07s * var(--i,0))}
@keyframes up{from{transform:translateY(108%)}}
.wf{padding-inline:.06em}
.st-top{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);background:var(--paper-2);font:500 .74rem "Departure Mono",monospace;color:var(--muted)}
.st-top>i{width:9px;height:9px;border-radius:50%;background:var(--line);display:block}
.meter{margin-left:auto;display:inline-flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:4px 10px;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}
.meter b{width:7px;height:7px;border-radius:50%;background:#1f7a4d;animation:blink 1.2s ease-in-out infinite}
.hero{grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:80px;padding-top:96px;padding-bottom:88px}
.hero h1{font-size:clamp(2.4rem,5vw,4.3rem);line-height:1.02;margin-bottom:26px}
.hero .lede{max-width:30rem;font-size:1.2rem}
.hero .eyebrow{margin-bottom:22px}
.waxtext{color:var(--accent-strong);background:url(/img/wax.webp) 30% 48%/cover;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;-webkit-text-stroke:1.5px var(--accent-strong)}
.actions{display:flex;flex-wrap:wrap;align-items:center;gap:14px 24px;margin-top:40px}
.talk{display:inline-flex;align-items:center;gap:14px;min-height:64px;padding:0 30px 0 10px;border:0;border-radius:999px;background:var(--talk-bg);color:var(--talk-ink);font:600 1.15rem "Hanken Grotesk",sans-serif;cursor:pointer;transition:transform .2s cubic-bezier(.2,.8,.2,1.2),background-color .2s}
.talk:hover{background:var(--talk-hover)}.talk:active{transform:scale(.98)}
.talk .ic{position:relative;flex:none;width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:var(--paper)}
.talk .ic::before{content:"";position:absolute;inset:-7px;border-radius:50%;background:repeating-conic-gradient(var(--accent) 0 5deg,transparent 5deg 15deg);-webkit-mask:radial-gradient(circle,transparent 62%,#000 64%);mask:radial-gradient(circle,transparent 62%,#000 64%);animation:turn 14s linear infinite;opacity:.8}
@keyframes turn{to{transform:rotate(1turn)}}
.alt{color:var(--muted);font-size:.95rem}.alt a{color:var(--ink);font-weight:600}
.said-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:40px;border-top:1px solid var(--line);padding-top:28px;margin-bottom:24px}
.said-row>*{display:flex;flex-direction:column;gap:4px;text-align:left;background:none;border:0;padding:0;font:inherit;color:inherit}
.said-row button{cursor:pointer}.said-row button:hover b{color:var(--accent-strong)}
.said-row span{color:var(--muted);font-size:.97rem}.said-row b{font-weight:600;transition:color .2s}
.thread{justify-self:end;width:100%;max-width:470px;background:var(--deep);border-radius:28px;padding:32px;display:flex;flex-direction:column;gap:18px;box-shadow:0 40px 80px -40px rgba(21,48,44,.55)}
.note{align-self:flex-end;display:flex;align-items:center;gap:12px;width:min(330px,100%);background:#d7f5c8;color:#10251a;border-radius:18px 18px 4px 18px;padding:11px 15px}
.play{flex:none;width:34px;height:34px;border-radius:50%;background:#1f7a4d;color:#fff;display:grid;place-items:center}
.wave{flex:1;display:flex;align-items:center;gap:3px;height:30px}
.wave i{display:block;width:3px;height:var(--h);border-radius:2px;background:#1f7a4d}
.thread.run .wave i{animation:heard .1s linear both;animation-delay:calc(.05s * var(--k))}
@keyframes heard{from{background:#8fb89c}}
.dur{font-size:.8rem;font-variant-numeric:tabular-nums}
.reply{align-self:flex-start;max-width:400px;background:#f5f4f2;color:#1a1514;border-radius:18px 18px 18px 4px;padding:11px 15px;font-size:.95rem;line-height:1.45}
.shop{align-self:flex-start;width:100%;background:#fffdf9;color:#1b1813;border-radius:18px;overflow:hidden}
.shop-img{height:150px;background:url(/img/wax.webp) center 45%/cover}
.shop .wa-btn{margin:12px 14px 14px}
.shop-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:14px 14px 0}
.shop-h strong{font:700 1.1rem "Hanken Grotesk",sans-serif}.shop-h span{font-size:.72rem;color:#5f584d}
.thread .pop{animation:none}.thread.run .pop{animation:pop .55s cubic-bezier(.2,.8,.2,1.15) both;animation-delay:calc(var(--d,0) * 1s)}
@media (max-width:900px){.said-row{grid-template-columns:1fr;gap:16px}.hero{gap:44px;padding-top:56px;padding-bottom:56px}.thread{justify-self:stretch;max-width:none}}
.tile{background:radial-gradient(260px circle at var(--mx,-400px) var(--my,-400px),color-mix(in srgb,var(--accent) 16%,transparent),transparent 70%) var(--card)}
@supports (animation-timeline:scroll()){header.top::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--accent);transform-origin:left;animation:grow linear both;animation-timeline:scroll(root)}}
@keyframes grow{from{transform:scaleX(0)}}
.marquee{overflow:hidden;border-block:1px solid var(--line);padding-block:10px}
.track{display:flex;width:max-content;align-items:center;gap:30px;animation:mq 42s linear infinite}
.track span{font:800 clamp(2.4rem,6.5vw,5.2rem)/1.1 "Hanken Grotesk",sans-serif;letter-spacing:-.04em;white-space:nowrap}
.track span.o{color:transparent;-webkit-text-stroke:1.5px var(--ink)}
.track i{width:44px;height:14px;border-radius:7px;background:var(--accent);flex:none}.track i:nth-of-type(2n){background:var(--deep)}
@keyframes mq{to{transform:translateX(-50%)}}
.pin-box{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:56px;align-items:center}
.beats{list-style:none;margin:28px 0 0;padding:0;display:flex;flex-direction:column;gap:4px;position:relative}
.beat{display:grid;grid-template-columns:52px 1fr;gap:12px;padding:14px 0;transition:opacity .45s}
.beat .num{font:700 .9rem "Departure Mono",monospace;color:var(--accent-strong);padding-top:5px}
.beat h3{margin:0 0 4px;font-size:1.3rem}.beat p{margin:0;color:var(--muted);font-size:.98rem;max-width:30rem}
.panels{display:flex;flex-direction:column;gap:18px}
.panel{background:var(--deep);border-radius:24px;padding:14px}
.pw{background:var(--card);border-radius:14px;border:1px solid var(--line);overflow:hidden;min-height:330px;display:flex;flex-direction:column}
.chatx{padding:16px;display:flex;flex-direction:column;gap:10px;font-size:.9rem}
.cx{align-self:flex-start;max-width:84%;padding:9px 13px;border-radius:14px 14px 14px 4px;background:color-mix(in srgb,var(--line) 75%,var(--card))}
.cx.me{align-self:flex-end;background:var(--ink);color:var(--paper);border-radius:14px 14px 4px 14px}
.cx.typing{display:flex;gap:5px;padding:12px 14px}.cx.typing i{width:7px;height:7px;border-radius:50%;background:var(--muted);animation:blink 1.2s infinite}.cx.typing i:nth-child(2){animation-delay:.2s}.cx.typing i:nth-child(3){animation-delay:.4s}
.files{display:flex;gap:2px;padding:8px 10px 0;font:500 .74rem "Departure Mono",monospace;color:var(--muted);border-bottom:1px solid var(--line)}
.files span{padding:6px 10px;border-radius:8px 8px 0 0}.files span.on{background:var(--code);color:var(--code-ink)}
.code.big{border-radius:0;font-size:.76rem;flex:1}
.checks{display:flex;flex-wrap:wrap;gap:8px;padding:10px 12px;font:500 .74rem "Departure Mono",monospace;border-top:1px solid var(--line)}
.checks span{border:1px solid var(--line);border-radius:999px;padding:3px 9px}.checks span.ok{color:#1f7a4d;border-color:color-mix(in srgb,#1f7a4d 45%,var(--line))}
.pw .mini{margin:12px}
.ship{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 12px 12px;font:500 .78rem "Departure Mono",monospace;color:var(--muted)}
.ship b{background:var(--accent-strong);color:var(--paper);border-radius:8px;padding:7px 14px;font:600 .8rem "Hanken Grotesk",sans-serif}
html.pin .story{height:340vh}
html.pin .pin-box{position:sticky;top:calc(env(safe-area-inset-top,0px) + 84px);min-height:calc(100vh - 110px)}
html.pin .panels{position:relative;height:440px;perspective:1400px}
html.pin .panel .pw{height:100%}
html.pin .panel{position:absolute;inset:0;opacity:0;transform:translateY(46px) rotateX(12deg) scale(.94);transition:opacity .5s ease,transform .85s cubic-bezier(.2,.7,.1,1);pointer-events:none}
html.pin .story[data-step="0"] .pa,html.pin .story[data-step="1"] .pb,html.pin .story[data-step="2"] .pc{opacity:1;transform:none}
html.pin .beat{opacity:.32}
html.pin .story[data-step="0"] .beat:nth-child(1),html.pin .story[data-step="1"] .beat:nth-child(2),html.pin .story[data-step="2"] .beat:nth-child(3){opacity:1}
html.pin .beats::before,html.pin .beats::after{content:"";position:absolute;left:-22px;top:18px;bottom:18px;width:2px;border-radius:1px;background:var(--line)}
html.pin .beats::after{background:var(--accent);transform-origin:top;transform:scaleY(var(--p,0))}
@supports (animation-timeline:view()){@media (prefers-reduced-motion:no-preference){
  .tile,html:not(.pin) .beat,.partner,.people figure,.qa .card,.pay figure{animation:inview linear both;animation-timeline:view();animation-range:entry 0% entry 70%}
}}
@media (prefers-reduced-motion:reduce){.reveal,.thread *,.talk .ic::before,.w>*,.track,.cx.typing i{animation:none!important}html{scroll-behavior:auto}*{transition:none!important}}
@media (max-width:900px){.hero{grid-template-columns:1fr;gap:36px}.pin-box{grid-template-columns:1fr;gap:28px}.gallery{grid-template-columns:1fr 1fr}.flow,.split{grid-template-columns:1fr}.links{display:none}.band{padding:28px}}
@media (max-width:460px){.st-body{height:auto;min-height:340px}.fw{grid-template-columns:1fr}.box{display:none}.meter span.l{display:none}}
@media (max-width:600px){.gallery,.qa{grid-template-columns:1fr}.window .body{grid-template-columns:1fr}.window .chat{border-right:0;border-bottom:1px solid var(--line)}.ask .bar{flex-direction:column;align-items:stretch}.hero{padding-top:44px}}
input[type=password]{width:100%;min-height:44px;padding:10px 14px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);font:inherit}
.row{display:flex;gap:10px;margin:18px 0}.row input{flex:1}
`;

const FONTS =
  "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap";

function page(title: string, body: string, options: { script?: string; formAction?: string | null; voiceOrigin?: string } = {}): Response {
  const scriptNonce = options.script ? nonce() : null;
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="Décrivez un site, un outil ou un objet connecté : Kairmel le construit avec vous. L'IA se paie en FCFA, partout en zone UEMOA.">
<meta name="theme-color" content="#f5f4f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1a1514" media="(prefers-color-scheme: dark)">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="icon" href="${FAVICON}">
<style>${STYLE}</style>
</head>
<body><a class="skip" href="#main">Aller au contenu</a>${body}${scriptNonce ? `<script nonce="${scriptNonce}">${options.script}</script>` : ""}</body>
</html>`;
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    options.voiceOrigin ? `connect-src 'self' ${options.voiceOrigin.replace(/^http/, "ws")}` : "connect-src 'self'",
    scriptNonce ? `script-src 'nonce-${scriptNonce}'${options.voiceOrigin ? " 'self' blob:" : ""}` : "",
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
    ? `<a class="btn ghost" href="${escape(playground)}/">Ouvrir Kairmel</a>`
    : contact ? `<a class="btn ghost" href="${escape(contact)}" rel="noopener">Accès bêta</a>` : "";
  return `<header class="top"><nav class="wrap" aria-label="Principale">
<a class="logo" href="/" aria-label="Kairmel, accueil">${MARK}${WORDMARK}</a>
<div class="links"><a href="/#modeles">Exemples</a><a href="/#comment">Comment ça marche</a><a href="/#tarifs">Tarifs</a><a href="/#api">API</a></div>
${cta}</nav></header>`;
}

/** A simple shop site: about 184,000 tokens once the agent has written and tested it. */
const BUILD_TOKENS = 184_000;

/** Voice-note waveform heights (px), fixed so the page renders the same everywhere. */
const WAVE = [8, 14, 22, 12, 26, 18, 10, 24, 30, 16, 9, 20, 28, 14, 22, 11, 18, 26, 12, 8, 16, 24, 20, 10, 14, 22, 18, 9, 12, 20];

/**
 * The hero's one moving moment: a WhatsApp voice note becomes a shop. The note plays, Kairmel asks
 * back, the shop card builds. Everything is visible at rest; the script only replays it.
 */
function thread(): string {
  const bars = WAVE.map((h, i) => `<i style="--h:${h}px;--k:${i}"></i>`).join("");
  return `<div class="thread reveal d2" id="thread" aria-label="Exemple : une note vocale devient une boutique" role="img">
  <div class="note"><span class="play">${icon.play}</span><span class="wave">${bars}</span><span class="dur">0:14</span></div>
  <div class="reply pop" style="--d:1.9">Compris : une boutique de bazin, prix en FCFA, commande sur WhatsApp. Je prépare le catalogue.</div>
  <div class="shop pop" style="--d:2.8">
    <div class="shop-img"></div>
    <div class="shop-h"><strong>Bazin Riche Médina</strong><span>prêt à publier</span></div>
    <div class="wa-btn pop" style="--d:3.5">Commander sur WhatsApp</div>
  </div>
</div>`;
}

const THREAD_SCRIPT = `
{
  const thread = document.getElementById("thread");
  if (thread && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const replay = () => { thread.classList.remove("run"); void thread.offsetWidth; thread.classList.add("run"); };
    replay();
    setInterval(replay, 9000);
  }
}`;

/**
 * "Comment ça marche" as a scroll story: on wide screens the section pins and scrolling moves the
 * panel from the chat, to the build, to the published site. Without script, or with reduced
 * motion, the three panels simply stack.
 */
function story(): string {
  const prods = [["Grand boubou", "25 000 F", "8%"], ["Ensemble brodé", "18 500 F", "46%"], ["Wax 6 yards", "12 000 F", "88%"]]
    .map(([name, price, x]) => `<div class="prod" style="--x:${x}"><b></b>${name}<em>${price}</em></div>`).join("");
  return `<section id="comment" class="story" data-step="0"><div class="wrap pin-box">
  <div>
    <p class="kicker">Comment ça marche</p>
    <h2>Un message, un build, un site en ligne.</h2>
    <ol class="beats">
      <li class="beat"><span class="num">01</span><div><h3>Décrire</h3><p>Dans Kairmel, avec vos mots, en français ou en wolof. L'agent demande ce qui manque : produits, prix, numéro.</p></div></li>
      <li class="beat"><span class="num">02</span><div><h3>Construire</h3><p>L'agent écrit et teste le code dans une sandbox. Vous voyez chaque fichier et chaque test.</p></div></li>
      <li class="beat"><span class="num">03</span><div><h3>Valider et publier</h3><p>Rien ne part en ligne sans votre accord. Vous payez les tokens utilisés, en FCFA, point.</p></div></li>
    </ol>
  </div>
  <div class="panels" aria-hidden="true">
    <div class="panel pa"><div class="pw">
      <div class="st-top"><i></i><i></i><i></i>&nbsp;playground · nouveau projet</div>
      <div class="chatx">
        <div class="cx me">Salam ! Je veux un site pour ma boutique de bazin, avec commande sur WhatsApp.</div>
        <div class="cx">Avec plaisir. Le nom de la boutique, et vos trois produits phares ?</div>
        <div class="cx me">Bazin Riche Médina. Grand boubou, ensemble brodé, wax 6 yards.</div>
        <div class="cx typing"><i></i><i></i><i></i></div>
      </div>
    </div></div>
    <div class="panel pb"><div class="pw">
      <div class="st-top"><i></i><i></i><i></i>&nbsp;sandbox · build</div>
      <div class="files"><span class="on">catalogue.ts</span><span>index.html</span><span>whatsapp.ts</span></div>
<pre class="code big"><span><span class="k">export const</span> catalogue = [</span><span>  { nom: <span class="s">"Grand boubou"</span>, prix: 25000 },</span><span>  { nom: <span class="s">"Ensemble brodé"</span>, prix: 18500 },</span><span>  { nom: <span class="s">"Wax 6 yards"</span>, prix: 12000 },</span><span>];</span><span> </span><span><span class="k">export const</span> commander = (p) =&gt;</span><span>  whatsapp(BOUTIQUE, <span class="s">"Je veux : "</span> + p.nom);</span></pre>
      <div class="checks"><span class="ok">✓ 12 tests OK</span><span>build 2,1 s</span><span>${num(BUILD_TOKENS)} tokens</span></div>
    </div></div>
    <div class="panel pc"><div class="pw">
      <div class="st-top"><i></i><i></i><i></i>&nbsp;aperçu · bazin-riche-medina<span class="meter"><b></b>prêt</span></div>
      <div class="mini"><div class="mini-h">Bazin Riche Médina<small>FR · WO</small></div><div class="prods">${prods}</div><div class="wa-btn">Commander sur WhatsApp</div></div>
      <div class="ship"><span>prêt à publier</span><b>Publier</b></div>
    </div></div>
  </div>
</div></section>`;
}

const PAGE_SCRIPT = `
{
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const story = document.querySelector(".story");
  if (story && !still) {
    const wide = matchMedia("(min-width: 900px)");
    let queued = false;
    const update = () => {
      queued = false;
      const box = story.getBoundingClientRect(), span = Math.max(1, box.height - innerHeight);
      const p = Math.min(1, Math.max(0, -box.top / span));
      story.style.setProperty("--p", p.toFixed(3));
      story.dataset.step = String(Math.min(2, Math.floor(p * 3)));
    };
    addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    const pin = () => { document.documentElement.classList.toggle("pin", wide.matches); update(); };
    addEventListener("resize", update);
    wide.addEventListener("change", pin);
    pin();
  }
  for (const tile of document.querySelectorAll(".tile")) {
    tile.addEventListener("pointermove", e => {
      const box = tile.getBoundingClientRect();
      tile.style.setProperty("--mx", (e.clientX - box.left) + "px");
      tile.style.setProperty("--my", (e.clientY - box.top) + "px");
    });
  }
}`;

const CALL_SCRIPT = `
{
  const talk = document.getElementById("talk"), sheet = document.getElementById("call"), host = document.getElementById("call-host");
  let close = null;
  const wait = text => { const p = document.createElement("p"); p.className = "call-wait"; p.textContent = text; host.replaceChildren(p); };
  const openCall = async idea => {
    sheet.showModal();
    if (close) return;
    if (!host.shadowRoot) wait("Connexion à Kairmel…");
    try {
      const call = await import("/voix/embed.js");
      host.replaceChildren();
      close = call.open(host, { onClose: () => sheet.close(), firstMessage: idea });
    } catch {
      wait("L'appel n'a pas pu démarrer. Réessayez dans un instant.");
    }
  };
  talk.addEventListener("click", () => openCall());
  for (const el of document.querySelectorAll("[data-idea]")) el.addEventListener("click", () => openCall(el.dataset.idea));
  sheet.addEventListener("close", () => { if (close) { close(); close = null; } });
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
  const band = ["Site e-commerce", "Bot WhatsApp", "Soundbox", "Dashboard", "Prépa live", "Balance connectée", "Firmware ESP32"]
    .map((word, i) => `<span${i % 2 ? ' class="o"' : ""}>${word}</span><i></i>`).join("");
  const marquee = band + band;
  const example = models.find(model => model.tier === "standard") ?? models[0]!;
  const live = new Set(models.map(model => model.id));
  // Every model is listed; those the current plan cannot serve yet are marked "bientôt" (and the API refuses them).
  const rows = MODELS.map(model => `<tr><td><code>${escape(model.id)}</code>${live.has(model.id) ? "" : ' <span class="soon">bientôt</span>'}</td><td>${TIER_LABEL[model.tier]}</td><td class="num">${num(model.inputXofPerMillion)}</td><td class="num">${num(model.outputXofPerMillion)}</td></tr>`).join("");
  // The product's voice call lives on kairmel.com now: when the builder origin is configured,
  // every idea goes there instead of the older call sheet.
  const voice = Boolean(env.VOICE) && !playground;
  const chips = IDEAS.map(idea =>
    `<button class="chip" type="button" data-prompt="${escape(idea.prompt)}" data-example="${escape(idea.example)}">${escape(idea.title)}</button>`).join("");
  const tiles = IDEAS.map(idea => {
    const inner = `<span class="tag">${escape(idea.tag)}</span><h3>${escape(idea.title)}</h3><p>${escape(idea.line)}</p>`;
    if (voice) return `<button class="tile" type="button" data-idea="${escape(idea.prompt)}">${inner}<span class="go">En parler ${icon.arrow}</span></button>`;
    return playground
      ? `<a class="tile" href="${escape(buildLink(playground, idea.prompt))}">${inner}<span class="go">Construire ${icon.arrow}</span></a>`
      : `<div class="tile">${inner}</div>`;
  }).join("");

  // With the call available, voice is the only way in: every idea on the page opens the call.
  const signIn = playground ? `<span class="alt">Déjà client ? <a href="${escape(playground)}/">Se connecter</a></span>`
    : contact ? `<span class="alt"><a href="${escape(contact)}" rel="noopener">Demander un accès bêta</a></span>`
    : `<span class="alt">Kairmel ouvre bientôt au public.</span>`;
  const actions = voice
    ? `<div class="actions reveal d3"><button class="talk" id="talk" type="button" aria-haspopup="dialog"><span class="ic">${icon.mic}</span>Parler à Kairmel</button>${signIn}</div>`
    : "";
  const saidLines: [string, string][] = [
    ["Mes commandes arrivent sur WhatsApp, aide-moi à les suivre.", "Bot WhatsApp"],
    ["Je veux vendre mes tissus en ligne, en FCFA.", "Site e-commerce"],
    ["Que ma boutique annonce chaque paiement reçu.", "Firmware Soundbox"],
  ];
  const said = saidLines.map(([line, what]) => voice
    ? `<button type="button" data-idea="${escape(line)}"><span>« ${escape(line)} »</span><b>→ ${escape(what)}</b></button>`
    : `<div><span>« ${escape(line)} »</span><b>→ ${escape(what)}</b></div>`).join("");
  const ask = voice ? "" : playground
    ? `<form class="ask reveal d3" method="get" action="${escape(playground)}/">
<label class="skip" for="prompt">Décrivez ce que vous voulez construire</label>
<textarea id="prompt" name="prompt" maxlength="${MAX_PROMPT}" required placeholder="Ex. : ${escape(IDEAS[0]!.example)}…"></textarea>
<div class="bar"><small>Kairmel s'ouvre avec votre idée. Un compte est nécessaire.</small><button class="btn accent" type="submit">Construire ${icon.arrow}</button></div>
</form>
<div class="chips reveal d4" role="group" aria-label="Idées pour commencer">${chips}</div>`
    : contact ? `<p class="reveal d3" style="margin-top:32px"><a class="btn accent" href="${escape(contact)}" rel="noopener">Demander un accès bêta</a></p>`
    : `<p class="reveal d3" style="margin-top:32px">Kairmel ouvre bientôt au public.</p>`;

  const body = `
${topNav(playground, contact)}
<main id="main">
<div class="wrap hero">
 <div>
  <span class="eyebrow reveal">Fait à Dakar · pour toute la zone UEMOA</span>
  <h1><span class="w"><span style="--i:0">De</span></span> <span class="w"><span style="--i:1">l'idée</span></span> <span class="w"><span style="--i:2">à</span></span> <span class="w"><span style="--i:3">l'outil</span></span> <span class="w wf"><span style="--i:4"><em class="waxtext">qui tourne.</em></span></span></h1>
  <p class="lede reveal d2">Parlez de votre idée, en français ou en wolof. Kairmel pose quelques questions, puis construit.</p>
  ${actions}
  ${ask}
 </div>
 ${thread()}
</div>
<div class="wrap"><div class="said-row reveal d4" role="group" aria-label="Ce que vous dites, ce que Kairmel construit">${said}</div></div>
${voice ? `<dialog class="call-sheet" id="call" aria-label="Appel avec Kairmel"><div id="call-host"></div></dialog>` : ""}

<section id="gens" style="padding-top:56px"><div class="wrap">
  <p class="kicker">Pour qui</p>
  <h2>Pour celles et ceux qui vendent déjà.</h2>
  <p class="sub">Couturières, commerçantes, vendeurs de rue : le travail se fait déjà sur WhatsApp et au marché. Kairmel part de là et en fait des outils, sans carte bancaire ni jargon.</p>
  <div class="people">
    <figure><img src="/img/market.webp" alt="Une commerçante trie des graines dans des paniers devant son étal." loading="lazy" width="1000" height="1153"><figcaption>Commerce de rue, Sénégal</figcaption></figure>
    <figure><img src="/img/wax.webp" alt="Des rouleaux de tissus wax aux motifs colorés empilés sur des étagères." loading="lazy" width="1400" height="786"><figcaption>Tissus wax</figcaption></figure>
    <figure><img src="/img/tailor.webp" alt="Une couturière coud un tissu wax orange et blanc à la machine." loading="lazy" width="1000" height="750"><figcaption>Couturière au Sénégal</figcaption></figure>
  </div>
</div></section>

<div class="marquee" aria-hidden="true"><div class="track">${marquee}</div></div>

<section id="modeles"><div class="wrap">
  <p class="kicker">Templates</p>
  <h2>Partez d'un template. Adaptez-le.</h2>
  <p class="sub">Chaque carte ouvre Kairmel avec un prompt déjà écrit. Vous le modifiez, l'agent pose ses questions, puis construit.</p>
  <div class="gallery">${tiles}</div>
  ${featuredLink ? `<p style="margin-top:22px"><a class="btn ghost" href="${escape(featuredLink)}">Ouvrir un template déjà construit : prépa live TikTok ${icon.arrow}</a></p>` : ""}
</div></section>

${story()}

<section id="objets"><div class="wrap split">
  <div>
    <p class="kicker">Objets connectés</p>
    <h2>Du prototype à l'objet fini.</h2>
    <p class="sub">Décrivez l'objet : Kairmel produit le firmware, le schéma de câblage et la liste des pièces, que vous relisez avant d'acheter quoi que ce soit. On fabrique seulement ce qui est commandé.</p>
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
  <p class="sub">Kairmel, les sites qu'il construit, vos objets et votre propre code passent par la même API. Une clé, un solde en FCFA, une facture. Si un modèle ne répond pas, un autre prend le relais, sauf si vous l'interdisez (<code>x-yaatal-no-failover</code>).</p>
  <figure class="flowfig"><svg class="api-flow" viewBox="0 0 720 360" role="img" aria-labelledby="af-title af-desc" xmlns="http://www.w3.org/2000/svg">
<title id="af-title">Comment fonctionne l'API Kairmel</title>
<desc id="af-desc">Votre app, un site Kairmel ou le constructeur appellent api.kairmel.com avec une seule clé. Chaque appel est payé sur un solde en FCFA, puis servi par un modèle du catalogue. Le solde se recharge depuis Kairmel, sur la fiche de paiement.</desc>
<style>
.api-flow{width:100%;height:auto;display:block;font-family:'Hanken Grotesk',ui-sans-serif,system-ui,sans-serif;color:inherit}
.api-flow .ln{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.api-flow .box{fill:none;stroke:currentColor;stroke-width:2}
.api-flow .box.card{fill:var(--af-paper,#f5f4f2)}
.api-flow .dash{stroke-dasharray:2 7}
.api-flow .flow{stroke-dasharray:7 9;animation:af-flow 2.4s linear infinite}
.api-flow .ink{fill:currentColor}
.api-flow .on-ink{fill:var(--af-paper,#f5f4f2)}
.api-flow .lbl{fill:currentColor;font-size:15px;font-weight:600}
.api-flow .sub{fill:var(--af-muted,#6e6866);font-size:12.5px}
.api-flow .mono{font-family:'Departure Mono',ui-monospace,monospace;font-size:12px;letter-spacing:.02em}
@keyframes af-flow{to{stroke-dashoffset:-32}}
@media (prefers-reduced-motion:reduce){.api-flow .flow{animation:none}}
</style>
<g>
  <rect class="box" x="20" y="30" width="190" height="56" rx="14"/>
  <rect class="box" x="36" y="47" width="18" height="22" rx="5"/><path class="ln" d="M42 52v12M48 52v12"/>
  <text class="lbl" x="66" y="56">Votre app</text><text class="sub" x="66" y="74">ou votre serveur</text>
  <rect class="box" x="20" y="104" width="190" height="56" rx="14"/>
  <rect class="box" x="36" y="121" width="18" height="22" rx="5"/><path class="ln" d="M42 126v12M48 126v12"/>
  <text class="lbl" x="66" y="130">Un site Kairmel</text><text class="sub" x="66" y="148">construit avec vous</text>
  <rect class="box" x="20" y="178" width="190" height="56" rx="14"/>
  <rect class="box" x="36" y="195" width="18" height="22" rx="5"/><path class="ln" d="M42 200v12M48 200v12"/>
  <text class="lbl" x="66" y="204">Le constructeur</text><text class="sub" x="66" y="222">Kairmel lui-même</text>
</g>
<path class="ln flow" d="M210 58C252 58 254 110 290 124"/>
<path class="ln flow" d="M210 132H290"/>
<path class="ln flow" d="M210 206C252 206 254 154 290 140"/>
<g>
  <rect class="ink" x="290" y="46" width="150" height="160" rx="36"/>
  <rect class="on-ink" x="324" y="86" width="20" height="80" rx="10"/>
  <rect class="on-ink" x="386" y="86" width="20" height="80" rx="10"/>
  <text class="lbl mono" x="365" y="230" text-anchor="middle">api.kairmel.com</text>
  <text class="sub" x="365" y="248" text-anchor="middle">une clé, compatible OpenAI</text>
  <rect class="ink" x="290" y="268" width="150" height="34" rx="17"/>
  <text class="on-ink mono" x="365" y="290" text-anchor="middle">Solde · FCFA</text>
</g>
<path class="ln flow" d="M440 126H520"/>
<g>
  <rect class="box" x="548" y="42" width="152" height="150" rx="16" opacity=".35"/>
  <rect class="box" x="534" y="56" width="152" height="150" rx="16" opacity=".6"/>
  <rect class="box card" x="520" y="70" width="152" height="150" rx="16"/>
  <text class="lbl" x="538" y="102">Catalogue</text>
  <text class="sub" x="538" y="120">de modèles</text>
  <path class="ln" d="M538 140h96M538 156h76M538 172h86" opacity=".45"/>
  <text class="sub mono" x="538" y="200">/v1/models</text>
</g>
<g>
  <rect class="box dash" x="20" y="268" width="190" height="56" rx="14"/>
  <text class="lbl" x="38" y="292">Recharger</text><text class="sub" x="38" y="310">sur la fiche de paiement</text>
</g>
<path class="ln dash" d="M210 290H282"/><path class="ln" d="M276 284l8 6-8 6"/>
<text class="sub" x="474" y="290">Un appel qui échoue</text><text class="sub" x="474" y="306">n'est pas facturé.</text>
</svg></figure>
  <div class="tabs">
    <input type="radio" name="t" id="t1" checked><label for="t1">curl</label>
    <input type="radio" name="t" id="t2"><label for="t2">JavaScript</label>
    <input type="radio" name="t" id="t3"><label for="t3">Python</label>
<pre class="p1">curl ${escape(origin)}/v1/chat/completions \\
  -H "Authorization: Bearer VOTRE_CLE_KAIRMEL" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${escape(example.id)}", "messages": [{"role": "user", "content": "Salaam!"}]}'</pre>
<pre class="p2">import OpenAI from "openai";

const kairmel = new OpenAI({ baseURL: "${escape(origin)}/v1", apiKey: process.env.KAIRMEL_API_KEY });
const reply = await kairmel.chat.completions.create({
  model: "${escape(example.id)}",
  messages: [{ role: "user", content: "Salaam!" }],
});</pre>
<pre class="p3">import os
from openai import OpenAI

kairmel = OpenAI(base_url="${escape(origin)}/v1", api_key=os.environ["KAIRMEL_API_KEY"])
reply = kairmel.chat.completions.create(
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
      <p class="sub" style="margin-bottom:0">Recharger Kairmel, c'est comme acheter du crédit au coin de la rue. Le prix se compte en tokens (les bouts de texte que le modèle lit et écrit), et un appel qui échoue n'est pas facturé. Les recharges se font depuis Kairmel (Ventes, puis Recharger), sur la fiche de paiement.</p>
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
    <div class="card"><h3>Combien de temps sont-elles gardées ?</h3><p>Kairmel ne garde ni vos prompts ni les réponses.</p></div>
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
    ${playground ? `<a class="btn accent" href="${escape(playground)}/">Créer un compte</a>` : ""}
    ${contact ? `<a class="btn ghost" href="${escape(contact)}" rel="noopener">Parler à l'équipe sur WhatsApp</a>` : ""}
  </div>
</div></section>
</main>
<footer class="wrap"><span>Kairmel, un service de Yaatal · Dakar</span><span><a href="/usage">Consommation</a> · <a href="/v1/models">Modèles</a> · Bêta</span>
<p class="credits">Photos, Wikimedia Commons : Sanghesenegalafrica (CC BY-SA 4.0), Lucas Takerkart (CC BY-SA 4.0), dimworld (CC BY 2.0), GuillaumeG (CC BY-SA 4.0).</p></footer>`;

  const script = THREAD_SCRIPT + PAGE_SCRIPT + (voice ? CALL_SCRIPT : "") + (playground ? `
const box = document.getElementById("prompt");
for (const chip of document.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => { box.value = chip.dataset.prompt; box.focus(); });
}
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const ideas = [...document.querySelectorAll(".chip")].map(c => "Ex. : " + c.dataset.example + "…");
  let i = 0;
  setInterval(() => { if (!box.value && document.activeElement !== box) { i = (i + 1) % ideas.length; box.placeholder = ideas[i]; } }, 4000);
}` : "");

  return page("Kairmel · De l'idée à l'outil qui tourne. Facturé en FCFA.", body, {
    script,
    voiceOrigin: voice ? origin : undefined,
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
  const h = document.createElement("h2"); h.textContent = money(data.balance_xof); out.appendChild(h);
  const table = document.createElement("table"), head = document.createElement("tr");
  for (const t of ["Date", "Opération", "Modèle", "Tokens", "Montant"]) { const th = document.createElement("th"); th.textContent = t; head.appendChild(th); }
  table.appendChild(head);
  for (const r of data.recent) {
    const tr = document.createElement("tr");
    cell(tr, new Date(r.at).toLocaleString("fr-FR"));
    cell(tr, r.kind === "credit" ? "Recharge" : "Consommation" + (r.estimated ? " (estimée)" : ""));
    cell(tr, r.model ?? "—");
    cell(tr, r.kind === "usage" ? String((r.input_tokens ?? 0) + (r.output_tokens ?? 0)) : "—", "num");
    cell(tr, money(r.amount_xof), "num");
    table.appendChild(tr);
  }
  const wrap = document.createElement("div"); wrap.className = "table-wrap"; wrap.appendChild(table); out.appendChild(wrap);
});`;
  const body = `${topNav(playgroundOrigin(request, env), whatsappLink(env))}
<main id="main" class="wrap" style="padding-top:56px;padding-bottom:88px;max-width:860px">
<p class="kicker">Consommation</p>
<h2>Votre solde en FCFA</h2>
<p class="sub">Collez votre clé API pour voir votre solde et vos derniers appels. Elle n'est ni enregistrée ni envoyée ailleurs.</p>
<form id="f" class="row"><input id="k" type="password" autocomplete="off" placeholder="yk_…" required aria-label="Clé API Kairmel"><button class="btn accent" type="submit">Voir</button></form>
<div id="out" aria-live="polite"></div>
</main>`;
  return page("Kairmel · Consommation", body, { script });
}
