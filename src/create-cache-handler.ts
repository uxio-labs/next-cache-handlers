import {
  areTagsExpired,
  areTagsStale,
  bytesToStream,
  decodeExpire,
  encodeExpire,
  entryTtlSec,
  hashCacheKey,
  readStreamToBuffer,
} from "./protocol.ts"
import type { CacheHandler, CacheStore, StoredTagEntry } from "./types.ts"

export function createCacheHandler(store: CacheStore): CacheHandler {
  const localTagsManifest = new Map<string, StoredTagEntry>()
  const pendingSets = new Map<string, Promise<void>>()

  return {
    async get(cacheKey, softTags) {
      try {
        const pendingPromise = pendingSets.get(cacheKey)
        if (pendingPromise) {
          await pendingPromise
        }

        const parsed = await store.getEntry(hashCacheKey(cacheKey))
        if (!parsed) {
          return undefined
        }

        const tagsToCheck = [...parsed.tags, ...softTags]
        if (areTagsExpired(localTagsManifest, tagsToCheck, parsed.timestamp)) {
          return undefined
        }

        let revalidate = parsed.revalidate
        if (areTagsStale(localTagsManifest, tagsToCheck, parsed.timestamp)) {
          revalidate = -1
        }

        return {
          value: bytesToStream(Buffer.from(parsed.valueB64, "base64")),
          tags: parsed.tags,
          stale: parsed.stale,
          timestamp: parsed.timestamp,
          expire: decodeExpire(parsed.expire),
          revalidate,
        }
      } catch {
        return undefined
      }
    },

    async set(cacheKey, pendingEntry) {
      let resolvePending = () => {}
      const pendingPromise = new Promise<void>((resolve) => {
        resolvePending = resolve
      })
      const previousPending = pendingSets.get(cacheKey)
      pendingSets.set(cacheKey, pendingPromise)

      try {
        if (previousPending) {
          await previousPending
        }

        const entry = await pendingEntry
        const body = await readStreamToBuffer(entry.value)
        const hash = hashCacheKey(cacheKey)
        await store.setEntry(
          hash,
          {
            valueB64: Buffer.from(body).toString("base64"),
            tags: entry.tags,
            stale: entry.stale,
            timestamp: entry.timestamp,
            expire: encodeExpire(entry.expire),
            revalidate: entry.revalidate,
          },
          entryTtlSec(entry.expire, entry.revalidate),
        )
        for (const tag of entry.tags) {
          await store.addTagRefs(tag, [hash])
        }
      } catch (error) {
        console.error("[cache-fn] set failed", error)
      } finally {
        resolvePending()
        if (pendingSets.get(cacheKey) === pendingPromise) {
          pendingSets.delete(cacheKey)
        }
      }
    },

    async refreshTags() {
      try {
        const all = await store.getTagManifest()
        localTagsManifest.clear()
        for (const [tag, entry] of Object.entries(all)) {
          localTagsManifest.set(tag, entry)
        }
      } catch (error) {
        console.error("[cache-fn] refreshTags failed", error)
      }
    },

    async getExpiration(tags) {
      try {
        return Math.max(0, ...tags.map((tag) => localTagsManifest.get(tag)?.expired ?? 0))
      } catch {
        return 0
      }
    },

    async updateTags(tags, durations) {
      const now = Math.round(performance.timeOrigin + performance.now())

      const apply = async () => {
        for (const tag of tags) {
          const existing = localTagsManifest.get(tag) ?? {}
          if (durations) {
            const updates: StoredTagEntry = { ...existing, stale: now }
            if (durations.expire !== undefined) {
              updates.expired = now + durations.expire * 1000
            }
            localTagsManifest.set(tag, updates)
          } else {
            localTagsManifest.set(tag, { ...existing, expired: now })
          }
        }

        const toWrite: Record<string, StoredTagEntry> = {}
        for (const tag of tags) {
          const data = localTagsManifest.get(tag)
          if (data) {
            toWrite[tag] = data
          }
        }
        await store.setTagEntries(toWrite)

        const hashesToDelete = new Set<string>()
        for (const tag of tags) {
          for (const hash of await store.getTagRefs(tag)) {
            hashesToDelete.add(hash)
          }
        }
        for (const hash of hashesToDelete) {
          const entry = await store.deleteEntry(hash)
          if (entry) {
            for (const tag of entry.tags) {
              await store.removeTagRefs(tag, [hash])
            }
          }
        }
      }

      if (durations?.expire === 0) {
        await apply()
        return
      }

      try {
        await apply()
      } catch (error) {
        console.error("[cache-fn] updateTags failed", error)
      }
    },
  }
}
