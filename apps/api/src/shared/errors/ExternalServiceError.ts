// Сбой внешнего сервиса (почта, позже Google): в логе — только сервис, операция и HTTP-статус.
// Тело ответа, адреса и ключи в ошибку не кладутся
export class ExternalServiceError extends Error {
  readonly service: string
  readonly status: number | null

  constructor(service: string, status: number | null) {
    super(`${service} request failed`)
    this.name = 'ExternalServiceError'
    this.service = service
    this.status = status
  }
}
