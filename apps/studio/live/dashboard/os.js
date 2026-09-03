/* Dedicated embedded SELL surface. Standalone Studio remains available at /. */
const CATALOG_URL = '/api/studio/product-queue';
const SESSION_URL = '/api/studio/operator/session';
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const params = new URLSearchParams(location.search);
let theme = params.get('theme') === 'dark' ? 'dark' : 'light';
let products = [];
let selected = null;
let live = false;
let startedAt = 0;
let timer = 0;
let operatorAuthenticated = false;
let toastTimer = 0;
let socket = null;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
const safeImage = (value) => { try { const url = new URL(String(value || ''), location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
const price = (product) => product?.price_display || `${Number(product?.price_fcfa ?? product?.price_cents ?? 0).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} FCFA`;

function applyTheme(next) {
  theme = next === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
}

function notify(text) {
  const root = $('#toast');
  root.textContent = text;
  root.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => root.classList.remove('show'), 2600);
}

function activity(title, detail) {
  const item = document.createElement('li');
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  item.innerHTML = `<strong>${escapeHtml(title)}</strong>${escapeHtml(detail)}<time>${time}</time>`;
  $('#activity').prepend(item);
  while ($('#activity').children.length > 5) $('#activity').lastElementChild.remove();
}

function postProduct(product) {
  const productId = String(product?.id ?? '').trim();
  if (!ID_PATTERN.test(productId) || window.parent === window) return;
  window.parent.postMessage({ version: 'yaatal-os.v1', kind: 'product-navigation', productId, source: 'studio' }, '*');
}

function selectProduct(product, announce = true) {
  selected = product;
  const image = safeImage(product?.images?.[0] || product?.image_url || product?.thumbnail);
  $('#preview').style.backgroundImage = image ? `url(${JSON.stringify(image)})` : '';
  $('#previewName').textContent = product?.name || 'Choose a product below';
  $('#previewPrice').textContent = product ? price(product) : '— FCFA';
  $('#previewCategory').textContent = product?.category || 'Product preview';
  document.querySelectorAll('.product').forEach((card) => card.classList.toggle('active', card.dataset.id === String(product?.id)));
  if (announce) {
    activity('Product selected', `${product.name} is ready for the live overlay.`);
    postProduct(product);
  }
}

function renderProducts() {
  const root = $('#products');
  root.innerHTML = products.slice(0, 3).map((product) => {
    const image = safeImage(product.images?.[0] || product.image_url || product.thumbnail);
    return `<button class="product" type="button" data-id="${escapeHtml(product.id)}">
      <span class="product-image" style="background-image:url(${JSON.stringify(image)})"></span>
      <span class="product-copy"><em>${product.stock_status === 'low_stock' ? 'Low stock' : 'Available'}</em><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(price(product))}</span></span>
    </button>`;
  }).join('');
  root.querySelectorAll('.product').forEach((card) => card.addEventListener('click', () => {
    const product = products.find((item) => String(item.id) === card.dataset.id);
    if (product) selectProduct(product);
  }));
  $('#catalogState').textContent = `${products.length} available`;
}

// ── Views: Live / Catalog / Media / Insights ──────────────────────
let currentView = 'live';

function switchView(view) {
  if (!['live', 'catalog', 'media', 'insights'].includes(view)) return;
  currentView = view;
  document.querySelectorAll('.view-tab').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  document.querySelectorAll('[data-view-panel]').forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== view; });
  // UXR-03: the Live Assistant panel is a Live-view element per the approved
  // reference; other views get the full width.
  const assistant = document.querySelector('.assistant-panel');
  if (assistant) assistant.hidden = view !== 'live';
  if (view === 'catalog') renderCatalogGrid();
  if (view === 'media') renderMediaGrid();
  if (view === 'insights') loadInsights();
}

function renderCatalogGrid() {
  const root = $('#catalogGrid');
  if (!root || root.dataset.rendered === String(products.length)) return;
  root.dataset.rendered = String(products.length);
  root.innerHTML = products.map((product) => {
    const image = safeImage(product.images?.[0] || product.image_url || product.thumbnail);
    const stock = product.stock_status === 'low_stock' ? '<em class="low">Low stock</em>' : '<em>Available</em>';
    return `<button class="catalog-card" type="button" data-id="${escapeHtml(product.id)}">
      <span class="catalog-image" style="background-image:url(${JSON.stringify(image)})"></span>
      <span class="catalog-copy">${stock}<strong>${escapeHtml(product.name)}</strong>
        <span>${escapeHtml(product.category || '')}</span><span class="catalog-price">${escapeHtml(price(product))}</span></span>
    </button>`;
  }).join('');
  root.querySelectorAll('.catalog-card').forEach((card) => card.addEventListener('click', () => {
    const product = products.find((item) => String(item.id) === card.dataset.id);
    if (!product) return;
    switchView('live');
    selectProduct(product);
  }));
  $('#catalogSource').textContent = `${products.length} products · ${lastCatalogSource || 'studio context'}`;
}

const MEDIA_LIBRARY = [
  { src: '/dashboard/img/bazin_robe.png', title: 'Robe Bazin — editorial', tag: 'Fashion' },
  { src: '/dashboard/img/leather_bag.png', title: 'Sac en cuir — atelier', tag: 'Leather' },
  { src: '/dashboard/img/gold_earrings.png', title: 'Sablé gold — macro', tag: 'Jewelry' },
  { src: '/dashboard/img/bissap.png', title: 'Bissap — bouteille', tag: 'Drinks' },
  { src: '/dashboard/img/thiote_mat.png', title: 'Tapis thiote — texture', tag: 'Decor' },
  { src: '/dashboard/img/smartphone.png', title: 'Smartphone — studio', tag: 'Tech' },
];

function renderMediaGrid() {
  const root = $('#mediaGrid');
  if (!root || root.dataset.rendered === '1') return;
  root.dataset.rendered = '1';
  root.innerHTML = MEDIA_LIBRARY.map((item) => `
    <figure class="media-card">
      <img src="${item.src}" alt="${escapeHtml(item.title)}" loading="lazy">
      <figcaption><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.tag)} · demo visual</span></figcaption>
    </figure>`).join('');
}

let lastCatalogSource = '';

async function loadInsights() {
  const count = $('#conversionCount');
  const list = $('#conversionList');
  const empty = $('#insightEmpty');
  count.textContent = '…';
  try {
    const response = await fetch('/api/studio/poc/conversions', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (response.status === 401 || response.status === 403) {
      count.textContent = '—';
      list.hidden = true; empty.hidden = false;
      empty.textContent = 'Unlock the operator session to read conversion receipts.';
      return;
    }
    if (!response.ok) throw new Error(String(response.status));
    const payload = await response.json();
    const rows = Array.isArray(payload.conversions) ? payload.conversions : [];
    count.textContent = String(payload.count ?? rows.length);
    empty.hidden = rows.length > 0;
    list.innerHTML = rows.slice(0, 8).map((row) => {
      const channel = row.source_channel ? escapeHtml(String(row.source_channel)) : 'social';
      const live = row.live_session_id ? ` · live ${escapeHtml(String(row.live_session_id)).slice(0, 8)}` : '';
      const when = row.confirmed_at ? new Date(row.confirmed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      return `<li><span class="conv-channel">${channel}</span><span class="conv-meta">checkout confirmed${live}</span><time>${when}</time></li>`;
    }).join('');
    list.hidden = rows.length === 0;
  } catch {
    count.textContent = '—';
    list.hidden = true; empty.hidden = false;
    empty.textContent = 'Commerce receipts are unavailable while the Studio POC store is unreachable.';
  }
}

async function loadCatalog() {
  const response = await fetch(CATALOG_URL, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Catalog unavailable (${response.status})`);
  const payload = await response.json();
  products = Array.isArray(payload) ? payload : payload.products || [];
  lastCatalogSource = payload.source || '';
  renderProducts();
  if (products[0]) selectProduct(products[0], false);
  activity('Catalog ready', `${products.length} products loaded from the Studio context.`);
}

function renderSession(configured = true) {
  // The embedded surface does not own an audio-device session yet. Keep this
  // visibly unavailable instead of presenting a control that only looks live.
  $('#mic').disabled = true;
  $('#armLive').disabled = !operatorAuthenticated;
  $('#unlock').hidden = operatorAuthenticated || !configured;
  $('#governanceTitle').textContent = operatorAuthenticated ? 'Governance active' : configured ? 'Operator controls locked' : 'Operator token unavailable';
  $('#governanceText').textContent = operatorAuthenticated ? 'Harness approval remains required before state changes.' : 'Product preview works; governed live and voice actions remain locked.';
  $('#voiceTitle').textContent = operatorAuthenticated ? 'Voice lane reserved' : 'Voice controls locked';
  $('#voiceText').textContent = operatorAuthenticated ? 'Audio-device handoff is the next explicit integration seam.' : 'Unlock the local operator session to inspect governed controls.';
}

async function refreshSession() {
  try {
    const response = await fetch(SESSION_URL, { credentials: 'same-origin', cache: 'no-store' });
    const state = await response.json();
    operatorAuthenticated = response.ok && Boolean(state.authenticated);
    renderSession(state.configured !== false);
  } catch {
    operatorAuthenticated = false;
    renderSession(false);
  }
}

async function armLive() {
  if (!operatorAuthenticated) return $('#unlockDialog').showModal();
  const endpoint = live ? '/api/studio/stop-stream' : '/api/studio/go-live';
  const response = await fetch(endpoint, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: live ? undefined : JSON.stringify({ title: 'Yaatal Live Commerce' }),
  });
  if (!response.ok) return notify(`Studio rejected the request (${response.status}).`);
  live = !live;
  $('#liveState').textContent = live ? 'Live' : 'Preview';
  $('#previewState').textContent = live ? 'On air' : 'Preview';
  $('#armLive').textContent = live ? 'End live' : 'Arm cockpit';
  $('.live-state').dataset.live = String(live);
  startedAt = live ? Date.now() : 0;
  activity(live ? 'Cockpit armed' : 'Cockpit disarmed', live ? 'The governed live session is active.' : 'The live session ended cleanly.');
}

function updateTimer() {
  const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  $('#previewTimer').textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
}

function connectEvents() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${protocol}://${location.host}/ws`);
  socket.onopen = () => { $('#assistantDot').classList.add('connected'); activity('Studio connected', 'The local event stream is ready.'); };
  socket.onmessage = (event) => { try { const message = JSON.parse(event.data); if (message.type === 'governed_action') activity('Governed action', message.result?.allowed ? 'Harness allowed the proposal.' : 'Proposal was not applied.'); if (message.type === 'commerce_conversion') activity('Conversion recorded', `${message.source_channel || 'Social'} checkout confirmed.`); } catch {} };
  socket.onclose = () => { $('#assistantDot').classList.remove('connected'); setTimeout(connectEvents, 2000); };
}

async function unlock(event) {
  event.preventDefault();
  const token = $('#operatorToken').value;
  const response = await fetch(SESSION_URL, { method: 'POST', credentials: 'same-origin', headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.authenticated) { $('#unlockError').textContent = payload.error || 'Unlock rejected.'; return; }
  operatorAuthenticated = true;
  $('#operatorToken').value = '';
  $('#unlockDialog').close();
  renderSession(true);
  activity('Operator unlocked', 'Governed live and voice controls are available.');
}

function wire() {
  document.querySelectorAll('.view-tab').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
  $('#openShop').addEventListener('click', () => selected ? postProduct(selected) : notify('Choose a product first.'));
  $('#armLive').addEventListener('click', armLive);
  $('#unlock').addEventListener('click', () => $('#unlockDialog').showModal());
  $('#cancelUnlock').addEventListener('click', () => $('#unlockDialog').close());
  $('#unlockForm').addEventListener('submit', unlock);
  $('#refreshInsights').addEventListener('click', loadInsights);
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    if (event.data?.version !== 'yaatal-os.v1' || event.data.kind !== 'theme-change') return;
    if (event.data.theme === 'light' || event.data.theme === 'dark') applyTheme(event.data.theme);
  });
}

async function init() {
  applyTheme(theme);
  wire();
  renderSession(false);
  timer = setInterval(updateTimer, 1000);
  connectEvents();
  await Promise.allSettled([loadCatalog(), refreshSession()]);
}

window.addEventListener('beforeunload', () => { clearInterval(timer); socket?.close(); });
document.addEventListener('DOMContentLoaded', init);
