// The customer-facing pages: what Yaatal API sells, at what price, how to start, what happens to
// data, and a usage page. Prices are rendered from the model catalog so the page cannot drift from
// what the gateway bills. No supplier or upstream model name ever appears here.
import { MODELS } from "./models.js";

export interface SiteEnv {
  /** International number, digits only (e.g. 221770000000). Without it the access button is hidden. */
  CONTACT_WHATSAPP?: string;
}

const TIER_LABEL = { micro: "Micro", standard: "Standard", reasoning: "Raisonnement" } as const;

function escape(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const fcfa = (value: number) => new Intl.NumberFormat("fr-FR").format(value).replace(/ | /g, " ");

function whatsappLink(env: SiteEnv): string | null {
  const number = env.CONTACT_WHATSAPP?.trim();
  if (!number || !/^[1-9][0-9]{7,14}$/.test(number)) return null;
  const text = encodeURIComponent("Bonjour, je souhaite un accès bêta à Yaatal API.");
  return `https://wa.me/${number}?text=${text}`;
}

function nonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function page(title: string, body: string, scriptNonce?: string, script = ""): Response {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="Yaatal API : une clé, plusieurs modèles d'IA, facturé en FCFA.">
<style>
:root{--bg:#fbfaf8;--fg:#1c1b19;--muted:#6b675f;--line:#e6e2da;--card:#fff;--accent:#e85a25;--code:#f3f0ea}
@media (prefers-color-scheme:dark){:root{--bg:#141312;--fg:#f2efe9;--muted:#a39e94;--line:#2c2a27;--card:#1c1b19;--code:#24221f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:880px;margin:0 auto;padding:40px 16px 64px}
h1{font-size:clamp(1.8rem,5vw,2.6rem);line-height:1.15;margin:0 0 12px}h2{margin:40px 0 12px;font-size:1.25rem}
p{margin:0 0 12px}.muted{color:var(--muted)}a{color:var(--accent)}
.btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;border:0;cursor:pointer;font-size:1rem}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);font-size:.95rem}th{color:var(--muted);font-weight:600}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
pre{background:var(--code);padding:14px;border-radius:10px;overflow-x:auto;font-size:.85rem}
ul{padding-left:20px}li{margin:4px 0}.table-wrap{overflow-x:auto}
input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg);font:inherit}
.row{display:flex;gap:8px;margin:12px 0}.row input{flex:1}
</style>
</head>
<body><main>${body}</main>${script ? `<script nonce="${scriptNonce}">${script}</script>` : ""}</body>
</html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy":
        `default-src 'none'; style-src 'unsafe-inline'; connect-src 'self'; ${scriptNonce ? `script-src 'nonce-${scriptNonce}'; ` : ""}base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

export function home(request: Request, env: SiteEnv): Response {
  const origin = new URL(request.url).origin;
  const contact = whatsappLink(env);
  const rows = MODELS.map(model => `<tr>
    <td><code>${escape(model.id)}</code></td><td>${TIER_LABEL[model.tier]}</td>
    <td class="num">${fcfa(model.inputFcfaPerMillion)}</td><td class="num">${fcfa(model.outputFcfaPerMillion)}</td></tr>`).join("");
  const example = MODELS.find(model => model.tier === "standard") ?? MODELS[0]!;
  return page("Yaatal API — l'IA facturée en FCFA", `
<h1>Une clé. Plusieurs modèles d'IA.<br>Facturé en FCFA.</h1>
<p class="muted">Yaatal API est compatible OpenAI : changez une ligne dans votre code, gardez vos outils.
Rechargez votre solde en FCFA, sans carte bancaire internationale.</p>
${contact ? `<p><a class="btn" href="${escape(contact)}" rel="noopener">Demander un accès bêta sur WhatsApp</a></p>` : ""}

<h2>Tarifs</h2>
<div class="table-wrap"><table>
<thead><tr><th>Modèle</th><th>Gamme</th><th class="num">Entrée (FCFA / 1M jetons)</th><th class="num">Sortie (FCFA / 1M jetons)</th></tr></thead>
<tbody>${rows}</tbody></table></div>
<p class="muted">Vous payez les jetons consommés, décomptés à l'appel. Un appel qui échoue n'est pas facturé.</p>

<h2>Démarrer</h2>
<pre>curl ${escape(origin)}/v1/chat/completions \\
  -H "Authorization: Bearer VOTRE_CLE_YAATAL" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${escape(example.id)}", "messages": [{"role": "user", "content": "Salaam!"}]}'</pre>
<p class="muted">Avec un SDK OpenAI, indiquez <code>${escape(origin)}/v1</code> comme URL de base et votre clé Yaatal.
Liste des modèles : <a href="/v1/models">/v1/models</a>. Suivi du solde : <a href="/usage">/usage</a>.</p>

<h2>Vos données</h2>
<ul>
<li><strong>Où sont-elles traitées ?</strong> Par le fournisseur de calcul du modèle choisi, le temps de la réponse.</li>
<li><strong>Combien de temps sont-elles gardées ?</strong> Yaatal ne conserve ni vos requêtes ni les réponses.</li>
<li><strong>Sont-elles journalisées ?</strong> Nous gardons seulement le décompte : modèle, jetons, montant, date.</li>
<li><strong>Peut-on les supprimer ?</strong> Oui : sur demande, votre compte et son historique de consommation.</li>
</ul>
<p class="muted">Seul le contenu de votre requête part chez le fournisseur de calcul : jamais votre clé ni l'identifiant de votre compte. Évitez d'y mettre des données personnelles sensibles. Bêta : conditions détaillées sur demande.</p>
`);
}

export function usage(): Response {
  const scriptNonce = nonce();
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
  const h = document.createElement("h2"); h.textContent = "Solde : " + money(data.balance_fcfa); out.appendChild(h);
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
  return page("Yaatal API — Consommation", `
<h1>Consommation</h1>
<p class="muted">Collez votre clé pour voir votre solde et vos derniers appels. La clé n'est ni enregistrée ni envoyée ailleurs.</p>
<form id="f" class="row"><input id="k" type="password" autocomplete="off" placeholder="yk_…" required aria-label="Clé Yaatal"><button class="btn" type="submit">Voir</button></form>
<div id="out" aria-live="polite"></div>
<p><a href="/">← Yaatal API</a></p>`, scriptNonce, script);
}
