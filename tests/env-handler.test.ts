import { afterEach, describe, expect, it, vi } from "vitest"

import { makeEntry, pending } from "./helpers/entry.ts"

afterEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("next-cache-handlers/redis env handler", () => {
  it("is always-miss and warns once when REDIS_URL is missing", async () => {
    vi.stubEnv("REDIS_URL", "")
    vi.stubEnv("REDIS_DB", "")
    vi.stubEnv("NEXT_CACHE_HANDLERS_PREFIX", "")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const mod = await import("../src/redis.ts")
    const handler = mod.default
    await expect(handler.get("k1", [])).resolves.toBeUndefined()
    await expect(handler.set("k1", pending(makeEntry()))).resolves.toBeUndefined()
    const mod2 = await import("../src/redis.ts")
    await expect(mod2.default.get("k2", [])).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toMatch(/REDIS_URL/)
  })

  it("throws when REDIS_DB is invalid with REDIS_URL set", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    vi.stubEnv("REDIS_DB", "1abc")
    await expect(import("../src/redis.ts")).rejects.toThrow(
      /REDIS_DB must be a non-negative integer/,
    )
  })

  it("throws when REDIS_DB is a decimal with REDIS_URL set", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    vi.stubEnv("REDIS_DB", "1.5")
    await expect(import("../src/redis.ts")).rejects.toThrow(
      /REDIS_DB must be a non-negative integer/,
    )
  })

  it("throws when REDIS_DB exceeds the safe integer range", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    vi.stubEnv("REDIS_DB", String(Number.MAX_SAFE_INTEGER + 1))
    await expect(import("../src/redis.ts")).rejects.toThrow(
      /REDIS_DB must be a non-negative safe integer/,
    )
  })

  it("accepts valid REDIS_DB values without connecting", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    vi.stubEnv("REDIS_DB", "0")
    const mod0 = await import("../src/redis.ts")
    expect(mod0.default).toBeDefined()

    vi.resetModules()
    vi.unstubAllEnvs()
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    vi.stubEnv("REDIS_DB", "2")
    const mod2 = await import("../src/redis.ts")
    expect(mod2.default).toBeDefined()
  })
})
