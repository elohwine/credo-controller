import { container } from 'tsyringe'
import { Agent } from '@credo-ts/core'
import jwt from 'jsonwebtoken'
import type { RestMultiTenantAgentModules } from '../cliAgent'

/**
 * Retrieves the JWT secret, prioritizing the JWT_SECRET environment variable.
 * Fallback: Search generic records for a 'secretKey' if the env var is missing.
 */
export async function getJwtSecret(): Promise<string> {
    // Always prioritize environment variable for consistency across Docker/Prod
    if (process.env.JWT_SECRET) {
        return process.env.JWT_SECRET
    }

    try {
        const agent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)
        const genericRecords = await agent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
        const record = genericRecords[0]

        if (record?.content?.secretKey) {
            return record.content.secretKey as string
        }
    } catch (error) {
        // If agent is not initialized yet or query fails, we continue
        console.warn('[jwt.ts] Failed to retrieve secret from generic records:', (error as Error).message)
    }

    // Final fallback to avoid undefined if everything fails in dev
    // In production, JWT_SECRET should always be set
    return 'default-dev-secret-change-me'
}

/**
 * Signs a JWT token using the centralized secret.
 */
export async function signToken(payload: string | Buffer | object, options?: jwt.SignOptions): Promise<string> {
    const secret = await getJwtSecret()
    return jwt.sign(payload, secret, options)
}

/**
 * Verifies a JWT token using the centralized secret.
 */
export async function verifyToken(token: string, options?: jwt.VerifyOptions): Promise<any> {
    const secret = await getJwtSecret()
    return jwt.verify(token, secret, options)
}
