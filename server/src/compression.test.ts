import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import express from 'express'
import { acceptedEncoding, compressJson, MIN_COMPRESS_BYTES, precompressedFiles } from './compression.js'

describe('acceptedEncoding', () => {
  it('prefers brotli, falls back to gzip and honours q=0', () => {
    assert.equal(acceptedEncoding('gzip, deflate, br'), 'br')
    assert.equal(acceptedEncoding('gzip, br;q=0'), 'gzip')
    assert.equal(acceptedEncoding('identity'), null)
    assert.equal(acceptedEncoding(undefined), null)
    assert.equal(acceptedEncoding('*'), 'br')
    assert.equal(acceptedEncoding('*, br;q=0'), 'gzip')
  })

  it('offers only the encodings that exist', () => {
    assert.equal(acceptedEncoding('br, gzip', ['gzip']), 'gzip')
    assert.equal(acceptedEncoding('br', ['gzip']), null)
  })
})

async function serve(app: express.Express) {
  const server: Server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe('compressJson', () => {
  it('compresses large JSON for clients that accept it and leaves small bodies alone', async () => {
    const app = express()
    app.use(compressJson())
    app.get('/big', (_req, res) => res.json({ items: 'x'.repeat(MIN_COMPRESS_BYTES * 4) }))
    app.get('/small', (_req, res) => res.json({ ok: true }))
    const { base, close } = await serve(app)
    try {
      const big = await fetch(`${base}/big`, { headers: { 'Accept-Encoding': 'gzip' } })
      assert.equal(big.headers.get('content-encoding'), 'gzip')
      assert.match(big.headers.get('vary') ?? '', /Accept-Encoding/)
      assert.equal((await big.json()).items.length, MIN_COMPRESS_BYTES * 4)

      const small = await fetch(`${base}/small`, { headers: { 'Accept-Encoding': 'br' } })
      assert.equal(small.headers.get('content-encoding'), null)
      assert.deepEqual(await small.json(), { ok: true })

      const plain = await fetch(`${base}/big`, { headers: { 'Accept-Encoding': 'identity' } })
      assert.equal(plain.headers.get('content-encoding'), null)
    } finally {
      await close()
    }
  })
})

describe('precompressedFiles', () => {
  it('serves the best precompressed variant with the original type and cache policy', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'erp-precompressed-'))
    const source = `console.log(${JSON.stringify('a'.repeat(4096))})`
    mkdirSync(path.join(dir, 'assets'))
    writeFileSync(path.join(dir, 'assets', 'app.js'), source)
    writeFileSync(path.join(dir, 'assets', 'app.js.br'), brotliCompressSync(source))
    writeFileSync(path.join(dir, 'assets', 'app.js.gz'), gzipSync(source))
    writeFileSync(path.join(dir, 'plain.txt'), 'plain')
    const files = precompressedFiles(dir)
    const app = express()
    app.use((req, res, next) => {
      if (!files.send(res, req.path.slice(1), req.headers['accept-encoding'], 'public, max-age=60')) next()
    })
    app.use((_req, res) => res.status(404).end())
    const { base, close } = await serve(app)
    try {
      const br = await fetch(`${base}/assets/app.js`, { headers: { 'Accept-Encoding': 'br, gzip' } })
      assert.equal(br.headers.get('content-encoding'), 'br')
      assert.match(br.headers.get('content-type') ?? '', /javascript/)
      assert.equal(br.headers.get('cache-control'), 'public, max-age=60')
      assert.equal(await br.text(), source)

      const gzip = await fetch(`${base}/assets/app.js`, { headers: { 'Accept-Encoding': 'gzip' } })
      assert.equal(gzip.headers.get('content-encoding'), 'gzip')
      assert.equal(await gzip.text(), source)

      const identity = await fetch(`${base}/assets/app.js`, { headers: { 'Accept-Encoding': 'identity' } })
      assert.equal(identity.status, 404, 'falls through to the regular static handler')
      assert.equal((await fetch(`${base}/plain.txt`)).status, 404, 'files without variants fall through')
      assert.equal((await fetch(`${base}/../secret`)).status, 404)
    } finally {
      await close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
