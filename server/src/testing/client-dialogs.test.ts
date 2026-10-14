import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const clientSrc = fileURLToPath(new URL('../../../client/src/', import.meta.url))
const NATIVE_DIALOG = /(?<![\w.$]|function\s+|async\s+)(?:window\.)?(?:confirm|alert|prompt)\s*\(/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(vue|ts)$/.test(entry.name) ? [path] : []
  })
}

test('клиент не вызывает нативные confirm/alert/prompt: во встроенном браузере Битрикс24 они вешают страницу', () => {
  const offenders = sourceFiles(clientSrc).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, index) => (NATIVE_DIALOG.test(line) ? [`${relative(clientSrc, file)}:${index + 1}`] : [])),
  )
  assert.deepEqual(offenders, [])
})
