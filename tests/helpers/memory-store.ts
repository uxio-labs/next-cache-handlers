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
    async getEntry(hash) {
      return entries.get(hash)
    },
    async setEntry(hash, entry, ttlSec) {
      entries.set(hash, entry)
      ttls.set(hash, ttlSec)
    },
    async deleteEntry(hash) {
      const existing = entries.get(hash)
      entries.delete(hash)
      ttls.delete(hash)
      return existing
    },
    async getTagManifest() {
      return { ...tags }
    },
    async setTagEntries(entriesToSet) {
      Object.assign(tags, entriesToSet)
    },
    async addTagRefs(tag, hashes) {
      const set = refs.get(tag) ?? new Set<string>()
      for (const h of hashes) {
        set.add(h)
      }
      refs.set(tag, set)
    },
    async getTagRefs(tag) {
      return [...(refs.get(tag) ?? [])]
    },
    async removeTagRefs(tag, hashes) {
      const set = refs.get(tag)
      if (!set) {
        return
      }
      for (const h of hashes) {
        set.delete(h)
      }
    },
    getTtl(hash) {
      return ttls.get(hash)
    },
  }
}
