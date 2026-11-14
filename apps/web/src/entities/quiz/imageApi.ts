import { IMAGE_UPLOAD_FIELD, imageUploadResponseSchema } from '@nataskium/shared/schemas'
import { apiRequest } from '@/shared'
import type { UploadedImage } from './types'

// Загрузка картинки для вопроса или варианта. Обновление токена при 401 делает вызывающий виджет
export const imageApi = {
  upload: async (file: File, accessToken: string): Promise<UploadedImage> => {
    const form = new FormData()
    form.append(IMAGE_UPLOAD_FIELD, file)
    const { image } = await apiRequest('/quiz-images', imageUploadResponseSchema, { method: 'POST', body: form, accessToken })
    return image
  },
}
