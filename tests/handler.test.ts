import { describe, expect, it, vi } from "vitest"
import { createCacheHandler } from "../src/create-cache-handler.ts"
import { hashCacheKey } from "../src/protocol.ts"
import { INFINITY_TTL_SEC } from "../src/types.ts"
import { makeEntry, pending, readText } from "./helpers/entry.ts"
import { createMemoryStore } from "./helpers/memory-store.ts"

describe("createCacheHandler get/set", () => {
  it("returns undefined on a miss", async () => {
    const handler = createCacheHandler(createMemoryStore())
    await expect(handler.get("missing", [])).resolves.toBeUndefined()
  })

  it("round-trips bytes and metadata", async () => {
    const store = createMemoryStore()
    const handler = createCacheHandler(store)
    const entry = makeEntry({ tags: ["posts"], stale: 12, expire: 99, revalidate: 30 })
    await handler.set("k1", pending(entry))

    const got = await handler.get("k1", [])
    expect(got).toBeDefined()
    expect(got?.tags).toEqual(["posts"])
    expect(got?.stale).toBe(12)
    expect(got?.timestamp).toBe(entry.timestamp)
    expect(got?.expire).toBe(99)
    expect(got?.revalidate).toBe(30)
    expect(await readText(got!.value)).toBe("hello")
  })

  it("returns a fresh stream on every get", async () => {
    const handler = createCacheHandler(createMemoryStore())
    await handler.set("k1", pending(makeEntry()))
    const a = await handler.get("k1", [])
    const b = await handler.get("k1", [])
    expect(await readText(a!.value)).toBe("hello")
    expect(await readText(b!.value)).toBe("hello")
  })

  it("waits for an in-flight set before get", async () => {
    const handler = createCacheHandler(createMemoryStore())
    let resolveEntry!: (entry: ReturnType<typeof makeEntry>) => void
    const pendingEntry = new Promise<ReturnType<typeof makeEntry>>((resolve) => {
      resolveEntry = resolve
    })

    const setPromise = handler.set("k1", pendingEntry)
    const getPromise = handler.get("k1", [])
    resolveEntry(makeEntry())
    await setPromise
    const got = await getPromise
    expect(got).toBeDefined()
    expect(await readText(got!.value)).toBe("hello")
  })

  it("discards the write when the value stream errors", async () => {
    const handler = createCacheHandler(createMemoryStore())
    const boom = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("partial"))
        controller.error(new Error("boom"))
      },
    })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    await handler.set("k1", pending(makeEntry({ value: boom })))
    errorSpy.mockRestore()
    await expect(handler.get("k1", [])).resolves.toBeUndefined()
  })

  it("stores a one-year TTL when expire is Infinity", async () => {
    const store = createMemoryStore()
    const handler = createCacheHandler(store)
    await handler.set(
      "k1",
      pending(makeEntry({ expire: Number.POSITIVE_INFINITY, revalidate: 60 })),
    )
    expect(store.getTtl(hashCacheKey("k1"))).toBe(INFINITY_TTL_SEC)
    const got = await handler.get("k1", [])
    expect(got?.expire).toBe(Number.POSITIVE_INFINITY)
  })

  it("does not miss only because revalidate has elapsed", async () => {
    const handler = createCacheHandler(createMemoryStore())
    await handler.set(
      "k1",
      pending(makeEntry({ timestamp: Date.now() - 120_000, revalidate: 60, expire: 3600 })),
    )
    await expect(handler.get("k1", [])).resolves.toBeDefined()
  })
})
