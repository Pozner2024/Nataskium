import type { ForgotPasswordInput } from '@nataskium/shared/schemas'
import type { Clock, EmailQuota, EmailSender, PasswordResetRepository, TeacherRepository, TokenService } from '../types'
import { sendInBackground } from './sendInBackground'

const MS_PER_HOUR = 60 * 60 * 1000
const PASSWORD_RESET_TTL_HOURS = 1
export const PASSWORD_RESET_TTL_MS = PASSWORD_RESET_TTL_HOURS * MS_PER_HOUR

export type RequestPasswordResetDeps = {
  teachers: TeacherRepository
  passwordResets: PasswordResetRepository
  tokens: TokenService
  emailSender: EmailSender
  // Отдельно от бюджета писем регистрации: спам регистрациями не должен блокировать учителю сброс
  resetEmailQuota: EmailQuota
  now: Clock
}

// Ответ один на все ветки (маршрут отдаёт 202): по нему не понять, есть ли аккаунт с этим email
export function makeRequestPasswordReset(deps: RequestPasswordResetDeps) {
  return async function requestPasswordReset(input: ForgotPasswordInput): Promise<void> {
    // Бюджет — до поиска учителя и для любого адреса: иначе по расходу бюджета было бы видно, есть ли аккаунт
    if (!deps.resetEmailQuota.tryConsume(input.email)) return

    const teacher = await deps.teachers.findByEmail(input.email)
    // Нет учителя или нет пароля (вход только через Google) — сбрасывать нечего, письма нет.
    // Гостевой ветки «задать первый пароль» из NatsDoll здесь нет: учителей без способа входа не бывает
    if (teacher === null || teacher.passwordHash === null) return

    // Существующий адрес отвечает на транзакцию дольше. Допустимо, как и в register: каждый замер тратит бюджет
    // писем этого адреса и шлёт письмо его владельцу. Сырой токен — только в письмо, в базе — его HMAC
    const rawToken = deps.tokens.generateOpaqueToken()
    await deps.passwordResets.replaceForTeacher({
      teacherId: teacher.id,
      tokenHash: deps.tokens.hashOpaqueToken(rawToken),
      expiresAt: new Date(deps.now().getTime() + PASSWORD_RESET_TTL_MS),
    })
    sendInBackground('passwordReset.request', () =>
      deps.emailSender.sendPasswordResetEmail(teacher.email, rawToken, teacher.displayName),
    )
  }
}
