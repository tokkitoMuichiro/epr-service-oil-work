import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_ERROR,
  DOCUMENT_UPLOAD_TYPES,
  PREVIEWABLE_MIME,
  documentUploadMimeType,
  isPreviewableFile,
  isPreviewableMime,
  isUnsafeInlineMime,
} from './files.js'

describe('files preview helpers', () => {
  it('lists previewable MIME types', () => {
    assert.deepEqual([...PREVIEWABLE_MIME], [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'video/mp4',
    ])
  })

  it('detects previewable MIME ignoring parameters', () => {
    assert.equal(isPreviewableMime('application/pdf'), true)
    assert.equal(isPreviewableMime('image/jpeg; charset=binary'), true)
    assert.equal(isPreviewableMime('IMAGE/PNG'), true)
    assert.equal(isPreviewableMime('video/mp4'), true)
    assert.equal(isPreviewableMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), false)
    assert.equal(isPreviewableMime('text/html'), false)
    assert.equal(isPreviewableMime(null), false)
    assert.equal(isPreviewableMime(''), false)
  })

  it('detects previewable files by MIME or extension', () => {
    assert.equal(isPreviewableFile('a.pdf'), true)
    assert.equal(isPreviewableFile('a.JPG'), true)
    assert.equal(isPreviewableFile('a.png'), true)
    assert.equal(isPreviewableFile('a.mp4'), true)
    assert.equal(isPreviewableFile('a.docx'), false)
    assert.equal(isPreviewableFile('a.html'), false)
    assert.equal(isPreviewableFile('a.docx', 'application/pdf'), true)
    assert.equal(isPreviewableFile('a.pdf', 'text/html'), false)
  })

  it('flags unsafe inline MIME', () => {
    assert.equal(isUnsafeInlineMime('text/html'), true)
    assert.equal(isUnsafeInlineMime('image/svg+xml'), true)
    assert.equal(isUnsafeInlineMime('application/xhtml+xml'), true)
    assert.equal(isUnsafeInlineMime('application/pdf'), false)
  })
})

describe('document upload whitelist', () => {
  it('maps allowed extensions to canonical MIME', () => {
    assert.equal(DOCUMENT_UPLOAD_TYPES.pdf, 'application/pdf')
    assert.equal(documentUploadMimeType('Паспорт.pdf'), 'application/pdf')
    assert.equal(documentUploadMimeType('photo.JPEG'), 'image/jpeg')
    assert.equal(documentUploadMimeType('scan.png'), 'image/png')
    assert.equal(
      documentUploadMimeType('акт.docx'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    assert.equal(documentUploadMimeType('note.txt'), null)
    assert.equal(documentUploadMimeType('page.html'), null)
    assert.equal(documentUploadMimeType('clip.mp4'), null)
  })

  it('exposes accept list and Russian error text', () => {
    assert.match(DOCUMENT_UPLOAD_ACCEPT, /\.pdf/)
    assert.match(DOCUMENT_UPLOAD_ACCEPT, /\.docx/)
    assert.equal(DOCUMENT_UPLOAD_ERROR, 'Допустимы PDF, JPG, PNG и DOCX')
  })
})
