import type { CacheStore, SerializedEntry, StoredTagEntry } from "../../src/types.ts"

export interface MemoryStore extends CacheStore {
  getTtl(hash: string): number | undefined
}

export function createMemoryStore(): MemoryStore {
  const entries = new Map<string, SerializedEntry>()
  const ttls = new Map<string, number>()
  const tags: Record<string, StoredTagEntry> = {}
  const refs = new Map<string, Set<string>>()

  return {
    getEntry(hash) {
      return Promise.resolve(entries.get(hash))
    },
    setEntry(hash, entry, ttlSec) {
      entries.set(hash, entry)
      ttls.set(hash, ttlSec)
      return Promise.resolve()
    },
    deleteEntry(hash) {
      const existing = entries.get(hash)
      entries.delete(hash)
      ttls.delete(hash)
      return Promise.resolve(existing)
    },
    getTagManifest() {
      return Promise.resolve({ ...tags })
    },
    setTagEntries(entriesToSet) {
      Object.assign(tags, entriesToSet)
      return Promise.resolve()
    },
    addTagRefs(tag, hashes) {
      const set = refs.get(tag) ?? new Set<string>()
      for (const h of hashes) {
        set.add(h)
      }
      refs.set(tag, set)
      return Promise.resolve()
    },
    getTagRefs(tag) {
      return Promise.resolve([...(refs.get(tag) ?? [])])
    },
    removeTagRefs(tag, hashes) {
      const set = refs.get(tag)
      if (!set) {
        return Promise.resolve()
      }
      for (const h of hashes) {
        set.delete(h)
      }
      return Promise.resolve()
    },
    getTtl(hash) {
      return ttls.get(hash)
    },
  }
}
