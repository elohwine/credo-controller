import { DatabaseManager } from '../persistence/DatabaseManager'
import { randomUUID } from 'crypto'
import { rootLogger } from '../utils/pinoLogger'
import { payrollService } from './PayrollService'
import { credentialIssuanceService } from './CredentialIssuanceService'

const logger = rootLogger.child({ module: 'OnboardingService' })

export interface OnboardingRequest {
    id: string
    tenantId: string
    candidateEmail: string
    candidatePhone?: string
    fullName: string
    status: 'draft' | 'invited' | 'in_progress' | 'review' | 'approved' | 'rejected' | 'completed'
    currentStep: 'init' | 'personal_details' | 'documents' | 'contract' | 'complete'
    accessToken: string
    employeeId?: string
    createdAt: string
    data?: OnboardingData
}

export interface OnboardingData {
    personalInfo?: {
        dob?: string
        address?: string
        nokName?: string
        nokPhone?: string
    }
    bankDetails?: {
        bankName?: string
        account?: string
        ecocashNumber?: string
        payoutMethod?: 'bank' | 'ecocash'
    }
    documents?: {
        idFront?: string
        passport?: string
    }
}

export class OnboardingService {

    /**
     * Start a new onboarding process for a candidate
     */
    async createRequest(tenantId: string, email: string, fullName: string, phone?: string): Promise<OnboardingRequest> {
        const db = DatabaseManager.getDatabase()
        const id = `REQ-${randomUUID().substring(0, 8)}`
        const token = randomUUID() // Simple access token for link access

        db.transaction(() => {
            db.prepare(`
                INSERT INTO onboarding_requests (id, tenant_id, candidate_email, candidate_phone, full_name, status, access_token)
                VALUES (?, ?, ?, ?, ?, 'invited', ?)
            `).run(id, tenantId, email, phone, fullName, token)

            db.prepare(`
                INSERT INTO onboarding_data (request_id) VALUES (?)
            `).run(id)
        })()

        return (await this.getRequest(id)) as OnboardingRequest
    }

    async getRequest(id: string): Promise<OnboardingRequest | null> {
        const db = DatabaseManager.getDatabase()
        const req = db.prepare('SELECT * FROM onboarding_requests WHERE id = ?').get(id) as any
        if (!req) return null

        const dataRow = db.prepare('SELECT * FROM onboarding_data WHERE request_id = ?').get(id) as any

        const data: OnboardingData = {}
        if (dataRow) {
            if (dataRow.personal_info) data.personalInfo = JSON.parse(dataRow.personal_info)
            if (dataRow.bank_details) data.bankDetails = JSON.parse(dataRow.bank_details)
            if (dataRow.documents) data.documents = JSON.parse(dataRow.documents)
        }

        return {
            id: req.id,
            tenantId: req.tenant_id,
            candidateEmail: req.candidate_email,
            candidatePhone: req.candidate_phone,
            fullName: req.full_name,
            status: req.status as any,
            currentStep: req.current_step as any,
            accessToken: req.access_token,
            employeeId: req.employee_id,
            createdAt: req.created_at,
            data
        }
    }

    async updateProgress(id: string, step: string, data: Partial<OnboardingData>): Promise<OnboardingRequest> {
        const db = DatabaseManager.getDatabase()
        const current = await this.getRequest(id)
        if (!current) throw new Error('Request not found')

        const updates: string[] = []
        const params: any[] = []

        if (data.personalInfo) {
            updates.push('personal_info = ?')
            params.push(JSON.stringify({ ...current.data?.personalInfo, ...data.personalInfo }))
        }
        if (data.bankDetails) {
            updates.push('bank_details = ?')
            params.push(JSON.stringify({ ...current.data?.bankDetails, ...data.bankDetails }))
        }
        if (data.documents) {
            updates.push('documents = ?')
            params.push(JSON.stringify({ ...current.data?.documents, ...data.documents }))
        }

        db.transaction(() => {
            if (updates.length > 0) {
                params.push(id)
                db.prepare(`UPDATE onboarding_data SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE request_id = ?`).run(...params)
            }
            db.prepare('UPDATE onboarding_requests SET current_step = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(step, 'in_progress', id)
        })()

        return (await this.getRequest(id)) as OnboardingRequest
    }

    /**
     * Approve onboarding: Create employee and issue contract VC
     */
    async approveRequest(id: string): Promise<string> {
        const req = await this.getRequest(id)
        if (!req) throw new Error('Request not found')

        if (req.status === 'completed') return req.employeeId!

        const names = req.fullName.split(' ')
        const firstName = names[0]
        const lastName = names.slice(1).join(' ') || 'Employee'

        // 1. Create Employee Record
        const employee = await payrollService.saveEmployee({
            tenantId: req.tenantId,
            firstName,
            lastName,
            email: req.candidateEmail,
            phone: req.candidatePhone,
            baseSalary: 0, // Placeholder, usually set in contract step
            status: 'active'
        })

        // 2. Issue EmploymentContractVC (Mock logic for MVP)
        // In real flow, we'd sign the markdown contract. 
        // Here we just issue a VC stating they are employed.
        try {
            await credentialIssuanceService.createOffer({
                credentialType: 'EmploymentContractDef', // Needs to be added to definitions
                claims: {
                    employeeId: employee.id,
                    name: req.fullName,
                    role: 'Software Engineer', // TODO: Add role to onboarding request
                    startDate: new Date().toISOString(),
                    employer: 'Credo Demo Corp'
                },
                tenantId: req.tenantId
            })
        } catch (e) {
            logger.warn({ error: e }, 'Failed to issue contract VC during approval (non-blocking)')
        }

        const db = DatabaseManager.getDatabase()
        db.prepare('UPDATE onboarding_requests SET status = ?, employee_id = ? WHERE id = ?')
            .run('completed', employee.id, id)

        return employee.id
    }
}

export const onboardingService = new OnboardingService()
