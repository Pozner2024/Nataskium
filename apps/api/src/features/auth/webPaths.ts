// Страницы фронтенда (шаг 5), на которые ведут письма и редиректы API. Токены — только во фрагменте URL:
// он не попадает в логи Caddy, историю запросов сервера и Referer
export const VERIFY_EMAIL_PATH = '/auth/verify-email'
export const SIGN_IN_PATH = '/auth/login'
export const RESET_PASSWORD_PATH = '/auth/reset-password'
// После входа через Google: refresh-cookie уже стоит, страница получает access-токен через /api/auth/refresh
export const GOOGLE_SIGN_IN_DONE_PATH = '/auth/callback'
// Учитель с паролем подтверждает привязку Google вводом пароля; токен привязки — во фрагменте
export const LINK_GOOGLE_PATH = '/auth/link-google'
