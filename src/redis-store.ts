import { createClient, type RedisClientType } from "redis"

import { DEFAULT_PREFIX } from "./types.ts"

import type {
  CacheStore,
  RedisCacheHandlerOptions,
  SerializedEntry,
  StoredTagEntry,
} from "./types.ts"

function refKey(prefix: string, tag: string): string {
  return `${prefix}:r:${Buffer.from(tag, "utf8").toString("base64url")}`
}

export function createRedisStore(options: RedisCacheHandlerOptions): CacheStore {
  const prefix = options.prefix ?? DEFAULT_PREFIX
  let client: RedisClientType | undefined

  async function getClient(): Promise<RedisClientType> {
    if (!client) {
      client = createClient({
        url: options.url,
        ...(options.database !== undefined ? { database: options.database } : {}),
      })
      client.on("error", (error) => {
        console.error("[cache-fn] Redis client error:", error)
      })
    }
    if (!client.isOpen) {
      await client.connect()
    }
    return client
  }

  return {
    async getEntry(hash) {
      const redis = await getClient()
      const raw = await redis.get(`${prefix}:e:${hash}`)
      if (!raw) {
        return undefined
      }
      try {
        return JSON.parse(raw) as SerializedEntry
      } catch {
        return undefined
      }
    },

    async setEntry(hash, entry, ttlSec) {
      const redis = await getClient()
      await redis.set(`${prefix}:e:${hash}`, JSON.stringify(entry), {
        expiration: { type: "EX", value: ttlSec },
      })
    },

    async deleteEntry(hash) {
      const redis = await getClient()
      const raw = await redis.getDel(`${prefix}:e:${hash}`)
      if (!raw) {
        return undefined
      }
      try {
        return JSON.parse(raw) as SerializedEntry
      } catch {
        return undefined
      }
    },

    async getTagManifest() {
      const redis = await getClient()
      const all = await redis.hGetAll(`${prefix}:tags`)
      const manifest: Record<string, StoredTagEntry> = {}
      for (const [tag, json] of Object.entries(all)) {
        try {
          manifest[tag] = JSON.parse(json) as StoredTagEntry
        } catch {
          // skip malformed
        }
      }
      return manifest
    },

    async setTagEntries(entries) {
      const redis = await getClient()
      const pipeline = redis.multi()
      for (const [tag, data] of Object.entries(entries)) {
        pipeline.hSet(`${prefix}:tags`, tag, JSON.stringify(data))
      }
      await pipeline.exec()
    },

    async addTagRefs(tag, hashes) {
      if (hashes.length === 0) {
        return
      }
      const redis = await getClient()
      await redis.sAdd(refKey(prefix, tag), hashes)
    },

    async getTagRefs(tag) {
      const redis = await getClient()
      return redis.sMembers(refKey(prefix, tag))
    },

    async removeTagRefs(tag, hashes) {
      if (hashes.length === 0) {
        return
      }
      const redis = await getClient()
      await redis.sRem(refKey(prefix, tag), hashes)
    },
  }
}
