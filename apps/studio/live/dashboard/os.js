/* Dedicated embedded SELL surface. Standalone Studio remains available at /. */
const CATALOG_URL = '/api/studio/product-queue';
const SESSION_URL = '/api/studio/operator/session';
const NATIVE_BOOTSTRAP_URL = '/api/studio/operator/bootstrap';
const COMMERCE_INTENT_URL = '/api/studio/poc/commerce-intents';
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const BOOTSTRAP_NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const OS_PROTOCOL_VERSION = 'yaatal-os.v1';
const params = new URLSearchParams(location.search);
let theme = params.get('theme') === 'dark' ? 'dark' : 'light';
let products = [];
let selected = null;
let live = false;
let startedAt = 0;
let timer = 0;
let operatorAuthenticated = false;
let operatorConfigured = false;
let toastTimer = 0;
let socket = null;
let currentCommerceIntent = null;
let commerceIntentController = null;
let commerceIntentGeneration = 0;
let insightsController = null;
let insightsGeneration = 0;
let nativeBootstrapController = null;
let nativeBootstrapGeneration = 0;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
const safeImage = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, location.origin);
    return ['http:', 'https:'].includes(url.protocol) && url.pathname !== '/' ? url.href : '';
  } catch { return ''; }
};
// CSS url() inside a double-quoted HTML attribute: JSON.stringify's double
// quotes terminate the attribute. Use single quotes around the URL instead.
const cssUrl = (image) => image ? `url('${image.replace(/'/g, '%27')}')` : '';
const price = (product) => product?.price_display || `${Number(product?.price_fcfa ?? product?.price_cents ?? 0).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} FCFA`;
const safeCommerceUrl = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
};

function trustedParentOrigin() {
  if (window.parent === window) return '';
  const ancestors = window.location.ancestorOrigins;
  const raw = String(ancestors?.length ? ancestors[0] : '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol === 'tauri:' && url.hostname === 'localhost') return 'tauri://localhost';
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (!['127.0.0.1', 'localhost', 'tauri.localhost'].includes(url.hostname)) return '';
    return url.origin;
  } catch { return ''; }
}

function postToNativeParent(message) {
  const origin = trustedParentOrigin();
  if (!origin) return false;
  window.parent.postMessage(message, origin);
  return true;
}

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
  postToNativeParent({ version: OS_PROTOCOL_VERSION, kind: 'product-navigation', productId, source: 'studio' });
}

function selectProduct(product, announce = true) {
  selected = product;
  const image = safeImage(product?.images?.[0] || product?.image_url || product?.thumbnail);
  $('#preview').style.backgroundImage = cssUrl(image);
  $('#previewName').textContent = product?.name || 'Choose a product below';
  $('#previewPrice').textContent = product ? price(product) : '— FCFA';
  $('#previewCategory').textContent = product?.category || 'Product preview';
  document.querySelectorAll('.product').forEach((card) => card.classList.toggle('active', card.dataset.id === String(product?.id)));
  if (announce) {
    activity('Product selected', `${product.name} is ready for the live overlay.`);
    postProduct(product);
  }
}

function selectedProductSnapshot() {
  const productId = String(selected?.id ?? '').trim();
  if (!ID_PATTERN.test(productId)) return null;
  return products.find((item) => String(item.id) === productId) || null;
}

function setCommerceState(message, state = '') {
  const root = $('#commerceState');
  root.textContent = message;
  root.dataset.state = state;
}

function showCommerceDialog() {
  const dialog = $('#commerceDialog');
  if (typeof dialog?.showModal !== 'function') {
    notify('Checkout sharing is unavailable in this browser.');
    return false;
  }
  if (!dialog.open) dialog.showModal();
  return true;
}

function clearCommerceIntent() {
  currentCommerceIntent = null;
  $('#commerceLinks').hidden = true;
  $('#commerceProduct').textContent = '';
}

function cancelCommerceIntentRequest() {
  commerceIntentGeneration += 1;
  commerceIntentController?.abort();
  commerceIntentController = null;
}

function commerceRequestOwnsView(generation, controller, productId) {
  return generation === commerceIntentGeneration
    && controller === commerceIntentController
    && String(selectedProductSnapshot()?.id ?? '') === productId;
}

function commerceRequestIsCurrent(generation, controller, productId) {
  return commerceRequestOwnsView(generation, controller, productId) && !controller.signal.aborted;
}

function renderCommerceIntent(intent) {
  const urls = {
    copy: safeCommerceUrl(intent.public_url),
    livestream: safeCommerceUrl(intent.livestream_url),
    whatsapp: safeCommerceUrl(intent.share?.whatsapp),
    telegram: safeCommerceUrl(intent.share?.telegram),
  };
  if (Object.values(urls).some((value) => !value)) {
    throw new Error('Studio returned an incomplete checkout link set.');
  }
  currentCommerceIntent = { urls };
  $('#commerceProduct').textContent = intent.product?.name || selected?.name || 'Selected product';
  $('#commerceLinks').hidden = false;
  setCommerceState('Commerce Sheet ready. Each action uses a server-attributed link.', 'ready');
}

function commerceFailure(message, clearIntent = true) {
  if (clearIntent) clearCommerceIntent();
  setCommerceState(message, 'error');
  notify(message);
}

async function copyCommerceLink(channel, label) {
  const value = currentCommerceIntent?.urls?.[channel];
  if (!value) return commerceFailure(`${label} is unavailable.`);
  if (typeof navigator.clipboard?.writeText !== 'function') {
    return commerceFailure('Clipboard access is unavailable in this browser.', false);
  }
  try {
    await navigator.clipboard.writeText(value);
    setCommerceState(`${label} copied.`, 'ready');
    notify(`${label} copied.`);
  } catch {
    commerceFailure('The browser could not copy this checkout link.', false);
  }
}

function openCommerceLink(channel, label) {
  const value = currentCommerceIntent?.urls?.[channel];
  if (!value) return commerceFailure(`${label} is unavailable.`);
  if (typeof window.open !== 'function') return commerceFailure('Opening links is unavailable in this browser.', false);
  let popup = null;
  try {
    popup = window.open('', '_blank');
    if (!popup) throw new Error('popup_blocked');
    popup.opener = null;
    popup.location.href = value;
    setCommerceState(`${label} opened in a new tab.`, 'ready');
  } catch {
    try { popup?.close(); } catch {}
    commerceFailure('The browser blocked this checkout link. Allow pop-ups and try again.', false);
  }
}

async function createCommerceIntent() {
  const product = selectedProductSnapshot();
  if (!product) return commerceFailure('Choose a product before sharing checkout.');
  if (!operatorAuthenticated) {
    if (!operatorConfigured) return commerceFailure('Operator authorization is unavailable in this Studio.');
    notify('Unlock operator controls before sharing checkout.');
    $('#unlockDialog').showModal();
    return;
  }
  if (!live) {
    showCommerceDialog();
    return commerceFailure('Arm the cockpit before sharing checkout.');
  }
  if (!showCommerceDialog()) return;
  cancelCommerceIntentRequest();
  const generation = commerceIntentGeneration;
  const productId = String(product.id);
  const controller = new AbortController();
  commerceIntentController = controller;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 5000);
  clearCommerceIntent();
  setCommerceState('Creating portable, attributed checkout links…', 'loading');
  try {
    const response = await fetch(COMMERCE_INTENT_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product }),
      signal: controller.signal,
    });
    const intent = await response.json().catch(() => ({}));
    if (!commerceRequestIsCurrent(generation, controller, productId)) return;
    if (!response.ok) {
      if (response.status === 503 && intent.detail === 'commerce_poc_disabled') {
        throw new Error('Social checkout is disabled for this Studio.');
      }
      if (response.status === 401 || response.status === 403) {
        operatorAuthenticated = false;
        renderSession(true);
        throw new Error('Operator session expired. Unlock and try again.');
      }
      throw new Error(intent.message || intent.detail || `Checkout request failed (${response.status}).`);
    }
    renderCommerceIntent(intent);
    activity('Checkout ready', `${product.name} has server-attributed social links.`);
  } catch (error) {
    if (!commerceRequestOwnsView(generation, controller, productId)) return;
    if (timedOut) return commerceFailure('Checkout request timed out. Try again.');
    commerceFailure(error?.message || 'Checkout links are unavailable.');
  } finally {
    clearTimeout(timeout);
    if (commerceIntentController === controller) commerceIntentController = null;
  }
}

function renderProducts() {
  const root = $('#products');
  root.innerHTML = products.slice(0, 3).map((product) => {
    const image = safeImage(product.images?.[0] || product.image_url || product.thumbnail);
    return `<button class="product" type="button" data-id="${escapeHtml(product.id)}">
      <span class="product-image" style="background-image:${cssUrl(image)}"></span>
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
    // UXR-05: fallback demo visuals are labeled, never passed off as real photos.
    const demoBadge = product.demo_visual ? '<em class="demo-badge">Demo visual</em>' : '';
    return `<button class="catalog-card" type="button" data-id="${escapeHtml(product.id)}" title="${escapeHtml(product.image_alt || product.name)}">
      <span class="catalog-image${product.demo_visual ? ' is-demo' : ''}" style="background-image:${cssUrl(image)}">${demoBadge}</span>
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
  { src: '/dashboard/img/bazin_robe.webp', title: 'Robe Bazin — editorial', tag: 'Fashion' },
  { src: '/dashboard/img/leather_bag.webp', title: 'Sac en cuir — atelier', tag: 'Leather' },
  { src: '/dashboard/img/gold_earrings.webp', title: 'Sablé gold — macro', tag: 'Jewelry' },
  { src: '/dashboard/img/bissap.webp', title: 'Bissap — bouteille', tag: 'Drinks' },
  { src: '/dashboard/img/thiote_mat.webp', title: 'Tapis thiote — texture', tag: 'Decor' },
  { src: '/dashboard/img/smartphone.webp', title: 'Smartphone — studio', tag: 'Tech' },
  { src: '/dashboard/img/cosmetics.webp', title: 'Cosmetics — collection', tag: 'Beauty' },
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
  insightsGeneration += 1;
  const generation = insightsGeneration;
  insightsController?.abort();
  const controller = new AbortController();
  insightsController = controller;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 5000);
  const requestOwnsView = () => generation === insightsGeneration && controller === insightsController;
  const requestIsCurrent = () => requestOwnsView() && !controller.signal.aborted;
  const count = $('#conversionCount');
  const list = $('#conversionList');
  const empty = $('#insightEmpty');
  count.textContent = '…';
  try {
    const response = await fetch('/api/studio/poc/conversions', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
    if (!requestIsCurrent()) return;
    if (response.status === 401 || response.status === 403) {
      count.textContent = '—';
      list.hidden = true; empty.hidden = false;
      empty.textContent = 'Unlock the operator session to read conversion receipts.';
      return;
    }
    if (!response.ok) throw new Error(String(response.status));
    const payload = await response.json();
    if (!requestIsCurrent()) return;
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
    if (!requestOwnsView()) return;
    count.textContent = '—';
    list.hidden = true; empty.hidden = false;
    empty.textContent = timedOut
      ? 'Commerce receipts timed out. Try refreshing the Insights view.'
      : 'Commerce receipts are unavailable while the Studio POC store is unreachable.';
  } finally {
    clearTimeout(timeout);
    if (insightsController === controller) insightsController = null;
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
  operatorConfigured = configured;
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

function sanitizeNativeAuthMessage(value) {
  if (!value || value.version !== OS_PROTOCOL_VERSION || typeof value.kind !== 'string') return null;
  if (value.kind === 'studio-auth-bootstrap') {
    if (value.surface !== 'studio' || !BOOTSTRAP_NONCE_PATTERN.test(String(value.nonce ?? ''))) return null;
    if (!Number.isInteger(value.expiresInSeconds) || value.expiresInSeconds < 1 || value.expiresInSeconds > 90) return null;
    return {
      kind: value.kind,
      surface: 'studio',
      nonce: String(value.nonce),
    };
  }
  if (value.kind === 'studio-auth-logout') return { kind: value.kind };
  return null;
}

function postNativeAuthStatus(action, ok, errorCode = '') {
  const message = {
    version: OS_PROTOCOL_VERSION,
    kind: 'studio-auth-status',
    action,
    ok: Boolean(ok),
  };
  if (!ok) {
    message.errorCode = /^[a-z0-9_]{1,64}$/.test(errorCode) ? errorCode : 'studio_auth_failed';
  }
  postToNativeParent(message);
}

async function redeemNativeBootstrap(message) {
  const generation = ++nativeBootstrapGeneration;
  nativeBootstrapController?.abort();
  const controller = new AbortController();
  nativeBootstrapController = controller;
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(NATIVE_BOOTSTRAP_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce: message.nonce, surface: 'studio' }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (generation !== nativeBootstrapGeneration || controller.signal.aborted) return;
    if (!response.ok || payload.authenticated !== true) {
      throw new Error(typeof payload.error === 'string' ? payload.error : 'studio_bootstrap_failed');
    }
    await refreshSession();
    if (!operatorAuthenticated) throw new Error('studio_session_missing');
    activity('Operator unlocked', 'Native Engine login established the Studio session.');
    postNativeAuthStatus('bootstrap', true);
  } catch (error) {
    if (generation !== nativeBootstrapGeneration) return;
    operatorAuthenticated = false;
    renderSession(operatorConfigured);
    const code = controller.signal.aborted ? 'studio_bootstrap_timeout' : String(error?.message || 'studio_bootstrap_failed');
    notify('Native Studio unlock failed. Manual unlock remains available.');
    postNativeAuthStatus('bootstrap', false, code);
  } finally {
    clearTimeout(timeout);
    if (nativeBootstrapController === controller) nativeBootstrapController = null;
  }
}

async function clearNativeStudioSession() {
  ++nativeBootstrapGeneration;
  nativeBootstrapController?.abort();
  nativeBootstrapController = null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(SESSION_URL, {
      method: 'DELETE',
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('studio_logout_failed');
    operatorAuthenticated = false;
    live = false;
    renderSession(operatorConfigured);
    postNativeAuthStatus('logout', true);
  } catch {
    postNativeAuthStatus(
      'logout',
      false,
      controller.signal.aborted ? 'studio_logout_timeout' : 'studio_logout_failed',
    );
  } finally {
    clearTimeout(timeout);
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
  socket.onmessage = (event) => { try { const message = JSON.parse(event.data); if (message.type === 'governed_action') activity('Governed action', message.result?.allowed ? 'Harness allowed the proposal.' : 'Proposal was not applied.'); if (message.type === 'commerce_conversion') { activity('Conversion recorded', `${message.source_channel || 'Social'} checkout confirmed.`); if (operatorAuthenticated) loadInsights(); } } catch {} };
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
  $('#shareCheckout').addEventListener('click', createCommerceIntent);
  $('#closeCommerce').addEventListener('click', () => {
    cancelCommerceIntentRequest();
    $('#commerceDialog').close();
  });
  $('#commerceCopy').addEventListener('click', () => copyCommerceLink('copy', 'Checkout link'));
  $('#commerceLivestream').addEventListener('click', () => copyCommerceLink('livestream', 'Livestream link'));
  $('#commerceWhatsApp').addEventListener('click', () => openCommerceLink('whatsapp', 'WhatsApp share'));
  $('#commerceTelegram').addEventListener('click', () => openCommerceLink('telegram', 'Telegram share'));
  $('#commerceOpen').addEventListener('click', () => openCommerceLink('copy', 'Commerce Sheet'));
  $('#armLive').addEventListener('click', armLive);
  $('#unlock').addEventListener('click', () => $('#unlockDialog').showModal());
  $('#cancelUnlock').addEventListener('click', () => $('#unlockDialog').close());
  $('#unlockForm').addEventListener('submit', unlock);
  $('#refreshInsights').addEventListener('click', loadInsights);
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const parentOrigin = trustedParentOrigin();
    if (!parentOrigin || event.origin !== parentOrigin) return;
    if (event.data?.version === OS_PROTOCOL_VERSION && event.data.kind === 'theme-change') {
      if (event.data.theme === 'light' || event.data.theme === 'dark') applyTheme(event.data.theme);
      return;
    }
    const authMessage = sanitizeNativeAuthMessage(event.data);
    if (authMessage?.kind === 'studio-auth-bootstrap') void redeemNativeBootstrap(authMessage);
    if (authMessage?.kind === 'studio-auth-logout') void clearNativeStudioSession();
  });
}

async function init() {
  applyTheme(theme);
  wire();
  renderSession(false);
  timer = setInterval(updateTimer, 1000);
  connectEvents();
  await Promise.allSettled([loadCatalog(), refreshSession()]);
  postToNativeParent({
    version: OS_PROTOCOL_VERSION,
    kind: 'studio-auth-ready',
  });
}

window.addEventListener('beforeunload', () => {
  cancelCommerceIntentRequest();
  insightsGeneration += 1;
  insightsController?.abort();
  ++nativeBootstrapGeneration;
  nativeBootstrapController?.abort();
  clearInterval(timer);
  socket?.close();
});
document.addEventListener('DOMContentLoaded', init);
