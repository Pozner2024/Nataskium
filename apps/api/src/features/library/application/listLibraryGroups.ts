import { type LibraryGroupsResponse, localizedNamesSchema } from '@nataskium/shared/schemas'
import type { LibraryRepository } from '../types'

export function makeListLibraryGroups(deps: { library: LibraryRepository }) {
  return async function listLibraryGroups(): Promise<LibraryGroupsResponse> {
    const rows = await deps.library.listGroups()
    return {
      groups: rows.map((row) => {
        const names = localizedNamesSchema.safeParse(row.names)
        if (!names.success) throw new Error(`Library group ${row.slug} has invalid names`)
        return { slug: row.slug, names: names.data }
      }),
    }
  }
}
