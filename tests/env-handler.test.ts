import { afterEach, describe, expect, it, vi } from "vitest"

import { makeEntry, pending } from "./helpers/entry.ts"
import { loadHandlerFromPath } from "./helpers/load-handler.ts"

import type { CacheHandler } from "../src/types.ts"

afterEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function loadEnvHandler(): Promise<CacheHandler> {
  const { default: redis } = await import("../src/redis.ts")
  return loadHandlerFromPath(redis())
}

describe("next-cache-handlers/redis env handler", () => {
  it("is always-miss and warns once when REDIS_URL is missing", async () => {
    vi.stubEnv("REDIS_URL", "")
    vi.stubEnv("REDIS_DB", "")
    vi.stubEnv("NEXT_CACHE_HANDLERS_PREFIX", "")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const handler = await loadEnvHandler()
    await expect(handler.get("k1", [])).resolves.toBeUndefined()
    await expect(handler.set("k1", pending(makeEntry()))).resolves.toBeUndefined()
    const handler2 = await loadEnvHandler()
    await expect(handler2.get("k2", [])).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toMatch(/REDIS_URL/)
  })

  it("throws when REDIS_DB is invalid with REDIS_URL set", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    vi.stubEnv("REDIS_DB", "1abc")
    await expect(loadEnvHandler()).rejects.toThrow(/REDIS_DB must be a non-negative integer/)
  })

  it("throws when REDIS_DB is a decimal with REDIS_URL set", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    vi.stubEnv("REDIS_DB", "1.5")
    await expect(loadEnvHandler()).rejects.toThrow(/REDIS_DB must be a non-negative integer/)
  })

  it("throws when REDIS_DB exceeds the safe integer range", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    vi.stubEnv("REDIS_DB", String(Number.MAX_SAFE_INTEGER + 1))
    await expect(loadEnvHandler()).rejects.toThrow(/REDIS_DB must be a non-negative safe integer/)
  })

  it("accepts valid REDIS_DB values without connecting", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    vi.stubEnv("REDIS_DB", "0")
    const handler0 = await loadEnvHandler()
    expect(handler0).toBeDefined()

    vi.resetModules()
    vi.unstubAllEnvs()
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    vi.stubEnv("REDIS_DB", "2")
    const handler2 = await loadEnvHandler()
    expect(handler2).toBeDefined()
  })
})
