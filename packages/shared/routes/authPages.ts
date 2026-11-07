// Страницы входа фронтенда — одно место для API и web: на эти адреса ведут письма и редиректы API,
// и по ним же строит маршруты фронтенд
export const AUTH_PAGE_PATHS = {
  login: '/auth/login',
  register: '/auth/register',
  verifyEmail: '/auth/verify-email',
  // После входа через Google: refresh-cookie уже стоит, страница получает access-токен через /api/auth/refresh
  googleCallback: '/auth/callback',
  // Учитель с паролем подтверждает привязку Google вводом пароля; токен привязки — во фрагменте
  linkGoogle: '/auth/link-google',
  // Запрос ссылки сброса пароля (ссылка «Забыли пароль?» со страницы входа)
  forgotPassword: '/auth/forgot',
  // Сюда ведёт письмо сброса пароля; токен — во фрагменте
  resetPassword: '/auth/reset-password',
} as const
