import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis"
import { createClient } from "redis"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createRedisCacheHandler } from "../src/create-redis-cache-handler.ts"
import { hashCacheKey } from "../src/protocol.ts"
import { makeEntry, pending, readText } from "./helpers/entry.ts"

describe("createRedisCacheHandler", () => {
  it("throws when url is missing", () => {
    expect(() => createRedisCacheHandler({ url: "" })).toThrow(/url is required/)
  })

  it("throws when database is invalid", () => {
    expect(() => createRedisCacheHandler({ url: "redis://localhost:6379", database: -1 })).toThrow(
      /database/,
    )
    expect(() =>
      createRedisCacheHandler({
        url: "redis://localhost:6379",
        database: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow(/database/)
  })
})

describe("Redis cache handler", () => {
  let url: string
  let container: StartedRedisContainer

  beforeAll(async () => {
    container = await new RedisContainer("redis:7.4-alpine").start()
    url = container.getConnectionUrl()
  }, 60_000)

  afterAll(async () => {
    await container.stop()
  })

  it("round-trips bytes and metadata", async () => {
    const handler = createRedisCacheHandler({ url, prefix: "t-roundtrip" })
    const entry = makeEntry({ tags: ["posts"], stale: 9, expire: 120, revalidate: 30 })
    await handler.set("k1", pending(entry))
    const got = await handler.get("k1", [])
    expect(got?.tags).toEqual(["posts"])
    expect(got?.stale).toBe(9)
    expect(got?.expire).toBe(120)
    expect(got?.revalidate).toBe(30)
    expect(got).toBeDefined()
    if (got) {
      expect(await readText(got.value)).toBe("hello")
    }
  })

  it("sets a Redis TTL on the entry key", async () => {
    const prefix = "t-ttl"
    const handler = createRedisCacheHandler({ url, prefix })
    await handler.set("k1", pending(makeEntry({ expire: 120, revalidate: 30 })))
    const redis = createClient({ url })
    await redis.connect()
    try {
      const ttl = await redis.ttl(`${prefix}:e:${hashCacheKey("k1")}`)
      expect(ttl).toBeGreaterThan(0)
      expect(ttl).toBeLessThanOrEqual(120)
    } finally {
      await redis.quit()
    }
  })

  it("misses after updateTags via local/remote manifest", async () => {
    const handler = createRedisCacheHandler({ url, prefix: "t-del" })
    await handler.set("k1", pending(makeEntry({ tags: ["posts"], timestamp: Date.now() - 1000 })))
    await handler.updateTags(["posts"])
    await expect(handler.get("k1", [])).resolves.toBeUndefined()
  })

  it("hard-deletes tagged entries and clears tag refs when expire is zero", async () => {
    const prefix = "t-hard-del"
    const handler = createRedisCacheHandler({ url, prefix })
    const hash = hashCacheKey("k1")
    const refKey = `${prefix}:r:${Buffer.from("posts", "utf8").toString("base64url")}`
    await handler.set("k1", pending(makeEntry({ tags: ["posts"] })))

    await handler.updateTags(["posts"], { expire: 0 })

    const redis = createClient({ url })
    await redis.connect()
    try {
      await expect(redis.exists(`${prefix}:e:${hash}`)).resolves.toBe(0)
      await expect(redis.sMembers(refKey)).resolves.toEqual([])
    } finally {
      await redis.quit()
    }
  })

  it("exposes tag updates to a second handler after refreshTags", async () => {
    const prefix = "t-refresh"
    const writer = createRedisCacheHandler({ url, prefix })
    const reader = createRedisCacheHandler({ url, prefix })
    await writer.set("k1", pending(makeEntry({ tags: ["posts"], timestamp: Date.now() - 1000 })))
    await writer.updateTags(["posts"])
    await expect(reader.get("k1", [])).resolves.toBeDefined()
    await reader.refreshTags()
    await expect(reader.get("k1", [])).resolves.toBeUndefined()
  })

  it("isolates two prefixes on the same Redis", async () => {
    const a = createRedisCacheHandler({ url, prefix: "t-a" })
    const b = createRedisCacheHandler({ url, prefix: "t-b" })
    await a.set("k1", pending(makeEntry({ tags: ["posts"] })))
    await expect(b.get("k1", [])).resolves.toBeUndefined()
    await expect(a.get("k1", [])).resolves.toBeDefined()
  })
})
