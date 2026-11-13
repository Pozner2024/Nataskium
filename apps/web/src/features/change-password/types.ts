// Поля — как в changePasswordSchema из @nataskium/shared
export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
}

// Текст ошибки под полем; нет ключа — поле без ошибки
export type ChangePasswordErrors = Partial<Record<keyof ChangePasswordPayload, string>>
