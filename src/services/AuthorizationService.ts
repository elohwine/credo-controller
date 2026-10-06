import type {
  AuthorityDecision,
  AuthorityDecisionInput,
  AuthorityScope,
  SsiCredentialCondition,
  SsiEvidenceInput,
} from './ssi/SsiTypes'

import { randomUUID } from 'crypto'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'

import { authZENAdapterService } from './AuthZENAdapterService'
import { authorizationPolicyService } from './AuthorizationPolicyService'

const logger = rootLogger.child({ module: 'AuthorizationService' })

/**
 * Authorization is intentionally separate from credential verification.
 * A verified credential is evidence consumed by policy; it is not itself the
 * permission to perform a business action.
 *
 * decide() is the synchronous in-process path (default).
 * decideAsync() adds optional external AuthZEN delegation when the organization
 * has an external_authzen adapter configured.
 */
export class AuthorizationService {
  /**
   * Async authorization decision that routes through an external AuthZEN
   * endpoint when the organization has one configured. Falls back to the
   * synchronous in-process path if no external adapter is set or if the
   * external call fails (fail-closed).
   */
  public async decideAsync(input: AuthorityDecisionInput): Promise<AuthorityDecision> {
    const db = DatabaseManager.getDatabase()
    const org = db
      .prepare(`SELECT id FROM organizations WHERE tenant_id = ? AND status = 'active' LIMIT 1`)
      .get(input.tenantId) as { id?: string } | undefined

    if (org?.id) {
      try {
        const config = authorizationPolicyService.getExternalAuthzConfig(org.id)
        if (config?.type === 'external_authzen' && config.endpoint && config.tokenRef) {
          const result = await authZENAdapterService.evaluate(
            config.endpoint,
            config.tokenRef,
            { type: 'person', id: input.personId },
            { name: input.action },
            { type: input.resourceType, id: input.resourceId },
            { organizationId: org.id, tenantId: input.tenantId, amount: input.amount, currency: input.currency },
          )
          const decisionId = randomUUID()
          const evaluatedAt = new Date().toISOString()
          return this.persistDecision(input, {
            decisionId,
            decision: result.decision ? 'allow' : 'deny',
            reasonCode: result.reasonCode ?? (result.decision ? 'authzen_allow' : 'authzen_deny'),
            credentialReferences: [],
            policyVersion: result.policyVersion ?? 'external',
            evaluatedAt,
          })
        }
      } catch (err) {
        logger.warn({ err }, 'External AuthZEN call failed — falling back to in-process evaluation')
      }
    }

    return this.decide(input)
  }

  public decide(input: AuthorityDecisionInput): AuthorityDecision {
    const db = DatabaseManager.getDatabase()
    const evaluatedAt = new Date().toISOString()
    const decisionId = randomUUID()
    const permission = input.requiredPermission || input.action

    const actor = db
      .prepare(
        `
      SELECT p.id AS personId, p.organization_id AS organizationId
      FROM people p
      JOIN organizations o ON o.id = p.organization_id
      WHERE o.tenant_id = ?
        AND o.status = 'active'
        AND p.id = ?
        AND p.status = 'active'
        AND (
          EXISTS (
            SELECT 1
            FROM organization_memberships m
            WHERE m.organization_id = p.organization_id
              AND m.person_id = p.id
              AND m.membership_status = 'active'
          )
          OR EXISTS (
            SELECT 1
            FROM org_memberships om
            WHERE om.org_tenant_id = o.tenant_id
              AND om.user_id = p.subject_ref
              AND om.status = 'active'
          )
          OR EXISTS (
            SELECT 1
            FROM org_memberships om
            WHERE om.org_tenant_id = o.tenant_id
              AND om.user_id = p.id
              AND om.status = 'active'
          )
        )
      LIMIT 1
    `,
      )
      .get(input.tenantId, input.personId) as { personId?: string; organizationId?: string } | undefined

    if (!actor?.organizationId) {
      return this.persistDecision(input, {
        decisionId,
        decision: 'deny',
        reasonCode: 'principal_not_active_in_tenant',
        credentialReferences: [],
        policyVersion: 'platform-v1',
        evaluatedAt,
      })
    }

    // Resolve the currently active versioned policy tag for this organization.
    const policyVersion = this.resolveActivePolicyVersion(actor.organizationId)

    const authorityRows = db
      .prepare(
        `
      SELECT
        a.id,
        a.authority_type AS authorityType,
        a.scope_json AS scopeJson,
        a.source_credential_ref AS sourceCredentialRef
      FROM authority_grants a
      WHERE a.organization_id = ?
        AND a.person_id = ?
        AND a.status = 'active'
        AND (a.valid_from IS NULL OR a.valid_from <= CURRENT_TIMESTAMP)
        AND (a.valid_until IS NULL OR a.valid_until >= CURRENT_TIMESTAMP)
      ORDER BY a.created_at DESC
    `,
      )
      .all(actor.organizationId, input.personId) as Array<{
      id: string
      authorityType: string
      scopeJson: string
      sourceCredentialRef?: string
    }>

    for (const authority of authorityRows) {
      const scope = this.parseScope(authority.scopeJson)
      if (!this.matchScope(input, permission, scope)) continue

      if (this.violatesSeparationOfDuties(input)) {
        return this.persistDecision(input, {
          decisionId,
          decision: 'deny',
          reasonCode: 'separation_of_duties_violation',
          authorityRef: authority.id,
          credentialReferences: authority.sourceCredentialRef ? [authority.sourceCredentialRef] : [],
          policyVersion,
          evaluatedAt,
        })
      }

      const ssiCheck = this.evaluateSsiEvidence(scope.requiredCredentials, input.ssiEvidence)
      if (!ssiCheck.satisfied) {
        return this.persistDecision(input, {
          decisionId,
          decision: 'deny',
          reasonCode: ssiCheck.reasonCode,
          authorityRef: authority.id,
          credentialReferences: ssiCheck.credentialRefs,
          policyVersion,
          evaluatedAt,
        })
      }

      return this.persistDecision(input, {
        decisionId,
        decision: 'allow',
        reasonCode: 'authority_scope_match',
        authorityRef: authority.id,
        credentialReferences: [
          ...(authority.sourceCredentialRef ? [authority.sourceCredentialRef] : []),
          ...ssiCheck.credentialRefs,
        ],
        policyVersion,
        evaluatedAt,
      })
    }

    // Delegation is usable only when an active delegation exists AND the
    // delegator independently has matching authority. The delegation itself
    // must also match the complete constrained scope of the requested action.
    const delegated = this.findValidDelegation(actor.organizationId, input, permission)
    if (delegated) {
      if (this.violatesSeparationOfDuties(input)) {
        return this.persistDecision(input, {
          decisionId,
          decision: 'deny',
          reasonCode: 'separation_of_duties_violation',
          authorityRef: delegated.authorityRef,
          credentialReferences: delegated.credentialReferences,
          policyVersion,
          evaluatedAt,
        })
      }

      const ssiCheck = this.evaluateSsiEvidence(
        this.parseScope(this.getRawDelegationAuthorityScope(actor.organizationId, delegated.authorityRef))
          .requiredCredentials,
        input.ssiEvidence,
      )
      if (!ssiCheck.satisfied) {
        return this.persistDecision(input, {
          decisionId,
          decision: 'deny',
          reasonCode: ssiCheck.reasonCode,
          authorityRef: delegated.authorityRef,
          credentialReferences: ssiCheck.credentialRefs,
          policyVersion,
          evaluatedAt,
        })
      }

      return this.persistDecision(input, {
        decisionId,
        decision: 'allow',
        reasonCode: 'active_delegation_scope_match',
        authorityRef: delegated.authorityRef,
        credentialReferences: [...delegated.credentialReferences, ...ssiCheck.credentialRefs],
        policyVersion,
        evaluatedAt,
      })
    }

    const orgRole = db
      .prepare(
        `
      SELECT om.role
      FROM org_memberships om
      JOIN people p ON p.organization_id = ?
      WHERE om.org_tenant_id = ?
        AND om.status = 'active'
        AND p.id = ?
        AND (om.user_id = p.subject_ref OR om.user_id = p.id)
      LIMIT 1
    `,
      )
      .get(actor.organizationId, input.tenantId, input.personId) as { role?: string } | undefined

    if (orgRole && ['owner', 'admin'].includes(orgRole.role || '') && permission.startsWith('request.')) {
      return this.persistDecision(input, {
        decisionId,
        decision: 'allow',
        reasonCode: 'org_role_permission_match',
        credentialReferences: [],
        policyVersion,
        evaluatedAt,
      })
    }

    return this.persistDecision(input, {
      decisionId,
      decision: 'deny',
      reasonCode: 'no_matching_authority',
      credentialReferences: [],
      policyVersion,
      evaluatedAt,
    })
  }

  private parseScope(value: string): AuthorityScope {
    try {
      const parsed = JSON.parse(value || '{}')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { permissions: [] }
      }

      const maybeScope = parsed as Partial<AuthorityScope>
      return {
        ...maybeScope,
        permissions: Array.isArray(maybeScope.permissions) ? maybeScope.permissions : [],
      }
    } catch {
      return { permissions: [] }
    }
  }

  private matchScope(input: AuthorityDecisionInput, permission: string, scope: AuthorityScope): boolean {
    if (!Array.isArray(scope.permissions) || !scope.permissions.includes(permission)) return false
    if (Array.isArray(scope.resourceTypes) && !scope.resourceTypes.includes(input.resourceType)) return false

    // A constrained authority cannot be used when the request omits the
    // constrained attribute; absence is not proof of a match.
    if (Array.isArray(scope.departmentIds)) {
      if (!input.departmentId || !scope.departmentIds.includes(input.departmentId)) return false
    }
    if (Array.isArray(scope.projectRefs)) {
      if (!input.projectRef || !scope.projectRefs.includes(input.projectRef)) return false
    }
    if (Array.isArray(scope.costCentreRefs)) {
      if (!input.costCentreRef || !scope.costCentreRefs.includes(input.costCentreRef)) return false
    }
    if (scope.currency) {
      if (!input.currency || scope.currency !== input.currency) return false
    }
    if (typeof scope.maxAmount === 'number') {
      if (typeof input.amount !== 'number' || input.amount > scope.maxAmount) return false
    }

    return true
  }

  private findValidDelegation(
    organizationId: string,
    input: AuthorityDecisionInput,
    permission: string,
  ): { authorityRef: string; credentialReferences: string[] } | undefined {
    const db = DatabaseManager.getDatabase()
    const rows = db
      .prepare(
        `
      SELECT
        d.scope_json AS delegationScopeJson,
        d.source_credential_ref AS delegationCredentialRef,
        a.id AS authorityRef,
        a.scope_json AS authorityScopeJson,
        a.source_credential_ref AS authorityCredentialRef
      FROM delegations d
      JOIN authority_grants a
        ON a.organization_id = d.organization_id
       AND a.person_id = d.delegator_person_id
       AND a.status = 'active'
       AND (a.valid_from IS NULL OR a.valid_from <= CURRENT_TIMESTAMP)
       AND (a.valid_until IS NULL OR a.valid_until >= CURRENT_TIMESTAMP)
      WHERE d.organization_id = ?
        AND d.delegate_person_id = ?
        AND d.status = 'active'
        AND d.valid_from <= CURRENT_TIMESTAMP
        AND (d.valid_until IS NULL OR d.valid_until >= CURRENT_TIMESTAMP)
      ORDER BY d.created_at DESC
    `,
      )
      .all(organizationId, input.personId) as Array<{
      delegationScopeJson: string
      delegationCredentialRef?: string
      authorityRef: string
      authorityScopeJson: string
      authorityCredentialRef?: string
    }>

    for (const row of rows) {
      const delegationScope = this.parseScope(row.delegationScopeJson)
      const authorityScope = this.parseScope(row.authorityScopeJson)
      if (!this.matchScope(input, permission, delegationScope)) continue
      if (!this.matchScope(input, permission, authorityScope)) continue

      return {
        authorityRef: row.authorityRef,
        credentialReferences: [row.authorityCredentialRef, row.delegationCredentialRef].filter(Boolean) as string[],
      }
    }

    return undefined
  }

  private getRawDelegationAuthorityScope(organizationId: string, authorityRef: string): string {
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare('SELECT scope_json AS scopeJson FROM authority_grants WHERE organization_id = ? AND id = ? LIMIT 1')
      .get(organizationId, authorityRef) as { scopeJson?: string } | undefined
    return row?.scopeJson ?? '{}'
  }

  private evaluateSsiEvidence(
    required: SsiCredentialCondition[] | undefined,
    supplied: SsiEvidenceInput[] | undefined,
  ): { satisfied: boolean; reasonCode: string; credentialRefs: string[] } {
    if (!required || required.length === 0) {
      return { satisfied: true, reasonCode: 'no_credential_conditions', credentialRefs: [] }
    }

    const credentialRefs: string[] = []

    for (const condition of required) {
      const match = (supplied ?? []).find((e) => e.credentialType === condition.credentialType)

      if (!match) {
        return { satisfied: false, reasonCode: 'required_credential_missing', credentialRefs }
      }

      if (condition.statusMustBeValid && match.status !== 'valid') {
        return { satisfied: false, reasonCode: 'credential_status_not_valid', credentialRefs }
      }

      if (condition.trustedIssuer && !match.isTrustedIssuer) {
        return { satisfied: false, reasonCode: 'credential_issuer_not_trusted', credentialRefs }
      }

      credentialRefs.push(match.credentialReferenceId)
    }

    return { satisfied: true, reasonCode: 'credential_conditions_met', credentialRefs }
  }

  private violatesSeparationOfDuties(input: AuthorityDecisionInput): boolean {
    const separated = new Set(input.separationOfDutiesPersonIds || [])
    return separated.has(input.personId)
  }

  private persistDecision(input: AuthorityDecisionInput, decision: AuthorityDecision): AuthorityDecision {
    const db = DatabaseManager.getDatabase()
    const organization = db
      .prepare(
        `
      SELECT id FROM organizations WHERE tenant_id = ? AND status = 'active' LIMIT 1
    `,
      )
      .get(input.tenantId) as { id?: string } | undefined

    if (organization?.id) {
      db.prepare(
        `
        INSERT INTO policy_decisions (
          id, organization_id, principal_person_id, action,
          resource_type, resource_id, decision, reason_code,
          authority_ref, credential_refs_json, policy_version, decided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        decision.decisionId,
        organization.id,
        input.personId,
        input.action,
        input.resourceType,
        input.resourceId || null,
        decision.decision,
        decision.reasonCode,
        decision.authorityRef || null,
        JSON.stringify(decision.credentialReferences),
        decision.policyVersion,
        decision.evaluatedAt,
      )
    }

    return decision
  }

  /**
   * Resolves the active versioned policy label for an organization.
   *
   * Returns 'v{N}' when a deployed policy_version exists, or 'platform-v1' as
   * a backward-compatible fallback when the table is absent or no active version
   * has been deployed yet.
   */
  private resolveActivePolicyVersion(organizationId: string): string {
    try {
      const db = DatabaseManager.getDatabase()
      const row = db
        .prepare(
          `
          SELECT 'v' || pv.version_number AS policyVersion
            FROM policy_versions pv
            JOIN authority_policies ap ON pv.authority_policy_id = ap.id
           WHERE ap.organization_id = ?
             AND pv.deployment_status = 'active'
             AND (ap.effective_from IS NULL OR ap.effective_from <= CURRENT_TIMESTAMP)
             AND (ap.effective_until IS NULL OR ap.effective_until > CURRENT_TIMESTAMP)
           ORDER BY pv.version_number DESC
           LIMIT 1
        `,
        )
        .get(organizationId) as { policyVersion?: string } | undefined
      return row?.policyVersion ?? 'platform-v1'
    } catch {
      // Graceful fallback when policy_versions table has not been migrated yet
      return 'platform-v1'
    }
  }
}

export const authorizationService = new AuthorizationService()
