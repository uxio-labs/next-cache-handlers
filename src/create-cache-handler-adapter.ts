import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export function createCacheHandlerAdapter(spec: {
  factoryHref: string
  factoryName: string
}): (options: unknown) => string {
  return (options) => {
    const source = `import { ${spec.factoryName} } from ${JSON.stringify(spec.factoryHref)}\nexport default ${spec.factoryName}(${JSON.stringify(options)})\n`
    const key = `${spec.factoryHref}\0${spec.factoryName}\0${JSON.stringify(options)}`
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
