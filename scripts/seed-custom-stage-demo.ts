/**
 * Seed one workflow an organisation could have onboarded itself, so the inbox and the step can be
 * walked on both apps. Saves a `shipment_release` template whose only step is the organisation's
 * own (`approve_shipment`), names the supervisor for it, and starts one run.
 *
 * Run with: npx tsx scripts/seed-custom-stage-demo.ts
 */

import 'reflect-metadata'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { initTenantStore } from '../src/persistence/TenantRepository'

const ORG_TENANT_ID = process.env.ORG_TENANT_ID || 'd28a5063-b5c6-49c5-ae16-5fdab4048d04'
const APPROVER_USER_ID = process.env.APPROVER_USER_ID || '504536cd-6419-470a-9649-5f72fda04dbd'
const APPROVER_WALLET = process.env.APPROVER_WALLET || 'cf04e9e4-10f5-4262-9101-3907cede9c1d'
const WORKFLOW_TYPE = 'shipment_release'
const STEP = 'approve_shipment'

async function main() {
  DatabaseManager.initialize({ path: process.env.DB_PATH || './data/persistence.db' })
  initTenantStore(process.env.TENANTS_DB_PATH || './data/tenants.db')

  const { WorkflowTemplateRepository } = await import('../src/persistence/WorkflowTemplateRepository')
  const { orgWorkflowActorService } = await import('../src/services/OrgWorkflowActorService')
  const { workflowService } = await import('../src/services/WorkflowService')

  const repository = new WorkflowTemplateRepository()
  const id = `${WORKFLOW_TYPE}-${ORG_TENANT_ID}`
  repository.save({
    id,
    tenantId: ORG_TENANT_ID,
    workflowType: WORKFLOW_TYPE,
    name: 'Shipment release',
    sector: 'custom',
    enabled: true,
    version: 1,
    steps: [
      {
        action: 'stage.await_actor',
        description: 'Someone approves the shipment',
        config: { stageAction: STEP, title: 'Approve the shipment', workflowType: WORKFLOW_TYPE },
      },
    ],
    paymentModes: [],
    credentialPolicy: { outputVCs: [], autoIssue: false },
    reconciliationPolicy: { mode: 'manual_close', events: [] },
    evidencePolicy: {},
    brandingPolicy: {},
    experience: { version: 1, family: 'requests', reviewAction: STEP },
  } as any)

  orgWorkflowActorService.upsertDefault({
    orgTenantId: ORG_TENANT_ID,
    workflowType: WORKFLOW_TYPE,
    stageAction: STEP,
    defaultUserId: APPROVER_USER_ID,
    defaultWalletTenantId: APPROVER_WALLET,
  })

  const start = await workflowService.executeWorkflow(
    WORKFLOW_TYPE,
    { reference: 'SHP-2041', amount: 1250, currency: 'USD', description: 'Release the Beira container' },
    ORG_TENANT_ID,
  )

  const run = DatabaseManager.getDatabase()
    .prepare('SELECT status, output FROM workflow_runs WHERE id = ?')
    .get(start.runId) as { status: string; output: string }
  const cards = DatabaseManager.getDatabase()
    .prepare(
      `SELECT tenant_id, title, body, metadata FROM wallet_pending_offers
        WHERE issuer_tenant_id = ? AND source_type = 'workflow_stage_action' AND workflow_run_id = ?`,
    )
    .all(ORG_TENANT_ID, start.runId)

  console.log(JSON.stringify({ runId: start.runId, status: run.status, state: JSON.parse(run.output || '{}'), cards }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
