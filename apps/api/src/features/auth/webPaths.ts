import { AUTH_PAGE_PATHS } from '@nataskium/shared/routes'

// Страницы фронтенда, на которые ведут письма и редиректы API — из @nataskium/shared, общие с web.
// Токены — только во фрагменте URL: он не попадает в логи Caddy, историю запросов сервера и Referer
export const VERIFY_EMAIL_PATH = AUTH_PAGE_PATHS.verifyEmail
export const SIGN_IN_PATH = AUTH_PAGE_PATHS.login
export const RESET_PASSWORD_PATH = AUTH_PAGE_PATHS.resetPassword
export const GOOGLE_SIGN_IN_DONE_PATH = AUTH_PAGE_PATHS.googleCallback
export const LINK_GOOGLE_PATH = AUTH_PAGE_PATHS.linkGoogle
