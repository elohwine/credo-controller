import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'Jobs' })

/**
 * Cleanup job for legacy OIDC offers.
 * Deprecated: Credo native module handles ephemeral state or we rely on DB cleanup if needed.
 */
export const cleanupExpiredOffers = () => {
    logger.info('cleanupExpiredOffers job called - DEPRECATED (Native OIDC4VC used)')
    // No-op
}

export const startCleanupJob = (logger?: any) => {
    // No-op
}

export const stopCleanupJob = (logger?: any) => {
    // No-op
}
