import type { RegisterInput } from '@nataskium/shared/schemas'
import type {
  Clock,
  EmailQuota,
  EmailSender,
  PasswordHasher,
  PendingRegistrationRepository,
  TeacherRepository,
  TokenService,
} from '../types'
import { sendInBackground } from './sendInBackground'

const MS_PER_HOUR = 60 * 60 * 1000
const PENDING_REGISTRATION_TTL_HOURS = 24
export const PENDING_REGISTRATION_TTL_MS = PENDING_REGISTRATION_TTL_HOURS * MS_PER_HOUR

export type RegisterDeps = {
  teachers: TeacherRepository
  pendingRegistrations: PendingRegistrationRepository
  hasher: PasswordHasher
  tokens: TokenService
  emailSender: EmailSender
  registrationEmailQuota: EmailQuota
  now: Clock
}

// Ответ один на все ветки (маршрут отдаёт 202): по нему не понять, есть ли аккаунт с этим email.
// Учитель создаётся только при подтверждении (verifyEmail) — до этого пароль лежит в записи регистрации
export function makeRegister(deps: RegisterDeps) {
  return async function register(input: RegisterInput): Promise<void> {
    // Первым шагом во всех ветках: иначе ~10 мс argon2 выдали бы по времени, есть ли адрес
    const passwordHash = await deps.hasher.hash(input.password)

    // Сверх бюджета — ни письма, ни записи: число ожидающих регистраций на адрес ограничено бюджетом писем
    if (!deps.registrationEmailQuota.tryConsume(input.email)) return

    const existing = await deps.teachers.findByEmail(input.email)
    if (existing !== null) {
      sendInBackground('register.accountExists', () => deps.emailSender.sendAccountExistsEmail(input.email, existing.displayName))
      return
    }

    // Новый адрес отвечает на INSERT дольше (единицы мс), чем существующий. Это допустимо: каждый замер тратит
    // бюджет писем этого адреса, а замер «есть ли аккаунт» на чужом адресе к тому же шлёт письмо его владельцу.
    // Сырой токен — только в письмо, в базе — его HMAC
    const rawToken = deps.tokens.generateOpaqueToken()
    await deps.pendingRegistrations.create({
      email: input.email,
      passwordHash,
      displayName: input.displayName ?? null,
      tokenHash: deps.tokens.hashOpaqueToken(rawToken),
      expiresAt: new Date(deps.now().getTime() + PENDING_REGISTRATION_TTL_MS),
    })
    sendInBackground('register.verification', () => deps.emailSender.sendVerificationEmail(input.email, rawToken))
  }
}
