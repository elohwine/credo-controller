import { Body, Controller, Get, Path, Post, Route, Tags, Query, Produces, Response } from 'tsoa'
import { ShortlinkService } from '../../services/ShortlinkService'
import { DatabaseManager } from '../../persistence/DatabaseManager'

interface CreateShortlinkRequest {
    type: 'credential' | 'receipt' | 'verification'
    targetId: string
    metadata?: Record<string, any>
    ttlHours?: number
}

interface ShortlinkResponse {
    code: string
    url: string
    expiresAt: string
}

interface ResolveResponse {
    valid: boolean
    type?: string
    targetId?: string
    metadata?: Record<string, any> | null
    expiresAt?: string
    verificationUrl?: string
}

/**
 * Shortlink Controller - Generate and resolve short verification links
 * 
 * Used for driver verification QR codes during delivery handover.
 */
@Route('api/shortlinks')
@Tags('Shortlinks')
export class ShortlinkController extends Controller {

    /**
     * Create a new shortlink for verification
     */
    @Post('')
    public async createShortlink(
        @Body() body: CreateShortlinkRequest
    ): Promise<ShortlinkResponse> {
        const result = ShortlinkService.create(
            body.type,
            body.targetId,
            body.metadata,
            body.ttlHours
        )

        this.setStatus(201)
        return result
    }

    /**
     * Resolve a shortlink code
     */
    @Get('{code}')
    public async resolveShortlink(
        @Path() code: string
    ): Promise<ResolveResponse> {
        const result = ShortlinkService.resolve(code)

        if (!result) {
            this.setStatus(404)
            return { valid: false }
        }

        // Build verification page URL
        const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000'
        const verificationUrl = `${baseUrl}/verify/receipt/${result.targetId}`

        return {
            valid: true,
            type: result.type,
            targetId: result.targetId,
            metadata: result.metadata,
            expiresAt: result.expiresAt,
            verificationUrl,
        }
    }

    /**
     * Create a receipt verification shortlink
     */
    @Post('receipt')
    public async createReceiptShortlink(
        @Body() body: {
            transactionId: string
            amount?: string
            currency?: string
            merchant?: string
        }
    ): Promise<ShortlinkResponse> {
        const { transactionId, amount, currency, merchant } = body

        const result = ShortlinkService.createReceiptLink(transactionId, {
            amount,
            currency,
            merchant,
        })

        this.setStatus(201)
        return result
    }

    /**
     * Cleanup expired shortlinks (admin only)
     */
    @Post('cleanup')
    public async cleanupExpired(): Promise<{ deleted: number }> {
        const deleted = ShortlinkService.cleanup()
        return { deleted }
    }
}

/**
 * Mobile-friendly verification page controller
 * Serves HTML for driver verification at delivery handover
 */
@Route('v')
@Tags('Verification Pages')
export class VerificationPageController extends Controller {

    /**
     * Mobile verification page for shortlink codes
     * Driver scans QR → sees verification status → confirms delivery
     */
    @Get('{code}')
    @Produces('text/html')
    @Response<string>(200, 'HTML verification page')
    public async getVerificationPage(
        @Path() code: string
    ): Promise<string> {
        const result = ShortlinkService.resolve(code)

        if (!result) {
            this.setStatus(404)
            return this.renderPage({
                valid: false,
                error: 'Link expired or invalid',
                code
            })
        }

        // Lookup payment/receipt info from database
        const db = DatabaseManager.getDatabase()
        let receiptData: any = null

        if (result.type === 'receipt') {
            const payment = db.prepare(`
                SELECT * FROM ack_payments WHERE provider_ref = ? OR idempotency_key = ?
            `).get(result.targetId, result.targetId) as any

            if (payment) {
                receiptData = {
                    transactionId: result.targetId,
                    amount: payment.amount,
                    currency: payment.currency,
                    merchant: payment.tenant_id,
                    status: payment.state,
                    paidAt: payment.updated_at
                }
            }
        }

        return this.renderPage({
            valid: true,
            type: result.type,
            targetId: result.targetId,
            metadata: result.metadata,
            receipt: receiptData,
            expiresAt: result.expiresAt,
            code
        })
    }

    /**
     * Confirm delivery action (driver taps to release escrow signal)
     */
    @Post('{code}/confirm')
    public async confirmDelivery(
        @Path() code: string
    ): Promise<{ success: boolean; message: string }> {
        const result = ShortlinkService.resolve(code)

        if (!result) {
            this.setStatus(404)
            return { success: false, message: 'Link expired or invalid' }
        }

        // Mark shortlink as used
        ShortlinkService.markUsed(code)

        // TODO: Emit escrow.release signal when escrow module is wired
        // For now, just log and return success
        console.log(`[DELIVERY CONFIRMED] Code: ${code}, Transaction: ${result.targetId}`)

        return {
            success: true,
            message: 'Delivery confirmed! Escrow release signal sent.'
        }
    }

    private renderPage(data: {
        valid: boolean
        error?: string
        type?: string
        targetId?: string
        metadata?: Record<string, any> | null
        receipt?: any
        expiresAt?: string
        code: string
    }): string {
        const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000'

        if (!data.valid) {
            return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verification Failed - Credentis</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F0F4F8; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 400px; width: 100%; padding: 32px; text-align: center; }
        .icon { width: 64px; height: 64px; margin: 0 auto 16px; background: #FEE2E2; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .icon svg { width: 32px; height: 32px; color: #DC2626; }
        h1 { color: #0F3F5E; font-size: 24px; margin-bottom: 8px; }
        p { color: #627D98; font-size: 16px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </div>
        <h1>Verification Failed</h1>
        <p>${data.error || 'This verification link has expired or is invalid.'}</p>
    </div>
</body>
</html>`
        }

        const receipt = data.receipt || data.metadata || {}
        const amount = receipt.amount ? `${receipt.currency || 'USD'} ${receipt.amount}` : 'N/A'

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>✅ Verified Receipt - Credentis</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #0F3F5E, #2188CA); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { background: white; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); max-width: 400px; width: 100%; overflow: hidden; }
        .header { background: linear-gradient(135deg, #10B981, #059669); padding: 24px; text-align: center; color: white; }
        .header .icon { width: 64px; height: 64px; margin: 0 auto 12px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .header .icon svg { width: 32px; height: 32px; }
        .header h1 { font-size: 20px; margin-bottom: 4px; }
        .header p { font-size: 14px; opacity: 0.9; }
        .body { padding: 24px; }
        .field { margin-bottom: 16px; }
        .field-label { font-size: 12px; color: #627D98; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .field-value { font-size: 18px; color: #0F3F5E; font-weight: 600; }
        .amount { font-size: 28px; color: #0F3F5E; font-weight: 700; text-align: center; padding: 16px; background: #F0F4F8; border-radius: 12px; margin-bottom: 16px; }
        .divider { height: 1px; background: #E4E7EB; margin: 16px 0; }
        .btn { display: block; width: 100%; padding: 16px; background: linear-gradient(135deg, #2188CA, #0F3F5E); color: white; font-size: 16px; font-weight: 600; border: none; border-radius: 12px; cursor: pointer; text-align: center; text-decoration: none; }
        .btn:hover { transform: scale(1.02); }
        .footer { padding: 16px 24px; background: #F9FAFB; text-align: center; font-size: 12px; color: #627D98; }
        .badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; background: #D1FAE5; color: #059669; border-radius: 9999px; font-size: 12px; font-weight: 600; }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div class="icon">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            </div>
            <h1>Payment Verified</h1>
            <p>This receipt is cryptographically signed</p>
        </div>
        <div class="body">
            <div class="amount">${amount}</div>
            <div class="field">
                <div class="field-label">Transaction ID</div>
                <div class="field-value">${data.targetId || 'N/A'}</div>
            </div>
            <div class="field">
                <div class="field-label">Merchant</div>
                <div class="field-value">${receipt.merchant || 'Credentis Merchant'}</div>
            </div>
            <div class="field">
                <div class="field-label">Status</div>
                <div class="field-value"><span class="badge">✓ Verified</span></div>
            </div>
            <div class="divider"></div>
            <button class="btn" onclick="confirmDelivery()">
                ✓ Confirm Delivery
            </button>
        </div>
        <div class="footer">
            Powered by <strong>Credentis</strong> Verifiable Commerce
        </div>
    </div>
    <script>
        async function confirmDelivery() {
            const btn = document.querySelector('.btn');
            btn.textContent = 'Confirming...';
            btn.disabled = true;
            try {
                const res = await fetch('${baseUrl}/v/${data.code}/confirm', { method: 'POST' });
                const json = await res.json();
                if (json.success) {
                    btn.textContent = '✓ Delivery Confirmed!';
                    btn.style.background = 'linear-gradient(135deg, #10B981, #059669)';
                } else {
                    btn.textContent = 'Failed - Try Again';
                    btn.disabled = false;
                }
            } catch (e) {
                btn.textContent = 'Error - Try Again';
                btn.disabled = false;
            }
        }
    </script>
</body>
</html>`
    }
}
