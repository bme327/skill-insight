import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'

// The Extensions view "Details" webview has `img-src https: data:` in its CSP, so a
// relative path shipped in the VSIX can never load - inline local images as data URIs.
const MIME_TYPES = {
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

const source = await readFile('DETAILS.md', 'utf8')
const pattern = /!\[([^\]]*)\]\((?!https?:|data:)([^)\s]+)\)/g

const matches = [...source.matchAll(pattern)]
const replacements = await Promise.all(
  matches.map(async ([, alt, relativePath]) => {
    const mime = MIME_TYPES[extname(relativePath).toLowerCase()]
    if (!mime) return undefined
    const bytes = await readFile(relativePath)
    return `![${alt}](data:${mime};base64,${bytes.toString('base64')})`
  }),
)

let result = source
let offset = 0
for (const [index, match] of matches.entries()) {
  const replacement = replacements[index]
  if (!replacement) continue
  const start = match.index + offset
  result = result.slice(0, start) + replacement + result.slice(start + match[0].length)
  offset += replacement.length - match[0].length
}

await mkdir('dist', { recursive: true })
await writeFile('dist/readme.md', result)
