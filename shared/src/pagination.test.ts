import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clampPage, compactPageNumbers, pageCountOf, pageNumbers, pageSlice, pageWindow } from './pagination.js'

const items = Array.from({ length: 23 }, (_, i) => i + 1)

describe('pagination', () => {
  it('counts pages and keeps at least one page for an empty list', () => {
    assert.equal(pageCountOf(0), 1)
    assert.equal(pageCountOf(10), 1)
    assert.equal(pageCountOf(11), 2)
    assert.equal(pageCountOf(23), 3)
    assert.equal(pageCountOf(23, 5), 5)
  })

  it('clamps the page into the available range', () => {
    assert.equal(clampPage(0, 23), 1)
    assert.equal(clampPage(-4, 23), 1)
    assert.equal(clampPage(9, 23), 3)
    assert.equal(clampPage(2.7, 23), 2)
    assert.equal(clampPage(Number.NaN, 23), 1)
    assert.equal(clampPage(5, 0), 1)
  })

  it('describes the visible window', () => {
    assert.deepEqual(pageWindow(1, 23), { page: 1, pageCount: 3, from: 1, to: 10 })
    assert.deepEqual(pageWindow(3, 23), { page: 3, pageCount: 3, from: 21, to: 23 })
    assert.deepEqual(pageWindow(7, 23), { page: 3, pageCount: 3, from: 21, to: 23 })
    assert.deepEqual(pageWindow(1, 0), { page: 1, pageCount: 1, from: 0, to: 0 })
  })

  it('slices the requested page', () => {
    assert.deepEqual(pageSlice(items, 1), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    assert.deepEqual(pageSlice(items, 3), [21, 22, 23])
    assert.deepEqual(pageSlice(items, 99), [21, 22, 23])
    assert.deepEqual(pageSlice([], 1), [])
  })

  it('builds a numbered window with ellipsis', () => {
    assert.deepEqual(pageNumbers(1, 1), [1])
    assert.deepEqual(pageNumbers(1, 5), [1, 2, 3, 4, 5])
    assert.deepEqual(pageNumbers(1, 10), [1, 2, 3, 4, 'ellipsis', 10])
    assert.deepEqual(pageNumbers(3, 10), [1, 2, 3, 4, 'ellipsis', 10])
    assert.deepEqual(pageNumbers(5, 10), [1, 'ellipsis', 4, 5, 6, 'ellipsis', 10])
    assert.deepEqual(pageNumbers(10, 10), [1, 'ellipsis', 7, 8, 9, 10])
    assert.deepEqual(pageNumbers(1, 10, 2), [1, 2, 3, 4, 5, 6, 'ellipsis', 10])
  })

  it('keeps a 5-number window so page 1 and 2 have the same button count', () => {
    assert.deepEqual(compactPageNumbers(1, 1), [1])
    assert.deepEqual(compactPageNumbers(2, 5), [1, 2, 3, 4, 5])
    assert.deepEqual(compactPageNumbers(1, 10), [1, 2, 3, 4, 5])
    assert.deepEqual(compactPageNumbers(2, 10), [1, 2, 3, 4, 5])
    assert.deepEqual(compactPageNumbers(3, 10), [1, 2, 3, 4, 5])
    assert.deepEqual(compactPageNumbers(4, 10), [2, 3, 4, 5, 6])
    assert.deepEqual(compactPageNumbers(8, 10), [6, 7, 8, 9, 10])
    assert.deepEqual(compactPageNumbers(10, 10), [6, 7, 8, 9, 10])
  })
})
