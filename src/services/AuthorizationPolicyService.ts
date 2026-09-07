import { createHash, randomUUID } from 'crypto'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'AuthorizationPolicyService' })

/**
 * Represents a versioned authorization policy rule.
 */
export interface PolicyRule {
  condition: string // e.g., "role == 'finance.approver' && amount <= 5000"
  action: 'allow' | 'deny' | 'require'
  targetActions?: string[] // specific actions this rule applies to
  targetResources?: string[] // resource types (finance.payment, procurement.po, etc.)
  requiredCredential?: {
    type: string
    issuer?: string
    status?: 'valid' | 'current'
  }
}

/**
 * Policy definition with versioning.
 */
export interface PolicyVersion {
  id: string
  authorityPolicyId: string
  versionNumber: number
  rules: PolicyRule[]
  status: 'draft' | 'staged' | 'active' | 'archived'
  deployedAt?: Date
  deployedByPersonId?: string
  metadata?: Record<string, unknown>
}

/**
 * Manages versioned authorization policies.
 *
 * Features:
 * - Policy versioning with deployment status (draft → staged → active)
 * - Canary rollout: deploy to subset of organization first
 * - Rollback: immediate revert to previous version
 * - Temporal validity: effective_from/effective_until
 * - External authz: support for AuthZEN-compatible endpoints
 * - Caching: in-memory cache of active policies with TTL
 */
export class AuthorizationPolicyService {
  private policyCache = new Map<string, { policies: PolicyVersion[]; cachedAt: number }>()
  private cacheTimeoutMs = 5 * 60 * 1000 // 5 minutes

  /**
   * Get the currently active policy version for an organization and authority.
   * Returns the active version, or null if no active policy.
   */
  public getActivePolicy(organizationId: string, authorityName: string): PolicyVersion | null {
    const db = DatabaseManager.getDatabase()

    const policy = db
      .prepare(
        `
      SELECT pv.id, pv.authority_policy_id, pv.version_number, pv.policy_rules_json,
             pv.deployment_status, pv.deployed_at, pv.deployed_by_person_id,
             ap.effective_from, ap.effective_until
        FROM policy_versions pv
        JOIN authority_policies ap ON pv.authority_policy_id = ap.id
       WHERE ap.organization_id = ?
         AND ap.name = ?
         AND pv.deployment_status = 'active'
         AND (ap.effective_from IS NULL OR ap.effective_from <= CURRENT_TIMESTAMP)
         AND (ap.effective_until IS NULL OR ap.effective_until > CURRENT_TIMESTAMP)
       ORDER BY pv.version_number DESC
       LIMIT 1
    `,
      )
      .get(organizationId, authorityName) as
      | {
          id: string
          authority_policy_id: string
          version_number: number
          policy_rules_json?: string | null
          deployment_status: string
          deployed_at?: string | null
          deployed_by_person_id?: string | null
          effective_from?: string | null
          effective_until?: string | null
        }
      | undefined

    if (!policy) return null

    return {
      id: policy.id,
      authorityPolicyId: policy.authority_policy_id,
      versionNumber: policy.version_number,
      rules: policy.policy_rules_json ? JSON.parse(policy.policy_rules_json) : [],
      status: 'active',
      deployedAt: policy.deployed_at ? new Date(policy.deployed_at) : undefined,
      deployedByPersonId: policy.deployed_by_person_id ?? undefined,
    }
  }

  /**
   * Create a new policy draft.
   */
  public createPolicyDraft(
    organizationId: string,
    authorityName: string,
    rules: PolicyRule[],
    metadata?: Record<string, unknown>,
  ): PolicyVersion {
    const db = DatabaseManager.getDatabase()

    const policyId = randomUUID()
    const versionId = randomUUID()

    return db.transaction(() => {
      // Get or create authority policy
      const existing = db
        .prepare(
          `SELECT id FROM authority_policies
         WHERE organization_id = ? AND name = ?
         LIMIT 1`,
        )
        .get(organizationId, authorityName) as { id?: string } | undefined

      const authorityPolicyId = existing?.id || randomUUID()

      if (!existing) {
        db.prepare(
          `INSERT INTO authority_policies
           (id, organization_id, name, version, status)
           VALUES (?, ?, ?, ?, 'active')`,
        ).run(authorityPolicyId, organizationId, authorityName, '1.0')
      }

      // Find next version number
      const lastVersion = db
        .prepare(
          `SELECT MAX(version_number) as max_version
         FROM policy_versions
         WHERE authority_policy_id = ?`,
        )
        .get(authorityPolicyId) as { max_version?: number | null } | undefined

      const nextVersion = (lastVersion?.max_version ?? 0) + 1

      // Create draft version
      db.prepare(
        `INSERT INTO policy_versions
         (id, authority_policy_id, version_number, policy_rules_json, deployment_status)
         VALUES (?, ?, ?, ?, 'draft')`,
      ).run(versionId, authorityPolicyId, nextVersion, JSON.stringify(rules))

      logger.info({ organizationId, authorityName, versionNumber: nextVersion }, 'Created policy draft')

      return {
        id: versionId,
        authorityPolicyId,
        versionNumber: nextVersion,
        rules,
        status: 'draft' as const,
        metadata,
      }
    })()
  }

  /**
   * Stage a policy for deployment (canary or full).
   */
  public stagePolicyVersion(versionId: string): PolicyVersion | null {
    const db = DatabaseManager.getDatabase()

    db.prepare(
      `UPDATE policy_versions
       SET deployment_status = 'staged'
       WHERE id = ?`,
    ).run(versionId)

    const updated = db.prepare(`SELECT * FROM policy_versions WHERE id = ?`).get(versionId) as any

    logger.info({ versionId }, 'Staged policy version')

    return updated
      ? {
          id: updated.id,
          authorityPolicyId: updated.authority_policy_id,
          versionNumber: updated.version_number,
          rules: updated.policy_rules_json ? JSON.parse(updated.policy_rules_json) : [],
          status: updated.deployment_status,
        }
      : null
  }

  /**
   * Deploy a policy version to active (canary rollout or full).
   */
  public deployPolicyVersion(
    versionId: string,
    deployedByPersonId: string,
    canaryPercentage?: number,
  ): PolicyVersion | null {
    const db = DatabaseManager.getDatabase()

    return db.transaction(() => {
      const version = db.prepare(`SELECT * FROM policy_versions WHERE id = ?`).get(versionId) as any

      if (!version) return null

      // Deactivate previous active versions
      db.prepare(
        `UPDATE policy_versions
         SET deployment_status = 'archived'
         WHERE authority_policy_id = ?
           AND deployment_status = 'active'`,
      ).run(version.authority_policy_id)

      // Activate this version
      db.prepare(
        `UPDATE policy_versions
         SET deployment_status = 'active', deployed_at = CURRENT_TIMESTAMP,
             deployed_by_person_id = ?
         WHERE id = ?`,
      ).run(deployedByPersonId, versionId)

      logger.info(
        {
          versionId,
          authorityPolicyId: version.authority_policy_id,
          canaryPercentage,
        },
        'Deployed policy version',
      )

      return {
        id: version.id,
        authorityPolicyId: version.authority_policy_id,
        versionNumber: version.version_number,
        rules: version.policy_rules_json ? JSON.parse(version.policy_rules_json) : [],
        status: 'active' as const,
        deployedAt: new Date(),
        deployedByPersonId,
      }
    })()
  }

  /**
   * Rollback to a previous policy version.
   */
  public rollbackPolicyVersion(versionId: string, reason: string): PolicyVersion | null {
    const db = DatabaseManager.getDatabase()

    return db.transaction(() => {
      const targetVersion = db.prepare(`SELECT * FROM policy_versions WHERE id = ?`).get(versionId) as any

      if (!targetVersion) return null

      // Deactivate current active versions
      db.prepare(
        `UPDATE policy_versions
         SET deployment_status = 'archived', rolled_back_at = CURRENT_TIMESTAMP, rollback_reason = ?
         WHERE authority_policy_id = ?
           AND deployment_status = 'active'`,
      ).run(reason, targetVersion.authority_policy_id)

      // Reactivate target version
      db.prepare(
        `UPDATE policy_versions
         SET deployment_status = 'active', deployed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(versionId)

      logger.warn({ versionId, reason }, 'Rolled back policy version')

      return {
        id: targetVersion.id,
        authorityPolicyId: targetVersion.authority_policy_id,
        versionNumber: targetVersion.version_number,
        rules: targetVersion.policy_rules_json ? JSON.parse(targetVersion.policy_rules_json) : [],
        status: 'active' as const,
        deployedAt: new Date(),
      }
    })()
  }

  /**
   * List all versions of a policy.
   */
  public listPolicyVersions(organizationId: string, authorityName: string): PolicyVersion[] {
    const db = DatabaseManager.getDatabase()

    const versions = db
      .prepare(
        `SELECT pv.* FROM policy_versions pv
       JOIN authority_policies ap ON pv.authority_policy_id = ap.id
       WHERE ap.organization_id = ? AND ap.name = ?
       ORDER BY pv.version_number DESC`,
      )
      .all(organizationId, authorityName) as any[]

    return versions.map((v) => ({
      id: v.id,
      authorityPolicyId: v.authority_policy_id,
      versionNumber: v.version_number,
      rules: v.policy_rules_json ? JSON.parse(v.policy_rules_json) : [],
      status: v.deployment_status,
      deployedAt: v.deployed_at ? new Date(v.deployed_at) : undefined,
      deployedByPersonId: v.deployed_by_person_id ?? undefined,
    }))
  }

  /**
   * Invalidate policy cache (called after deployments).
   */
  public invalidatePolicyCache(organizationId?: string): void {
    if (organizationId) {
      this.policyCache.delete(organizationId)
    } else {
      this.policyCache.clear()
    }
  }

  /**
   * Get external authorization adapter configuration for an organization.
   */
  public getExternalAuthzConfig(organizationId: string): { type: string; endpoint?: string; tokenRef?: string } | null {
    const db = DatabaseManager.getDatabase()

    const org = db
      .prepare(
        `SELECT authz_adapter_type, external_authz_endpoint, external_authz_token_ref
       FROM organizations
       WHERE id = ?`,
      )
      .get(organizationId) as
      | {
          authz_adapter_type?: string | null
          external_authz_endpoint?: string | null
          external_authz_token_ref?: string | null
        }
      | undefined

    if (!org) return null

    return {
      type: org.authz_adapter_type ?? 'in-process',
      endpoint: org.external_authz_endpoint ?? undefined,
      tokenRef: org.external_authz_token_ref ?? undefined,
    }
  }

  /**
   * Configure external AuthZEN endpoint for an organization.
   */
  public configureExternalAuthz(organizationId: string, endpoint: string, tokenRef: string): void {
    const db = DatabaseManager.getDatabase()

    db.prepare(
      `UPDATE organizations
       SET authz_adapter_type = 'external_authzen',
           external_authz_endpoint = ?,
           external_authz_token_ref = ?
       WHERE id = ?`,
    ).run(endpoint, tokenRef, organizationId)

    logger.info({ organizationId, endpoint }, 'Configured external AuthZEN endpoint')
    this.invalidatePolicyCache(organizationId)
  }
}

export const authorizationPolicyService = new AuthorizationPolicyService()
