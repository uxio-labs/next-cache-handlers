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

// Package name when the app can resolve it. A relative path is only for this
// repo's tests, where the generated file sits inside the package's own
// node_modules and cannot import the package name. Never an absolute file URL:
// that path is the build machine's pnpm store and is missing on Vercel.
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
