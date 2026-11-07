import { displayNameSchema, emailSchema } from '@nataskium/shared/schemas'
import type { AuthSession, GoogleIdentityProvider, PendingGoogleLinkRepository, TeacherRepository } from '../types'
import { type IssueSessionDeps, issueSession } from './issueSession'

const MS_PER_MINUTE = 60 * 1000
const GOOGLE_LINK_TTL_MINUTES = 10
// На ввод пароля после возврата из Google
export const GOOGLE_LINK_TTL_MS = GOOGLE_LINK_TTL_MINUTES * MS_PER_MINUTE

export type GoogleSignInFailure = 'invalidToken' | 'unverifiedEmail' | 'invalidEmail' | 'conflict'

export type GoogleSignInOutcome =
  | { ok: true; kind: 'session'; session: AuthSession }
  // Учитель с этим email уже есть, но без Google: привязка — после ввода пароля. linkToken — для ссылки,
  // linkSecret — для cookie этого браузера: подтвердить привязку можно только отсюда
  | { ok: true; kind: 'linkRequired'; linkToken: string; linkSecret: string }
  | { ok: false; reason: GoogleSignInFailure }

export type GoogleSignInInput = { code: string; codeVerifier: string; nonce: string }

export type GoogleSignInDeps = IssueSessionDeps & {
  teachers: TeacherRepository
  pendingGoogleLinks: PendingGoogleLinkRepository
  google: GoogleIdentityProvider
}

// Вход через Google: найти учителя по googleId; если учитель с этим email есть без Google — выдать токен привязки
// (вход после ввода пароля, googleLink); иначе создать учителя без пароля. Ожидаемые отказы — результатом,
// сбой Google или сети — ExternalServiceError
export function makeGoogleSignIn(deps: GoogleSignInDeps) {
  return async function googleSignIn(input: GoogleSignInInput): Promise<GoogleSignInOutcome> {
    const exchange = await deps.google.exchangeCode(input.code, input.codeVerifier, input.nonce)
    if (!exchange.ok) return { ok: false, reason: exchange.reason }

    const { profile } = exchange
    // Без подтверждённой почты Google не ручается за адрес
    if (!profile.emailVerified) return { ok: false, reason: 'unverifiedEmail' }

    // Та же нормализация, что при регистрации и входе: иначе Anna@Gmail.com создала бы второго учителя
    const email = emailSchema.safeParse(profile.email)
    if (!email.success) return { ok: false, reason: 'invalidEmail' }
    // Имя из Google — по правилам displayName; не прошло — без имени, а не отказ во входе
    const displayName = profile.name === null ? null : (displayNameSchema.safeParse(profile.name).data ?? null)

    const now = deps.now()
    const result = await deps.teachers.signInWithGoogle({ googleId: profile.googleId, email: email.data, displayName }, now)
    if (result.status === 'conflict') return { ok: false, reason: 'conflict' }
    if (result.status === 'signedIn') return { ok: true, kind: 'session', session: await issueSession(deps, result.teacher) }

    // Сырые токен и секрет — только во фрагмент ссылки и в cookie, в базе — их HMAC
    const linkToken = deps.tokens.generateOpaqueToken()
    const linkSecret = deps.tokens.generateOpaqueToken()
    const saved = await deps.pendingGoogleLinks.replaceForTeacher({
      teacherId: result.teacherId,
      googleId: profile.googleId,
      tokenHash: deps.tokens.hashOpaqueToken(linkToken),
      linkSecretHash: deps.tokens.hashOpaqueToken(linkSecret),
      expiresAt: new Date(now.getTime() + GOOGLE_LINK_TTL_MS),
    })
    // Учителя с этим email удалили между поиском и записью: привязывать не к кому
    if (!saved) return { ok: false, reason: 'invalidToken' }
    return { ok: true, kind: 'linkRequired', linkToken, linkSecret }
  }
}
