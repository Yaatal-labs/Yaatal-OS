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
    disabled: false,
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
  'mic', 'armLive', 'unlock', 'governanceTitle', 'governanceText',
  'voiceTitle', 'voiceText', 'liveState', 'previewState', 'toast', 'activity',
]) elements.set(`#${id}`, makeElement());
elements.set('#activity', makeElement({
  children: [],
  prepend(item) { this.children.unshift(item); },
  get lastElementChild() { return this.children.at(-1); },
}));

const parentMessages = [];
const document = {
  documentElement: { dataset: {} },
  querySelector: (selector) => elements.get(selector) || makeElement(),
  querySelectorAll: () => [],
  createElement: () => makeElement({ remove() {} }),
  addEventListener() {},
};
const parent = { postMessage(message) { parentMessages.push(message); } };
const location = {
  search: '',
  origin: 'http://127.0.0.1:8765',
  protocol: 'http:',
  host: '127.0.0.1:8765',
  ancestorOrigins: ['tauri://localhost'],
};
const window = { addEventListener() {}, open() {}, parent, location };

const context = vm.createContext({
  AbortController,
  clearInterval,
  clearTimeout,
  console,
  document,
  fetch: null,
  location,
  navigator: {},
  setInterval,
  setTimeout,
  URL,
  URLSearchParams,
  WebSocket: class {},
  window,
});
vm.runInContext(source, context, { filename: 'os.js' });

const refresh = deferred();
const logout = deferred();
context.fetch = (url, options = {}) => {
  if (url === '/api/studio/operator/session' && options.method === 'DELETE') return logout.promise;
  if (url === '/api/studio/operator/session') return refresh.promise;
  throw new Error(`unexpected fetch ${url}`);
};

vm.runInContext('operatorConfigured = true; operatorAuthenticated = true; live = true;', context);
const refreshRequest = vm.runInContext('refreshSession(true)', context);
const logoutMessage = { lifecycle: 7, requestId: 11 };
context.logoutMessage = logoutMessage;
const logoutRequest = vm.runInContext('clearNativeStudioSession(logoutMessage)', context);

assert.equal(vm.runInContext('operatorAuthenticated', context), false, 'logout locks auth before transport');
assert.equal(vm.runInContext('live', context), false, 'logout disarms live before transport');
assert.equal(elements.get('#armLive').disabled, true, 'governed control is disabled immediately');
assert.equal(elements.get('#liveState').textContent, 'Preview', 'visible live state is cleared immediately');

refresh.resolve(response({ configured: true, authenticated: true }));
await refreshRequest;
assert.equal(vm.runInContext('operatorAuthenticated', context), false, 'late refresh cannot restore auth');
assert.equal(elements.get('#armLive').disabled, true, 'late refresh cannot re-arm controls');

logout.resolve(response({ error: 'sensitive upstream detail' }, 503));
await logoutRequest;
assert.equal(vm.runInContext('operatorAuthenticated', context), false, 'failed cleanup stays locked');
assert.equal(vm.runInContext('live', context), false, 'failed cleanup stays disarmed');
assert.equal(elements.get('#armLive').disabled, true, 'failed cleanup keeps governed controls disabled');
assert.deepEqual(
  JSON.parse(JSON.stringify(parentMessages.at(-1))),
  {
    version: 'yaatal-os.v1',
    kind: 'studio-auth-status',
    action: 'logout',
    ok: false,
    lifecycle: 7,
    requestId: 11,
    errorCode: 'studio_logout_failed',
  },
  'parent receives only the sanitized retryable cleanup result',
);

console.log('native session behavior: ok');
