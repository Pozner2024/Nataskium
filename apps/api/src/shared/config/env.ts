import { z } from 'zod'

const DEFAULT_API_PORT = 3001
const MIN_PORT = 1
const MAX_PORT = 65535
const PORT_ERROR = `must be an integer from ${MIN_PORT} to ${MAX_PORT}`
const DATABASE_URL_PROTOCOL = /^postgres(ql)?$/

const envSchema = z.object({
  // production по умолчанию: вне разработки стек ошибок в лог не пишется
  NODE_ENV: z
    .enum(['development', 'production', 'test'], { error: 'must be one of: development, production, test' })
    .default('production'),
  // Только цифры: z.coerce.number() пропустил бы '', ' 3002 ', '1e3' и '0x10'
  API_PORT: z
    .string()
    .regex(/^\d+$/, { error: PORT_ERROR })
    .transform(Number)
    .pipe(z.number().min(MIN_PORT, { error: PORT_ERROR }).max(MAX_PORT, { error: PORT_ERROR }))
    .default(DEFAULT_API_PORT),
  DATABASE_URL: z.url({
    protocol: DATABASE_URL_PROTOCOL,
    // Без проверки хоста прошли бы 'postgresql:' и 'postgresql:///db'
    hostname: /.+/,
    error: (issue) => (issue.input === undefined ? 'is required' : 'must be a postgresql:// or postgres:// URL'),
  }),
})

export type Env = z.infer<typeof envSchema>

// В сообщении только имена переменных и причины: значения могут оказаться секретами
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source)
  if (result.success) return result.data

  const problems = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
  throw new Error(`Invalid environment variables:\n${problems.join('\n')}`)
}
