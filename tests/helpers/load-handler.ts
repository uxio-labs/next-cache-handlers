import { pathToFileURL } from "node:url"

import type { CacheHandler } from "../../src/types.ts"

export async function loadHandlerFromPath(handlerPath: string): Promise<CacheHandler> {
  const loaded = (await import(pathToFileURL(handlerPath).href)) as unknown
  return readDefaultHandler(loaded)
}

function readDefaultHandler(moduleNamespace: unknown): CacheHandler {
  if (typeof moduleNamespace !== "object" || moduleNamespace === null) {
    throw new Error("expected a module namespace")
  }
  if (!("default" in moduleNamespace)) {
    throw new Error("expected a default export")
  }
  const handler: unknown = moduleNamespace.default
  if (
    typeof handler !== "object" ||
    handler === null ||
    !("get" in handler) ||
    !("set" in handler) ||
    typeof handler.get !== "function" ||
    typeof handler.set !== "function"
  ) {
    throw new Error("expected a CacheHandler default export")
  }
  return handler as CacheHandler
}
