import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import type { RequestHandler, Response } from 'express'

export type Encoding = 'br' | 'gzip'

const EXTENSION: Record<Encoding, string> = { br: '.br', gzip: '.gz' }
/** Smaller bodies fit into a packet anyway; compressing them only costs CPU. */
export const MIN_COMPRESS_BYTES = 1024
const BROTLI_QUALITY = 4

/** Best encoding the client accepts (`q=0` means «refused»), brotli first. */
export function acceptedEncoding(header: string | undefined, offered: readonly Encoding[] = ['br', 'gzip']): Encoding | null {
  if (!header) return null
  const accepted = new Map<string, number>()
  for (const part of header.split(',')) {
    const [name = '', ...params] = part.trim().toLowerCase().split(';')
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
    accepted.set(name.trim(), q ? Number(q.slice(2)) || 0 : 1)
  }
  const wildcard = accepted.get('*')
  return offered.find((encoding) => (accepted.get(encoding) ?? wildcard ?? 0) > 0) ?? null
}

export function compressBody(body: Buffer, encoding: Encoding): Buffer {
  return encoding === 'br'
    ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } })
    : gzipSync(body)
}

function addVary(res: Response) {
  const vary = res.getHeader('Vary')
  if (!vary) res.setHeader('Vary', 'Accept-Encoding')
  else if (!String(vary).toLowerCase().includes('accept-encoding')) res.setHeader('Vary', `${vary}, Accept-Encoding`)
}

/** Compresses `res.json` bodies; streams and files are left as they are. */
export function compressJson(): RequestHandler {
  return (req, res, next) => {
    const json = res.json.bind(res)
    res.json = (value: unknown) => {
      const encoding = acceptedEncoding(req.headers['accept-encoding'])
      const body = Buffer.from(JSON.stringify(value) ?? 'null')
      if (!encoding || body.length < MIN_COMPRESS_BYTES || req.method === 'HEAD' || res.headersSent) return json(value)
      addVary(res)
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Encoding', encoding)
      res.end(compressBody(body, encoding))
      return res
    }
    next()
  }
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? listFiles(full) : [full]
  })
}

/**
 * Serves `file.br` / `file.gz` written next to the build output instead of the original.
 * The list is read once: the bundle does not change while the server runs.
 */
export function precompressedFiles(root: string) {
  const available = new Set(existsSync(root) ? listFiles(root).map((f) => path.relative(root, f).split(path.sep).join('/')) : [])

  function variantOf(relative: string, acceptEncoding: string | undefined): { file: string; encoding: Encoding } | null {
    const offered = (['br', 'gzip'] as const).filter((e) => available.has(relative + EXTENSION[e]))
    const encoding = acceptedEncoding(acceptEncoding, offered)
    return encoding ? { file: path.join(root, relative + EXTENSION[encoding]), encoding } : null
  }

  /** Sends a compressed variant of `relative` when there is one; otherwise returns false. */
  function send(res: Response, relative: string, acceptEncoding: string | undefined, cacheControl: string): boolean {
    if (!available.has(relative)) return false
    addVary(res)
    const variant = variantOf(relative, acceptEncoding)
    if (!variant) return false
    res.setHeader('Cache-Control', cacheControl)
    res.setHeader('Content-Encoding', variant.encoding)
    res.type(path.extname(relative))
    res.sendFile(variant.file)
    return true
  }

  return { send }
}
