// verifyEmail, linkGoogle и resetPassword — форма из одного пароля, forgotPassword — из одной почты,
// googleCallback — экран ожидания без формы
export type AuthCardMode =
  | 'login'
  | 'register'
  | 'verifyEmail'
  | 'linkGoogle'
  | 'googleCallback'
  | 'forgotPassword'
  | 'resetPassword'

export type AuthCardFieldName = 'displayName' | 'email' | 'password'

// Текст ошибки под полем; пустое значение или отсутствие ключа — поле без ошибки
export type AuthCardFieldErrors = Partial<Record<AuthCardFieldName, string>>

// Пропсы карточки — отдельным типом: страницы и превью описывают ими состояние, не завися от служебных типов Vue
export interface AuthCardProps {
  mode?: AuthCardMode
  isLoading?: boolean
  // Вместо формы — итоговый экран: «Проверьте почту» после регистрации и запроса сброса, «Пароль изменён» после сброса
  isSent?: boolean
  formError?: string
  fieldErrors?: AuthCardFieldErrors
}

export interface AuthCardSubmitPayload {
  // Только во входе, регистрации и запросе сброса: в остальных режимах почта известна по ссылке
  email?: string
  // Во всех режимах, кроме forgotPassword
  password?: string
  // Только при регистрации и только если имя заполнено
  displayName?: string
}
