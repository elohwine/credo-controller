import { describe, expect, test } from '@jest/globals'
import { crc32 as nodeCrc32 } from 'zlib'
import yauzl from 'yauzl'
import { buildEvidencePack, crc32, evidencePhotos, photoFile } from '../credo-ui/mobile/lib/evidencePack'
import * as portalPack from '../credo-ui/portal/lib/evidencePack'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 0xff, 0xd9])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 8, 7])
const jpegUri = `data:image/jpeg;base64,${JPEG.toString('base64')}`
const pngUri = `data:image/png;base64,${PNG.toString('base64')}`

const trail = {
  reference: 'FR-1',
  steps: [
    { id: 'before', title: 'Before photos', photos: [jpegUri, pngUri], by: 'Tendai', at: '2026-10-24T08:00:00Z' },
    { id: 'after', title: 'After photos', photos: ['https://cdn.example/after.jpg', jpegUri], by: 'Tendai' },
    { id: 'gone', title: 'Covered work', photos: ['https://cdn.example/missing.jpg'] },
  ],
  holds: [{ id: 'h1', label: 'Risk check', photo: pngUri, by: 'Eloh' }],
}

function readZip(bytes: Uint8Array): Promise<Record<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(Buffer.from(bytes), { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) return reject(error)
      const out: Record<string, Buffer> = {}
      zip.on('entry', (entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return reject(streamError)
          const parts: Buffer[] = []
          stream.on('data', (part: Buffer) => parts.push(part))
          stream.on('end', () => {
            out[entry.fileName] = Buffer.concat(parts)
            zip.readEntry()
          })
        })
      })
      zip.on('end', () => resolve(out))
      zip.on('error', reject)
      zip.readEntry()
    })
  })
}

const fakeFetch = (async (url: string) => {
  if (url.endsWith('after.jpg')) {
    return new Response(new Uint8Array(JPEG), { headers: { 'content-type': 'image/jpeg' } })
  }
  return new Response('nope', { status: 404 })
}) as typeof fetch

describe('job photo downloads and evidence pack', () => {
  test('a data: photo downloads as the original bytes with the right type', async () => {
    const file = await photoFile(jpegUri)
    expect(file).toMatchObject({ mime: 'image/jpeg', extension: 'jpg' })
    expect(Buffer.from(file.bytes)).toEqual(JPEG)
    expect((await photoFile(pngUri)).extension).toBe('png')
  })

  test('every photo is listed once, even when a hold reuses a step photo', () => {
    const photos = evidencePhotos(trail)
    expect(photos.map((photo) => photo.name)).toEqual([
      '01-Before-photos-1',
      '02-Before-photos-2',
      '03-After-photos-1',
      '04-Covered-work',
    ])
    expect(photos.map((photo) => photo.step)).not.toContain('Safety hold: Risk check')
  })

  test('the pack is a valid zip with the photos, audit table and a manifest naming missing photos', async () => {
    const pack = await buildEvidencePack(trail, 'step,at\n"Before photos","now"', fakeFetch)
    expect(pack.photoCount).toBe(3)
    expect(pack.missing).toEqual(['Covered work'])
    const files = await readZip(pack.bytes)
    expect(Object.keys(files).sort()).toEqual([
      'audit.csv',
      'manifest.csv',
      'photos/01-Before-photos-1.jpg',
      'photos/02-Before-photos-2.png',
      'photos/03-After-photos-1.jpg',
    ])
    expect(files['photos/01-Before-photos-1.jpg']).toEqual(JPEG)
    expect(files['photos/02-Before-photos-2.png']).toEqual(PNG)
    expect(files['photos/03-After-photos-1.jpg']).toEqual(JPEG)
    expect(files['audit.csv'].toString()).toContain('Before photos')
    const manifest = files['manifest.csv'].toString()
    expect(manifest).toContain('"photos/01-Before-photos-1.jpg","Before photos","Tendai","2026-10-24T08:00:00Z","included"')
    expect(manifest).toContain('"","Covered work","","","could not be loaded"')
  })

  test('a hold photo that is not on a step is included as its own file', async () => {
    const holdOnly = { reference: 'FR-2', steps: [], holds: [{ label: 'Risk check', photo: pngUri, by: 'Eloh' }] }
    const files = await readZip((await buildEvidencePack(holdOnly, '')).bytes)
    expect(files['photos/01-safety-hold-Risk-check.png']).toEqual(PNG)
  })

  test('checksums match zlib and the portal copy behaves the same', async () => {
    expect(crc32(JPEG)).toBe(nodeCrc32(JPEG))
    const mobile = await buildEvidencePack(trail, 'x', fakeFetch)
    const portal = await portalPack.buildEvidencePack(trail, 'x', fakeFetch)
    expect(Object.keys(await readZip(portal.bytes))).toEqual(Object.keys(await readZip(mobile.bytes)))
  })
})
