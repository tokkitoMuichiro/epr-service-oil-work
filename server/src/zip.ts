import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'

export interface ZipEntry {
  name: string
  data: Buffer
}

/** Builds a ZIP in memory (same style as xlsx export): deflate, UTF-8 names, CRC verified by {@link unzip}. */
export function zip(files: readonly ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const raw = file.data
    const data = deflateRawSync(raw)
    const crc = crc32(raw) >>> 0

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(0, 10)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, data)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(0x0800, 8)
    entry.writeUInt16LE(8, 10)
    entry.writeUInt32LE(0, 12)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(raw.length, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, name)

    offset += local.length + name.length + data.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

/** Strips path separators / nulls so a document title cannot escape the ZIP root. */
export function sanitizeZipEntryName(name: string): string {
  const cleaned = name
    .replace(/[/\\]+/g, '_')
    .replace(/\0/g, '')
    .replace(/^\.+/, '')
    .replace(/^_+/, '')
    .trim()
  return cleaned || 'document'
}

function withNumericSuffix(name: string, n: number): string {
  const dot = name.lastIndexOf('.')
  if (dot > 0) return `${name.slice(0, dot)} (${n})${name.slice(dot)}`
  return `${name} (${n})`
}

/** Unique ZIP entry names: sanitize, then append ` (2)`, ` (3)`, … before the extension on collision. */
export function uniqueZipNames(names: readonly string[]): string[] {
  const used = new Set<string>()
  return names.map((raw) => {
    const base = sanitizeZipEntryName(raw)
    let candidate = base
    let n = 2
    while (used.has(candidate.toLowerCase())) {
      candidate = withNumericSuffix(base, n++)
    }
    used.add(candidate.toLowerCase())
    return candidate
  })
}

/** Reads a ZIP (e.g. .xlsx) through its central directory and verifies every entry's CRC. */
export function unzip(data: Buffer): Map<string, string> {
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (end < 0) throw new Error('No end of central directory')
  const count = data.readUInt16LE(end + 10)
  let pointer = data.readUInt32LE(end + 16)
  const files = new Map<string, string>()
  for (let i = 0; i < count; i++) {
    if (data.readUInt32LE(pointer) !== 0x02014b50) throw new Error('Broken central directory')
    const method = data.readUInt16LE(pointer + 10)
    const crc = data.readUInt32LE(pointer + 16)
    const size = data.readUInt32LE(pointer + 20)
    const nameLength = data.readUInt16LE(pointer + 28)
    const extraLength = data.readUInt16LE(pointer + 30)
    const commentLength = data.readUInt16LE(pointer + 32)
    const offset = data.readUInt32LE(pointer + 42)
    const name = data.toString('utf8', pointer + 46, pointer + 46 + nameLength)
    if (data.readUInt32LE(offset) !== 0x04034b50) throw new Error(`Broken local header: ${name}`)
    const start = offset + 30 + data.readUInt16LE(offset + 26) + data.readUInt16LE(offset + 28)
    const packed = data.subarray(start, start + size)
    const content = method === 8 ? inflateRawSync(packed) : packed
    if (crc32(content) !== crc) throw new Error(`CRC mismatch: ${name}`)
    files.set(name, content.toString('utf8'))
    pointer += 46 + nameLength + extraLength + commentLength
  }
  return files
}
