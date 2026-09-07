import { rootLogger } from '../../utils/pinoLogger'

import { statusListAllocatorService } from './StatusListAllocatorService'
import { statusListPublisherService } from './StatusListPublisherService'

const logger = rootLogger.child({ module: 'StatusListCacheService' })

/**
 * Default TTL: 5 minutes. Status lists are signed once per set of allocations;
 * if an allocation changes (revoke/suspend/reactivate), the DB cached_vc is
 * invalidated. Between changes, the in-process cache reduces DB queries.
 */
const DEFAULT_TTL_MS = 5 * 60 * 1000

/**
 * Allow serving stale data for up to this duration while refreshing in
 * background. Users see the stale data immediately; if refresh fails,
 * they keep the stale data. Use only for non-authorization flows.
 */
const STALE_WHILE_REVALIDATE_MS = 60 * 1000

interface CacheEntry {
  statusListId: string
  vc: string
  digest: string
  cachedAt: number
  fetchedAt: number // when we fetched from DB
  refreshedAt: number
  isStale: boolean
}

interface CacheMetrics {
  hits: number
  misses: number
  staleServes: number
  invalidations: number
  errors: number
}

/**
 * In-memory status list VC cache with TTL, refresh, and stale-while-revalidate.
 *
 * Prevents redundant database queries and signature verification. Entries are
 * invalidated by the allocator when status changes. Stale entries are served
 * temporarily while a refresh is requested in the background, giving priority
 * to availability over absolute freshness for non-authorization flows.
 *
 * For authorization decisions, callers must check the digest against the
 * issuer's publicly available status list to prevent time-of-use attacks
 * where a revocation races against an authorization check.
 */
export class StatusListCacheService {
  private cache = new Map<string, CacheEntry>()
  private metrics: CacheMetrics = { hits: 0, misses: 0, staleServes: 0, invalidations: 0, errors: 0 }
  private refreshQueue = new Set<string>()
  private isRefreshing = false

  /**
   * Get a cached status list VC, or null if not in cache.
   * Does not query the database or perform on-demand signing.
   *
   * Returns `{ vc, isStale }` if found; isStale is true if TTL expired.
   * Caller can decide whether to serve stale data or request a refresh.
   */
  public getSync(statusListId: string): { vc: string; isStale: boolean } | null {
    const entry = this.cache.get(statusListId)
    if (!entry) {
      this.metrics.misses++
      return null
    }

    const now = Date.now()
    const age = now - entry.cachedAt
    const isStale = age > DEFAULT_TTL_MS
    entry.isStale = isStale

    if (isStale) {
      this.metrics.misses++
      return { vc: entry.vc, isStale: true }
    }

    this.metrics.hits++
    return { vc: entry.vc, isStale: false }
  }

  /**
   * Get a status list VC, refreshing from database if cache is stale.
   *
   * If allowStale=true and cache is stale, returns stale data while
   * scheduling an async refresh. Otherwise waits for refresh.
   *
   * Returns { vc, isStale, requiresFresh } where requiresFresh signals
   * that the data is stale and should not be used for authorization.
   */
  public async get(
    statusListId: string,
    allowStale = false,
  ): Promise<{ vc: string | null; isStale: boolean; requiresFresh: boolean } | null> {
    const synced = this.getSync(statusListId)

    if (synced && !synced.isStale) {
      return { vc: synced.vc, isStale: false, requiresFresh: false }
    }

    if (synced && synced.isStale && allowStale) {
      // Stale data available; schedule refresh in background
      this.scheduleRefresh(statusListId)
      this.metrics.staleServes++
      return { vc: synced.vc, isStale: true, requiresFresh: true }
    }

    // No cache or stale and not allowed; refresh now
    const refreshed = await this.refresh(statusListId)
    return refreshed
  }

  /**
   * Refresh a status list from the database.
   * Writes to cache if successful.
   */
  public async refresh(statusListId: string): Promise<{
    vc: string | null
    isStale: boolean
    requiresFresh: boolean
  } | null> {
    try {
      const vc = statusListPublisherService.getSignedVc(statusListId)
      if (!vc) {
        this.metrics.errors++
        return null
      }

      const digest = statusListAllocatorService.computeListDigest(statusListId)
      const now = Date.now()
      const entry: CacheEntry = {
        statusListId,
        vc,
        digest,
        cachedAt: now,
        fetchedAt: now,
        refreshedAt: now,
        isStale: false,
      }
      this.cache.set(statusListId, entry)
      this.refreshQueue.delete(statusListId)

      logger.debug({ statusListId, digest, cacheSize: this.cache.size }, 'Status list refreshed into cache')

      return { vc, isStale: false, requiresFresh: false }
    } catch (err) {
      this.metrics.errors++
      logger.warn({ statusListId, err }, 'Status list refresh failed')
      return null
    }
  }

  /**
   * Invalidate the cache entry for a status list.
   * Called whenever the allocator updates allocation statuses.
   */
  public invalidate(statusListId: string): void {
    if (this.cache.delete(statusListId)) {
      this.metrics.invalidations++
      this.refreshQueue.delete(statusListId)
      logger.debug({ statusListId }, 'Status list cache invalidated')
    }
  }

  /**
   * Invalidate all cache entries for an organization/issuer/purpose.
   * Useful after batch operations.
   */
  public invalidatePattern(organizationId: string, issuerRef?: string): void {
    let count = 0
    for (const [statusListId, entry] of this.cache.entries()) {
      // TODO: Store organization/issuer/purpose in cache entry for pattern matching
      // For now, log only
      if (issuerRef) {
        logger.debug({ organizationId, issuerRef }, 'Cache invalidation pattern requested')
      }
    }
    if (count > 0) {
      logger.info({ organizationId, issuerRef, count }, 'Invalidated status list cache entries')
    }
  }

  /**
   * Clear all cache entries.
   */
  public clear(): void {
    const size = this.cache.size
    this.cache.clear()
    this.refreshQueue.clear()
    logger.info({ clearedCount: size }, 'Status list cache cleared')
  }

  /**
   * Get current cache metrics.
   */
  public getMetrics(): CacheMetrics & { size: number; pendingRefreshes: number } {
    return {
      ...this.metrics,
      size: this.cache.size,
      pendingRefreshes: this.refreshQueue.size,
    }
  }

  /**
   * Reset metrics counters.
   */
  public resetMetrics(): void {
    this.metrics = { hits: 0, misses: 0, staleServes: 0, invalidations: 0, errors: 0 }
  }

  // ────────────────────────────────────────────────────────────────────────────

  private scheduleRefresh(statusListId: string): void {
    if (this.refreshQueue.has(statusListId) || this.isRefreshing) {
      return
    }
    this.refreshQueue.add(statusListId)
    this.processRefreshQueue().catch((err) => {
      logger.error({ err }, 'Refresh queue processing failed')
    })
  }

  private async processRefreshQueue(): Promise<void> {
    if (this.isRefreshing) return
    this.isRefreshing = true

    try {
      while (this.refreshQueue.size > 0) {
        const [statusListId] = this.refreshQueue
        this.refreshQueue.delete(statusListId)
        await this.refresh(statusListId)
        // Yield to avoid blocking
        await new Promise((resolve) => setImmediate(resolve))
      }
    } finally {
      this.isRefreshing = false
    }
  }
}

export const statusListCacheService = new StatusListCacheService()
