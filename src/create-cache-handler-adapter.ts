import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export function resolveCacheHandlerSpecifier(fromFile: string, packageName: string): string {
  try {
    createRequire(fromFile).resolve(packageName)
    return packageName
  } catch {
    // Tests import this module before `pnpm build`, so dist/index.js does not
    // exist yet. Point the generated handler at the TypeScript source instead
    // of an absolute pnpm path.
    return pathToFileURL(fileURLToPath(new URL("./index.ts", import.meta.url))).href
  }
}

export function createCacheHandlerAdapter(spec: {
  specifier: string
  factoryName: string
}): (options: unknown) => string {
  return (options) => {
    const source = `import { ${spec.factoryName} } from ${JSON.stringify(spec.specifier)}\nexport default ${spec.factoryName}(${JSON.stringify(options)})\n`
    const key = `${spec.specifier}\0${spec.factoryName}\0${JSON.stringify(options)}`
    const hash = createHash("sha256").update(key).digest("hex").slice(0, 16)
    const dir = resolveAdapterDir()
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${hash}.mjs`)
    writeFileSync(file, source)
    return file
  }
}

function resolveAdapterDir(): string {
  const projectDir = join(process.cwd(), "node_modules", ".cache", "next-cache-handlers")
  try {
    mkdirSync(projectDir, { recursive: true })
    return projectDir
  } catch {
    return join(tmpdir(), "next-cache-handlers")
  }
}
