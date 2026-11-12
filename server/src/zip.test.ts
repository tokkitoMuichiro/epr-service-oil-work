import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sanitizeZipEntryName, uniqueZipNames, unzip, zip } from './zip.js'

describe('zip', () => {
  it('round-trips binary entries and UTF-8 names', () => {
    const packed = zip([
      { name: 'Паспорт.pdf', data: Buffer.from('%PDF-1') },
      { name: 'folder/note.txt', data: Buffer.from('hello') },
    ])
    assert.equal(packed.subarray(0, 2).toString(), 'PK')
    const files = unzip(packed)
    assert.equal(files.get('Паспорт.pdf'), '%PDF-1')
    assert.equal(files.get('folder/note.txt'), 'hello')
  })

  it('sanitizes path separators and uniquifies collisions', () => {
    assert.equal(sanitizeZipEntryName('../a/b.pdf'), 'a_b.pdf')
    assert.equal(sanitizeZipEntryName(''), 'document')
    assert.deepEqual(uniqueZipNames(['a.pdf', 'a.pdf', 'A.PDF', 'b']), ['a.pdf', 'a (2).pdf', 'A (3).PDF', 'b'])
  })
})
