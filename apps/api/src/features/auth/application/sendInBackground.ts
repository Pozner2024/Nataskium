// Письмо — вне критического пути ответа: задержка или сбой почтового сервиса не должны выдавать по времени,
// существует ли аккаунт, и не превращают ответ в 500.
// В логе только операция и тип ошибки: в ошибках почтового сервиса бывают адрес получателя и ссылка с токеном
export function sendInBackground(operation: string, send: () => Promise<void>): void {
  // Через then: синхронное исключение внутри send тоже попадёт в catch, а не наружу
  void Promise.resolve()
    .then(send)
    .catch((error: unknown) => {
      const errorType = error instanceof Error ? error.name : typeof error
      console.error('Email sending failed', { operation, errorType })
    })
}
