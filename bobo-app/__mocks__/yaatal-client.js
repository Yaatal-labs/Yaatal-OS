const ok = async () => undefined

const __mockClient = {
  setToken() {},
  clearToken() {},
  auth: {
    register: ok,
    login: async () => ({ token: 'test-token', pid: 'test-pid', name: 'Test User', is_verified: true }),
    forgotPassword: ok,
  },
  products: {
    list: async () => ({ products: [], total: 0, page: 1, per_page: 20 }),
    get: ok,
    create: ok,
    update: ok,
    remove: ok,
    upvote: ok,
  },
  search: {
    products: async () => ({ products: [], total: 0, page: 1, per_page: 20 }),
    merchants: async () => ({ merchants: [], total: 0, page: 1, per_page: 20 }),
    orders: async () => ({ orders: [], total: 0, page: 1, per_page: 20 }),
  },
  catalog: {
    list: async () => ({ products: [], total: 0, page: 1, per_page: 20 }),
    get: ok,
  },
  liveSessions: {
    currentProducts: async () => ({ session: null, products: [] }),
  },
  notifications: {
    list: async () => [],
    unreadCount: async () => 0,
    markRead: ok,
    markAllRead: ok,
  },
  analytics: {
    track: ok,
    identify: ok,
  },
  orders: {
    list: async () => ({ orders: [], total: 0, page: 1, per_page: 20 }),
    me: async () => ({ orders: [], total: 0, page: 1, per_page: 20 }),
    get: ok,
    updateStatus: ok,
    updatePayment: ok,
    cancel: ok,
  },
  bobo: {
    checkout: ok,
    paymentStatus: ok,
  },
  delivery: {
    create: ok,
    list: async () => [],
    get: ok,
    updateStatus: ok,
    confirm: ok,
  },
}

function createYaatalClient() {
  return __mockClient
}

class YaatalApiError extends Error {
  constructor(status, body) {
    super(`Yaatal Engine request failed with status ${status}`)
    this.name = 'YaatalApiError'
    this.status = status
    this.body = body
  }
}

module.exports = { createYaatalClient, YaatalApiError, __mockClient }
