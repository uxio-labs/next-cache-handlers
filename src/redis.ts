import { join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  createCacheHandlerAdapter,
  resolveCacheHandlerSpecifier,
} from "./create-cache-handler-adapter.ts"
import { validateRedisCacheHandlerOptions } from "./create-redis-cache-handler.ts"

import type { RedisCacheHandlerOptions } from "./types.ts"

function resolveEnvHandlerPath(): string {
  const ext = import.meta.url.endsWith(".ts") ? ".ts" : ".js"
  return fileURLToPath(new URL(`./redis-env${ext}`, import.meta.url))
}

// Installed apps import "next-cache-handlers" by name. This repo's tests run
// before dist exists, so they fall back to the TypeScript source.
const resolveConfigured = createCacheHandlerAdapter({
  specifier: resolveCacheHandlerSpecifier(
    join(process.cwd(), "node_modules", ".cache", "next-cache-handlers", "handler.mjs"),
    "next-cache-handlers",
  ),
  factoryName: "createRedisCacheHandler",
})

export function redis(options?: RedisCacheHandlerOptions): string {
  if (options === undefined) {
    return resolveEnvHandlerPath()
  }
  validateRedisCacheHandlerOptions(options)
  return resolveConfigured(options)
}

export default redis
