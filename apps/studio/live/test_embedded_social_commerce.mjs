import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./dashboard/os.js', import.meta.url), 'utf8');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function makeElement(overrides = {}) {
  return {
    textContent: '',
    hidden: false,
    open: false,
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    showModal() { this.open = true; },
    close() { this.open = false; },
    ...overrides,
  };
}

const elements = new Map();
for (const id of [
  'commerceDialog', 'commerceState', 'commerceLinks', 'commerceProduct', 'toast',
  'activity', 'conversionCount', 'conversionList', 'insightEmpty',
]) elements.set(`#${id}`, makeElement());
elements.set('#activity', makeElement({
  children: [],
  prepend(item) { this.children.unshift(item); },
  get lastElementChild() { return this.children.at(-1); },
}));

const document = {
  documentElement: { dataset: {} },
  querySelector: (selector) => elements.get(selector) || makeElement(),
  querySelectorAll: () => [],
  createElement: () => makeElement({ remove() {} }),
  addEventListener() {},
};
const window = { addEventListener() {}, open() {}, parent: null };
window.parent = window;

const context = vm.createContext({
  AbortController,
  clearInterval,
  clearTimeout,
  console,
  document,
  fetch: null,
  location: { search: '', origin: 'http://127.0.0.1:8765', protocol: 'http:', host: '127.0.0.1:8765' },
  navigator: {},
  setInterval,
  setTimeout,
  URL,
  URLSearchParams,
  WebSocket: class {},
  window,
});
vm.runInContext(source, context, { filename: 'os.js' });

const productA = { id: 'prod-a', name: 'Product A' };
const productB = { id: 'prod-b', name: 'Product B' };
vm.runInContext(`operatorAuthenticated = true; live = true; products = ${JSON.stringify([productA, productB])}; selected = products[0];`, context);

const intentA = deferred();
const intentB = deferred();
let intentCall = 0;
context.fetch = () => (intentCall++ === 0 ? intentA.promise : intentB.promise);
const requestA = vm.runInContext('createCommerceIntent()', context);
vm.runInContext('selected = products[1]', context);
const requestB = vm.runInContext('createCommerceIntent()', context);
intentB.resolve(response({
  product: productB,
  public_url: 'http://127.0.0.1:8765/c/b',
  livestream_url: 'http://127.0.0.1:8765/c/b?src=livestream',
  share: { whatsapp: 'https://wa.me/?text=b', telegram: 'https://t.me/share/url?url=b' },
}));
await requestB;
intentA.resolve(response({
  product: productA,
  public_url: 'http://127.0.0.1:8765/c/a',
  livestream_url: 'http://127.0.0.1:8765/c/a?src=livestream',
  share: { whatsapp: 'https://wa.me/?text=a', telegram: 'https://t.me/share/url?url=a' },
}));
await requestA;
assert.equal(elements.get('#commerceProduct').textContent, 'Product B');
assert.equal(vm.runInContext('currentCommerceIntent.urls.copy', context), 'http://127.0.0.1:8765/c/b');

const oldInsights = deferred();
const freshInsights = deferred();
let insightsCall = 0;
context.fetch = () => (insightsCall++ === 0 ? oldInsights.promise : freshInsights.promise);
const oldRequest = vm.runInContext('loadInsights()', context);
const freshRequest = vm.runInContext('loadInsights()', context);
freshInsights.resolve(response({ count: 2, conversions: [{ source_channel: 'telegram' }, { source_channel: 'whatsapp' }] }));
await freshRequest;
oldInsights.resolve(response({ count: 1, conversions: [{ source_channel: 'copy' }] }));
await oldRequest;
assert.equal(elements.get('#conversionCount').textContent, '2');
assert.match(elements.get('#conversionList').innerHTML, /telegram/);

console.log('embedded social commerce behavior: ok');
