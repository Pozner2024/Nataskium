export { makePasswordHasher } from './infrastructure/passwordHasher'
export { makePendingRegistrationRepository } from './infrastructure/pendingRegistrationRepository'
export { makeRefreshTokenRepository } from './infrastructure/refreshTokenRepository'
export { makeTeacherRepository } from './infrastructure/teacherRepository'
export { makeTokenService } from './infrastructure/tokenService'
export type {
  PasswordHasher,
  PendingRegistrationRepository,
  RefreshTokenRepository,
  TeacherRepository,
  TokenService,
} from './types'
