import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, relative, sep } from "node:path"

export function resolveCacheHandlerSpecifier(fromFile: string, packageName: string): string {
  try {
    createRequire(fromFile).resolve(packageName)
    return packageName
  } catch {
    const entry = createRequire(import.meta.url).resolve(packageName)
    const rel = relative(dirname(fromFile), entry)
    const normalized = rel.split(sep).join("/")
    return normalized.startsWith(".") ? normalized : `./${normalized}`
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
