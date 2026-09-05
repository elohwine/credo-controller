import { randomUUID } from 'crypto'
import { DatabaseManager } from '../persistence/DatabaseManager'
import type { AuthorityDecision, AuthorityDecisionInput } from './ssi/SsiTypes'

/**
 * Authorization is intentionally separate from credential verification.
 * A verified credential is evidence consumed by policy; it is not itself the
 * permission to perform a business action.
 */
export class AuthorizationService {
  decide(input: AuthorityDecisionInput): AuthorityDecision {
    const db = DatabaseManager.getDatabase()
    const evaluatedAt = new Date().toISOString()
    const decisionId = randomUUID()
    const permission = input.requiredPermission || input.action

    const actor = db.prepare(`
      SELECT p.id AS personId, p.organization_id AS organizationId
      FROM people p
      JOIN organizations o ON o.id = p.organization_id
      JOIN organization_memberships m
        ON m.person_id = p.id
       AND m.organization_id = p.organization_id
      WHERE o.tenant_id = ?
        AND o.status = 'active'
        AND p.id = ?
        AND p.status = 'active'
        AND m.membership_status = 'active'
      LIMIT 1
    `).get(input.tenantId, input.personId) as { personId?: string; organizationId?: string } | undefined

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

    const authorityRows = db.prepare(`
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
    `).all(actor.organizationId, input.personId) as Array<{
      id: string
      authorityType: string
      scopeJson: string
      sourceCredentialRef?: string
    }>

    for (const authority of authorityRows) {
      let scope: any = {}
      try { scope = JSON.parse(authority.scopeJson || '{}') } catch { scope = {} }

      const permissions = new Set<string>([
        ...(Array.isArray(scope.permissions) ? scope.permissions : []),
        authority.authorityType,
      ])
      if (!permissions.has(permission)) continue

      if (Array.isArray(scope.resourceTypes) && input.resourceType && !scope.resourceTypes.includes(input.resourceType)) continue
      if (Array.isArray(scope.departmentIds) && input.departmentId && !scope.departmentIds.includes(input.departmentId)) continue
      if (Array.isArray(scope.projectRefs) && input.projectRef && !scope.projectRefs.includes(input.projectRef)) continue
      if (Array.isArray(scope.costCentreRefs) && input.costCentreRef && !scope.costCentreRefs.includes(input.costCentreRef)) continue

      if (typeof scope.maxAmount === 'number' && typeof input.amount === 'number' && input.amount > scope.maxAmount) continue
      if (scope.currency && input.currency && scope.currency !== input.currency) continue

      const separated = new Set(input.separationOfDutiesPersonIds || [])
      if (separated.has(input.personId)) {
        return this.persistDecision(input, {
          decisionId,
          decision: 'deny',
          reasonCode: 'separation_of_duties_violation',
          authorityRef: authority.id,
          credentialReferences: authority.sourceCredentialRef ? [authority.sourceCredentialRef] : [],
          policyVersion: 'platform-v1',
          evaluatedAt,
        })
      }

      return this.persistDecision(input, {
        decisionId,
        decision: 'allow',
        reasonCode: 'authority_scope_match',
        authorityRef: authority.id,
        credentialReferences: authority.sourceCredentialRef ? [authority.sourceCredentialRef] : [],
        policyVersion: 'platform-v1',
        evaluatedAt,
      })
    }

    return this.persistDecision(input, {
      decisionId,
      decision: 'deny',
      reasonCode: 'no_matching_authority',
      credentialReferences: [],
      policyVersion: 'platform-v1',
      evaluatedAt,
    })
  }

  private persistDecision(input: AuthorityDecisionInput, decision: AuthorityDecision): AuthorityDecision {
    const db = DatabaseManager.getDatabase()
    const organization = db.prepare(`
      SELECT id FROM organizations WHERE tenant_id = ? AND status = 'active' LIMIT 1
    `).get(input.tenantId) as { id?: string } | undefined

    if (organization?.id) {
      db.prepare(`
        INSERT INTO policy_decisions (
          id, organization_id, principal_person_id, action,
          resource_type, resource_id, decision, reason_code,
          authority_ref, credential_refs_json, policy_version, decided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
}

export const authorizationService = new AuthorizationService()
