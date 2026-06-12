import { createYaatalClient, type YaatalClient } from '@yaatal/client'

const DEFAULT_ENGINE_API_URL = 'http://localhost:5150'

let authToken: string | null = null
let engineApiUrl = DEFAULT_ENGINE_API_URL
let yaatalClient: YaatalClient = createYaatalClient({ baseUrl: engineApiUrl })

type EngineRequestOptions = RequestInit & {
  auth?: boolean
}

export class EngineHttpError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    super(`Engine request failed with status ${status}`)
    this.name = 'EngineHttpError'
    this.status = status
    this.body = body
  }
}

const refreshYaatalClient = () => {
  yaatalClient = createYaatalClient({
    baseUrl: engineApiUrl,
    ...(authToken ? { token: authToken } : {}),
  })
}

export const getYaatalClient = (): YaatalClient => yaatalClient

export const getEngineApiUrl = (): string => {
  return engineApiUrl
}

export const setEngineApiUrl = (url?: string | null) => {
  engineApiUrl = url?.replace(/\/+$/, '') || DEFAULT_ENGINE_API_URL
  refreshYaatalClient()
}

export const setEngineAuthToken = (token: string | null) => {
  authToken = token

  if (token) {
    yaatalClient.setToken(token)
  } else {
    yaatalClient.clearToken()
  }
}

export const getEngineAuthToken = (): string | null => authToken

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  if (!text) return undefined

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export const engineRequest = async <T>(
  path: string,
  options: EngineRequestOptions = {}
): Promise<T> => {
  const url = path.startsWith('http') ? path : `${getEngineApiUrl()}${path}`
  const headers = new Headers(options.headers)

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (options.auth !== false && authToken) {
    headers.set('Authorization', `Bearer ${authToken}`)
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })
  const body = await parseResponseBody(response)

  if (!response.ok) {
    throw new EngineHttpError(response.status, body)
  }

  return body as T
}

const isAbsoluteUrl = (value: string): boolean => {
  return !!value && /^https?:\/\//i.test(value)
}

export const getFileUrl = (bucketOrPath: string, path?: string): string => {
  const value = path || bucketOrPath
  if (!value) return ''
  if (isAbsoluteUrl(value) || value.startsWith('file:')) return value
  return `${getEngineApiUrl()}/${value.replace(/^\/+/, '')}`
}

export const getProductImageUrl = (imagePath?: string | null): string => {
  if (!imagePath) return ''
  return getFileUrl(imagePath)
}

export const getAvatarUrl = (
  avatarPath?: string | null,
  _size?: number
): string => {
  if (!avatarPath) return ''
  return getFileUrl(avatarPath)
}
