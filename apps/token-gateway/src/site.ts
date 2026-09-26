// The customer-facing pages. The landing page sells one thing: build anything, from a merchant's
// website to a device's firmware, on one AI API billed in FCFA. Every idea goes straight to the
// Playground (the Yaatal OS) through its `/?prompt=` deep link. Prices are rendered from the model
// catalog so the page cannot drift from billing. No supplier or upstream model name appears here.
import { MODELS } from "./models.js";

export interface SiteEnv {
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
const TIER_LABEL = { micro: "Micro", standard: "Standard", reasoning: "Raisonnement" } as const;

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
    title: "Site marchand en marque blanche",
    line: "Catalogue, prix en FCFA, commande sur WhatsApp.",
    example: "un site pour ma boutique de bazin, avec commande sur WhatsApp",
    prompt:
      "Construis un site vitrine en marque blanche pour une boutique de Dakar : catalogue avec photos et prix en FCFA, bouton « Commander sur WhatsApp », en français et en wolof. Demande-moi d'abord le nom de la boutique et mes produits.",
  },
  {
    tag: "Outil · Live",
    title: "Fiche de préparation live",
    line: "Trier les produits et l'ordre de passage avant le direct.",
    example: "une fiche pour préparer mon live TikTok de ce soir",
    prompt:
      "Construis une fiche de préparation pour une vente en direct sur TikTok ou WhatsApp : je colle mes produits (nom, prix en FCFA, stock), tu les tries, signales les ruptures et proposes l'ordre de passage. N'invente aucun prix ni aucun stock.",
  },
  {
    tag: "WhatsApp · Clients",
    title: "Assistant WhatsApp",
    line: "Répond depuis votre catalogue, vous validez les commandes.",
    example: "un assistant qui répond à mes clients en wolof",
    prompt:
      "Crée un assistant qui répond aux questions de mes clients sur WhatsApp à partir de mon catalogue, en français et en wolof, et me transmet les commandes pour validation. Il ne prend jamais de paiement lui-même.",
  },
  {
    tag: "Données · Ventes",
    title: "Tableau de bord des ventes",
    line: "Du fichier CSV aux décisions du jour.",
    example: "un tableau de bord de mes ventes de la semaine",
    prompt:
      "Transforme un export de mes ventes (CSV que je vais coller) en tableau de bord : chiffre du jour, meilleurs produits, stocks à réapprovisionner et trois recommandations concrètes.",
  },
  {
    tag: "ESP32 · Paiements",
    title: "Boîtier qui annonce les paiements",
    line: "Firmware, schéma de câblage et composants.",
    example: "le firmware d'un boîtier qui annonce les paiements reçus",
    prompt:
      "Conçois un boîtier ESP32-S3 qui annonce à voix haute, en wolof et en français, les paiements reçus. Donne le firmware, le schéma de câblage et la liste des composants (BOM) avec un prix indicatif par pièce. Prototype virtuel uniquement.",
  },
  {
    tag: "ESP32 · Stock",
    title: "Balance connectée pour le stock",
    line: "Pèse, compte et prévient quand il faut recommander.",
    example: "une balance connectée qui suit mon stock de riz",
    prompt:
      "Conçois une balance connectée à base d'ESP32 et de capteur HX711 qui suit le stock d'un produit vendu au poids (riz, sucre) et envoie une alerte quand il passe sous un seuil. Donne le firmware, le câblage et la liste des composants. Prototype virtuel uniquement.",
  },
];

const FAQ: readonly [string, string][] = [
  ["C'est quoi, Yaatal ?",
    "Un espace où des agents d'IA construisent avec vous des sites, des outils, des assistants et des prototypes d'objets connectés. Tout ce qui est construit utilise la même API d'IA, que vous payez en FCFA."],
  ["Faut-il savoir coder ?",
    "Non. Vous décrivez ce que vous voulez en français ; l'agent pose ses questions, construit, et vous montre le résultat. Chaque changement attend votre accord avant d'être appliqué. Si vous codez, tout reste modifiable."],
  ["Comment je paie ?",
    "À la consommation, en FCFA, sans carte bancaire internationale. Vous rechargez un solde ; chaque appel d'IA en déduit le prix affiché dans les tarifs. Pendant la bêta, les recharges se font avec notre équipe."],
  ["Et pour les objets, vous fabriquez ?",
    "Le Playground produit le firmware, le schéma de câblage et la liste des composants, que vous relisez avant tout achat. La fabrication se fait sur commande, avec nos partenaires : impression 3D, fournisseurs de composants, conseil technique."],
  ["Puis-je utiliser l'API dans mon propre code ?",
    "Oui. L'API Yaatal est compatible OpenAI : vous changez l'adresse et la clé, votre code et vos SDK restent les mêmes."],
  ["Que devient ce que j'envoie ?",
    "Yaatal ne garde ni vos requêtes ni les réponses. Nous gardons le décompte (modèle, jetons, montant, date), et nous supprimons votre compte et cet historique sur demande."],
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
.mark{width:28px;height:28px;border-radius:8px;background:var(--deep);display:grid;place-items:center}
.mark span{display:block;width:16px;height:3px;border-radius:2px;background:var(--accent);box-shadow:0 6px 0 #f3dcc0,0 -6px 0 #f3dcc0}
.links{display:flex;gap:26px;font-size:.95rem;color:var(--muted)}.links a{text-decoration:none;padding:10px 0}.links a:hover{color:var(--ink)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;background:var(--ink);color:var(--paper);border:0;border-radius:12px;padding:10px 18px;font:600 .98rem "Instrument Sans",sans-serif;text-decoration:none;cursor:pointer;transition:background-color .2s,color .2s,border-color .2s}
.btn:hover{background:var(--accent-strong);color:#fff}.btn.accent{background:var(--accent-strong);color:#fff}.btn.accent:hover{background:var(--ink);color:var(--paper)}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}.btn.ghost:hover{border-color:var(--ink);background:transparent;color:var(--ink)}
.hero{text-align:center;padding-top:72px;padding-bottom:56px}
h1{font-size:clamp(2.4rem,6vw,4.4rem);line-height:1.02;margin:0 auto 18px;max-width:14ch}
h1 em{font-style:normal;color:var(--accent-strong)}
.lede{font-size:1.15rem;color:var(--muted);max-width:40rem;margin:0 auto}
.ask{max-width:780px;margin:36px auto 0;background:var(--card);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow);text-align:left;overflow:hidden}
.ask textarea{display:block;width:100%;min-height:132px;resize:vertical;border:0;background:transparent;color:var(--ink);font:1.08rem/1.55 "Instrument Sans",sans-serif;padding:20px 22px;outline:none}
.ask textarea::placeholder{color:color-mix(in srgb,var(--muted) 75%,transparent)}
.ask .bar{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid var(--line);padding:12px 12px 12px 22px;background:var(--paper-2)}
.ask small{color:var(--muted);font-size:.88rem}
.chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:18px auto 0;max-width:820px}
.chip{min-height:40px;background:transparent;border:1px solid var(--line);color:var(--ink);border-radius:999px;padding:8px 14px;font:500 .9rem "Instrument Sans",sans-serif;cursor:pointer;transition:border-color .2s,background-color .2s}
.chip:hover{border-color:var(--accent);background:var(--card)}
.trust{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 28px;margin-top:36px;color:var(--muted);font-size:.92rem}
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
@media (prefers-reduced-motion:reduce){.reveal{animation:none}html{scroll-behavior:auto}*{transition:none!important}}
@media (max-width:900px){.gallery{grid-template-columns:1fr 1fr}.flow,.split{grid-template-columns:1fr}.links{display:none}.band{padding:28px}}
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

function topNav(playground: string | null, contact: string | null): string {
  const cta = playground
    ? `<a class="btn" href="${escape(playground)}/">Ouvrir le Playground</a>`
    : contact ? `<a class="btn" href="${escape(contact)}" rel="noopener">Accès bêta</a>` : "";
  return `<header class="top"><nav class="wrap" aria-label="Principale">
<a class="logo" href="/"><span class="mark" aria-hidden="true"><span></span></span>Yaatal</a>
<div class="links"><a href="/#modeles">Modèles</a><a href="/#comment">Comment ça marche</a><a href="/#objets">Objets</a><a href="/#api">API</a><a href="/#tarifs">Tarifs</a></div>
${cta}</nav></header>`;
}

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
  const example = MODELS.find(model => model.tier === "standard") ?? MODELS[0]!;
  const rows = MODELS.map(model => `<tr><td><code>${escape(model.id)}</code></td><td>${TIER_LABEL[model.tier]}</td><td class="num">${fcfa(model.inputFcfaPerMillion)}</td><td class="num">${fcfa(model.outputFcfaPerMillion)}</td></tr>`).join("");
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
  <h1 class="reveal d1">De l'idée à l'outil <em>qui tourne</em>.</h1>
  <p class="lede reveal d2">Site marchand, assistant WhatsApp, tableau de bord ou boîtier ESP32 : décrivez-le, Yaatal le construit avec vous. Chaque appel d'IA se paie en FCFA.</p>
  ${ask}
  <div class="trust reveal d4"><span><i></i>Français et wolof</span><span><i></i>Paiement en FCFA, sans carte internationale</span><span><i></i>API compatible OpenAI</span></div>
</div>

<section id="modeles"><div class="wrap">
  <p class="kicker">Modèles</p>
  <h2>Choisissez un point de départ. Adaptez-le.</h2>
  <p class="sub">Chaque carte ouvre le Playground avec une consigne déjà écrite. Vous la modifiez, l'agent pose ses questions, puis construit.</p>
  <div class="gallery">${tiles}</div>
  ${featuredLink ? `<p style="margin-top:22px"><a class="btn ghost" href="${escape(featuredLink)}">Ouvrir un modèle déjà construit : fiche de préparation live ${icon.arrow}</a></p>` : ""}
</div></section>

<section id="comment"><div class="wrap flow">
  <div>
    <p class="kicker">Comment ça marche</p>
    <h2>Décrire. Construire. Publier.</h2>
    <div class="steps">
      <div class="step"><span class="ic">${icon.chat}</span><div><h3>Décrire</h3><p>En français, avec vos mots. L'agent demande ce qui manque : vos produits, vos prix, votre numéro.</p></div></div>
      <div class="step"><span class="ic">${icon.build}</span><div><h3>Construire</h3><p>L'agent écrit et teste le code dans un espace isolé. Vous voyez le résultat en direct.</p></div></div>
      <div class="step"><span class="ic">${icon.check}</span><div><h3>Valider et publier</h3><p>Aucun changement n'est appliqué sans votre accord. Ensuite, vous le partagez ou le gardez comme modèle.</p></div></div>
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
    <h2>Du prototype au boîtier.</h2>
    <p class="sub">Décrivez l'objet : le Playground produit le firmware, le schéma de câblage et la liste des composants, que vous relisez avant d'acheter quoi que ce soit. On fabrique seulement ce qui est commandé.</p>
    <div class="boards" aria-label="Cartes courantes"><span>ESP32-S3</span><span>ESP32</span><span>Raspberry Pi Pico</span><span>Arduino</span><span>STM32</span></div>
  </div>
  <div class="partners">
    <div class="partner"><span class="ic">${icon.chip}</span><div><h3>Composants</h3><p>La liste des pièces avec des prix indicatifs, pour commander chez nos fournisseurs.</p></div></div>
    <div class="partner"><span class="ic">${icon.build}</span><div><h3>Boîtier en impression 3D</h3><p>Le boîtier est imprimé par un atelier partenaire, sur commande.</p></div></div>
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
  <h2>Vous payez ce que vous consommez, en FCFA.</h2>
  <p class="sub">Le prix se compte en jetons, les morceaux de texte que le modèle lit et écrit. Un appel qui échoue n'est pas facturé. Pendant la bêta, les recharges se font avec notre équipe.</p>
  <div class="table-wrap"><table>
    <thead><tr><th>Modèle</th><th>Gamme</th><th class="num">Entrée · FCFA / 1M jetons</th><th class="num">Sortie · FCFA / 1M jetons</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
  <p class="sub" style="margin-top:16px;margin-bottom:0">Liste à jour : <a href="/v1/models">/v1/models</a> · Votre solde : <a href="/usage">/usage</a></p>
</div></section>

<section id="donnees"><div class="wrap">
  <p class="kicker">Données</p>
  <h2>Les quatre questions qu'on nous pose.</h2>
  <div class="qa">
    <div class="card"><h3>Où sont-elles traitées ?</h3><p>Par le fournisseur de calcul du modèle choisi, le temps de produire la réponse.</p></div>
    <div class="card"><h3>Combien de temps sont-elles gardées ?</h3><p>Yaatal ne conserve ni vos requêtes ni les réponses.</p></div>
    <div class="card"><h3>Sont-elles journalisées ?</h3><p>Nous gardons seulement le décompte : modèle, jetons, montant, date.</p></div>
    <div class="card"><h3>Peut-on les supprimer ?</h3><p>Oui : sur demande, votre compte et son historique de consommation.</p></div>
  </div>
  <p class="sub" style="margin-top:18px;margin-bottom:0">Seul le contenu de votre requête part chez le fournisseur de calcul, jamais votre clé ni l'identifiant de votre compte. Évitez d'y mettre des données personnelles sensibles.</p>
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
<footer class="wrap"><span>© Yaatal · Dakar</span><span><a href="/usage">Consommation</a> · <a href="/v1/models">Modèles</a> · Bêta</span></footer>`;

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
  if (!res.ok) { out.textContent = res.status === 401 ? "Clé invalide." : "Erreur " + res.status + "."; return; }
  const data = await res.json(); out.textContent = "";
  const h = document.createElement("h2"); h.textContent = money(data.balance_fcfa); out.appendChild(h);
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
  const body = `${topNav(playgroundOrigin(request, env), whatsappLink(env))}
<main id="main" class="wrap" style="padding-top:56px;padding-bottom:88px;max-width:860px">
<p class="kicker">Consommation</p>
<h2>Votre solde en FCFA</h2>
<p class="sub">Collez votre clé pour voir votre solde et vos derniers appels. La clé n'est ni enregistrée ni envoyée ailleurs.</p>
<form id="f" class="row"><input id="k" type="password" autocomplete="off" placeholder="yk_…" required aria-label="Clé Yaatal"><button class="btn accent" type="submit">Voir</button></form>
<div id="out" aria-live="polite"></div>
</main>`;
  return page("Yaatal · Consommation", body, { script });
}
