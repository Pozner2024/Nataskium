import { AppError } from '../../../shared/errors'
import type { Clock, GoogleAuthorizationRequest, GoogleIdentityProvider, PendingGoogleReauthRepository, TeacherRepository, TokenService } from '../types'
import { sessionInvalid } from './authErrors'

const CONFLICT_STATUS = 409
const MS_PER_MINUTE = 60 * 1000
const GOOGLE_REAUTH_TTL_MINUTES = 5
// На выбор аккаунта в Google; столько же живёт cookie oauth
export const GOOGLE_REAUTH_TTL_MS = GOOGLE_REAUTH_TTL_MINUTES * MS_PER_MINUTE
// У учителя с паролем удаление — по паролю (POST /delete-account); без Google подтвердить нечем
const PASSWORD_ACCOUNT_MESSAGE = 'Accounts with a password are deleted with the password'

export type StartGoogleReauthDeps = {
  teachers: TeacherRepository
  pendingGoogleReauths: PendingGoogleReauthRepository
  google: Pick<GoogleIdentityProvider, 'createAuthorizationRequest'>
  tokens: Pick<TokenService, 'hashOpaqueToken'>
  now: Clock
}

// Удаление аккаунта без пароля, шаг 1: учитель из access-токена получает адрес входа в Google. Запись связывает
// state этого входа с учителем: callback удалит именно его и только если вернётся тот же Google-аккаунт
export function makeStartGoogleReauth(deps: StartGoogleReauthDeps) {
  return async function startGoogleReauth(teacherId: string): Promise<GoogleAuthorizationRequest> {
    const teacher = await deps.teachers.findById(teacherId)
    if (teacher === null) throw sessionInvalid()
    if (teacher.passwordHash !== null || teacher.googleId === null) throw new AppError(CONFLICT_STATUS, PASSWORD_ACCOUNT_MESSAGE)

    const request = deps.google.createAuthorizationRequest()
    // Сырой state — только в cookie этого браузера и в адресе Google, в базе — его HMAC
    const saved = await deps.pendingGoogleReauths.replaceForTeacher({
      teacherId,
      stateHash: deps.tokens.hashOpaqueToken(request.state),
      expiresAt: new Date(deps.now().getTime() + GOOGLE_REAUTH_TTL_MS),
    })
    // Аккаунт удалили между проверкой и записью
    if (!saved) throw sessionInvalid()
    return request
  }
}
