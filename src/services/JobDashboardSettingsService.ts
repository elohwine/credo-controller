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
}

export interface TodayJobsMap {
  date: string
  jobs: TodayMapJob[]
  pendingLocations: number
  notFoundLocations: number
}

const EMPTY_TARGETS: JobResponseTargets = { urgent: null, out_of_hours: null, normal: null }
const MAX_GEOCODES_PER_REQUEST = 10
const ONE_SECOND = 1000

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
    if (confirmed !== true) throw new Error('Confirm sharing job locations with OpenStreetMap before mapping them.')
    const limit = Math.max(
      1,
      Math.min(MAX_GEOCODES_PER_REQUEST, Math.trunc(Number(requestedLimit) || MAX_GEOCODES_PER_REQUEST)),
    )
    const jobs = operationsRegisterService.listJobs(orgTenantId).filter((job) => this.isTodayOpenJob(job))
    const locations = [...new Set(jobs.map((job) => String(job.location || '').trim()).filter(Boolean))]
    let completed = 0
    for (const location of locations) {
      if (completed >= limit) break
      const key = locationKey(location)
      const cached = this.db
        .prepare('SELECT status FROM job_map_geocodes WHERE org_tenant_id = ? AND location_key = ?')
        .get(orgTenantId, key) as { status: string } | undefined
      if (cached) continue
      await this.geocodeOne(orgTenantId, key, location)
      completed += 1
    }
    return this.mapForJobs(orgTenantId, jobs)
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
        })
      }
    }
    return { date, jobs: mapped, pendingLocations: pending.size, notFoundLocations: notFound.size }
  }

  private geocodeOne(orgTenantId: string, key: string, location: string): Promise<void> {
    const request = this.geocodeQueue.then(() => this.performGeocode(orgTenantId, key, location))
    this.geocodeQueue = request.then(
      () => undefined,
      () => undefined,
    )
    return request
  }

  private async performGeocode(orgTenantId: string, key: string, location: string): Promise<void> {
    const elapsed = Date.now() - this.lastGeocodeRequest
    if (elapsed < ONE_SECOND) await sleep(ONE_SECOND - elapsed)
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', '1')
    url.searchParams.set('q', location)
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
    const first = results[0]
    const latitude = Number(first?.lat)
    const longitude = Number(first?.lon)
    const found =
      Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    this.db
      .prepare(
        `INSERT OR REPLACE INTO job_map_geocodes
         (org_tenant_id, location_key, latitude, longitude, status, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .run(orgTenantId, key, found ? latitude : null, found ? longitude : null, found ? 'found' : 'not_found')
  }
}

export const jobDashboardSettingsService = new JobDashboardSettingsService()
