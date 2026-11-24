import { createHash } from 'crypto'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { operationsRegisterService, type JobSummary } from './OperationsRegisterService'

export const RESPONSE_PRIORITIES = ['urgent', 'out_of_hours', 'normal'] as const
export type ResponsePriority = (typeof RESPONSE_PRIORITIES)[number]

export type JobResponseTargets = Record<ResponsePriority, number | null>

export interface TodayMapJob {
  runId: string
  reference: string
  description: string
  storeNumber?: string
  location: string
  priority?: ResponsePriority
  latitude?: number
  longitude?: number
  /** Placed at the centre of the postcode district because the exact address was not found. */
  approximate?: boolean
}

export interface TodayJobsMap {
  date: string
  jobs: TodayMapJob[]
  pendingLocations: number
  notFoundLocations: number
  /** Set when OpenStreetMap stopped answering part-way; the rest can be tried again shortly. */
  notice?: string
}

const EMPTY_TARGETS: JobResponseTargets = { urgent: null, out_of_hours: null, normal: null }
const MAX_GEOCODES_PER_REQUEST = 10
/** Each lookup waits a second (OpenStreetMap's limit), so this keeps one request under ~20 seconds. */
const MAX_LOOKUPS_PER_REQUEST = 18
const ONE_SECOND = 1000
/** A place not found earlier is tried again after this long, in case the address was corrected. */
const RETRY_NOT_FOUND_MS = 30 * 24 * 60 * 60 * 1000

const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*([0-9O][A-Z]{2})\b/i

/**
 * The searches to try for one job address, best first. Job addresses come from store lists and
 * emails ("2153 Lidl Ashby-de-la-Zouch, Resolution Road, Ashby-de-la-Zouch, LE65 1HW"): a store
 * number, a site name and a postcode the geocoder does not know make the whole text unmatched,
 * while "Resolution Road, Ashby-de-la-Zouch" is found. A UK postcode also limits the search to GB.
 */
export function geocodePlan(location: string): {
  queries: string[]
  countryCode?: string
  postcode?: string
  outcode?: string
} {
  const text = location.replace(/\s+/g, ' ').trim()
  const postcode = text.match(UK_POSTCODE)
  // Typed postcodes swap a zero for the letter O ("NR31 ODW"); the inward code always starts with a digit.
  const outcode = postcode?.[1].toUpperCase()
  const fullPostcode = postcode ? `${outcode} ${postcode[2].toUpperCase().replace(/^O/, '0')}` : undefined
  const parts: string[] = []
  for (const [index, raw] of text.split(',').entries()) {
    let part = raw
      .replace(UK_POSTCODE, '')
      .replace(/[.\s]+$/, '')
      .trim()
    // The store number leads the first part: "2153 Lidl …", "1007 - Great Bridge".
    if (index === 0) part = part.replace(/^\d{2,6}\s*[-–_:]?\s*/, '').trim()
    if (part && !parts.some((seen) => seen.toLowerCase() === part.toLowerCase())) parts.push(part)
  }
  const candidates = [
    parts.join(', '),
    parts.length > 2 ? parts.slice(-2).join(', ') : '',
    parts.length > 1 ? parts.slice(1).join(', ') : '',
    parts.length > 1 ? parts[parts.length - 1] : '',
  ]
  const queries = [...new Set(candidates.filter((query) => query.length >= 3))].slice(0, 3)
  return {
    queries: queries.length ? queries : [text],
    ...(postcode ? { countryCode: 'gb', postcode: fullPostcode, outcode } : {}),
  }
}

type Point = { latitude: number; longitude: number }

function validPoint(latitude: unknown, longitude: unknown): Point | undefined {
  const lat = Number(latitude)
  const lon = Number(longitude)
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180
    ? { latitude: lat, longitude: lon }
    : undefined
}

function kilometresBetween(a: Point, b: Point): number {
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad
  const dLon = (b.longitude - a.longitude) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** A street search further than this from the postcode area is a same-named street elsewhere. */
const MAX_KM_FROM_POSTCODE_AREA = 25

function normalizedLocation(location: string): string {
  return location.trim().replace(/\s+/g, ' ').toLowerCase()
}

function locationKey(location: string): string {
  return createHash('sha256').update(normalizedLocation(location)).digest('hex')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class JobDashboardSettingsService {
  private lastGeocodeRequest = 0
  private geocodeQueue: Promise<void> = Promise.resolve()

  private get db() {
    return DatabaseManager.getDatabase()
  }

  public responseTargets(orgTenantId: string): JobResponseTargets {
    const rows = this.db
      .prepare('SELECT priority, target_minutes AS targetMinutes FROM job_response_targets WHERE org_tenant_id = ?')
      .all(orgTenantId) as Array<{ priority: ResponsePriority; targetMinutes: number }>
    const targets = { ...EMPTY_TARGETS }
    for (const row of rows) {
      if (RESPONSE_PRIORITIES.includes(row.priority)) targets[row.priority] = Number(row.targetMinutes)
    }
    return targets
  }

  public saveResponseTargets(orgTenantId: string, input: Partial<JobResponseTargets>): JobResponseTargets {
    const save = this.db.transaction(() => {
      for (const priority of RESPONSE_PRIORITIES) {
        const value = input[priority]
        if (value === undefined || value === null || value === 0) {
          this.db
            .prepare('DELETE FROM job_response_targets WHERE org_tenant_id = ? AND priority = ?')
            .run(orgTenantId, priority)
          continue
        }
        const minutes = Number(value)
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
          throw new Error(`${priority.replace('_', ' ')} response target must be from 1 to 10080 minutes`)
        }
        this.db
          .prepare(
            `INSERT INTO job_response_targets (org_tenant_id, priority, target_minutes, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(org_tenant_id, priority) DO UPDATE SET
             target_minutes = excluded.target_minutes, updated_at = CURRENT_TIMESTAMP`,
          )
          .run(orgTenantId, priority, minutes)
      }
    })
    save()
    return this.responseTargets(orgTenantId)
  }

  public todayJobsMap(orgTenantId: string): TodayJobsMap {
    return this.mapForJobs(orgTenantId, operationsRegisterService.listJobs(orgTenantId))
  }

  public async geocodeTodayJobs(
    orgTenantId: string,
    confirmed: boolean,
    requestedLimit?: number,
  ): Promise<TodayJobsMap> {
    if (confirmed !== true) throw new Error('Confirm sharing job locations with the map services before mapping them.')
    const limit = Math.max(
      1,
      Math.min(MAX_GEOCODES_PER_REQUEST, Math.trunc(Number(requestedLimit) || MAX_GEOCODES_PER_REQUEST)),
    )
    const jobs = operationsRegisterService.listJobs(orgTenantId).filter((job) => this.isTodayOpenJob(job))
    const locations = [...new Set(jobs.map((job) => String(job.location || '').trim()).filter(Boolean))]
    const budget = { lookups: MAX_LOOKUPS_PER_REQUEST }
    let completed = 0
    let notice: string | undefined
    for (const location of locations) {
      if (completed >= limit || budget.lookups <= 0) break
      const key = locationKey(location)
      const cached = this.db
        .prepare('SELECT status, updated_at FROM job_map_geocodes WHERE org_tenant_id = ? AND location_key = ?')
        .get(orgTenantId, key) as { status: string; updated_at?: string } | undefined
      const stale =
        cached?.status === 'not_found' && Date.now() - Date.parse(`${cached.updated_at || ''}Z`) > RETRY_NOT_FOUND_MS
      if (cached && !stale) continue
      try {
        await this.geocodeOne(orgTenantId, key, location, budget)
      } catch {
        // A refusal or timeout says nothing about the address: keep it pending for the next try.
        notice = 'OpenStreetMap is not answering right now. Try the remaining locations again in a minute.'
        break
      }
      completed += 1
    }
    return { ...this.mapForJobs(orgTenantId, jobs), ...(notice ? { notice } : {}) }
  }

  private isTodayOpenJob(job: JobSummary): boolean {
    return (
      job.scheduledDate?.slice(0, 10) === new Date().toISOString().slice(0, 10) &&
      !['completed', 'reconciled', 'cancelled'].includes(job.category)
    )
  }

  private mapForJobs(orgTenantId: string, jobs: JobSummary[]): TodayJobsMap {
    const date = new Date().toISOString().slice(0, 10)
    const todayJobs = jobs.filter((job) => this.isTodayOpenJob(job))
    const mapped: TodayMapJob[] = []
    const pending = new Set<string>()
    const notFound = new Set<string>()
    for (const job of todayJobs) {
      const location = String(job.location || '').trim()
      if (!location) continue
      const key = locationKey(location)
      const cached = this.db
        .prepare(
          `SELECT latitude, longitude, status FROM job_map_geocodes
          WHERE org_tenant_id = ? AND location_key = ?`,
        )
        .get(orgTenantId, key) as { latitude?: number; longitude?: number; status: string } | undefined
      if (!cached) {
        pending.add(key)
        continue
      }
      if (cached.status === 'not_found') {
        notFound.add(key)
        continue
      }
      if (Number.isFinite(cached.latitude) && Number.isFinite(cached.longitude)) {
        mapped.push({
          runId: job.runId,
          reference: job.reference,
          description: job.description,
          storeNumber: job.storeNumber,
          location,
          priority: job.priority,
          latitude: Number(cached.latitude),
          longitude: Number(cached.longitude),
          ...(cached.status === 'approximate' ? { approximate: true } : {}),
        })
      }
    }
    return { date, jobs: mapped, pendingLocations: pending.size, notFoundLocations: notFound.size }
  }

  private geocodeOne(orgTenantId: string, key: string, location: string, budget: { lookups: number }): Promise<void> {
    const request = this.geocodeQueue.then(() => this.performGeocode(orgTenantId, key, location, budget))
    this.geocodeQueue = request.then(
      () => undefined,
      () => undefined,
    )
    return request
  }

  private async performGeocode(
    orgTenantId: string,
    key: string,
    location: string,
    budget: { lookups: number },
  ): Promise<void> {
    const plan = geocodePlan(location)
    let point: Point | undefined
    let status: 'found' | 'approximate' | 'not_found' = 'not_found'
    // A UK postcode is the most exact thing on a job: postcodes.io (ONS open data) knows live
    // and retired codes. Street searches are a fallback and must land in the postcode's area.
    let area: Point | undefined
    if (plan.postcode && budget.lookups > 0) {
      budget.lookups -= 1
      point = await this.postcodeLookup(plan.postcode)
      if (!point && plan.outcode) area = await this.postcodeLookup(plan.outcode, true)
    }
    if (point) status = 'found'
    let tried = 0
    for (const query of point ? [] : plan.queries) {
      if (budget.lookups <= 0) break
      budget.lookups -= 1
      tried += 1
      const hit = await this.search(query, plan.countryCode)
      if (hit && (!area || kilometresBetween(hit, area) <= MAX_KM_FROM_POSTCODE_AREA)) {
        point = hit
        status = 'found'
        break
      }
    }
    if (!point && area) {
      point = area
      status = 'approximate'
    }
    // Out of lookups before every search was tried: leave it pending rather than call it unknown.
    if (!point && tried < plan.queries.length) return
    this.db
      .prepare(
        `INSERT OR REPLACE INTO job_map_geocodes
         (org_tenant_id, location_key, latitude, longitude, status, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .run(orgTenantId, key, point?.latitude ?? null, point?.longitude ?? null, status)
  }

  /** A UK postcode, or with `outcode` just its district ("LE65"), from postcodes.io. */
  private async postcodeLookup(code: string, outcode = false): Promise<Point | undefined> {
    const compact = encodeURIComponent(code.replace(/\s+/g, ''))
    const paths = outcode ? [`outcodes/${compact}`] : [`postcodes/${compact}`, `terminated_postcodes/${compact}`]
    for (const path of paths) {
      const response = await fetch(`https://api.postcodes.io/${path}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      })
      if (response.status === 404) continue
      if (!response.ok) throw new Error(`Postcode lookup failed (${response.status})`)
      const body = (await response.json()) as { result?: { latitude?: number; longitude?: number } }
      const point = validPoint(body.result?.latitude, body.result?.longitude)
      if (point) return point
    }
    return undefined
  }

  /** One OpenStreetMap search, never more than one a second across the whole server. */
  private async search(query: string, countryCode?: string): Promise<Point | undefined> {
    const elapsed = Date.now() - this.lastGeocodeRequest
    if (elapsed < ONE_SECOND) await sleep(ONE_SECOND - elapsed)
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', '1')
    url.searchParams.set('q', query)
    if (countryCode) url.searchParams.set('countrycodes', countryCode)
    this.lastGeocodeRequest = Date.now()
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'LDK-iFacilities/1.0 (https://ldk-ifacilities-portal.onrender.com)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`OpenStreetMap geocoding failed (${response.status})`)
    const results = (await response.json()) as Array<{ lat?: string; lon?: string }>
    return validPoint(results[0]?.lat, results[0]?.lon)
  }
}

export const jobDashboardSettingsService = new JobDashboardSettingsService()
