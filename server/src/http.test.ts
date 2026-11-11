import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sendFile, type StoredFile } from './http.js'

function capture() {
  const headers = new Map<string, string>()
  let body: Buffer | undefined
  const res = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value)
    },
    end(data: Buffer) {
      body = data
    },
  }
  return {
    res: res as Parameters<typeof sendFile>[0],
    headers,
    body: () => body,
  }
}

const pdf: StoredFile = { data: Buffer.from('%PDF'), mimeType: 'application/pdf' }
const docx: StoredFile = {
  data: Buffer.from('PK'),
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}
const html: StoredFile = { data: Buffer.from('<html>'), mimeType: 'text/html' }

describe('sendFile disposition', () => {
  it('defaults to attachment and always sets nosniff', () => {
    const out = capture()
    sendFile(out.res, pdf, 'doc.pdf')
    assert.match(out.headers.get('content-disposition') ?? '', /^attachment;/)
    assert.equal(out.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(out.headers.get('content-type'), 'application/pdf')
  })

  it('serves previewable MIME inline when requested', () => {
    const out = capture()
    sendFile(out.res, pdf, 'doc.pdf', { disposition: 'inline' })
    assert.match(out.headers.get('content-disposition') ?? '', /^inline;/)
    assert.match(out.headers.get('content-disposition') ?? '', /filename\*=UTF-8''doc\.pdf/)
  })

  it('falls back to attachment for docx and html even when inline is requested', () => {
    const docxOut = capture()
    sendFile(docxOut.res, docx, 'act.docx', { disposition: 'inline' })
    assert.match(docxOut.headers.get('content-disposition') ?? '', /^attachment;/)

    const htmlOut = capture()
    sendFile(htmlOut.res, html, 'page.html', { disposition: 'inline' })
    assert.match(htmlOut.headers.get('content-disposition') ?? '', /^attachment;/)
  })
})
