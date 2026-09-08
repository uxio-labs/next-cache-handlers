import { describe, expect, it, vi } from "vitest"
import { createCacheHandler } from "../src/create-cache-handler.ts"
import { bytesToStream, hashCacheKey } from "../src/protocol.ts"
import { INFINITY_TTL_SEC, type CacheStore } from "../src/types.ts"
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

    const got = requireEntry(await handler.get("k1", []))
    expect(got.tags).toEqual(["posts"])
    expect(got.stale).toBe(12)
    expect(got.timestamp).toBe(entry.timestamp)
    expect(got.expire).toBe(99)
    expect(got.revalidate).toBe(30)
    expect(await readText(got.value)).toBe("hello")
  })

  it("returns a fresh stream on every get", async () => {
    const handler = createCacheHandler(createMemoryStore())
    await handler.set("k1", pending(makeEntry()))
    const a = requireEntry(await handler.get("k1", []))
    const b = requireEntry(await handler.get("k1", []))
    expect(await readText(a.value)).toBe("hello")
    expect(await readText(b.value)).toBe("hello")
  })

  it("waits for the latest in-flight set when two sets overlap", async () => {
    const handler = createCacheHandler(createMemoryStore())

    let resolveSet1!: (entry: ReturnType<typeof makeEntry>) => void
    let resolveSet2!: (entry: ReturnType<typeof makeEntry>) => void
    const pendingSet1 = new Promise<ReturnType<typeof makeEntry>>((resolve) => {
      resolveSet1 = resolve
    })
    const pendingSet2 = new Promise<ReturnType<typeof makeEntry>>((resolve) => {
      resolveSet2 = resolve
    })

    const set1Promise = handler.set("k1", pendingSet1)
    const set2Promise = handler.set("k1", pendingSet2)

    resolveSet1(
      makeEntry({ value: bytesToStream(new TextEncoder().encode("first")) }),
    )
    await set1Promise

    const getPromise = handler.get("k1", [])

    resolveSet2(
      makeEntry({ value: bytesToStream(new TextEncoder().encode("second")) }),
    )
    await set2Promise

    const got = requireEntry(await getPromise)
    expect(await readText(got.value)).toBe("second")
  })

  it("keeps the later write when overlapping sets resolve out of order", async () => {
    const handler = createCacheHandler(createMemoryStore())

    let resolveSet1!: (entry: ReturnType<typeof makeEntry>) => void
    let resolveSet2!: (entry: ReturnType<typeof makeEntry>) => void
    const pendingSet1 = new Promise<ReturnType<typeof makeEntry>>((resolve) => {
      resolveSet1 = resolve
    })
    const pendingSet2 = new Promise<ReturnType<typeof makeEntry>>((resolve) => {
      resolveSet2 = resolve
    })

    const set1Promise = handler.set("k1", pendingSet1)
    const set2Promise = handler.set("k1", pendingSet2)

    resolveSet2(
      makeEntry({ value: bytesToStream(new TextEncoder().encode("second")) }),
    )
    resolveSet1(
      makeEntry({ value: bytesToStream(new TextEncoder().encode("first")) }),
    )

    await Promise.all([set1Promise, set2Promise])

    const got = requireEntry(await handler.get("k1", []))
    expect(await readText(got.value)).toBe("second")
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
    const got = requireEntry(await getPromise)
    expect(await readText(got.value)).toBe("hello")
  })

  it("does not throw when a queued pendingEntry rejects behind a slow set", async () => {
    const handler = createCacheHandler(createMemoryStore())

    let resolveSet1!: (entry: ReturnType<typeof makeEntry>) => void
    let rejectSet2!: (error: Error) => void
    const pendingSet1 = new Promise<ReturnType<typeof makeEntry>>((resolve) => {
      resolveSet1 = resolve
    })
    const pendingSet2 = new Promise<ReturnType<typeof makeEntry>>((_resolve, reject) => {
      rejectSet2 = reject
    })

    const unhandledRejections: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason)
    }
    process.on("unhandledRejection", onUnhandledRejection)

    const set1Promise = handler.set("k1", pendingSet1)
    const set2Promise = handler.set("k1", pendingSet2)

    rejectSet2(new Error("set2 failed"))
    await new Promise((resolve) => setTimeout(resolve, 0))

    resolveSet1(
      makeEntry({ value: bytesToStream(new TextEncoder().encode("first")) }),
    )

    await expect(set1Promise).resolves.toBeUndefined()
    await expect(set2Promise).resolves.toBeUndefined()

    process.off("unhandledRejection", onUnhandledRejection)

    expect(unhandledRejections).toEqual([])

    const got = requireEntry(await handler.get("k1", []))
    expect(await readText(got.value)).toBe("first")
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

describe("createCacheHandler tags", () => {
  it("misses after explicit tags are hard-expired", async () => {
    const handler = createCacheHandler(createMemoryStore())
    await handler.set("k1", pending(makeEntry({ tags: ["posts"], timestamp: Date.now() - 1000 })))
    await handler.updateTags(["posts"])
    await expect(handler.get("k1", [])).resolves.toBeUndefined()
  })

  it("misses when a soft tag was expired after the entry timestamp", async () => {
    const handler = createCacheHandler(createMemoryStore())
    await handler.set("k1", pending(makeEntry({ tags: ["posts"], timestamp: Date.now() - 1000 })))
    await handler.updateTags(["_N_T_/blog"])
    await expect(handler.get("k1", ["_N_T_/blog"])).resolves.toBeUndefined()
  })

  it("returns revalidate -1 when tags are stale", async () => {
    const handler = createCacheHandler(createMemoryStore())
    await handler.set("k1", pending(makeEntry({ tags: ["posts"], timestamp: Date.now() - 1000 })))
    await handler.updateTags(["posts"], { expire: 60 })
    const got = requireEntry(await handler.get("k1", []))
    expect(got.revalidate).toBe(-1)
    expect(await readText(got.value)).toBe("hello")
  })

  it("getExpiration returns the max expired timestamp", async () => {
    const handler = createCacheHandler(createMemoryStore())
    await handler.updateTags(["a"])
    await handler.updateTags(["b"])
    const expiration = await handler.getExpiration(["a", "b", "missing"])
    expect(expiration).toBeGreaterThan(0)
    expect(await handler.getExpiration(["missing"])).toBe(0)
  })

  it("refreshTags replaces the local manifest from the store", async () => {
    const store = createMemoryStore()
    const writer = createCacheHandler(store)
    const reader = createCacheHandler(store)
    await writer.set("k1", pending(makeEntry({ tags: ["posts"], timestamp: Date.now() - 1000 })))
    await writer.updateTags(["posts"])
    await expect(reader.get("k1", [])).resolves.toBeDefined()
    await reader.refreshTags()
    await expect(reader.get("k1", [])).resolves.toBeUndefined()
  })
})

function rejectingStore(overrides: Partial<CacheStore> = {}): CacheStore {
  const fail = () => Promise.reject(new Error("store down"))
  return {
    getEntry: fail,
    setEntry: fail,
    deleteEntry: fail,
    getTagManifest: fail,
    setTagEntries: fail,
    addTagRefs: fail,
    getTagRefs: fail,
    removeTagRefs: fail,
    ...overrides,
  }
}

describe("createCacheHandler errors", () => {
  it("get returns undefined when the store rejects", async () => {
    const handler = createCacheHandler(rejectingStore())
    await expect(handler.get("k1", [])).resolves.toBeUndefined()
  })

  it("set does not throw when the store rejects", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const handler = createCacheHandler(rejectingStore())
    await expect(handler.set("k1", pending(makeEntry()))).resolves.toBeUndefined()
    errorSpy.mockRestore()
  })

  it("refreshTags keeps the previous manifest when the store rejects", async () => {
    const store = createMemoryStore()
    const handler = createCacheHandler(store)
    await handler.set("k1", pending(makeEntry({ tags: ["posts"], timestamp: Date.now() - 1000 })))
    await handler.updateTags(["posts"])
    store.getTagManifest = () => Promise.reject(new Error("store down"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(handler.refreshTags()).resolves.toBeUndefined()
    errorSpy.mockRestore()
    await expect(handler.get("k1", [])).resolves.toBeUndefined()
  })

  it("propagates store errors for hard updateTags({ expire: 0 })", async () => {
    const handler = createCacheHandler(
      rejectingStore({
        setTagEntries: () => Promise.reject(new Error("store down")),
      }),
    )
    await expect(handler.updateTags(["posts"], { expire: 0 })).rejects.toThrow("store down")
  })

  it("swallows store errors for soft updateTags", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const handler = createCacheHandler(
      rejectingStore({
        setTagEntries: () => Promise.reject(new Error("store down")),
      }),
    )
    await expect(handler.updateTags(["posts"])).resolves.toBeUndefined()
    errorSpy.mockRestore()
  })
})

function requireEntry<T>(value: T | undefined): T {
  expect(value).toBeDefined()
  if (value === undefined) {
    throw new Error("expected cache entry")
  }
  return value
}
