import { crc32, inflateRawSync } from 'node:zlib'

/** Test helper: reads a ZIP (e.g. .xlsx) through its central directory and verifies every entry's CRC. */
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
