import { ExternalServiceError } from '../../../shared/errors'

// Письмо — вне критического пути ответа: задержка или сбой почтового сервиса не должны выдавать по времени,
// существует ли аккаунт, и не превращают ответ в 500.
// В логе только операция и тип ошибки: в ошибках почтового сервиса бывают адрес получателя и ссылка с токеном
export function sendInBackground(operation: string, send: () => Promise<void>): void {
  // Через then: синхронное исключение внутри send тоже попадёт в catch, а не наружу
  void Promise.resolve()
    .then(send)
    .catch((error: unknown) => {
      const errorType = error instanceof Error ? error.name : typeof error
      // Статус ответа сервиса помогает отличить неверный ключ (401/403) от лимитов (429) и сбоев (5xx)
      const status = error instanceof ExternalServiceError ? error.status : undefined
      console.error('Email sending failed', { operation, errorType, status })
    })
}
