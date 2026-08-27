/* ─── Yaatal Studio Dashboard ─────────────────────────────────
 * Vanilla JS — no build step.
 * Fetches products from Engine API, handles nav, bilingual EN/FR,
 * scene switching, product queue + overlay toggle, mock chat.
 */

const CATALOG_URL = '/api/studio/product-queue';
const STUDIO_API = '/api';

// ─── Bilingual labels ─────────────────────────────────────────
const I18N = {
  en: {
    studio_tagline: 'Live Production Studio',
    nav_dashboard: 'Dashboard', nav_studio: 'Live Studio',
    nav_content: 'Content Library', nav_catalog: 'Product Catalog', nav_analytics: 'Analytics',
    prepare_live: 'Prepare for Live',
    prepare_live_sub: 'Set up your stream before going live.',
    go_live: 'Go Live',
    stream_preview: 'Live Stream Preview',
    preview_empty: 'Camera offline — press Go Live to begin.',
    no_product_overlay: 'No product on overlay',
    stream_title: 'Stream Title',
    default_stream_title: 'Yaatal Live Commerce',
    scheduled_at: 'Scheduled',
    default_scheduled: 'Today, 19:00 GMT',
    scheduled_streams: 'Scheduled Livestreams',
    soon: 'Soon', upcoming: 'Upcoming',
    top_products: 'Top Products',
    loading_products: 'Loading products…',
    refresh: 'Refresh',
    live_studio: 'Live Studio',
    live_studio_sub: 'Control your stream in real time.',
    live_preview: 'Live Preview',
    studio_preview_empty: 'No scene active.',
    scenes: 'Scenes',
    add_scene: '+ Add Scene',
    live_chat: 'Live Chat',
    product_queue: 'Product Queue',
    add_to_queue: '+ Add',
    mic_on: 'Mic On', cam_on: 'Cam On', share: 'Share',
    health_excellent: 'Stream Health: Excellent',
    stop_stream: 'Stop Stream',
    content_library: 'Content Library',
    product_catalog: 'Product Catalog',
    catalog_sub: 'Browse all products from the Engine.',
    analytics: 'Analytics',
    coming_soon: 'Coming soon.',
    obs_integration: 'OBS Integration',
    stream_health: 'Stream Health',
    language_support: 'Language Support',
    excellent: 'Excellent',
    // toasts
    toast_golive: 'Going live… connect OBS to begin streaming.',
    toast_stop: 'Stream stopped.',
    toast_overlay_on: 'Overlay enabled for: ',
    toast_overlay_off: 'Overlay disabled for: ',
    toast_scene: 'Scene switched to ',
    toast_products_loaded: ' products loaded from Engine.',
    toast_engine_err: 'Engine API unreachable — showing cached/mock products.',
    toast_queued: 'Added to queue: ',
  },
  fr: {
    studio_tagline: 'Studio de Production Direct',
    nav_dashboard: 'Tableau de bord', nav_studio: 'Studio Direct',
    nav_content: 'Bibliothèque', nav_catalog: 'Catalogue Produits', nav_analytics: 'Analytique',
    prepare_live: 'Préparer le Direct',
    prepare_live_sub: 'Configurez votre stream avant le direct.',
    go_live: 'Démarrer le Direct',
    stream_preview: 'Aperçu du Stream',
    preview_empty: 'Caméra hors ligne — appuyez sur Démarrer le Direct.',
    no_product_overlay: 'Aucun produit sur overlay',
    stream_title: 'Titre du Stream',
    default_stream_title: 'Yaatal Commerce Direct',
    scheduled_at: 'Programmé',
    default_scheduled: "Aujourd'hui, 19:00 GMT",
    scheduled_streams: 'Streams Programmés',
    soon: 'Bientôt', upcoming: 'À venir',
    top_products: 'Top Produits',
    loading_products: 'Chargement des produits…',
    refresh: 'Rafraîchir',
    live_studio: 'Studio Direct',
    live_studio_sub: 'Contrôlez votre stream en temps réel.',
    live_preview: 'Aperçu Direct',
    studio_preview_empty: 'Aucune scène active.',
    scenes: 'Scènes',
    add_scene: '+ Ajouter Scène',
    live_chat: 'Chat Direct',
    product_queue: 'File de Produits',
    add_to_queue: '+ Ajouter',
    mic_on: 'Micro On', cam_on: 'Caméra On', share: 'Partager',
    health_excellent: 'Santé: Excellent',
    stop_stream: 'Arrêter le Stream',
    content_library: 'Bibliothèque de Contenu',
    product_catalog: 'Catalogue Produits',
    catalog_sub: 'Parcourez tous les produits depuis Engine.',
    analytics: 'Analytique',
    coming_soon: 'Bientôt disponible.',
    obs_integration: 'Intégration OBS',
    stream_health: 'Santé du Stream',
    language_support: 'Support Linguistique',
    excellent: 'Excellent',
    toast_golive: 'Mise en direct… connectez OBS pour commencer.',
    toast_stop: 'Stream arrêté.',
    toast_overlay_on: 'Overlay activé pour: ',
    toast_overlay_off: 'Overlay désactivé pour: ',
    toast_scene: 'Scène changée vers ',
    toast_products_loaded: ' produits chargés depuis Engine.',
    toast_engine_err: 'Engine API injoignable — produits mock affichés.',
    toast_queued: 'Ajouté à la file: ',
  },
};

let lang = 'en';
let products = [];
let queue = [];
let overlayProductId = null;
let streamSeconds = 0;
let timerInterval = null;
let isLive = false;

// ─── Utilities ────────────────────────────────────────────────
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return [...document.querySelectorAll(sel)]; }
function t(key) { return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key; }

function formatFCFA(price) {
  // Accept number or string; return "75 000 FCFA"
  const n = typeof price === 'number' ? price : parseInt(String(price).replace(/[^\d]/g, ''), 10);
  if (isNaN(n)) return '— FCFA';
  return n.toLocaleString('fr-FR').replace(/\u202f/g, ' ').replace(/\u00a0/g, ' ') + ' FCFA';
}

function toast(msg, ms = 2400) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── i18n ─────────────────────────────────────────────────────
function applyI18n() {
  document.body.setAttribute('data-lang', lang);
  $$('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    // For buttons with nested spans (Go Live has i18n-fr span), only set text node
    if (el.querySelector('.i18n-fr')) {
      // Go Live button: set the first text node (English label)
      const firstText = el.firstChild;
      if (firstText && firstText.nodeType === Node.TEXT_NODE) {
        firstText.textContent = t(key) + ' ';
      }
    } else {
      el.textContent = t(key);
    }
  });
  $('#langToggle').textContent = lang === 'en' ? 'FR' : 'EN';
}

function toggleLang() {
  lang = (lang === 'en') ? 'fr' : 'en';
  applyI18n();
}

// ─── Navigation ───────────────────────────────────────────────
function switchView(viewName) {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === viewName));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${viewName}`));
  document.body.setAttribute('data-view', viewName);
  if (viewName === 'catalog') renderCatalog();
}

// ─── Products ─────────────────────────────────────────────────
async function fetchProducts() {
  try {
    const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Engine returns array or { products: [...] } — normalize
    products = Array.isArray(data) ? data : (data.products || []);
    if (!Array.isArray(products)) products = [];
    toast(`${products.length}${t('toast_products_loaded')}`);
    return products;
  } catch (err) {
    console.warn('Studio product proxy failed:', err);
    toast(t('toast_engine_err'), 3200);
    products = [];
    return products;
  }
}

function mockProducts() {
  return [
    { id: 1, name: 'Robe Bazin Moderne', price: 75000, stock_status: 'in_stock',
      images: ['https://picsum.photos/seed/robe/400/400'], likes: 1200, category: 'Fashion' },
    { id: 2, name: 'Sac en Cuir Sénégal', price: 45000, stock_status: 'in_stock',
      images: ['https://picsum.photos/seed/sac/400/400'], likes: 980, category: 'Leather' },
    { id: 3, name: 'Tissu Wax Hollandais', price: 12000, stock_status: 'low_stock',
      images: ['https://picsum.photos/seed/wax/400/400'], likes: 850, category: 'Textile' },
    { id: 4, name: 'Collier Perles Artisanale', price: 18000, stock_status: 'in_stock',
      images: ['https://picsum.photos/seed/collier/400/400'], likes: 670, category: 'Jewelry' },
    { id: 5, name: 'Chapeau Artisanale', price: 8500, stock_status: 'out_of_stock',
      images: ['https://picsum.photos/seed/chapeau/400/400'], likes: 430, category: 'Accessory' },
    { id: 6, name: 'Boubou Brodé', price: 38000, stock_status: 'in_stock',
      images: ['https://picsum.photos/seed/boubou/400/400'], likes: 1100, category: 'Fashion' },
  ];
}

function productImage(p) {
  if (p.images && p.images.length) return p.images[0];
  if (p.image_url) return p.image_url;
  if (p.thumbnail) return p.thumbnail;
  return `https://picsum.photos/seed/p${p.id || Math.random()}/400/400`;
}

function productCardHTML(p) {
  const img = productImage(p);
  const priceValue = p.price_fcfa ?? p.price_cents ?? p.price;
  const price = p.price_display || formatFCFA(priceValue);
  const stock = p.stock_status || p.stock || 'in_stock';
  const likes = p.likes || p.like_count || Math.floor(Math.random() * 1500) + 200;
  const stockLabel = stock.replace(/_/g, ' ');
  return `
    <div class="product-card" data-id="${p.id}" data-name="${escapeHtml(p.name)}" data-price="${priceValue ?? ''}">
      <div class="product-img" style="background-image:url('${escapeHtml(img)}')">
        <span class="stock-badge ${stock}">${escapeHtml(stockLabel)}</span>
      </div>
      <div class="product-body">
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="product-price">${price.replace(' FCFA','')}<span class="product-currency">FCFA</span></div>
        <div class="product-likes">❤ ${likes.toLocaleString('en-US')} likes</div>
      </div>
    </div>`;
}

function renderGallery(targetSel) {
  const el = $(targetSel);
  if (!el) return;
  if (!products.length) {
    el.innerHTML = `<div class="gallery-loading">${t('loading_products')}</div>`;
    return;
  }
  el.innerHTML = products.slice(0, 12).map(productCardHTML).join('');
  // Click → add to queue
  el.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      const p = products.find(x => String(x.id) === card.dataset.id);
      if (p) addToQueue(p);
    });
  });
}

function renderDashboardGallery() { renderGallery('#productGallery'); }
function renderCatalog() { renderGallery('#catalogGallery'); }

// ─── Queue ────────────────────────────────────────────────────
function addToQueue(p) {
  if (queue.find(q => q.id === p.id)) {
    toast(`${escapeHtml(p.name)} already in queue`);
    return;
  }
  queue.push({ ...p, overlayOn: false });
  renderQueue();
  toast(t('toast_queued') + p.name);
}

function toggleOverlay(productId) {
  const item = queue.find(q => q.id === productId);
  if (!item) return;
  // Only one overlay at a time
  if (!item.overlayOn) {
    queue.forEach(q => q.overlayOn = false);
    item.overlayOn = true;
    overlayProductId = productId;
    updateOverlay(item);
    toast(t('toast_overlay_on') + item.name);
  } else {
    item.overlayOn = false;
    overlayProductId = null;
    updateOverlay(null);
    toast(t('toast_overlay_off') + item.name);
  }
  renderQueue();
}

function updateOverlay(item) {
  const nameEl = $('.overlay-name');
  const priceEl = $('#overlayPrice');
  if (!nameEl || !priceEl) return;
  if (item) {
    nameEl.textContent = item.name;
    priceEl.textContent = formatFCFA(item.price);
  } else {
    nameEl.textContent = t('no_product_overlay');
    priceEl.textContent = '';
  }
}

function removeFromQueue(productId) {
  queue = queue.filter(q => q.id !== productId);
  if (overlayProductId === productId) { overlayProductId = null; updateOverlay(null); }
  renderQueue();
}

function renderQueue() {
  const el = $('#queueList');
  if (!el) return;
  if (!queue.length) {
    el.innerHTML = `<li class="gallery-loading">${lang === 'fr' ? 'File vide — cliquez un produit.' : 'Queue empty — click a product.'}</li>`;
    return;
  }
  el.innerHTML = queue.map(item => `
    <li class="queue-item">
      <div class="queue-thumb" style="background-image:url('${escapeHtml(productImage(item))}')"></div>
      <div class="queue-info">
        <div class="queue-name">${escapeHtml(item.name)}</div>
        <div class="queue-price">${formatFCFA(item.price)}</div>
      </div>
      <div class="queue-actions">
        <button class="toggle-overlay-btn ${item.overlayOn ? 'active' : ''}" data-overlay="${item.id}">
          ${item.overlayOn ? (lang==='fr'?'Overlay On':'Overlay On') : (lang==='fr'?'Afficher':'Toggle')}
        </button>
        <button class="toggle-overlay-btn" data-remove="${item.id}" style="background:transparent;color:var(--danger)">✕</button>
      </div>
    </li>`).join('');
  el.querySelectorAll('[data-overlay]').forEach(b => {
    b.addEventListener('click', () => toggleOverlay(parseInt(b.dataset.overlay, 10)));
  });
  el.querySelectorAll('[data-remove]').forEach(b => {
    b.addEventListener('click', () => removeFromQueue(parseInt(b.dataset.remove, 10)));
  });
}

// ─── Scenes ────────────────────────────────────────────────────
function switchScene(sceneName) {
  $$('.scene-item').forEach(s => s.classList.toggle('active', s.dataset.scene === sceneName));
  const label = $('#activeSceneLabel');
  if (label) label.textContent = sceneName;
  toast(t('toast_scene') + sceneName);
}

// ─── Chat (mock) ───────────────────────────────────────────────
const MOCK_CHAT = [
  { user: 'Awa_Dkr', text: 'Combien le bazin ? 😍' },
  { user: 'Modou_92', text: 'Le sac est dispo en quelle couleur ?' },
  { user: 'Fatou_S', text: 'J\'adore la collection, bravo !' },
  { user: 'Cheikh', text: 'Livraison à Thiès possible ?' },
  { user: 'Aïssa', text: 'Le prix du wax 12 mille ?' },
  { user: 'Mamadou', text: 'Sama boubou bi lañu ? 😄' },
  { user: 'Ndeye', text: 'Très belle robe 👗' },
  { user: 'Ousmane', text: 'Payement à la livraison ?' },
];
let chatIdx = 0;

function addChatMsg(msg) {
  const feed = $('#chatFeed');
  if (!feed) return;
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<div class="chat-user">${escapeHtml(msg.user)}</div><div class="chat-text">${escapeHtml(msg.text)}</div>`;
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
  const count = $('#chatCount');
  if (count) count.textContent = String(feed.children.length);
}

function startMockChat() {
  // Seed a few
  for (let i = 0; i < 3; i++) {
    addChatMsg(MOCK_CHAT[chatIdx % MOCK_CHAT.length]);
    chatIdx++;
  }
  setInterval(() => {
    addChatMsg(MOCK_CHAT[chatIdx % MOCK_CHAT.length]);
    chatIdx++;
  }, 6000);
}

// ─── Stream controls ──────────────────────────────────────────
async function goLive() {
  if (isLive) return;
  isLive = true;
  toast(t('toast_golive'));
  streamSeconds = 0;
  timerInterval = setInterval(() => {
    streamSeconds++;
    const h = String(Math.floor(streamSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((streamSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(streamSeconds % 60).padStart(2, '0');
    const timer = $('#streamTimer');
    if (timer) timer.textContent = `${h}:${m}:${s}`;
  }, 1000);
  // POST to Studio → Engine live session
  try {
    const res = await fetch('/api/studio/go-live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Yaatal Live Commerce' }),
    });
    const data = await res.json();
    if (data.fallback) {
      toast(lang === 'fr' ? 'Mode autonome — Engine non connecté' : 'Standalone mode — Engine not connected', 3200);
    }
    // Fetch product queue from Engine
    fetchProductQueue();
  } catch (err) {
    console.warn('go-live API failed:', err);
  }
}

async function stopStream() {
  if (!isLive) return;
  isLive = false;
  clearInterval(timerInterval);
  toast(t('toast_stop'));
  const timer = $('#streamTimer');
  if (timer) timer.textContent = '00:00:00';
  // POST to Studio → end Engine live session
  try {
    await fetch('/api/studio/stop-stream', { method: 'POST' });
  } catch (err) {
    console.warn('stop-stream API failed:', err);
  }
}

// ─── Product queue from Engine ─────────────────────────────────
async function fetchProductQueue() {
  try {
    const res = await fetch('/api/studio/product-queue', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;
    const data = await res.json();
    const engineProducts = data.products || [];
    if (engineProducts.length && !queue.length) {
      // Auto-populate queue from Engine products
      engineProducts.slice(0, 6).forEach(p => {
        queue.push({ ...p, overlayOn: false });
      });
      renderQueue();
      toast(`${engineProducts.length} ${lang === 'fr' ? 'produits chargés' : 'products loaded'} (${data.source})`);
    }
  } catch (err) {
    console.warn('Product queue fetch failed:', err);
  }
}

// ─── Engine health ─────────────────────────────────────────────
async function checkEngineHealth() {
  const pill = $('#enginePill');
  if (!pill) return;
  try {
    const r = await fetch('/api/status', { signal: AbortSignal.timeout(3000) });
    const status = await r.json();
    if (r.ok && status.engine && status.engine.reachable) pill.classList.add('ok');
    else pill.classList.add('err');
  } catch {
    pill.classList.add('err');
  }
}

// ─── Theme toggle ─────────────────────────────────────────────
function toggleTheme() {
  const current = document.body.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', next);
  $('#themeToggle').textContent = next === 'dark' ? '🌙' : '☀️';
  try { localStorage.setItem('yaatal-theme', next); } catch {}
}

function initTheme() {
  let saved;
  try { saved = localStorage.getItem('yaatal-theme'); } catch {}
  if (saved === 'light') {
    document.body.setAttribute('data-theme', 'light');
    $('#themeToggle').textContent = '☀️';
  }
}

// ─── Wire up ──────────────────────────────────────────────────
function wireEvents() {
  $('#langToggle').addEventListener('click', toggleLang);
  $('#themeToggle').addEventListener('click', toggleTheme);

  $$('.nav-item').forEach(b => {
    b.addEventListener('click', () => switchView(b.dataset.view));
  });

  $('#goLiveBtn').addEventListener('click', () => {
    switchView('studio');
    goLive();
  });

  $('#refreshProducts').addEventListener('click', async () => {
    $('#productGallery').innerHTML = `<div class="gallery-loading">${t('loading_products')}</div>`;
    await fetchProducts();
    renderDashboardGallery();
  });

  $('#stopStreamBtn').addEventListener('click', stopStream);

  $('#addSceneBtn').addEventListener('click', () => {
    const name = prompt(lang === 'fr' ? 'Nom de la scène:' : 'Scene name:');
    if (!name) return;
    const li = document.createElement('li');
    li.className = 'scene-item';
    li.dataset.scene = name.toUpperCase();
    li.textContent = name.toUpperCase();
    li.addEventListener('click', () => switchScene(li.dataset.scene));
    $('#sceneList').appendChild(li);
  });

  $$('.scene-item').forEach(s => {
    s.addEventListener('click', () => switchScene(s.dataset.scene));
  });

  $('#micToggle').addEventListener('click', e => e.currentTarget.classList.toggle('off'));
  $('#camToggle').addEventListener('click', e => e.currentTarget.classList.toggle('off'));
  $('#shareToggle').addEventListener('click', e => e.currentTarget.classList.toggle('off'));

  $('#addQueueProduct').addEventListener('click', () => {
    // Switch to catalog to pick
    switchView('catalog');
  });

  // Platform links (placeholders)
  $$('.platform-link').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); toast(`${a.dataset.platform} — ${lang==='fr'?'configuration requise':'setup required'}`); });
  });
}

// ─── Init ─────────────────────────────────────────────────────
async function init() {
  initTheme();
  applyI18n();
  wireEvents();
  renderQueue();
  startMockChat();
  checkEngineHealth();
  await fetchProducts();
  renderDashboardGallery();
}

document.addEventListener('DOMContentLoaded', init);
