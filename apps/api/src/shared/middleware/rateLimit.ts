// Ограничение числа запросов по ключу (IP, IP + email, email). Счётчики в памяти (Map), поэтому реплика api одна.
// При превышении — 429 с Retry-After
import { BlockList, isIP } from 'node:net'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context, MiddlewareHandler } from 'hono'
import { RateLimitedError } from '../errors'

export type RateLimitOptions = {
  max: number
  windowMs: number
  // Потолок числа ключей: ключи с email задаёт клиент, без потолка Map росла бы без предела
  maxTrackedKeys: number
}

type Entry = { count: number; resetAt: number }

export type LimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number }

export type LimitReservation = { allowed: true; release(): void } | { allowed: false; retryAfterSeconds: number }

const MS_PER_SECOND = 1000
const MIN_RETRY_AFTER_SECONDS = 1
const MIN_CLEANUP_INTERVAL_MS = 60_000
// Очистка до 90% потолка, а не на один ключ: иначе при заполненной Map сортировка шла бы на каждой вставке
const EVICTION_TARGET_RATIO = 0.9
const FULL_WARNING_INTERVAL_MS = 60_000
const IPV4_MAPPED_PREFIX = '::ffff:'
const REAL_IP_HEADER = 'x-real-ip'
// Клиенту IPv6 провайдер обычно выдаёт целую /64: по полному адресу он обходил бы лимит, меняя адрес внутри сети
const IPV6_RATE_LIMIT_PREFIX = 64
const IPV6_GROUP_BITS = 16
const IPV6_GROUP_COUNT = 8
const IPV6_COMPRESSED_GROUPS = '::'
const IPV6_GROUP_SEPARATOR = ':'
const IPV6_ZONE_SEPARATOR = '%'
// Если Map заполнена ключами у порога, полный проход очистки повторяется не чаще этого интервала
const EVICTION_RETRY_INTERVAL_MS = 1000

function ipFamily(address: string): 'ipv4' | 'ipv6' | null {
  const version = isIP(address)
  if (version === 4) return 'ipv4'
  if (version === 6) return 'ipv6'
  return null
}

// Сокет с двумя стеками отдаёт IPv4 как ::ffff:a.b.c.d — приводим к a.b.c.d, иначе адрес Caddy не совпадёт со списком
function normalizeIp(address: string | undefined): string | undefined {
  const trimmed = address?.trim()
  if (trimmed === undefined || trimmed === '') return undefined
  const unmapped = trimmed.toLowerCase().startsWith(IPV4_MAPPED_PREFIX) ? trimmed.slice(IPV4_MAPPED_PREFIX.length) : trimmed
  return isIP(unmapped) === 4 ? unmapped : trimmed
}

// Все 8 групп IPv6 в каноническом виде WHATWG URL: строчные, без ведущих нулей, встроенный IPv4 — в hex.
// Сжатая и полная записи одного адреса дают одни и те же группы
function ipv6Groups(address: string): string[] {
  const [withoutZone = ''] = address.split(IPV6_ZONE_SEPARATOR)
  const canonical = new URL(`http://[${withoutZone}]`).hostname.slice(1, -1)
  const [head = '', tail] = canonical.split(IPV6_COMPRESSED_GROUPS)
  const headGroups = head === '' ? [] : head.split(IPV6_GROUP_SEPARATOR)
  if (tail === undefined) return headGroups

  const tailGroups = tail === '' ? [] : tail.split(IPV6_GROUP_SEPARATOR)
  const zeros = Array<string>(IPV6_GROUP_COUNT - headGroups.length - tailGroups.length).fill('0')
  return [...headGroups, ...zeros, ...tailGroups]
}

// Ключ лимитов по IP: IPv4 (и ::ffff:a.b.c.d, уже приведённый к IPv4) — полный адрес, IPv6 — сеть /64
function rateLimitKey(ip: string): string {
  if (ipFamily(ip) !== 'ipv6') return ip
  const networkGroups = ipv6Groups(ip).slice(0, IPV6_RATE_LIMIT_PREFIX / IPV6_GROUP_BITS)
  return `${networkGroups.join(IPV6_GROUP_SEPARATOR)}${IPV6_COMPRESSED_GROUPS}/${IPV6_RATE_LIMIT_PREFIX}`
}

// getConnInfo доступен только под реальным Node-сервером; в тестах адрес сокета передаётся через env app.request
function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address
  } catch {
    return undefined
  }
}

// Ключ клиента для лимитов: адрес сокета (IPv6 — его сеть /64). X-Real-IP принимается, только если сокет —
// доверенный прокси (Caddy перезаписывает заголовок адресом TCP-пира); доверие проверяется по полному адресу.
// X-Forwarded-For не используется: его дописывает кто угодно
export function makeClientIpResolver(trustedProxies: readonly string[]): (c: Context) => string {
  const trusted = new BlockList()
  for (const entry of trustedProxies) {
    const [network = '', prefix] = entry.split('/')
    const family = ipFamily(network)
    if (family === null) continue
    if (prefix === undefined) trusted.addAddress(network, family)
    else trusted.addSubnet(network, Number(prefix), family)
  }

  function isTrusted(address: string): boolean {
    const family = ipFamily(address)
    return family !== null && trusted.check(address, family)
  }

  return (c) => {
    const socket = normalizeIp(socketAddress(c))
    // Без адреса нельзя считать лимит: общий ключ 'unknown' дал бы одному клиенту заблокировать всех
    if (socket === undefined) throw new Error('Client address is unavailable')
    if (!isTrusted(socket)) return rateLimitKey(socket)

    const realIp = normalizeIp(c.req.header(REAL_IP_HEADER))
    if (realIp !== undefined && ipFamily(realIp) !== null) return rateLimitKey(realIp)
    // Значение заголовка в лог не пишем: его прислал клиент
    console.warn('Ignoring invalid X-Real-IP from trusted proxy')
    return rateLimitKey(socket)
  }
}

export function createRateLimiter({ max, windowMs, maxTrackedKeys }: RateLimitOptions) {
  const hits = new Map<string, Entry>()
  const evictionTarget = Math.floor(maxTrackedKeys * EVICTION_TARGET_RATIO)
  let lastFullWarningAt = 0
  let nextEvictionAttemptAt = 0

  // Чистим устаревшие записи, чтобы Map не держала их до переполнения.
  // unref() — таймер не мешает Node.js завершиться при остановке сервера
  const cleanupTimer = setInterval(() => removeExpired(Date.now()), Math.max(windowMs, MIN_CLEANUP_INTERVAL_MS))
  cleanupTimer.unref()

  function removeExpired(now: number): void {
    for (const [key, entry] of hits) {
      if (now >= entry.resetAt) hits.delete(key)
    }
  }

  // При переполнении: сначала истёкшие, затем ключи с наименьшим счётчиком (шум перебора случайных адресов).
  // Ключи у порога не вытесняются никогда: иначе распределённый перебор сбросил бы счётчик жертвы
  function makeRoom(now: number): boolean {
    if (hits.size < maxTrackedKeys) return true
    // Недавняя очистка не освободила места: без этой паузы каждый новый ключ запускал бы проход O(n log n)
    if (now < nextEvictionAttemptAt) return false

    removeExpired(now)
    if (hits.size < maxTrackedKeys) return true

    const evictable = [...hits].filter(([, entry]) => entry.count < max).sort(([, a], [, b]) => a.count - b.count)
    for (const [key] of evictable) {
      if (hits.size <= evictionTarget) break
      hits.delete(key)
    }
    if (hits.size < maxTrackedKeys) return true

    nextEvictionAttemptAt = now + EVICTION_RETRY_INTERVAL_MS
    if (now - lastFullWarningAt >= FULL_WARNING_INTERVAL_MS) {
      lastFullWarningAt = now
      console.warn('Rate limiter is full, new keys are not tracked', { trackedKeys: hits.size })
    }
    return false
  }

  function currentEntry(key: string, now: number): Entry | undefined {
    const entry = hits.get(key)
    if (entry === undefined || now < entry.resetAt) return entry
    hits.delete(key)
    return undefined
  }

  function retryAfterSeconds(entry: Entry, now: number): number {
    return Math.max(MIN_RETRY_AFTER_SECONDS, Math.ceil((entry.resetAt - now) / MS_PER_SECOND))
  }

  function isAllowed(key: string, now = Date.now()): LimitDecision {
    const entry = currentEntry(key, now)
    if (entry !== undefined && entry.count >= max) return { allowed: false, retryAfterSeconds: retryAfterSeconds(entry, now) }
    return { allowed: true }
  }

  // Проверка и увеличение — один синхронный шаг без await: в одном потоке Node это атомарно
  function hit(key: string): LimitDecision & { resetAt?: number } {
    const now = Date.now()
    const decision = isAllowed(key, now)
    if (!decision.allowed) return decision

    const entry = currentEntry(key, now)
    if (entry !== undefined) {
      entry.count++
      return { allowed: true, resetAt: entry.resetAt }
    }
    // Ключ не поместился — не отслеживаем: остаются лимиты по IP
    if (!makeRoom(now)) return { allowed: true }

    const resetAt = now + windowMs
    hits.set(key, { count: 1, resetAt })
    return { allowed: true, resetAt }
  }

  // Неудача засчитывается заранее; release отменяет её, только если окно ключа не сменилось
  function reserve(key: string): LimitReservation {
    const decision = hit(key)
    if (!decision.allowed) return decision

    const reservedWindow = decision.resetAt
    let released = false
    return {
      allowed: true,
      // Идемпотентно: повторный вызов не снимает чужие неудачи этого ключа
      release() {
        if (released) return
        released = true
        const entry = hits.get(key)
        if (entry === undefined || entry.resetAt !== reservedWindow) return
        entry.count--
        if (entry.count <= 0) hits.delete(key)
      },
    }
  }

  function middleware(keyOf: (c: Context) => string): MiddlewareHandler {
    return async (c, next) => {
      const decision = hit(keyOf(c))
      if (!decision.allowed) throw new RateLimitedError(decision.retryAfterSeconds)
      await next()
    }
  }

  return { middleware, hit, isAllowed, reserve, reset: () => hits.clear(), size: () => hits.size }
}

export type RateLimiter = ReturnType<typeof createRateLimiter>
