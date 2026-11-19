// Клиент GigaChat API: OAuth2 (client credentials) + chat completions.
// Десктоп (Electron): запросы идут через main-процесс (window.gigaFetch) — без CORS
// и с доверием к ГОСТ-сертификатам. Dev (vite): через прокси /giga → api.giga.chat.
import type { GigaChatSettings } from '@/types'

export const DEFAULT_GIGACHAT_SETTINGS: GigaChatSettings = {
  clientId: '',
  authorizationKey: '',
  scope: 'GIGACHAT_API_PERS',
  host: 'https://api.giga.chat',
  model: 'GigaChat',
  severity: 'mild',
  models: ['GigaChat-2-Max', 'GigaChat-2-Pro', 'GigaChat-2', 'GigaChat-Max', 'GigaChat-Pro', 'GigaChat'],
  hidden: false
}

// OAuth — всегда на ngw.devices.sberbank.ru (так в официальном SDK Сбера).
const OAUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'

// API: https://api.giga.chat/v1/... (новый единый адрес) или
// https://gigachat.devices.sberbank.ru/api/v1/... (легаси).
const NEW_API_HOST = 'https://api.giga.chat'
const LEGACY_API_HOST = 'https://gigachat.devices.sberbank.ru'

/** База API с префиксом версии: api.giga.chat → /v1, легаси → /api/v1. */
function apiBaseOf(host: string): string {
  const h = host.replace(/\/+$/, '')
  return h.includes('api.giga.chat') ? `${h}/v1` : `${h}/api/v1`
}

/** В dev-режиме запросы идут через vite-прокси (обход CORS и ГОСТ-TLS). */
function proxify(url: string): string {
  if (!import.meta.env.DEV) return url
  return url
    .replace('https://api.giga.chat', '/giga')
    .replace('https://ngw.devices.sberbank.ru:9443', '/giga-ngw')
    .replace('https://gigachat.devices.sberbank.ru', '/giga-old')
}

interface GigaFetchBridge {
  (url: string, options: { method: string; headers: Record<string, string>; body?: string }): Promise<{
    status: number
    body: string
  }>
}

declare global {
  interface Window {
    gigaFetch?: GigaFetchBridge
  }
}

function baseUrl(s: GigaChatSettings): string {
  return s.host.replace(/\/+$/, '')
}

function settingsKey(s: GigaChatSettings): string {
  return `${s.clientId}:${s.scope}:${s.host}`
}

async function http(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
  signal?: AbortSignal
): Promise<{ status: number; body: string }> {
  if (!import.meta.env.DEV && window.gigaFetch) {
    return window.gigaFetch(url, init)
  }
  const resp = await fetch(proxify(url), { ...init, signal })
  return { status: resp.status, body: await resp.text() }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

function errorFromBody(prefix: string, status: number, body: string): Error {
  let detail = body.slice(0, 200)
  try {
    const parsed = JSON.parse(body)
    detail = parsed.message ?? parsed.error ?? detail
  } catch {
    // тело не JSON — показываем как есть
  }
  return new Error(`${prefix}: HTTP ${status} — ${detail}`)
}

// Кэш токена в памяти: живёт 30 минут, обновляем с запасом 30 секунд.
// apiHost — адрес API, с которым ключ реально работает (новый или легаси).
let tokenCache: { token: string; expiresAt: number; key: string; apiHost: string } | null = null

/** Хост API, под которым прошёл последний успешный запрос (fallback на легаси учитывается). */
function apiHost(s: GigaChatSettings): string {
  if (tokenCache && tokenCache.key === settingsKey(s)) return tokenCache.apiHost
  return baseUrl(s)
}

/** Если запрос ушёл не на тот хост (404) — переключаемся на легаси-адрес и наоборот. */
function switchApiHost(s: GigaChatSettings): void {
  if (!tokenCache || tokenCache.key !== settingsKey(s)) return
  tokenCache.apiHost = tokenCache.apiHost.includes('api.giga.chat') ? LEGACY_API_HOST : NEW_API_HOST
}

export async function getAccessToken(
  s: GigaChatSettings,
  signal?: AbortSignal,
  forceRefresh = false
): Promise<string> {
  const key = settingsKey(s)
  if (!forceRefresh && tokenCache && tokenCache.key === key && Date.now() < tokenCache.expiresAt - 30_000) {
    return tokenCache.token
  }
  // В кабинете Studio выдаётся готовый Authorization Key (Base64) — используем напрямую.
  const authKey = s.authorizationKey.trim()
  if (!authKey) throw new Error('Не задан Authorization Key GigaChat (настройки → GigaChat)')

  const res = await http(
    OAUTH_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        RqUID: crypto.randomUUID(),
        Authorization: `Basic ${authKey}`
      },
      body: `scope=${encodeURIComponent(s.scope)}`
    },
    signal
  )
  if (res.status !== 200) {
    throw errorFromBody('Ошибка авторизации GigaChat', res.status, res.body)
  }
  const data = JSON.parse(res.body) as { access_token: string; expires_at?: number }
  tokenCache = {
    token: data.access_token,
    expiresAt: data.expires_at ?? Date.now() + 1_800_000,
    key,
    apiHost: baseUrl(s)
  }
  return data.access_token
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Chat completions с автообновлением токена (401 → refresh → retry) и backoff по 429. */
export async function chatCompletion(
  s: GigaChatSettings,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<string> {
  let token = await getAccessToken(s, signal)
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await http(
      `${apiBaseOf(apiHost(s))}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`
        },
        // max_tokens — с запасом на неделю из ~25 занятий, иначе ответ обрезается
        // и часть планов теряется.
        body: JSON.stringify({ model: s.model, messages, temperature: 0.7, max_tokens: 4096 })
      },
      signal
    )
    if (res.status === 200) {
      const data = JSON.parse(res.body) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const content = data.choices?.[0]?.message?.content
      if (!content) throw new Error('GigaChat вернул пустой ответ')
      return content
    }
    if (res.status === 401) {
      token = await getAccessToken(s, signal, true)
      continue
    }
    if (res.status === 404) {
      // Ключ мог быть выпущен под легаси-адрес (или наоборот) — пробуем другой хост.
      switchApiHost(s)
      continue
    }
    if (res.status === 429) {
      lastError = errorFromBody('Превышен лимит запросов GigaChat', res.status, res.body)
      await sleep(1500 * (attempt + 1), signal)
      continue
    }
    throw errorFromBody('Ошибка GigaChat', res.status, res.body)
  }
  throw lastError ?? new Error('GigaChat: не удалось выполнить запрос')
}

/** Список доступных моделей (GET /models). */
export async function listModels(s: GigaChatSettings, signal?: AbortSignal): Promise<string[]> {
  const token = await getAccessToken(s, signal)
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await http(
      `${apiBaseOf(apiHost(s))}/models`,
      { method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } },
      signal
    )
    if (res.status === 200) {
      const data = JSON.parse(res.body) as { data?: Array<{ id: string }> }
      return (data.data ?? []).map((m) => m.id)
    }
    if (res.status === 404) {
      switchApiHost(s)
      continue
    }
    throw errorFromBody('Ошибка получения моделей', res.status, res.body)
  }
  throw new Error('Ошибка получения моделей GigaChat')
}

/** Проверка подключения: токен + список моделей. Модель выбирается автоматически (самая новая). */
export async function testConnection(
  s: GigaChatSettings,
  signal?: AbortSignal
): Promise<{ models: string[]; model: string }> {
  const models = await listModels(s, signal)
  return { models, model: pickBestModel(models) }
}

/** Автовыбор самой новой модели: GigaChat-3-Max > GigaChat-2-Max > GigaChat-2-Pro > … */
export function pickBestModel(models: string[]): string {
  const rank = (m: string): number => {
    const match = m.match(/GigaChat(?:-(\d+))?(?:-(Max|Pro|Lite))?/i)
    if (!match) return -1
    const version = match[1] ? Number(match[1]) : 1
    const tier = { max: 3, pro: 2, lite: 0 }[(match[2] ?? '').toLowerCase()] ?? 1
    return version * 100 + tier
  }
  const best = [...models].sort((a, b) => rank(b) - rank(a))[0]
  return best ?? 'GigaChat'
}
