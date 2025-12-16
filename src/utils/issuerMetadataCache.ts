/**
 * IssuerMetadataCache - In-process cache for issuer metadata
 * 
 * Purpose: Avoid HTTP loopback when holder resolves offers from same-process issuer.
 * The holder normally fetches /.well-known/openid-credential-issuer via HTTP,
 * but when issuer is on localhost:3000 and holder is on same process, this causes ECONNRESET.
 * 
 * Solution: Cache issuer metadata in-memory and provide it directly to scoped fetch wrapper.
 */

interface CachedIssuerMetadata {
    issuerUrl: string
    metadata: any
    did: string
    kid: string
    tenantId?: string
    cachedAt: Date
}

class IssuerMetadataCacheClass {
    private cache = new Map<string, CachedIssuerMetadata>()

    /**
     * Store issuer metadata keyed by origin (e.g., "http://127.0.0.1:3000")
     */
    set(issuerUrl: string, metadata: any, did: string, kid: string, tenantId?: string): void {
        try {
            const origin = new URL(issuerUrl).origin.replace(/localhost/g, '127.0.0.1')
            this.cache.set(origin, {
                issuerUrl,
                metadata,
                did,
                kid,
                tenantId,
                cachedAt: new Date(),
            })
            console.log(`[IssuerMetadataCache] Cached metadata for ${origin}`)
        } catch (e) {
            console.warn('[IssuerMetadataCache] Failed to cache:', (e as any)?.message)
        }
    }

    /**
     * Get cached metadata by origin
     */
    get(issuerUrl: string): CachedIssuerMetadata | undefined {
        try {
            const origin = new URL(issuerUrl).origin.replace(/localhost/g, '127.0.0.1')
            return this.cache.get(origin)
        } catch {
            return undefined
        }
    }

    /**
     * Check if we have cached metadata for an origin
     */
    has(issuerUrl: string): boolean {
        try {
            const origin = new URL(issuerUrl).origin.replace(/localhost/g, '127.0.0.1')
            return this.cache.has(origin)
        } catch {
            return false
        }
    }

    /**
     * Get metadata for any localhost/127.0.0.1 origin (for local issuers)
     */
    getLocalIssuer(): CachedIssuerMetadata | undefined {
        for (const [origin, data] of this.cache.entries()) {
            if (origin.includes('127.0.0.1') || origin.includes('localhost')) {
                return data
            }
        }
        return undefined
    }

    /**
     * Clear cache for an origin
     */
    delete(issuerUrl: string): boolean {
        try {
            const origin = new URL(issuerUrl).origin.replace(/localhost/g, '127.0.0.1')
            return this.cache.delete(origin)
        } catch {
            return false
        }
    }

    /**
     * Clear all cached metadata
     */
    clear(): void {
        this.cache.clear()
    }

    /**
     * List all cached origins (for debugging)
     */
    list(): string[] {
        return Array.from(this.cache.keys())
    }
}

// Singleton export
export const issuerMetadataCache = new IssuerMetadataCacheClass()
