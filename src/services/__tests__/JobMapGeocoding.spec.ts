import 'reflect-metadata'

import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { jest } from '@jest/globals'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { JobDashboardSettingsService, geocodePlan } from '../JobDashboardSettingsService'
import { operationsRegisterService } from '../OperationsRegisterService'

const ORG = 'org-sgk'
const migration = (file: string) => readFileSync(join(process.cwd(), 'migrations', file), 'utf8')

describe('job map geocoding', () => {
  it('plans searches without the store number or postcode, limited to GB', () => {
    const plan = geocodePlan('2153 Lidl Ashby-de-la-Zouch, Resolution Road, Ashby-de-la-Zouch, LE65 1HW')
    expect(plan.countryCode).toBe('gb')
    expect(plan.postcode).toBe('LE65 1HW')
    expect(plan.outcode).toBe('LE65')
    expect(plan.queries).toContain('Resolution Road, Ashby-de-la-Zouch')
    expect(plan.queries.join(' ')).not.toMatch(/2153|LE65/)

    expect(geocodePlan('1007 - Great Bridge, Great Bridge Road, Tipton, DY4 7HQ').queries[0]).toBe(
      'Great Bridge, Great Bridge Road, Tipton',
    )
    expect(geocodePlan('Lidl, Pasteur Road, Great Yarmouth, NR31 ODW').postcode).toBe('NR31 0DW')
  })

  describe('placing today’s jobs', () => {
    let db: Database.Database
    const restores: Array<{ mockRestore: () => void }> = []
    const answers: Record<string, unknown> = {}
    const asked: string[] = []

    const job = (runId: string, location: string) => ({
      runId,
      reference: runId,
      description: 'Door repair',
      location,
      category: 'scheduled',
      scheduledDate: new Date().toISOString(),
    })

    beforeEach(() => {
      db = new Database(':memory:')
      db.exec(migration('159_job_dashboard_settings.sql'))
      db.exec(migration('162_regeocode_job_locations.sql'))
      restores.push(jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db))
      restores.push(
        jest.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
          const url = new URL(String(input))
          const key = url.hostname === 'api.postcodes.io' ? url.pathname : `osm:${url.searchParams.get('q')}`
          asked.push(key)
          const body = answers[key]
          return new Response(JSON.stringify(body ?? (key.startsWith('osm:') ? [] : { status: 404 })), {
            status: body || key.startsWith('osm:') ? 200 : 404,
          })
        }),
      )
    })

    afterEach(() => {
      while (restores.length) restores.pop()!.mockRestore()
      for (const key of Object.keys(answers)) delete answers[key]
      asked.length = 0
      db.close()
    })

    it('uses the postcode, a retired postcode, a street only inside the postcode area, then the district', async () => {
      restores.push(
        jest
          .spyOn(operationsRegisterService, 'listJobs')
          .mockReturnValue([
            job('exact', '1151 - Blackheath, Oldbury Road, Blackheath, B65 0LG'),
            job('retired', '1804 Lidl Colchester, St Andrews Avenue, CO4 3BG'),
            job('district', '1712 - BOU - West Howe, Ringwood Road, BH11 9ZZ'),
          ] as any),
      )
      answers['/postcodes/B650LG'] = { result: { latitude: 52.4766, longitude: -2.0366 } }
      answers['/terminated_postcodes/CO43BG'] = { result: { latitude: 51.892, longitude: 0.9187 } }
      answers['/outcodes/BH11'] = { result: { latitude: 50.76, longitude: -1.92 } }
      // A Ringwood Road in London is a different street from the Bournemouth store's.
      answers['osm:Ringwood Road'] = [{ lat: '51.57', lon: '-0.01' }]

      const map = await new JobDashboardSettingsService().geocodeTodayJobs(ORG, true)
      const placed = Object.fromEntries(map.jobs.map((entry) => [entry.runId, entry]))

      expect(placed.exact).toMatchObject({ latitude: 52.4766, longitude: -2.0366 })
      expect(placed.exact.approximate).toBeUndefined()
      expect(placed.retired).toMatchObject({ latitude: 51.892, longitude: 0.9187 })
      expect(placed.district).toMatchObject({ latitude: 50.76, longitude: -1.92, approximate: true })
      expect(asked).not.toContain('osm:Oldbury Road, Blackheath')
      expect(map.pendingLocations).toBe(0)
    }, 20000)
  })
})
