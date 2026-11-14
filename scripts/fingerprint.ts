import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { createHash } from "node:crypto"

export function fingerprint(root: string): string {
  const hash = createHash("sha256")
  const files = ["package.json","manifest.json",...["scripts", "circuits", "full-boards"].flatMap((directory) => readdirSync(join(root,directory),{withFileTypes:true}).filter((f) => f.isFile()).map((f) => `${directory}/${f.name}`))]
  for (const file of files.sort()) hash.update(file + "\0").update(readFileSync(join(root,file))).update("\0")
  return `sha256:${hash.digest("hex")}`
}
