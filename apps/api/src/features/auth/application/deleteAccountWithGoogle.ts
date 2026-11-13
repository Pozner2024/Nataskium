import type { Locale } from '@nataskium/shared/locales'
import type { Clock, EmailSender, GoogleIdentityProvider, PendingGoogleReauthRepository, TokenService } from '../types'
import { sendInBackground } from './sendInBackground'

// expired — подтверждения нет (истекло, отменено, уже использовано или начато в другом браузере);
// wrongAccount — вернулся не тот Google-аккаунт; invalidToken — Google отклонил код или id_token не прошёл проверку;
// hasPassword — после запуска у аккаунта появился пароль: удалять его можно только по паролю
export type GoogleReauthFailure = 'expired' | 'wrongAccount' | 'invalidToken' | 'hasPassword'

export type DeleteAccountWithGoogleInput = { state: string; code: string; codeVerifier: string; nonce: string; locale: Locale }

export type DeleteAccountWithGoogleDeps = {
  pendingGoogleReauths: PendingGoogleReauthRepository
  google: Pick<GoogleIdentityProvider, 'exchangeCode'>
  tokens: Pick<TokenService, 'hashOpaqueToken'>
  emailSender: EmailSender
  now: Clock
}

// Удаление аккаунта без пароля, шаг 2 (callback Google). Подтверждение — вход в тот же Google-аккаунт (sub), что
// привязан к учителю. Свежесть входа Google не подтверждает (auth_time не приходит, max_age не исполняется) —
// риск «незаблокированный компьютер» принят, docs/architecture.md. Ожидаемые отказы — результатом, аккаунт цел;
// сбой Google или сети — ExternalServiceError
export function makeDeleteAccountWithGoogle(deps: DeleteAccountWithGoogleDeps) {
  return async function deleteAccountWithGoogle(input: DeleteAccountWithGoogleInput): Promise<{ ok: true } | { ok: false; reason: GoogleReauthFailure }> {
    const now = deps.now()
    const stateHash = deps.tokens.hashOpaqueToken(input.state)
    const reauth = await deps.pendingGoogleReauths.findByStateHash(stateHash)
    if (reauth === null || reauth.expiresAt <= now) return { ok: false, reason: 'expired' }

    // Любой отказ ниже гасит подтверждение: повторить можно только новым запуском из настроек
    const fail = async (reason: GoogleReauthFailure) => {
      await deps.pendingGoogleReauths.deleteByStateHash(stateHash)
      return { ok: false as const, reason }
    }

    const exchange = await deps.google.exchangeCode(input.code, input.codeVerifier, input.nonce)
    if (!exchange.ok) return fail('invalidToken')
    if (reauth.teacherGoogleId === null || exchange.profile.googleId !== reauth.teacherGoogleId) return fail('wrongAccount')

    // Адрес, имя и язык — до удаления: после него их в базе нет
    const { teacherId, teacherEmail, teacherDisplayName } = reauth
    const result = await deps.pendingGoogleReauths.deleteAccount(reauth, stateHash, now)
    // Параллельный callback уже использовал подтверждение, или оно истекло между проверкой и транзакцией
    if (result === 'invalid') return { ok: false, reason: 'expired' }
    // Пароль появился после запуска: подтверждение погашено в той же транзакции, аккаунт цел
    if (result === 'hasPassword') return { ok: false, reason: 'hasPassword' }

    // Только teacherId: email удалённого учителя в логах не остаётся
    console.info('Teacher account deleted with Google', { teacherId })
    sendInBackground('account.deleted', () => deps.emailSender.sendAccountDeletedEmail(teacherEmail, teacherDisplayName, input.locale))
    return { ok: true }
  }
}
