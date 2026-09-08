import { afterEach, describe, expect, it, vi } from "vitest"

import { makeEntry, pending } from "./helpers/entry.ts"

afterEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("cache-fn/redis env handler", () => {
  it("is always-miss and warns once when REDIS_URL is missing", async () => {
    vi.stubEnv("REDIS_URL", "")
    vi.stubEnv("REDIS_DB", "")
    vi.stubEnv("CACHE_FN_PREFIX", "")
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
})
