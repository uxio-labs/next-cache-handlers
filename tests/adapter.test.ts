import { existsSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createCacheHandlerFactory } from "../src/create-cache-handler.ts"
import { makeEntry, pending, readText } from "./helpers/entry.ts"
import { loadHandlerFromPath } from "./helpers/load-handler.ts"
import { createMemoryStore } from "./helpers/memory-store.ts"

afterEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("createCacheHandlerFactory", () => {
  it("returns a function that builds a handler from options", async () => {
    const create = createCacheHandlerFactory((options: { prefix: string }) => {
      expect(options.prefix).toBe("from-config")
      return createMemoryStore()
    })

    const handler = create({ prefix: "from-config" })
    await handler.set("k1", pending(makeEntry()))
    const got = await handler.get("k1", [])
    expect(got).toBeDefined()
    if (got) {
      expect(await readText(got.value)).toBe("hello")
    }
  })
})

describe("next-cache-handlers/redis factory", () => {
  it("returns a resolvable handler path for the given config", async () => {
    const { default: redis } = await import("../src/redis.ts")
    const handlerPath = redis({
      url: "redis://localhost:6379",
      database: 2,
      prefix: "from-config",
    })

    expect(typeof handlerPath).toBe("string")
    expect(handlerPath.endsWith(".mjs")).toBe(true)
    expect(existsSync(handlerPath)).toBe(true)

    const handler = await loadHandlerFromPath(handlerPath)
    expect(typeof handler.get).toBe("function")
    expect(typeof handler.set).toBe("function")
  })

  it("throws when url is missing, like createRedisCacheHandler", async () => {
    const { default: redis } = await import("../src/redis.ts")
    expect(() => redis({ url: "" })).toThrow(/url is required/)
  })

  it("throws when database is invalid, like createRedisCacheHandler", async () => {
    const { default: redis } = await import("../src/redis.ts")
    expect(() => redis({ url: "redis://localhost:6379", database: -1 })).toThrow(/database/)
  })

  it("returns the env handler path when called without config", async () => {
    vi.stubEnv("REDIS_URL", "")
    vi.stubEnv("REDIS_DB", "")
    vi.stubEnv("NEXT_CACHE_HANDLERS_PREFIX", "")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { default: redis } = await import("../src/redis.ts")
    const handlerPath = redis()
    expect(typeof handlerPath).toBe("string")
    expect(existsSync(handlerPath)).toBe(true)

    const handler = await loadHandlerFromPath(handlerPath)
    await expect(handler.get("k1", [])).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    expect(warn.mock.calls[0]?.[0]).toMatch(/REDIS_URL/)
  })
})
