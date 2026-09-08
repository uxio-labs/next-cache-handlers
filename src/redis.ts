import { createCacheHandler } from "./create-cache-handler.ts"
import { createRedisCacheHandler } from "./create-redis-cache-handler.ts"
import { DEFAULT_PREFIX } from "./types.ts"

import type { CacheHandler, CacheStore } from "./types.ts"

function parseDatabase(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") {
    return undefined
  }
  if (!/^\d+$/.test(raw)) {
    throw new Error(`REDIS_DB must be a non-negative integer, got ${JSON.stringify(raw)}`)
  }
  const database = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(database)) {
    throw new Error(`REDIS_DB must be a non-negative safe integer, got ${JSON.stringify(raw)}`)
  }
  return database
}

function createDisabledHandler(): CacheHandler {
  const store: CacheStore = {
    getEntry() {
      return Promise.resolve(undefined)
    },
    async setEntry() {},
    deleteEntry() {
      return Promise.resolve(undefined)
    },
    getTagManifest() {
      return Promise.resolve({})
    },
    async setTagEntries() {},
    async addTagRefs() {},
    getTagRefs() {
      return Promise.resolve([])
    },
    async removeTagRefs() {},
  }
  return createCacheHandler(store)
}

let missingUrlWarned = false

function createEnvHandler(): CacheHandler {
  const url = process.env.REDIS_URL
  if (!url) {
    if (!missingUrlWarned) {
      missingUrlWarned = true
      console.warn("[cache-fn] REDIS_URL is not set; Redis cache handler is disabled")
    }
    return createDisabledHandler()
  }
  return createRedisCacheHandler({
    url,
    database: parseDatabase(process.env.REDIS_DB),
    prefix: process.env.CACHE_FN_PREFIX || DEFAULT_PREFIX,
  })
}

export default createEnvHandler()
