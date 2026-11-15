import { type ComputedRef, type Ref, computed, ref } from 'vue'
import { useState } from '#imports'
import { useCurrentLocale } from '@/shared'
import { libraryApi } from './libraryApi'
import type { LibraryGroup, NamedLibraryGroup } from './types'

// Список групп грузится один раз за визит: useState живёт при переходах между страницами
export function useLibraryGroups(): {
  groups: ComputedRef<NamedLibraryGroup[]>
  isFailed: Ref<boolean>
  load: () => Promise<void>
} {
  const loaded = useState<LibraryGroup[] | null>('library-groups', () => null)
  const isFailed = ref(false)
  const locale = useCurrentLocale()

  const groups = computed(() => (loaded.value ?? []).map((group) => ({ slug: group.slug, name: group.names[locale.value] })))

  async function load(): Promise<void> {
    if (loaded.value !== null) return
    isFailed.value = false
    try {
      loaded.value = (await libraryApi.groups()).groups
    } catch {
      isFailed.value = true
    }
  }

  return { groups, isFailed, load }
}
