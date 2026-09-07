import Database from 'better-sqlite3'
import { tmpdir } from 'os'
import { join } from 'path'

import { DatabaseManager } from '../../../persistence/DatabaseManager'
import { StatusListCacheService } from '../StatusListCacheService'

describe('StatusListCacheService', () => {
  let cacheService: StatusListCacheService
  let testDb: Database.Database

  beforeEach(() => {
    // Use in-memory database for tests
    testDb = new Database(':memory:')
    DatabaseManager.setDatabase(testDb)

    // Create minimal schema
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS credential_status_lists (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        issuer_ref TEXT NOT NULL,
        purpose TEXT NOT NULL,
        list_size INTEGER NOT NULL DEFAULT 131072,
        allocated_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        signed_vc_json TEXT,
        published_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(organization_id, issuer_ref, purpose)
      );
    `)

    cacheService = new StatusListCacheService()
  })

  afterEach(() => {
    if (cacheService) cacheService.clear()
    if (testDb) testDb.close()
  })

  describe('getSync', () => {
    it('returns null for missing entry', () => {
      const result = cacheService.getSync('nonexistent')
      expect(result).toBeNull()
    })

    it('returns cached VC if present and fresh', () => {
      const statusListId = 'test-list-1'
      const vc = 'eyJhbGc...'

      // Manually insert into cache
      const cacheEntry = {
        statusListId,
        vc,
        digest: 'abc123',
        cachedAt: Date.now(),
        fetchedAt: Date.now(),
        refreshedAt: Date.now(),
        isStale: false,
      }
      // Access private cache via reflection
      ;(cacheService as any).cache.set(statusListId, cacheEntry)

      const result = cacheService.getSync(statusListId)
      expect(result).not.toBeNull()
      expect(result?.vc).toBe(vc)
      expect(result?.isStale).toBe(false)
    })

    it('marks entry stale after TTL expires', () => {
      const statusListId = 'test-list-2'
      const vc = 'eyJhbGc...'
      const cacheEntry = {
        statusListId,
        vc,
        digest: 'abc123',
        cachedAt: Date.now() - 6 * 60 * 1000, // 6 minutes ago
        fetchedAt: Date.now() - 6 * 60 * 1000,
        refreshedAt: Date.now() - 6 * 60 * 1000,
        isStale: false,
      }
      ;(cacheService as any).cache.set(statusListId, cacheEntry)

      const result = cacheService.getSync(statusListId)
      expect(result).not.toBeNull()
      expect(result?.isStale).toBe(true)
    })

    it('increments hit counter for fresh entries', () => {
      const statusListId = 'test-list-3'
      const vc = 'eyJhbGc...'
      const cacheEntry = {
        statusListId,
        vc,
        digest: 'abc123',
        cachedAt: Date.now(),
        fetchedAt: Date.now(),
        refreshedAt: Date.now(),
        isStale: false,
      }
      ;(cacheService as any).cache.set(statusListId, cacheEntry)

      const before = cacheService.getMetrics().hits
      cacheService.getSync(statusListId)
      const after = cacheService.getMetrics().hits
      expect(after).toBe(before + 1)
    })

    it('increments miss counter for missing entries', () => {
      const before = cacheService.getMetrics().misses
      cacheService.getSync('nonexistent')
      const after = cacheService.getMetrics().misses
      expect(after).toBe(before + 1)
    })
  })

  describe('invalidate', () => {
    it('removes cached entry', () => {
      const statusListId = 'test-list-4'
      const cacheEntry = {
        statusListId,
        vc: 'eyJhbGc...',
        digest: 'abc123',
        cachedAt: Date.now(),
        fetchedAt: Date.now(),
        refreshedAt: Date.now(),
        isStale: false,
      }
      ;(cacheService as any).cache.set(statusListId, cacheEntry)

      expect(cacheService.getSync(statusListId)).not.toBeNull()
      cacheService.invalidate(statusListId)
      expect(cacheService.getSync(statusListId)).toBeNull()
    })

    it('increments invalidation counter', () => {
      const statusListId = 'test-list-5'
      const cacheEntry = {
        statusListId,
        vc: 'eyJhbGc...',
        digest: 'abc123',
        cachedAt: Date.now(),
        fetchedAt: Date.now(),
        refreshedAt: Date.now(),
        isStale: false,
      }
      ;(cacheService as any).cache.set(statusListId, cacheEntry)

      const before = cacheService.getMetrics().invalidations
      cacheService.invalidate(statusListId)
      const after = cacheService.getMetrics().invalidations
      expect(after).toBe(before + 1)
    })

    it('no-op on missing entry', () => {
      const before = cacheService.getMetrics().invalidations
      cacheService.invalidate('nonexistent')
      const after = cacheService.getMetrics().invalidations
      expect(after).toBe(before) // No increment
    })
  })

  describe('clear', () => {
    it('removes all cached entries', () => {
      const entries = [
        { id: 'list-1', vc: 'vc1' },
        { id: 'list-2', vc: 'vc2' },
        { id: 'list-3', vc: 'vc3' },
      ]
      for (const { id, vc } of entries) {
        const cacheEntry = {
          statusListId: id,
          vc,
          digest: 'digest',
          cachedAt: Date.now(),
          fetchedAt: Date.now(),
          refreshedAt: Date.now(),
          isStale: false,
        }
        ;(cacheService as any).cache.set(id, cacheEntry)
      }

      expect((cacheService as any).cache.size).toBe(3)
      cacheService.clear()
      expect((cacheService as any).cache.size).toBe(0)
    })
  })

  describe('getMetrics', () => {
    it('returns current metric state', () => {
      const metrics = cacheService.getMetrics()
      expect(metrics).toHaveProperty('hits')
      expect(metrics).toHaveProperty('misses')
      expect(metrics).toHaveProperty('staleServes')
      expect(metrics).toHaveProperty('invalidations')
      expect(metrics).toHaveProperty('errors')
      expect(metrics).toHaveProperty('size')
      expect(metrics).toHaveProperty('pendingRefreshes')
    })
  })

  describe('resetMetrics', () => {
    it('resets all counters to zero', () => {
      cacheService.resetMetrics()
      const metrics = cacheService.getMetrics()
      expect(metrics.hits).toBe(0)
      expect(metrics.misses).toBe(0)
      expect(metrics.staleServes).toBe(0)
      expect(metrics.invalidations).toBe(0)
      expect(metrics.errors).toBe(0)
    })
  })

  describe('stale-while-revalidate', () => {
    it('returns stale data while allowStale=true', async () => {
      const statusListId = 'test-list-stale'
      const cacheEntry = {
        statusListId,
        vc: 'eyJhbGc...',
        digest: 'abc123',
        cachedAt: Date.now() - 6 * 60 * 1000, // 6 minutes ago (stale)
        fetchedAt: Date.now() - 6 * 60 * 1000,
        refreshedAt: Date.now() - 6 * 60 * 1000,
        isStale: false,
      }
      ;(cacheService as any).cache.set(statusListId, cacheEntry)

      // Mock database to return null (no fresh version)
      const result = await cacheService.get(statusListId, true)
      expect(result).not.toBeNull()
      expect(result?.vc).toBe('eyJhbGc...')
      expect(result?.isStale).toBe(true)
      expect(result?.requiresFresh).toBe(true)
    })

    it('increments staleServes counter', async () => {
      const statusListId = 'test-list-stale-2'
      const cacheEntry = {
        statusListId,
        vc: 'eyJhbGc...',
        digest: 'abc123',
        cachedAt: Date.now() - 6 * 60 * 1000,
        fetchedAt: Date.now() - 6 * 60 * 1000,
        refreshedAt: Date.now() - 6 * 60 * 1000,
        isStale: false,
      }
      ;(cacheService as any).cache.set(statusListId, cacheEntry)

      const before = cacheService.getMetrics().staleServes
      await cacheService.get(statusListId, true)
      const after = cacheService.getMetrics().staleServes
      expect(after).toBe(before + 1)
    })
  })
})
