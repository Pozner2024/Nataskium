import { type Context, Hono, type MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import type { PrismaClient } from './generated/prisma/client'
import {
  AUTH_ROUTES_BASE_PATH,
  type AuthLimits,
  type EmailSender,
  type GoogleIdentityProvider,
  type PasswordHasher,
  type TeacherImageFiles,
  makeAuthLimiters,
  makeAuthRouter,
  makeCancelGoogleReauth,
  makeCleanupExpiredAuthRecords,
  makeChangePassword,
  makeDeleteAccount,
  makeDeleteAccountWithGoogle,
  makeGetMe,
  GOOGLE_LINK_TTL_MS,
  makeGoogleLink,
  makeGoogleSignIn,
  makeLogin,
  makeLogout,
  makeLogoutAll,
  makePasswordResetRepository,
  makePendingGoogleLinkRepository,
  makePendingGoogleReauthRepository,
  makePendingRegistrationRepository,
  makeRefreshSession,
  makeRefreshTokenRepository,
  makeRegister,
  makeRequestPasswordReset,
  makeResetPassword,
  makeStartGoogleReauth,
  makeTeacherRepository,
  makeTokenService,
  makeVerifyEmail,
} from './features/auth'
import {
  LIBRARY_LIMITS,
  LIBRARY_ROUTES_BASE_PATH,
  makeGetLibraryQuiz,
  makeLibraryRepository,
  makeLibraryRouter,
  makeListLibraryGroups,
  makeListLibraryQuizzes,
  makeTakeLibraryQuiz,
  type LibraryImageCopier,
} from './features/library'
import {
  PLAY_LIMITS,
  PLAY_ROUTES_BASE_PATH,
  makeCheckAnswer,
  makeCheckTrueFalse,
  makeFinishMatching,
  makeFinishTrueFalse,
  makeFinishQuiz,
  makeGetPlayActivity,
  makePlayRouter,
} from './features/play'
import {
  IMAGE_UPLOAD_LIMITS,
  QUIZ_IMAGE_ROUTES_BASE_PATH,
  makeCleanupImages,
  makeImageProcessor,
  listTeacherImageIds,
  makeImageRouter,
  makeQuizImageRepository,
  makeUploadImage,
  quizImageKey,
} from './features/quiz-images'
import {
  QUIZ_LIMITS,
  QUIZ_ROUTES_BASE_PATH,
  makeCreateQuiz,
  makeDeleteQuiz,
  makeGetQuiz,
  makeListQuizzes,
  makePurgeDeletedQuizzes,
  makeQuizRepository,
  makeQuizRouter,
  makeUpdateQuiz,
  type QuizImageFiles,
  type QuizTransaction,
} from './features/quizzes'
import {
  MATCHING_ROUTES_BASE_PATH,
  makeCreateMatching,
  makeDeleteMatching,
  makeGetMatching,
  makeMatchingRepository,
  makeMatchingRouter,
  makeUpdateMatching,
} from './features/matchings'
import {
  TRUE_FALSE_ROUTES_BASE_PATH,
  makeCreateTrueFalse,
  makeDeleteTrueFalse,
  makeGetTrueFalse,
  makeTrueFalseRepository,
  makeTrueFalseRouter,
  makeUpdateTrueFalse,
} from './features/trueFalse'
import type { Env } from './shared/config'
import { AppError } from './shared/errors'
import type { ImageStorage } from './shared/infrastructure'
import { secureShuffle } from './shared/utils'
import {
  createRateLimiter,
  makeErrorHandler,
  makeClientIpResolver,
  makeRequireAuth,
  nonErrorHandler,
  notFoundHandler,
} from './shared/middleware'

const MAX_BODY_SIZE_BYTES = 100 * 1024
// 50 вопросов с длинными текстами и ссылками на картинки (до 7 на вопрос) не помещаются в 100 КБ
const MAX_QUIZ_BODY_SIZE_BYTES = 160 * 1024
// Файл до MAX_IMAGE_UPLOAD_BYTES (15 МБ) плюс запас на multipart
const MAX_IMAGE_UPLOAD_BODY_SIZE_BYTES = 16 * 1024 * 1024
const MS_PER_SECOND = 1000
const PAYLOAD_TOO_LARGE_STATUS = 413
const CORS_ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE']
const CORS_ALLOWED_HEADERS = ['Content-Type', 'Authorization']

export type AppDeps = {
  env: Env
  prisma: PrismaClient
  limits: AuthLimits
  // Асинхронная фабрика (dummy-хэш при старте) — создаётся до createApp
  passwordHasher: PasswordHasher
  // Параметром, а не из env здесь: тесты передают фейк и читают из него токен подтверждения
  emailSender: EmailSender
  // null — Google не настроен; параметром, чтобы тесты подставляли фейк вместо Google
  googleIdentity: GoogleIdentityProvider | null
  // null — хранилище картинок не настроено (только вне production); параметром, чтобы тесты подставляли фейк
  imageStorage: ImageStorage | null
}

function limitBody(maxSize: number) {
  return bodyLimit({
    maxSize,
    onError: () => {
      throw new AppError(PAYLOAD_TOO_LARGE_STATUS, 'Payload Too Large')
    },
  })
}

const defaultBodyLimit = limitBody(MAX_BODY_SIZE_BYTES)
const quizBodyLimit = limitBody(MAX_QUIZ_BODY_SIZE_BYTES)
const imageUploadBodyLimit = limitBody(MAX_IMAGE_UPLOAD_BODY_SIZE_BYTES)
const skipBodyLimit: MiddlewareHandler = (_c, next) => next()

// Больший лимит — только маршрутам, которым он нужен; всё остальное, включая неизвестные адреса, — 100 КБ.
// Загрузка картинки ограничивается в своём роутере: bodyLimit читает тело без Content-Length целиком
// ещё до маршрута, а читать его можно только после проверки токена, лимитов и слота одновременных загрузок
function bodyLimitFor(c: Context): MiddlewareHandler {
  const { method, path } = c.req
  if (method === 'POST' && path === QUIZ_IMAGE_ROUTES_BASE_PATH) return skipBodyLimit
  if (path === QUIZ_ROUTES_BASE_PATH || path.startsWith(`${QUIZ_ROUTES_BASE_PATH}/`)) return quizBodyLimit
  return defaultBodyLimit
}

// Отдельно от createApp: расписание запускает только index.ts, тесты очистку не стартуют
export function createAuthCleanup(prisma: PrismaClient): () => Promise<void> {
  return makeCleanupExpiredAuthRecords({
    refreshTokens: makeRefreshTokenRepository(prisma),
    pendingRegistrations: makePendingRegistrationRepository(prisma),
    passwordResets: makePasswordResetRepository(prisma),
    pendingGoogleLinks: makePendingGoogleLinkRepository(prisma),
    pendingGoogleReauths: makePendingGoogleReauthRepository(prisma),
    now: () => new Date(),
  })
}

// Отдельно от createAuthCleanup: своё суточное расписание; сверка с хранилищем убирает и файлы удалённых аккаунтов (GDPR)
export function createImageCleanup(
  prisma: PrismaClient,
  imageStorage: ImageStorage | null,
  { reconcileStorage }: { reconcileStorage: boolean },
): () => Promise<void> {
  return makeCleanupImages({ images: makeQuizImageRepository(prisma), storage: imageStorage, reconcileStorage, now: () => new Date() })
}

// Отдельно от createApp, как и очистка картинок: своё суточное расписание в index.ts
export function createQuizCleanup(prisma: PrismaClient): () => Promise<void> {
  return makePurgeDeletedQuizzes({ quizzes: makeQuizRepository(prisma), now: () => new Date() })
}

// Composition root: единственное место, где application связывается с infrastructure
export function createApp({ env, prisma, limits, passwordHasher, emailSender, googleIdentity, imageStorage }: AppDeps) {
  const app = new Hono()

  // Первым: ответ на preflight и заголовки CORS нужны даже на ошибках. Только origin фронтенда, без '*'
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      allowMethods: CORS_ALLOWED_METHODS,
      allowHeaders: CORS_ALLOWED_HEADERS,
    }),
  )
  app.use(secureHeaders())
  app.use((c, next) => bodyLimitFor(c)(c, next))
  // Последним перед маршрутами: ловит сбой самого errorHandler
  app.use(nonErrorHandler)

  app.onError(makeErrorHandler(env.NODE_ENV === 'development'))
  app.notFound(notFoundHandler)

  app.get('/health', (c) => c.json({ status: 'ok' }))

  // Auth
  const teachers = makeTeacherRepository(prisma)
  const refreshTokens = makeRefreshTokenRepository(prisma)
  const pendingRegistrations = makePendingRegistrationRepository(prisma)
  const passwordResets = makePasswordResetRepository(prisma)
  const pendingGoogleLinks = makePendingGoogleLinkRepository(prisma)
  const pendingGoogleReauths = makePendingGoogleReauthRepository(prisma)
  const tokens = makeTokenService({ jwtSecret: env.JWT_SECRET, hmacSecret: env.HMAC_SECRET })
  const limiters = makeAuthLimiters(limits)
  const now = () => new Date()
  const sessionDeps = { refreshTokens, tokens, now }
  // Файлы картинок удаляемого аккаунта: строки уходят каскадом, файлы — после коммита удаления
  const teacherImageFiles: TeacherImageFiles | null =
    imageStorage === null
      ? null
      : {
          listIds: (teacherId) => listTeacherImageIds(prisma, teacherId),
          removeFiles: (imageIds) => imageStorage.remove(imageIds.map(quizImageKey)),
        }

  app.route(
    AUTH_ROUTES_BASE_PATH,
    makeAuthRouter({
      register: makeRegister({
        teachers,
        pendingRegistrations,
        hasher: passwordHasher,
        tokens,
        emailSender,
        registrationEmailQuota: limiters.registrationEmailQuota,
        now,
      }),
      verifyEmail: makeVerifyEmail({
        ...sessionDeps,
        pendingRegistrations,
        hasher: passwordHasher,
        failureLimiter: limiters.failureLimiter,
      }),
      login: makeLogin({ ...sessionDeps, teachers, hasher: passwordHasher, failureLimiter: limiters.failureLimiter }),
      refreshSession: makeRefreshSession({ ...sessionDeps, teachers }),
      logout: makeLogout({ refreshTokens, tokens }),
      logoutAll: makeLogoutAll({ refreshTokens }),
      getMe: makeGetMe({ teachers }),
      requestPasswordReset: makeRequestPasswordReset({
        teachers,
        passwordResets,
        tokens,
        emailSender,
        resetEmailQuota: limiters.resetEmailQuota,
        now,
      }),
      resetPassword: makeResetPassword({ passwordResets, hasher: passwordHasher, tokens, emailSender, now }),
      deleteAccount: makeDeleteAccount({
        teachers,
        hasher: passwordHasher,
        failureLimiter: limiters.failureLimiter,
        emailSender,
        imageFiles: teacherImageFiles,
      }),
      changePassword: makeChangePassword({
        ...sessionDeps,
        teachers,
        hasher: passwordHasher,
        failureLimiter: limiters.failureLimiter,
        emailSender,
      }),
      google:
        googleIdentity === null
          ? null
          : {
              createAuthorizationRequest: () => googleIdentity.createAuthorizationRequest(),
              signIn: makeGoogleSignIn({ ...sessionDeps, teachers, pendingGoogleLinks, google: googleIdentity }),
              link: makeGoogleLink({
                ...sessionDeps,
                pendingGoogleLinks,
                hasher: passwordHasher,
                failureLimiter: limiters.failureLimiter,
                emailSender,
              }),
              linkTtlSeconds: GOOGLE_LINK_TTL_MS / MS_PER_SECOND,
              startReauth: makeStartGoogleReauth({ teachers, pendingGoogleReauths, google: googleIdentity, tokens, now }),
              deleteAccount: makeDeleteAccountWithGoogle({
                pendingGoogleReauths,
                google: googleIdentity,
                tokens,
                emailSender,
                now,
                imageFiles: teacherImageFiles,
              }),
              cancelReauth: makeCancelGoogleReauth({ pendingGoogleReauths, tokens }),
            },
      requireAuth: makeRequireAuth(tokens.verifyAccessToken),
      clientIp: makeClientIpResolver(env.TRUSTED_PROXY_IPS),
      webOrigin: env.WEB_ORIGIN,
      limiters,
    }),
  )

  // Викторины и их картинки
  const quizzes = makeQuizRepository(prisma)
  const quizImages = makeQuizImageRepository(prisma)
  // Оба репозитория на одном клиенте транзакции: викторина и привязка картинок фиксируются вместе
  const quizTransaction: QuizTransaction = (work) =>
    prisma.$transaction((tx) => work({ quizzes: makeQuizRepository(tx), images: makeQuizImageRepository(tx) }))
  const imageFiles: QuizImageFiles | null =
    imageStorage === null
      ? null
      : {
          publicUrl: (imageId) => imageStorage.publicUrl(quizImageKey(imageId)),
          removeFiles: (imageIds) => imageStorage.remove(imageIds.map(quizImageKey)),
          deleteDetached: (imageIds) => quizImages.deleteDetached(imageIds),
        }
  const imageUrl = (imageId: string) => imageFiles?.publicUrl(imageId) ?? null
  const quizWriteDeps = { quizzes, transaction: quizTransaction, imageFiles }
  const quizLimiter = (limit: { max: number; windowMs: number }) =>
    createRateLimiter({ ...limit, maxTrackedKeys: QUIZ_LIMITS.maxTrackedKeys })
  // Одни экземпляры на викторины и сопоставления: квота учителя общая на все типы заданий (ADR-0013, ADR-0016)
  const teacherActivityLimiters = {
    read: quizLimiter(QUIZ_LIMITS.read),
    write: quizLimiter(QUIZ_LIMITS.write),
    create: quizLimiter(QUIZ_LIMITS.create),
  }
  app.route(
    QUIZ_ROUTES_BASE_PATH,
    makeQuizRouter({
      listQuizzes: makeListQuizzes({ quizzes }),
      getQuiz: makeGetQuiz({ quizzes }),
      createQuiz: makeCreateQuiz(quizWriteDeps),
      updateQuiz: makeUpdateQuiz(quizWriteDeps),
      deleteQuiz: makeDeleteQuiz(quizWriteDeps),
      imageUrl,
      requireAuth: makeRequireAuth(tokens.verifyAccessToken),
      limiters: teacherActivityLimiters,
    }),
  )

  // Сопоставления: тот же кабинет, лимит 100 заданий и лимитеры общие с викторинами
  const matchings = makeMatchingRepository(prisma)
  app.route(
    MATCHING_ROUTES_BASE_PATH,
    makeMatchingRouter({
      getMatching: makeGetMatching({ matchings }),
      createMatching: makeCreateMatching({ matchings }),
      updateMatching: makeUpdateMatching({ matchings }),
      deleteMatching: makeDeleteMatching({ matchings }),
      requireAuth: makeRequireAuth(tokens.verifyAccessToken),
      limiters: teacherActivityLimiters,
    }),
  )

  // Да/нет: тот же кабинет, лимит 100 заданий и лимитеры общие с викторинами
  const trueFalse = makeTrueFalseRepository(prisma)
  app.route(
    TRUE_FALSE_ROUTES_BASE_PATH,
    makeTrueFalseRouter({
      getTrueFalse: makeGetTrueFalse({ trueFalse }),
      createTrueFalse: makeCreateTrueFalse({ trueFalse }),
      updateTrueFalse: makeUpdateTrueFalse({ trueFalse }),
      deleteTrueFalse: makeDeleteTrueFalse({ trueFalse }),
      requireAuth: makeRequireAuth(tokens.verifyAccessToken),
      limiters: teacherActivityLimiters,
    }),
  )

  // Картинки викторин: загрузка учителем
  const uploadLimiter = (limit: { max: number; windowMs: number }) =>
    createRateLimiter({ ...limit, maxTrackedKeys: IMAGE_UPLOAD_LIMITS.maxTrackedKeys })
  app.route(
    QUIZ_IMAGE_ROUTES_BASE_PATH,
    makeImageRouter({
      uploadImage: makeUploadImage({
        images: quizImages,
        storage: imageStorage,
        processImage: makeImageProcessor(),
      }),
      requireAuth: makeRequireAuth(tokens.verifyAccessToken),
      clientIp: makeClientIpResolver(env.TRUSTED_PROXY_IPS),
      limiters: {
        perIp: uploadLimiter(IMAGE_UPLOAD_LIMITS.perIp),
        perTeacher: uploadLimiter(IMAGE_UPLOAD_LIMITS.perTeacher),
      },
      concurrent: IMAGE_UPLOAD_LIMITS.concurrent,
      bodyReadTimeoutMs: IMAGE_UPLOAD_LIMITS.bodyReadTimeoutMs,
      bodyLimit: imageUploadBodyLimit,
    }),
  )

  // Игра ученика: публичные маршруты по shareToken, только лимиты по IP
  const playLimiter = (limit: { max: number; windowMs: number }) =>
    createRateLimiter({ ...limit, maxTrackedKeys: PLAY_LIMITS.maxTrackedKeys })
  app.route(
    PLAY_ROUTES_BASE_PATH,
    makePlayRouter({
      getPlayActivity: makeGetPlayActivity({ quizzes, matchings, trueFalses: trueFalse, imageUrl, shuffle: secureShuffle }),
      checkAnswer: makeCheckAnswer({ quizzes }),
      finishQuiz: makeFinishQuiz({ quizzes }),
      finishMatching: makeFinishMatching({ matchings }),
      checkTrueFalse: makeCheckTrueFalse({ trueFalses: trueFalse }),
      finishTrueFalse: makeFinishTrueFalse({ trueFalses: trueFalse }),
      clientIp: makeClientIpResolver(env.TRUSTED_PROXY_IPS),
      limiters: {
        get: playLimiter(PLAY_LIMITS.get),
        check: playLimiter(PLAY_LIMITS.check),
        finish: playLimiter(PLAY_LIMITS.finish),
      },
    }),
  )

  // Библиотека: чтение публичное, только лимиты по IP; «Взять себе» — под Bearer
  const library = makeLibraryRepository(prisma)
  const libraryImageCopier: LibraryImageCopier | null =
    imageStorage === null
      ? null
      : {
          copyFile: (fromImageId, toImageId) => imageStorage.copy(quizImageKey(fromImageId), quizImageKey(toImageId)),
          createRow: async (imageId, teacherId) => (await quizImages.create(imageId, teacherId)) !== null,
          deleteRows: (imageIds) => quizImages.deleteRows(imageIds),
          removeFiles: (imageIds) => imageStorage.remove(imageIds.map(quizImageKey)),
        }
  const libraryLimiter = (limit: { max: number; windowMs: number }) =>
    createRateLimiter({ ...limit, maxTrackedKeys: LIBRARY_LIMITS.maxTrackedKeys })
  app.route(
    LIBRARY_ROUTES_BASE_PATH,
    makeLibraryRouter({
      listLibraryGroups: makeListLibraryGroups({ library }),
      listLibraryQuizzes: makeListLibraryQuizzes({ library }),
      getLibraryQuiz: makeGetLibraryQuiz({ library, imageUrl, shuffle: secureShuffle }),
      takeLibraryQuiz: makeTakeLibraryQuiz({
        library,
        countQuizzes: (teacherId) => quizzes.countByTeacher(teacherId),
        imageCopier: libraryImageCopier,
        createQuiz: makeCreateQuiz(quizWriteDeps),
        createMatching: makeCreateMatching({ matchings }),
        createTrueFalse: makeCreateTrueFalse({ trueFalse }),
      }),
      requireAuth: makeRequireAuth(tokens.verifyAccessToken),
      clientIp: makeClientIpResolver(env.TRUSTED_PROXY_IPS),
      limiters: {
        groups: libraryLimiter(LIBRARY_LIMITS.groups),
        list: libraryLimiter(LIBRARY_LIMITS.list),
        search: libraryLimiter(LIBRARY_LIMITS.search),
        quiz: libraryLimiter(LIBRARY_LIMITS.quiz),
        takePerIp: libraryLimiter(LIBRARY_LIMITS.take.perIp),
        takePerTeacher: libraryLimiter(LIBRARY_LIMITS.take.perTeacher),
      },
    }),
  )

  return app
}
