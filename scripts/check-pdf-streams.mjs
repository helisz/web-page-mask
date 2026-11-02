import { readFileSync } from 'node:fs'
import { deflateSync, inflateSync } from 'node:zlib'

const buffer = readFileSync(process.argv[2])
const latin = buffer.toString('latin1')
const dicts = [...latin.matchAll(/\/Subtype \/Image \/Width (\d+) \/Height (\d+)[\s\S]{0,400}?\/Length (\d+) >>/g)]
console.log('dicts:', dicts.length, 'hasPredictor:', /DecodeParms/.test(latin), 'bytes:', buffer.length)

for (const [index, match] of dicts.entries()) {
  const width = Number(match[1])
  const height = Number(match[2])
  const length = Number(match[3])
  const start = latin.indexOf('stream\n', match.index) + 'stream\n'.length
  const inflated = inflateSync(buffer.subarray(start, start + length))
  const stride = width * 3
  const rowBytes = stride + 1
  const filterCounts = { 0: 0, 2: 0, other: 0 }
  for (let y = 0; y < height; y++) {
    const f = inflated[y * rowBytes]
    if (f === 0) filterCounts[0]++
    else if (f === 2) filterCounts[2]++
    else filterCounts.other++
  }
  // reconstruct raw RGB (undo PNG predictor)
  const raw = Buffer.alloc(stride * height)
  let prev = Buffer.alloc(stride)
  const row = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const base = y * rowBytes
    const f = inflated[base]
    for (let i = 0; i < stride; i++) {
      const value = inflated[base + 1 + i]
      row[i] = f === 2 ? (value + prev[i]) & 0xff : value
    }
    row.copy(raw, y * stride)
    prev = Buffer.from(row)
  }
  const plain = deflateSync(raw)
  console.log(JSON.stringify({
    page: index + 1,
    width, height,
    inflated: inflated.length,
    expected: height * rowBytes,
    compressed: length,
    filters: filterCounts,
    plainDeflate: plain.length,
  }))
}
