/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/**
 * Payroll Service
 * Handles employee management, payroll calculation, and payslip generation.
 * Supports plugin architecture for statutory deductions (NSSA, PAYE).
 */

import { randomUUID } from 'crypto'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'

import { credentialIssuanceService } from './CredentialIssuanceService'
import { normalizeContactPhone } from './ssi/contactHash'
import { NSSACalculator, PAYECalculator } from './payroll/plugins/StatutoryPlugins'

const logger = rootLogger.child({ module: 'PayrollService' })

function employeeFromRow(row: any): Employee {
  let skills: string[] = []
  try {
    const parsed = JSON.parse(row.skills_json || '[]')
    skills = Array.isArray(parsed) ? parsed.map((skill) => String(skill)) : []
  } catch {
    skills = []
  }
  let qualifications: EmployeeQualification[] = []
  try {
    const parsed = JSON.parse(row.qualifications_json || '[]')
    qualifications = Array.isArray(parsed)
      ? parsed
          .filter((item) => item && typeof item.name === 'string')
          .map((item) => ({
            name: item.name,
            ...(item.expiresAt ? { expiresAt: String(item.expiresAt) } : {}),
            ...(item.issuer ? { issuer: String(item.issuer) } : {}),
          }))
      : []
  } catch {
    qualifications = []
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    did: row.did,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    baseSalary: row.base_salary,
    currency: row.currency,
    nssaNumber: row.nssa_number,
    tin: row.tin,
    staffNumber: row.staff_number || undefined,
    skills,
    qualifications,
    userId: row.user_id || undefined,
    branch: row.branch || undefined,
    legacyUsername: row.legacy_username || undefined,
    status: row.status,
    createdAt: row.created_at,
  }
}

export interface EmployeeQualification {
  name: string
  expiresAt?: string
  issuer?: string
}

export interface Employee {
  id: string
  tenantId: string
  did?: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  baseSalary: number
  currency: string
  nssaNumber?: string
  tin?: string
  /** The attendant's number. Unique in the organisation. */
  staffNumber?: string
  skills?: string[]
  qualifications?: EmployeeQualification[]
  /** The team account this employee uses, so their jobs, leave and van can be listed. */
  userId?: string
  branch?: string
  /** Login name in the office's old job system, so imported jobs show who did them. */
  legacyUsername?: string
  status: 'active' | 'terminated' | 'on_leave'
  createdAt: string
}

export interface PayrollRun {
  id: string
  tenantId: string
  period: string
  status: 'draft' | 'processing' | 'completed' | 'paid'
  totalGross: number
  totalNet: number
  totalNssa?: number
  totalPaye?: number
  totalAidsLevy?: number
  runVcId?: string
  createdAt: string
}

export interface Payslip {
  id: string
  runId: string
  employeeId: string
  period: string
  grossAmount: number
  deductions: {
    nssa: number
    paye: number
    aids_levy: number
    other: number
  }
  netAmount: number
  currency: string
  payslipVcId?: string
  status: string
  createdAt: string
}

export interface TaxCompliance {
  id: string
  tenantId: string
  taxType: 'NSSA' | 'PAYE' | 'AIDS_LEVY' | 'ZIMRA'
  period: string
  amount: number
  currency: string
  filingDate?: string
  referenceNumber?: string
  status: 'pending' | 'filed' | 'confirmed' | 'rejected'
  relatedPayrollRunId?: string
  complianceVcId?: string
  createdAt: string
}

export class PayrollService {
  /**
   * Create or update an employee record
   */
  async saveEmployee(
    employee: Partial<Employee> & { firstName: string; lastName: string; baseSalary: number },
  ): Promise<Employee> {
    const db = DatabaseManager.getDatabase()
    const id = employee.id || `EMP-${randomUUID()}`
    const now = new Date().toISOString()
    const tenantId = employee.tenantId || 'default'
    // Editing a record keeps the date it was first added.
    const existing = db
      .prepare('SELECT created_at, qualifications_json FROM employees WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId) as { created_at?: string; qualifications_json?: string } | undefined
    if (employee.id && !existing) {
      const other = db.prepare('SELECT tenant_id FROM employees WHERE id = ?').get(id) as
        | { tenant_id: string }
        | undefined
      if (other && other.tenant_id !== tenantId) throw new Error('That employee belongs to another organisation')
    }

    const staffNumber =
      String(employee.staffNumber || '')
        .trim()
        .toUpperCase() || null
    const userId = String(employee.userId || '').trim() || null
    if (staffNumber) {
      const taken = db
        .prepare('SELECT id FROM employees WHERE tenant_id = ? AND staff_number = ? AND id <> ?')
        .get(tenantId, staffNumber, id) as { id: string } | undefined
      if (taken) throw new Error(`Staff number ${staffNumber} is already in use`)
    }
    if (userId) {
      const member = db
        .prepare(`SELECT user_id FROM org_memberships WHERE org_tenant_id = ? AND user_id = ? AND status != 'inactive'`)
        .get(tenantId, userId) as { user_id: string } | undefined
      if (!member) throw new Error('Link a person who is already on the team')
      const linked = db
        .prepare('SELECT id FROM employees WHERE tenant_id = ? AND user_id = ? AND id <> ?')
        .get(tenantId, userId, id) as { id: string } | undefined
      if (linked) throw new Error('That team account is already linked to an employee')
    }
    const skillsByKey = new Map<string, string>()
    for (const skill of employee.skills || []) {
      const name = String(skill || '')
        .trim()
        .slice(0, 60)
      if (name && !skillsByKey.has(name.toLowerCase())) skillsByKey.set(name.toLowerCase(), name)
    }
    const skills = Array.from(skillsByKey.values()).slice(0, 20)
    const previousQualifications = (() => {
      try {
        const parsed = JSON.parse(existing?.qualifications_json || '[]')
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    })()
    const qualifications = this.normalizeQualifications(employee.qualifications ?? previousQualifications)

    const record = {
      id,
      tenant_id: tenantId,
      did: employee.did || null,
      first_name: employee.firstName,
      last_name: employee.lastName,
      email: employee.email || null,
      phone: employee.phone || null,
      base_salary: employee.baseSalary,
      currency: employee.currency || 'USD',
      nssa_number: employee.nssaNumber || null,
      tin: employee.tin || null,
      staff_number: staffNumber,
      skills_json: JSON.stringify(skills),
      qualifications_json: JSON.stringify(qualifications),
      user_id: userId,
      status: employee.status || 'active',
      created_at: existing?.created_at || now,
      updated_at: now,
    }

    db.prepare(
      `
            INSERT OR REPLACE INTO employees 
            (id, tenant_id, did, first_name, last_name, email, phone, base_salary, currency, nssa_number, tin, staff_number, skills_json, qualifications_json, user_id, status, created_at, updated_at)
            VALUES (@id, @tenant_id, @did, @first_name, @last_name, @email, @phone, @base_salary, @currency, @nssa_number, @tin, @staff_number, @skills_json, @qualifications_json, @user_id, @status, @created_at, @updated_at)
        `,
    ).run(record)

    const saved = await this.getEmployee(id)
    if (!saved) throw new Error('Failed to save employee')
    return saved
  }

  private normalizeQualifications(input: unknown): EmployeeQualification[] {
    if (!Array.isArray(input)) throw new Error('Qualifications must be a list')
    if (input.length > 20) throw new Error('Add no more than 20 qualifications')
    const qualifications = new Map<string, EmployeeQualification>()
    for (const value of input) {
      if (!value || typeof value !== 'object') throw new Error('Each qualification needs a name')
      const item = value as Record<string, unknown>
      const name = String(item.name || '')
        .trim()
        .slice(0, 100)
      if (!name) throw new Error('Each qualification needs a name')
      const expiresAt = String(item.expiresAt || '').trim()
      if (expiresAt) {
        const parsed = new Date(`${expiresAt}T00:00:00.000Z`)
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) ||
          Number.isNaN(parsed.getTime()) ||
          parsed.toISOString().slice(0, 10) !== expiresAt
        ) {
          throw new Error(`The expiry date for ${name} must be a valid YYYY-MM-DD date`)
        }
      }
      const issuer = String(item.issuer || '')
        .trim()
        .slice(0, 100)
      const qualification = {
        name,
        ...(expiresAt ? { expiresAt } : {}),
        ...(issuer ? { issuer } : {}),
      }
      qualifications.set(`${name.toLowerCase()}:${expiresAt}`, qualification)
    }
    return [...qualifications.values()]
  }

  async getEmployee(id: string): Promise<Employee | null> {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as any
    if (!row) return null

    return employeeFromRow(row)
  }

  /**
   * Get employee by email
   */
  async getEmployeeByEmail(email: string): Promise<Employee | null> {
    const db = DatabaseManager.getDatabase()
    const emp = db.prepare('SELECT * FROM employees WHERE email = ?').get(email) as any
    if (!emp) return null

    return employeeFromRow(emp)
  }

  /**
   * One list of people. Everyone on the team has an employee record, so People & payroll is
   * the only place a person is added, linked to their app account, given a staff number and
   * skills, and paid. Safe to call again and again.
   *
   * - A team member with no record gets one (no salary yet, so payroll skips them until a
   *   salary is set).
   * - An employee typed in earlier with the same phone number is linked, not duplicated.
   */
  syncTeam(
    tenantId: string,
    members: Array<{ userId: string; displayName?: string; phone?: string; status?: string }>,
  ): number {
    const db = DatabaseManager.getDatabase()
    const rows = db.prepare('SELECT id, phone, user_id FROM employees WHERE tenant_id = ?').all(tenantId) as Array<{
      id: string
      phone?: string | null
      user_id?: string | null
    }>
    const linked = new Set(rows.filter((row) => row.user_id).map((row) => String(row.user_id)))
    const loose = rows.filter((row) => !row.user_id)
    let added = 0
    for (const member of members) {
      if (!member?.userId || member.status === 'inactive' || linked.has(member.userId)) continue
      const phoneKey = normalizeContactPhone(member.phone || '')
      const match = phoneKey ? loose.find((row) => normalizeContactPhone(row.phone || '') === phoneKey) : undefined
      if (match) {
        db.prepare('UPDATE employees SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
          member.userId,
          match.id,
        )
        loose.splice(loose.indexOf(match), 1)
      } else {
        const name = String(member.displayName || member.phone || 'Team member')
          .replace(/\s+/g, ' ')
          .trim()
        const [first, ...rest] = name.split(' ')
        db.prepare(
          `INSERT INTO employees (id, tenant_id, first_name, last_name, phone, base_salary, currency, status, user_id)
           VALUES (?, ?, ?, ?, ?, 0, 'USD', 'active', ?)`,
        ).run(
          `EMP-${randomUUID()}`,
          tenantId,
          first || 'Team member',
          rest.join(' '),
          member.phone || null,
          member.userId,
        )
        added += 1
      }
      linked.add(member.userId)
    }
    return added
  }

  async listEmployees(tenantId: string = 'default'): Promise<Employee[]> {
    const db = DatabaseManager.getDatabase()
    const rows = db.prepare('SELECT * FROM employees WHERE tenant_id = ?').all(tenantId) as any[]
    return rows.map((row) => employeeFromRow(row))
  }

  /**
   * Run payroll calculation for a period
   * This applies NSSA (4.5% up to max) and PAYE tables
   */
  async calculatePayrollRun(tenantId: string, period: string): Promise<PayrollRun> {
    const db = DatabaseManager.getDatabase()
    const runId = `RUN-${period}-${randomUUID().substring(0, 6)}`
    const employees = await this.listEmployees(tenantId)
    // People with no salary yet (team members just added) are not paid or issued a payslip.
    const activeEmployees = employees.filter((e) => e.status === 'active' && e.baseSalary > 0)

    let totalGross = 0
    let totalNet = 0
    const payslips: any[] = []

    // Statutory Constants (Zimbabwe 2024 Estimates for MVP)
    const NSSA_RATE = 0.045 // 4.5%
    const NSSA_CEILING_USD = 700 // Max insurable earnings
    const AIDS_LEVY_RATE = 0.03 // 3% of PAYE

    // Transaction within database transaction
    const insertTx = db.transaction(() => {
      // Create Run
      db.prepare(
        `
                INSERT INTO payroll_runs (id, tenant_id, period, status, total_gross, total_net)
                VALUES (?, ?, ?, ?, ?, ?)
            `,
      ).run(runId, tenantId, period, 'draft', 0, 0)

      for (const emp of activeEmployees) {
        const gross = emp.baseSalary

        // 1. Calculate NSSA
        const nssaCalc = new NSSACalculator()
        const nssa = nssaCalc.calculate(gross)

        // 2. Calculate Taxable Income (Gross - NSSA)
        const taxableIncome = gross - nssa

        // 3. Calculate PAYE & AIDS Levy
        const payeCalc = new PAYECalculator()
        const paye = payeCalc.calculate(taxableIncome)
        const aidsLevy = payeCalc.calculateAidsLevy(paye)

        const totalDeductions = nssa + paye + aidsLevy
        const net = gross - totalDeductions

        totalGross += gross
        totalNet += net

        const payslipId = `SLIP-${randomUUID()}`
        const deductions = { nssa, paye, aids_levy: aidsLevy, other: 0 }

        db.prepare(
          `
                    INSERT INTO payslips (id, run_id, employee_id, period, gross_amount, deductions, net_amount, currency, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
        ).run(payslipId, runId, emp.id, period, gross, JSON.stringify(deductions), net, emp.currency, 'pending')
      }

      // Update Run Totals
      db.prepare(
        `
                UPDATE payroll_runs SET total_gross = ?, total_net = ? WHERE id = ?
            `,
      ).run(totalGross, totalNet, runId)
    })

    insertTx()

    return {
      id: runId,
      tenantId,
      period,
      status: 'draft',
      totalGross,
      totalNet,
      createdAt: new Date().toISOString(),
    }
  }

  /**
   * Issue Payslip Verifiable Credentials for a completed run
   * Also issues a PayrollRunVC as a batch summary
   */
  async issuePayslips(runId: string): Promise<{ issuedCount: number; runVcId?: string }> {
    const db = DatabaseManager.getDatabase()
    const runRow = db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(runId) as any
    if (!runRow) throw new Error('Run not found')

    const tenantId = runRow.tenant_id || 'default'
    const slips = db
      .prepare(
        `
            SELECT p.*, e.did, e.first_name, e.last_name, e.nssa_number 
            FROM payslips p 
            JOIN employees e ON p.employee_id = e.id 
            WHERE p.run_id = ? AND p.status = 'pending'
        `,
      )
      .all(runId) as any[]

    let issuedCount = 0
    const issuedVcIds: string[] = []

    // Aggregate totals for PayrollRunVC
    let totalNssa = 0
    let totalPaye = 0
    let totalAidsLevy = 0

    for (const slip of slips) {
      try {
        const deductions = JSON.parse(slip.deductions)
        totalNssa += deductions.nssa || 0
        totalPaye += deductions.paye || 0
        totalAidsLevy += deductions.aids_levy || 0

        // Prepare VC Claims
        const claims = {
          payslipId: slip.id,
          employeeName: `${slip.first_name} ${slip.last_name}`,
          nssaNumber: slip.nssa_number,
          period: slip.period,
          grossAmount: slip.gross_amount,
          netAmount: slip.net_amount,
          currency: slip.currency,
          deductions: deductions,
          employer: 'Credentis Demo Employer',
        }

        // Issue Credential Offer
        const offer = await credentialIssuanceService.createOffer({
          credentialType: 'PayslipVC',
          claims: claims,
          tenantId: tenantId,
          subjectDid: slip.did,
        })

        issuedVcIds.push(offer.offerId)

        // Update payslip record
        db.prepare(
          `
                    UPDATE payslips SET payslip_vc_id = ?, status = 'issued' WHERE id = ?
                `,
        ).run(offer.offerId, slip.id)

        issuedCount++
      } catch (err) {
        logger.error({ payslipId: slip.id, error: err }, 'Failed to issue Payslip VC')
      }
    }

    // Issue PayrollRunVC (batch summary)
    let runVcId: string | undefined
    try {
      const runVcClaims = {
        runId: runId,
        period: runRow.period,
        totalGross: runRow.total_gross,
        totalNet: runRow.total_net,
        totalDeductions: runRow.total_gross - runRow.total_net,
        totalNssa,
        totalPaye,
        totalAidsLevy,
        employeeCount: slips.length,
        currency: slips[0]?.currency || 'USD',
        employer: 'Credentis Demo Employer',
        processedAt: new Date().toISOString(),
        payslipVcIds: issuedVcIds,
      }

      const runVcOffer = await credentialIssuanceService.createOffer({
        credentialType: 'PayrollRunVC',
        claims: runVcClaims,
        tenantId: tenantId,
      })

      runVcId = runVcOffer.offerId
      logger.info({ runId, runVcId }, 'PayrollRunVC issued')

      // Update run with VC reference, offer URI, and statutory totals
      db.prepare(
        `
                UPDATE payroll_runs 
                SET status = 'completed', run_vc_id = ?, run_vc_offer_uri = ?, total_nssa = ?, total_paye = ?, total_aids_levy = ?
                WHERE id = ?
            `,
      ).run(runVcId, runVcOffer.credential_offer_deeplink, totalNssa, totalPaye, totalAidsLevy, runId)
    } catch (err) {
      logger.error({ runId, error: err }, 'Failed to issue PayrollRunVC')
      db.prepare('UPDATE payroll_runs SET status = ? WHERE id = ?').run('completed', runId)
    }

    return { issuedCount, runVcId }
  }

  /**
   * Get PayrollRunVC credential offer for reoffer
   */
  async getPayrollRunVCOffer(
    runId: string,
  ): Promise<{ credential_offer_uri: string; credential_offer_deeplink: string }> {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare('SELECT run_vc_offer_uri FROM payroll_runs WHERE id = ?').get(runId) as any
    if (!row || !row.run_vc_offer_uri) {
      throw new Error(`No PayrollRunVC credential offer found for run ${runId}`)
    }

    const deeplink = row.run_vc_offer_uri
    // Extract HTTP URI from deeplink
    let uri = deeplink
    if (deeplink.includes('credential_offer_uri=')) {
      const encodedUri = deeplink.split('credential_offer_uri=')[1]
      uri = decodeURIComponent(encodedUri)
    }

    return {
      credential_offer_uri: uri,
      credential_offer_deeplink: deeplink,
    }
  }

  /**
   * Create and issue TaxComplianceVC for statutory filing
   */
  async issueTaxComplianceVC(
    runId: string,
    taxType: 'NSSA' | 'PAYE' | 'AIDS_LEVY',
    referenceNumber?: string,
  ): Promise<TaxCompliance> {
    const db = DatabaseManager.getDatabase()
    const runRow = db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(runId) as any
    if (!runRow) throw new Error('Run not found')

    const tenantId = runRow.tenant_id || 'default'
    const complianceId = `TAX-${runRow.period}-${taxType}-${randomUUID().substring(0, 6)}`
    const now = new Date()

    // Get statutory amount based on type
    let amount = 0
    if (taxType === 'NSSA') amount = runRow.total_nssa || 0
    else if (taxType === 'PAYE') amount = runRow.total_paye || 0
    else if (taxType === 'AIDS_LEVY') amount = runRow.total_aids_levy || 0

    // Insert tax compliance record
    db.prepare(
      `
            INSERT INTO tax_compliance 
            (id, tenant_id, tax_type, period, amount, currency, status, related_payroll_run_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
    ).run(complianceId, tenantId, taxType, runRow.period, amount, 'USD', 'pending', runId, now.toISOString())

    // Issue TaxComplianceVC
    const claims = {
      complianceId,
      taxType,
      period: runRow.period,
      amount,
      currency: 'USD',
      filingDate: now.toISOString().slice(0, 10),
      referenceNumber: referenceNumber || `${taxType}-${now.getTime()}`,
      status: 'pending',
      employeeCount: await this.getEmployeeCountForRun(runId),
      relatedPayrollRunId: runId,
    }

    try {
      const offer = await credentialIssuanceService.createOffer({
        credentialType: 'TaxComplianceVC',
        claims,
        tenantId,
      })

      // Update with VC reference
      db.prepare(
        `
                UPDATE tax_compliance SET compliance_vc_id = ?, reference_number = ? WHERE id = ?
            `,
      ).run(offer.offerId, claims.referenceNumber, complianceId)

      logger.info({ complianceId, taxType, vcId: offer.offerId }, 'TaxComplianceVC issued')

      return {
        id: complianceId,
        tenantId,
        taxType,
        period: runRow.period,
        amount,
        currency: 'USD',
        filingDate: claims.filingDate,
        referenceNumber: claims.referenceNumber,
        status: 'pending',
        relatedPayrollRunId: runId,
        complianceVcId: offer.offerId,
        createdAt: now.toISOString(),
      }
    } catch (err) {
      logger.error({ complianceId, error: err }, 'Failed to issue TaxComplianceVC')
      throw err
    }
  }

  /**
   * Get employee count for a payroll run
   */
  private async getEmployeeCountForRun(runId: string): Promise<number> {
    const db = DatabaseManager.getDatabase()
    const result = db.prepare('SELECT COUNT(*) as count FROM payslips WHERE run_id = ?').get(runId) as any
    return result?.count || 0
  }

  /**
   * List tax compliance records for a tenant
   */
  async listTaxCompliance(tenantId: string = 'default'): Promise<TaxCompliance[]> {
    const db = DatabaseManager.getDatabase()
    const rows = db
      .prepare(
        `
            SELECT * FROM tax_compliance WHERE tenant_id = ? ORDER BY created_at DESC
        `,
      )
      .all(tenantId) as any[]

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      taxType: r.tax_type,
      period: r.period,
      amount: r.amount,
      currency: r.currency,
      filingDate: r.filing_date,
      referenceNumber: r.reference_number,
      status: r.status,
      relatedPayrollRunId: r.related_payroll_run_id,
      complianceVcId: r.compliance_vc_id,
      createdAt: r.created_at,
    }))
  }

  /**
   * Update tax compliance status (after filing with authority)
   */
  async updateTaxComplianceStatus(
    complianceId: string,
    status: 'filed' | 'confirmed' | 'rejected',
    proofOfPaymentRef?: string,
  ): Promise<void> {
    const db = DatabaseManager.getDatabase()
    db.prepare(
      `
            UPDATE tax_compliance 
            SET status = ?, filing_date = ?, proof_of_payment_ref = ?
            WHERE id = ?
        `,
    ).run(status, new Date().toISOString().slice(0, 10), proofOfPaymentRef || null, complianceId)
  }

  async listRuns(tenantId: string = 'default'): Promise<PayrollRun[]> {
    const db = DatabaseManager.getDatabase()
    const rows = db
      .prepare('SELECT * FROM payroll_runs WHERE tenant_id = ? ORDER BY period DESC')
      .all(tenantId) as any[]
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      period: r.period,
      status: r.status as any,
      totalGross: r.total_gross,
      totalNet: r.total_net,
      totalNssa: r.total_nssa,
      totalPaye: r.total_paye,
      totalAidsLevy: r.total_aids_levy,
      runVcId: r.run_vc_id,
      createdAt: r.created_at,
    }))
  }

  async getRunDetails(runId: string): Promise<{ run: PayrollRun; payslips: Payslip[] }> {
    const db = DatabaseManager.getDatabase()
    const runRow = db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(runId) as any
    if (!runRow) throw new Error('Run not found')

    const slipRows = db.prepare('SELECT * FROM payslips WHERE run_id = ?').all(runId) as any[]

    return {
      run: {
        id: runRow.id,
        tenantId: runRow.tenant_id,
        period: runRow.period,
        status: runRow.status as any,
        totalGross: runRow.total_gross,
        totalNet: runRow.total_net,
        totalNssa: runRow.total_nssa,
        totalPaye: runRow.total_paye,
        totalAidsLevy: runRow.total_aids_levy,
        runVcId: runRow.run_vc_id,
        createdAt: runRow.created_at,
      },
      payslips: slipRows.map((s) => ({
        id: s.id,
        runId: s.run_id,
        employeeId: s.employee_id,
        period: s.period,
        grossAmount: s.gross_amount,
        deductions: JSON.parse(s.deductions),
        netAmount: s.net_amount,
        currency: s.currency,
        payslipVcId: s.payslip_vc_id,
        status: s.status,
        createdAt: s.created_at,
      })),
    }
  }
}

export const payrollService = new PayrollService()
