import { createPrivateKey, randomBytes, randomUUID, X509Certificate } from 'crypto'

import Database from 'better-sqlite3'

import { StatusException } from '../../errors'
import { fiscalDaySigningString, receiptSigningString } from '../../integrations/fiscal/fdms/canonical'
import {
  FdmsClient,
  FdmsError,
  simulateCloseDay,
  simulateConfig,
  simulateOpenDay,
  simulateSubmit,
  type DeviceContext,
} from '../../integrations/fiscal/fdms/client'
import { generateDeviceIdentity, signCanonical } from '../../integrations/fiscal/fdms/crypto'
import { receiptQrCode } from '../../integrations/fiscal/fdms/qr'
import { applyToCounters, buildReceipt, type BuiltReceipt, type SaleDocument } from '../../integrations/fiscal/fdms/receipt'
import { receiptStamp } from '../../integrations/fiscal/time'
import {
  exchangeCode,
  getContact,
  getCreditNote,
  getInvoice,
  listIssuedCreditNotes,
  listIssuedInvoices,
  listOrganizations,
  mapZohoDocument,
  phoneFromZoho,
  refreshAccessToken,
  type NeutralDocument,
  type ZohoMappings,
  type ZohoOrganisation,
} from '../../integrations/fiscal/zoho'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import type { PartnerClientRecord } from '../partner/PartnerClientService'

/** Sent through the existing connected-record path after a receipt is accepted. */
export const CUSTOMER_BILL_TYPE = 'CustomerBillRecord'
const BOOKS_CLIENT = 'books-fiscal'

type Sql = Database.Database

type ConnectionRow = {
  org_tenant_id: string
  provider: string
  external_org_id: string | null
  external_org_name: string | null
  accounts_url: string | null
  api_domain: string | null
  refresh_token: string | null
  access_token: string | null
  access_expires_at: string | null
  status: string
  updated_at: string
}

type DeviceRow = {
  id: string
  org_tenant_id: string
  label: string
  device_id: number
  serial_no: string
  activation_key: string | null
  environment: string
  model_name: string
  model_version: string
  private_key_pem: string | null
  csr_pem: string | null
  certificate_pem: string | null
  qr_url: string | null
  fiscal_day_status: string
  fiscal_day_no: number
  fiscal_day_opened_at: string | null
  receipt_counter: number
  receipt_global_no: number
  previous_receipt_hash: string | null
  last_receipt_date: string | null
  config_json: string | null
  created_at: string
}

type DocumentRow = {
  id: string
  org_tenant_id: string
  device_row_id: string | null
  fiscal_day_no: number | null
  source: string
  source_id: string
  invoice_no: string
  receipt_type: string
  normalized_json: string
  status: string
  receipt_id: number | null
  qr_code: string | null
  error: string | null
  wallet_status: string | null
  created_at: string
  updated_at: string
}

type ProfileRow = {
  org_tenant_id: string
  taxpayer_name: string | null
  tin: string | null
  vat_number: string | null
  is_vat_payer: number
  updated_at: string
}

export type BooksFiscalStatus = {
  books: {
    provider: 'zoho'
    configured: boolean
    status: string | null
    organisationId: string | null
    organisationName: string | null
  }
  fiscal: {
    taxpayerName: string | null
    tin: string | null
    isVatPayer: boolean
    device: {
      id: string
      label: string
      deviceId: number
      serialNo: string
      environment: string
      fiscalDayStatus: string
      fiscalDayNo: number
      receiptCounter: number
      registered: boolean
    } | null
  }
  documents: FiscalDocumentView[]
}

export type FiscalDocumentView = {
  id: string
  source: string
  sourceId: string
  invoiceNo: string
  receiptType: string
  status: string
  currency: string
  total: number
  customerName: string | null
  hasPhone: boolean
  receiptId: number | null
  qrCode: string | null
  walletStatus: string | null
  error: string | null
}

/**
 * Credentis-owned books and fiscalisation. Zoho Books is the first books adapter.
 * Fiscal receipts are signed and submitted to ZIMRA FDMS (or the simulator) by this
 * service. The neighbouring fiscalisation app is not called.
 */
export class BooksFiscalService {
  public constructor(private readonly db: Sql = DatabaseManager.getDatabase()) {}

  public status(orgTenantId: string): BooksFiscalStatus {
    const connection = this.connection(orgTenantId)
    const profile = this.profile(orgTenantId)
    const device = this.device(orgTenantId)
    return {
      books: {
        provider: 'zoho',
        configured: zohoConfigured(),
        status: connection ? publicBooksStatus(connection) : null,
        organisationId: connection?.status === 'connected' ? connection.external_org_id : null,
        organisationName: connection?.status === 'connected' ? connection.external_org_name : null,
      },
      fiscal: {
        taxpayerName: profile?.taxpayer_name ?? null,
        tin: profile?.tin ?? null,
        isVatPayer: (profile?.is_vat_payer ?? 1) === 1,
        device: device ? this.deviceView(device) : null,
      },
      documents: this.documents(orgTenantId).map((row) => this.documentView(row)),
    }
  }

  public startZoho(orgTenantId: string): { url: string } {
    const clientId = process.env.ZOHO_CLIENT_ID?.trim()
    const redirectUri = process.env.ZOHO_REDIRECT_URI?.trim()
    if (!clientId || !process.env.ZOHO_CLIENT_SECRET?.trim() || !redirectUri) {
      throw new StatusException('Zoho is not configured on this server', 503)
    }
    const state = randomBytes(16).toString('hex')
    const expires = new Date(Date.now() + 10 * 60_000).toISOString()
    this.db.prepare(
      `INSERT INTO org_books_oauth_states (state, org_tenant_id, expires_at) VALUES (?, ?, ?)`,
    ).run(state, orgTenantId, expires)
    const accounts = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com'
    const query = new URLSearchParams({
      scope: 'ZohoBooks.invoices.READ,ZohoBooks.invoices.UPDATE,ZohoBooks.creditnotes.READ,ZohoBooks.settings.READ,ZohoBooks.contacts.READ,ZohoBooks.customerpayments.READ',
      client_id: clientId,
      state,
      response_type: 'code',
      redirect_uri: redirectUri,
      access_type: 'offline',
      prompt: 'consent',
    })
    return { url: `${accounts.replace(/\/$/, '')}/oauth/v2/auth?${query}` }
  }

  /** Zoho redirects the browser here. Returns the website address to send the person back to. */
  public async finishZoho(input: { state?: string; code?: string; error?: string; accountsServer?: string }): Promise<string> {
    const portal = (process.env.CREDENTIS_PORTAL_URL || 'http://localhost:5000').replace(/\/$/, '')
    const back = (reason: string) => `${portal}/organization/sign-in-partners?books=error&reason=${encodeURIComponent(reason)}`
    if (input.error) return back(input.error)
    const state = String(input.state || '')
    const row = this.db.prepare(
      `SELECT org_tenant_id, expires_at FROM org_books_oauth_states WHERE state = ?`,
    ).get(state) as { org_tenant_id: string; expires_at: string } | undefined
    this.db.prepare(`DELETE FROM org_books_oauth_states WHERE state = ?`).run(state)
    if (!row || row.expires_at < new Date().toISOString()) return back('The Zoho sign-in session expired. Try again.')
    if (!input.code) return back('Zoho did not return an authorisation code')
    const accountsUrl = input.accountsServer || process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com'
    try {
      const token = await exchangeCode(
        accountsUrl,
        process.env.ZOHO_CLIENT_ID || '',
        process.env.ZOHO_CLIENT_SECRET || '',
        process.env.ZOHO_REDIRECT_URI || '',
        input.code,
      )
      const saved = await this.saveZohoToken(row.org_tenant_id, accountsUrl, token)
      return `${portal}/organization/sign-in-partners?books=${saved.status}`
    } catch (error) {
      return back(error instanceof Error ? error.message : 'Zoho connection failed')
    }
  }

  public async selectZohoOrganisation(orgTenantId: string, organisationId: string): Promise<BooksFiscalStatus> {
    const connection = this.connection(orgTenantId)
    if (!connection?.api_domain) throw new StatusException('Connect Zoho Books first', 409)
    const token = await this.accessToken(connection)
    const organisations = await listOrganizations(connection.api_domain, token)
    const chosen = organisations.find((item) => item.id === organisationId.trim())
    if (!chosen) throw new StatusException('That Zoho Books organisation is not available', 404)
    this.db.prepare(
      `UPDATE org_books_connections SET external_org_id = ?, external_org_name = ?, status = 'connected', updated_at = ? WHERE org_tenant_id = ?`,
    ).run(chosen.id, chosen.name, new Date().toISOString(), orgTenantId)
    return this.status(orgTenantId)
  }

  public saveProfile(orgTenantId: string, input: { taxpayerName?: string; tin?: string; vatNumber?: string; isVatPayer?: boolean }): BooksFiscalStatus {
    const now = new Date().toISOString()
    this.db.prepare(
      `INSERT INTO org_fiscal_profiles (org_tenant_id, taxpayer_name, tin, vat_number, is_vat_payer, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(org_tenant_id) DO UPDATE SET
         taxpayer_name = excluded.taxpayer_name, tin = excluded.tin, vat_number = excluded.vat_number,
         is_vat_payer = excluded.is_vat_payer, updated_at = excluded.updated_at`,
    ).run(
      orgTenantId,
      input.taxpayerName?.trim() || null,
      input.tin?.trim() || null,
      input.vatNumber?.trim() || null,
      input.isVatPayer === false ? 0 : 1,
      now,
    )
    this.ensureTaxMappings(orgTenantId)
    return this.status(orgTenantId)
  }

  public addDevice(orgTenantId: string, input: { deviceId: number; serialNo: string; label?: string; environment?: string; activationKey?: string }): BooksFiscalStatus {
    if (!Number.isSafeInteger(input.deviceId) || input.deviceId <= 0) {
      throw new StatusException('Device ID must be a positive whole number', 400)
    }
    const serial = input.serialNo.trim()
    if (!serial || serial.length > 20) throw new StatusException('Device serial number must contain 1 to 20 characters', 400)
    const environment = input.environment || 'simulator'
    if (!['simulator', 'test', 'production'].includes(environment)) {
      throw new StatusException('Unknown fiscal environment', 400)
    }
    if (this.device(orgTenantId)) throw new StatusException('This organisation already has a fiscal device', 409)
    const identity = generateDeviceIdentity(serial, input.deviceId)
    const now = new Date().toISOString()
    const id = randomUUID()
    this.db.prepare(
      `INSERT INTO org_fiscal_devices (
        id, org_tenant_id, label, device_id, serial_no, activation_key, environment, model_name, model_version,
        private_key_pem, csr_pem, qr_url, fiscal_day_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'closed', ?)`,
    ).run(
      id,
      orgTenantId,
      input.label?.trim() || 'Main device',
      input.deviceId,
      serial,
      input.activationKey?.trim() || null,
      environment,
      process.env.FDMS_DEVICE_MODEL_NAME?.trim() || 'Credentis',
      process.env.FDMS_DEVICE_MODEL_VERSION?.trim() || '1.0',
      identity.privateKeyPem,
      identity.csrPem,
      environment === 'simulator' ? 'https://fdmstest.zimra.co.zw' : null,
      now,
    )
    this.ensureTaxMappings(orgTenantId)
    if (environment === 'simulator') {
      const device = this.mustDevice(orgTenantId)
      this.storeConfig(device, simulateConfig(this.context(device)))
    }
    return this.status(orgTenantId)
  }

  public async registerDevice(orgTenantId: string): Promise<BooksFiscalStatus> {
    const device = this.mustDevice(orgTenantId)
    if (device.environment === 'simulator') throw new StatusException('Simulator devices do not register with ZIMRA', 400)
    if (!device.activation_key || !device.csr_pem) throw new StatusException('Add the activation key before registering', 400)
    const response = await new FdmsClient(this.context(device)).registerDevice(device.activation_key, device.csr_pem)
    const certificate = String(response.certificate || '')
    if (!certificate.includes('BEGIN CERTIFICATE')) throw new StatusException('ZIMRA did not return a device certificate', 502)
    if (!new X509Certificate(certificate).checkPrivateKey(createPrivateKey(device.private_key_pem!))) {
      throw new StatusException('The ZIMRA certificate does not match this device', 502)
    }
    this.db.prepare(`UPDATE org_fiscal_devices SET certificate_pem = ? WHERE id = ?`).run(certificate, device.id)
    const config = await new FdmsClient(this.context({ ...device, certificate_pem: certificate })).getConfig()
    this.storeConfig({ ...device, certificate_pem: certificate }, config)
    return this.status(orgTenantId)
  }

  public async openDay(orgTenantId: string): Promise<BooksFiscalStatus> {
    const device = this.mustDevice(orgTenantId)
    if (device.fiscal_day_status !== 'closed') throw new StatusException('The previous fiscal day must be closed first', 409)
    if (device.environment !== 'simulator' && !device.certificate_pem) {
      throw new StatusException('Register the device with ZIMRA before opening a fiscal day', 409)
    }
    const fiscalDayNo = device.fiscal_day_no + 1
    const openedAt = receiptStamp(undefined, null, null)
    const response = device.environment === 'simulator'
      ? simulateOpenDay(fiscalDayNo)
      : await new FdmsClient(this.context(device)).openDay(openedAt, fiscalDayNo)
    if (response.fiscalDayNo !== fiscalDayNo) throw new StatusException('ZIMRA returned an unexpected fiscal day', 502)
    this.db.prepare(
      `UPDATE org_fiscal_devices SET fiscal_day_status = 'opened', fiscal_day_no = ?, fiscal_day_opened_at = ?,
        receipt_counter = 0, previous_receipt_hash = NULL WHERE id = ?`,
    ).run(fiscalDayNo, openedAt, device.id)
    return this.status(orgTenantId)
  }

  public async closeDay(orgTenantId: string): Promise<BooksFiscalStatus> {
    const device = this.mustDevice(orgTenantId)
    if (device.fiscal_day_status !== 'opened' && device.fiscal_day_status !== 'close_failed') {
      throw new StatusException('Open a fiscal day before closing it', 409)
    }
    const counters = this.counters(device)
    const fiscalDayDate = (device.fiscal_day_opened_at || receiptStamp(undefined, null, null)).slice(0, 10)
    const canonical = fiscalDaySigningString(device.device_id, device.fiscal_day_no, fiscalDayDate, counters)
    const signature = signCanonical(device.private_key_pem!, canonical)
    const payload = {
      fiscalDayNo: device.fiscal_day_no,
      fiscalDayCounters: counters.map((counter) => ({
        fiscalCounterType: counter.fiscalCounterType,
        fiscalCounterCurrency: counter.fiscalCounterCurrency,
        ...(counter.fiscalCounterTaxID !== undefined ? { fiscalCounterTaxID: counter.fiscalCounterTaxID } : {}),
        ...(counter.fiscalCounterTaxPercent !== null && counter.fiscalCounterTaxPercent !== undefined && counter.fiscalCounterTaxPercent !== ''
          ? { fiscalCounterTaxPercent: Number(counter.fiscalCounterTaxPercent) }
          : {}),
        ...(counter.fiscalCounterMoneyType ? { fiscalCounterMoneyType: counter.fiscalCounterMoneyType } : {}),
        fiscalCounterValue: Number(counter.fiscalCounterValue),
      })),
      fiscalDayDeviceSignature: signature,
      receiptCounter: device.receipt_counter,
    }
    const response = device.environment === 'simulator'
      ? simulateCloseDay(device.fiscal_day_no)
      : await new FdmsClient(this.context(device)).closeDay(payload)
    if (String(response.fiscalDayStatus) !== 'FiscalDayClosed') {
      this.db.prepare(`UPDATE org_fiscal_devices SET fiscal_day_status = 'close_failed' WHERE id = ?`).run(device.id)
      throw new StatusException('ZIMRA has not confirmed the day is closed', 502)
    }
    this.db.prepare(`UPDATE org_fiscal_devices SET fiscal_day_status = 'closed' WHERE id = ?`).run(device.id)
    return this.status(orgTenantId)
  }

  /** Import a Zoho invoice or credit note that is already issued. Drafts and voids are refused by the mapper. */
  public async importZoho(orgTenantId: string, kind: 'invoice' | 'creditnote', documentId: string): Promise<FiscalDocumentView> {
    const session = await this.zohoSession(orgTenantId)
    const source = kind === 'invoice'
      ? await getInvoice(session.apiDomain, session.token, session.organisationId, documentId)
      : await getCreditNote(session.apiDomain, session.token, session.organisationId, documentId)
    await this.attachPhone(session, source)
    return this.importSource(orgTenantId, source)
  }

  public async listZoho(orgTenantId: string, kind: 'invoice' | 'creditnote') {
    const session = await this.zohoSession(orgTenantId)
    const list = kind === 'invoice' ? listIssuedInvoices : listIssuedCreditNotes
    const documents = await list(session.apiDomain, session.token, session.organisationId)
    return documents.map((item) => ({
      sourceId: String(item[`${kind}_id`] ?? ''),
      documentNumber: String(item[`${kind}_number`] ?? ''),
      customerName: String(item.customer_name ?? ''),
      date: String(item.date ?? ''),
      status: String(item.status ?? ''),
      currency: String(item.currency_code ?? ''),
      total: Number(item.total ?? 0),
    }))
  }

  /** Used by the Zoho import and by tests that already hold the document. */
  public importSource(orgTenantId: string, source: Record<string, unknown>): FiscalDocumentView {
    const profile = this.profile(orgTenantId)
    const document = mapZohoDocument(source, (profile?.is_vat_payer ?? 1) === 1, this.mappings(orgTenantId))
    return this.saveDocument(orgTenantId, document)
  }

  public async fiscalise(orgTenantId: string, documentId: string): Promise<FiscalDocumentView> {
    const row = this.mustDocument(orgTenantId, documentId)
    if (row.status === 'accepted' || row.status === 'accepted_invalid') return this.documentView(row)
    const device = this.mustDevice(orgTenantId)
    if (device.fiscal_day_status !== 'opened' && device.fiscal_day_status !== 'close_failed') {
      throw new StatusException(`Open the fiscal day on ${device.label} before fiscalising`, 409)
    }
    if (!device.private_key_pem) throw new StatusException('This device has no signing key', 409)
    const normalized = JSON.parse(row.normalized_json) as NeutralDocument
    this.assertHs(orgTenantId, normalized)
    const creditDebitNote = normalized.receiptType === 'CreditNote'
      ? this.originalReceipt(orgTenantId, normalized.referenceSourceId)
      : undefined
    const sale: SaleDocument = {
      invoiceNo: normalized.invoiceNo,
      receiptType: normalized.receiptType,
      currency: normalized.currency,
      taxInclusive: normalized.taxInclusive,
      lines: normalized.lines,
      payments: normalized.payments,
      buyer: normalized.buyer,
      notes: normalized.notes,
      creditDebitNote,
    }
    const receipt = buildReceipt(
      sale,
      device.receipt_counter + 1,
      device.receipt_global_no + 1,
      receiptStamp(normalized.zohoDate, device.last_receipt_date, device.fiscal_day_opened_at),
    )
    const previous = device.receipt_counter === 0 ? null : device.previous_receipt_hash
    const canonical = receiptSigningString(device.device_id, receipt, previous)
    receipt.receiptDeviceSignature = signCanonical(device.private_key_pem, canonical)
    let response: Record<string, unknown>
    try {
      response = device.environment === 'simulator'
        ? simulateSubmit(device.device_id, receipt, previous)
        : await new FdmsClient(this.context(device)).submitReceipt(receipt)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ZIMRA rejected the receipt'
      this.db.prepare(
        `UPDATE org_fiscal_documents SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`,
      ).run(message, new Date().toISOString(), row.id)
      throw new StatusException(message, error instanceof FdmsError && error.status ? error.status : 502)
    }
    if (!Number.isSafeInteger(response.receiptID) || Number(response.receiptID) <= 0) {
      throw new StatusException('ZIMRA returned an incomplete receipt acknowledgement', 502)
    }
    const invalid = Array.isArray(response.validationErrors) && response.validationErrors.length > 0
    const qr = receiptQrCode(
      device.qr_url || 'https://fdmstest.zimra.co.zw',
      device.device_id,
      receipt.receiptDate,
      receipt.receiptGlobalNo,
      receipt.receiptDeviceSignature.signature,
    )
    const now = new Date().toISOString()
    const receiptId = Number(response.receiptID)
    this.db.prepare(
      `UPDATE org_fiscal_documents SET status = ?, device_row_id = ?, fiscal_day_no = ?, canonical_string = ?,
        receipt_json = ?, response_json = ?, receipt_id = ?, qr_code = ?, error = NULL, updated_at = ? WHERE id = ?`,
    ).run(
      invalid ? 'accepted_invalid' : 'accepted',
      device.id,
      device.fiscal_day_no,
      canonical,
      JSON.stringify(receipt),
      JSON.stringify(response),
      receiptId,
      qr,
      now,
      row.id,
    )
    this.db.prepare(
      `UPDATE org_fiscal_devices SET receipt_counter = ?, receipt_global_no = ?, previous_receipt_hash = ?, last_receipt_date = ? WHERE id = ?`,
    ).run(receipt.receiptCounter, receipt.receiptGlobalNo, receipt.receiptDeviceSignature.hash, receipt.receiptDate, device.id)
    await this.offerWallet(orgTenantId, row.id, normalized, receipt, receiptId, qr)
    return this.documentView(this.mustDocument(orgTenantId, row.id))
  }

  private async offerWallet(
    orgTenantId: string,
    documentId: string,
    document: NeutralDocument,
    receipt: BuiltReceipt,
    receiptId: number,
    qr: string,
  ) {
    const phone = document.customerPhone
    if (!phone) {
      this.db.prepare(`UPDATE org_fiscal_documents SET wallet_status = 'no-phone' WHERE id = ?`).run(documentId)
      return
    }
    try {
      const { connectedRecordService } = await import('../connected/ConnectedRecordService')
      const client: PartnerClientRecord = {
        clientId: BOOKS_CLIENT,
        orgTenantId,
        name: 'Books and fiscal',
        redirectUris: [],
        policy: { releaseClaims: [], audience: 'org_members', operations: ['send_records'], recipientScope: 'any_registered' },
        status: 'active',
        createdAt: '',
        updatedAt: '',
        secretRotatedAt: null,
        revokedAt: null,
        subjectSalt: '',
      }
      await connectedRecordService.submit(client, `zoho.${document.source}.${document.sourceId}`.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 128), {
        credentialType: CUSTOMER_BILL_TYPE,
        recipient: { phone },
        claims: {
          documentNumber: document.invoiceNo,
          issuedOn: String(receipt.receiptDate).slice(0, 10),
          currency: receipt.receiptCurrency,
          total: Number(receipt.receiptTotal),
          fiscalReceipt: String(receiptId),
          checkLink: qr.slice(0, 500),
        },
        externalReference: document.invoiceNo.slice(0, 120),
        title: `Customer bill ${document.invoiceNo}`.slice(0, 120),
        message: 'Your bill has been fiscalised. The lines stay in the books.',
      })
      this.db.prepare(`UPDATE org_fiscal_documents SET wallet_status = 'offered' WHERE id = ?`).run(documentId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The wallet card was not offered'
      const status = /not set up|record type/i.test(message) ? 'needs-record-type' : 'not-offered'
      this.db.prepare(`UPDATE org_fiscal_documents SET wallet_status = ? WHERE id = ?`).run(`${status}:${message}`.slice(0, 200), documentId)
    }
  }

  private async saveZohoToken(orgTenantId: string, accountsUrl: string, token: Record<string, unknown>) {
    const apiDomain = String(token.api_domain || 'https://www.zohoapis.com')
    const accessToken = String(token.access_token || '')
    if (!accessToken) throw new Error('Zoho did not return an access token')
    const organisations = await listOrganizations(apiDomain, accessToken)
    const previous = this.connection(orgTenantId)
    const chosen = resolveOrganisation(organisations, previous)
    const now = new Date()
    const expires = new Date(now.getTime() + (Number(token.expires_in || 3600) - 60) * 1000).toISOString()
    this.db.prepare(
      `INSERT INTO org_books_connections (
        org_tenant_id, provider, external_org_id, external_org_name, accounts_url, api_domain,
        refresh_token, access_token, access_expires_at, status, updated_at
      ) VALUES (?, 'zoho', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(org_tenant_id) DO UPDATE SET
        external_org_id = excluded.external_org_id,
        external_org_name = excluded.external_org_name,
        accounts_url = excluded.accounts_url,
        api_domain = excluded.api_domain,
        refresh_token = COALESCE(excluded.refresh_token, org_books_connections.refresh_token),
        access_token = excluded.access_token,
        access_expires_at = excluded.access_expires_at,
        status = excluded.status,
        updated_at = excluded.updated_at`,
    ).run(
      orgTenantId,
      chosen?.id ?? previous?.external_org_id ?? null,
      chosen?.name ?? previous?.external_org_name ?? null,
      accountsUrl,
      apiDomain,
      token.refresh_token ? String(token.refresh_token) : null,
      accessToken,
      expires,
      chosen ? 'connected' : organisations.length ? 'select_organisation' : 'pending_organisation',
      now.toISOString(),
    )
    return { status: chosen ? 'connected' : organisations.length ? 'select_organisation' : 'pending_organisation' }
  }

  private async zohoSession(orgTenantId: string) {
    const connection = this.connection(orgTenantId)
    if (!connection || publicBooksStatus(connection) !== 'connected' || !connection.api_domain || !connection.external_org_id) {
      throw new StatusException('Connect Zoho Books and choose an organisation first', 409)
    }
    return { apiDomain: connection.api_domain, organisationId: connection.external_org_id, token: await this.accessToken(connection) }
  }

  private async accessToken(connection: ConnectionRow) {
    if (connection.access_token && connection.access_expires_at && connection.access_expires_at > new Date().toISOString()) {
      return connection.access_token
    }
    if (!connection.refresh_token) throw new StatusException('The Zoho connection has expired. Connect again.', 409)
    if (!zohoConfigured()) throw new StatusException('Zoho is not configured on this server', 503)
    const refreshed = await refreshAccessToken(
      connection.accounts_url || process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com',
      process.env.ZOHO_CLIENT_ID || '',
      process.env.ZOHO_CLIENT_SECRET || '',
      connection.refresh_token,
    )
    if (typeof refreshed.access_token !== 'string' || !refreshed.access_token) {
      throw new StatusException('Zoho did not return a refreshed access token', 502)
    }
    const expires = new Date(Date.now() + (Number(refreshed.expires_in || 3600) - 60) * 1000).toISOString()
    this.db.prepare(
      `UPDATE org_books_connections SET access_token = ?, access_expires_at = ?, updated_at = ? WHERE org_tenant_id = ?`,
    ).run(refreshed.access_token, expires, new Date().toISOString(), connection.org_tenant_id)
    return refreshed.access_token
  }

  private async attachPhone(session: { apiDomain: string; token: string; organisationId: string }, source: Record<string, unknown>) {
    if (phoneFromZoho(source) || typeof source.customer_id !== 'string') return
    try {
      const contact = await getContact(session.apiDomain, session.token, session.organisationId, source.customer_id)
      const phone = phoneFromZoho(contact)
      if (phone) source.customer_phone = phone
    } catch {
      // The fiscal document does not depend on the contact phone.
    }
  }

  private saveDocument(orgTenantId: string, document: NeutralDocument): FiscalDocumentView {
    const now = new Date().toISOString()
    const id = randomUUID()
    const saved = this.db.prepare(
      `INSERT INTO org_fiscal_documents (
        id, org_tenant_id, source, source_id, invoice_no, receipt_type, normalized_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'imported', ?, ?)
      ON CONFLICT(org_tenant_id, source, source_id) DO UPDATE SET
        invoice_no = excluded.invoice_no,
        receipt_type = excluded.receipt_type,
        normalized_json = excluded.normalized_json,
        status = 'imported',
        error = NULL,
        updated_at = excluded.updated_at
      WHERE org_fiscal_documents.status NOT IN ('accepted', 'accepted_invalid')
      RETURNING id`,
    ).get(
      id,
      orgTenantId,
      document.source,
      document.sourceId,
      document.invoiceNo,
      document.receiptType,
      JSON.stringify(document),
      now,
      now,
    ) as { id: string } | undefined
    return this.documentView(this.mustDocument(orgTenantId, saved?.id || this.existingDocumentId(orgTenantId, document)))
  }

  private existingDocumentId(orgTenantId: string, document: NeutralDocument) {
    const row = this.db.prepare(
      `SELECT id FROM org_fiscal_documents WHERE org_tenant_id = ? AND source = ? AND source_id = ?`,
    ).get(orgTenantId, document.source, document.sourceId) as { id: string }
    return row.id
  }

  private originalReceipt(orgTenantId: string, sourceId?: string) {
    if (!sourceId) throw new StatusException('This credit note has no original invoice', 400)
    const row = this.db.prepare(
      `SELECT receipt_id FROM org_fiscal_documents WHERE org_tenant_id = ? AND source = 'zoho_invoice'
        AND source_id = ? AND receipt_id IS NOT NULL AND status IN ('accepted', 'accepted_invalid')`,
    ).get(orgTenantId, sourceId) as { receipt_id: number } | undefined
    if (!row) throw new StatusException('Fiscalise the original invoice before this credit note', 409)
    return { receiptID: row.receipt_id }
  }

  private assertHs(orgTenantId: string, document: NeutralDocument) {
    if ((this.profile(orgTenantId)?.is_vat_payer ?? 1) !== 1) return
    for (const line of document.lines) {
      const hs = line.hsCode || ''
      const percent = line.taxPercent
      const zero = percent === undefined || percent === '' || Number(percent) === 0
      if (zero && hs.length !== 8) throw new StatusException(`${line.name} needs an 8-digit HS code`, 400)
      if (!zero && hs.length !== 4 && hs.length !== 8) throw new StatusException(`${line.name} needs a 4 or 8 digit HS code`, 400)
    }
  }

  private counters(device: DeviceRow) {
    const rows = this.db.prepare(
      `SELECT receipt_json FROM org_fiscal_documents WHERE device_row_id = ? AND fiscal_day_no = ?
        AND status IN ('accepted', 'accepted_invalid') AND receipt_json IS NOT NULL`,
    ).all(device.id, device.fiscal_day_no) as { receipt_json: string }[]
    return rows.reduce((counters, row) => applyToCounters(counters, JSON.parse(row.receipt_json) as BuiltReceipt), [] as ReturnType<typeof applyToCounters>)
  }

  private mappings(orgTenantId: string): ZohoMappings {
    this.ensureTaxMappings(orgTenantId)
    const taxes: ZohoMappings['taxes'] = {}
    for (const row of this.db.prepare(
      `SELECT source_key, tax_id, tax_percent, tax_code FROM org_fiscal_tax_mappings WHERE org_tenant_id = ?`,
    ).all(orgTenantId) as { source_key: string; tax_id: number; tax_percent: string | null; tax_code: string | null }[]) {
      taxes[row.source_key] = { taxID: row.tax_id, taxPercent: row.tax_percent, taxCode: row.tax_code ?? undefined }
    }
    return { taxes, items: {}, payments: {} }
  }

  private ensureTaxMappings(orgTenantId: string) {
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO org_fiscal_tax_mappings (org_tenant_id, source_key, tax_id, tax_percent) VALUES (?, ?, ?, ?)`,
    )
    insert.run(orgTenantId, '15.50', 1, '15.50')
    insert.run(orgTenantId, '0.00', 3, '0.00')
    insert.run(orgTenantId, 'exempt', 2, null)
  }

  private storeConfig(device: DeviceRow, response: Record<string, unknown>) {
    this.db.prepare(`UPDATE org_fiscal_devices SET config_json = ?, qr_url = ? WHERE id = ?`).run(
      JSON.stringify(response),
      response.qrUrl ? String(response.qrUrl) : device.qr_url,
      device.id,
    )
  }

  private context(device: DeviceRow): DeviceContext {
    const profile = this.profile(device.org_tenant_id)
    return {
      deviceId: device.device_id,
      modelName: device.model_name,
      modelVersion: device.model_version,
      environment: device.environment as DeviceContext['environment'],
      certificatePem: device.certificate_pem,
      privateKeyPem: device.private_key_pem,
      qrUrl: device.qr_url,
      taxpayerName: profile?.taxpayer_name ?? undefined,
      taxpayerTin: profile?.tin ?? undefined,
    }
  }

  private connection(orgTenantId: string) {
    return this.db.prepare(`SELECT * FROM org_books_connections WHERE org_tenant_id = ?`).get(orgTenantId) as ConnectionRow | undefined
  }

  private profile(orgTenantId: string) {
    return this.db.prepare(`SELECT * FROM org_fiscal_profiles WHERE org_tenant_id = ?`).get(orgTenantId) as ProfileRow | undefined
  }

  private device(orgTenantId: string) {
    return this.db.prepare(`SELECT * FROM org_fiscal_devices WHERE org_tenant_id = ? ORDER BY created_at LIMIT 1`).get(orgTenantId) as DeviceRow | undefined
  }

  private mustDevice(orgTenantId: string) {
    const device = this.device(orgTenantId)
    if (!device) throw new StatusException('Add a fiscal device first', 409)
    return device
  }

  private documents(orgTenantId: string) {
    return this.db.prepare(
      `SELECT * FROM org_fiscal_documents WHERE org_tenant_id = ? ORDER BY updated_at DESC LIMIT 50`,
    ).all(orgTenantId) as DocumentRow[]
  }

  private mustDocument(orgTenantId: string, documentId: string) {
    const row = this.db.prepare(
      `SELECT * FROM org_fiscal_documents WHERE id = ? AND org_tenant_id = ?`,
    ).get(documentId, orgTenantId) as DocumentRow | undefined
    if (!row) throw new StatusException('Document not found', 404)
    return row
  }

  private deviceView(device: DeviceRow): BooksFiscalStatus['fiscal']['device'] {
    return {
      id: device.id,
      label: device.label,
      deviceId: device.device_id,
      serialNo: device.serial_no,
      environment: device.environment,
      fiscalDayStatus: device.fiscal_day_status,
      fiscalDayNo: device.fiscal_day_no,
      receiptCounter: device.receipt_counter,
      registered: device.environment === 'simulator' || Boolean(device.certificate_pem),
    }
  }

  private documentView(row: DocumentRow): FiscalDocumentView {
    const document = JSON.parse(row.normalized_json) as NeutralDocument
    const total = document.lines.reduce((sum, line) => sum + Number(line.total), 0)
    return {
      id: row.id,
      source: row.source,
      sourceId: row.source_id,
      invoiceNo: row.invoice_no,
      receiptType: row.receipt_type,
      status: row.status,
      currency: document.currency,
      total: Math.round(total * 100) / 100,
      customerName: document.customerName ?? null,
      hasPhone: Boolean(document.customerPhone),
      receiptId: row.receipt_id,
      qrCode: row.qr_code,
      walletStatus: row.wallet_status,
      error: row.error,
    }
  }
}

function zohoConfigured() {
  return Boolean(process.env.ZOHO_CLIENT_ID?.trim() && process.env.ZOHO_CLIENT_SECRET?.trim() && process.env.ZOHO_REDIRECT_URI?.trim())
}

function publicBooksStatus(connection: ConnectionRow) {
  if (connection.status === 'connected' && !connection.external_org_id) return 'pending_organisation'
  return connection.status
}

function resolveOrganisation(organisations: ZohoOrganisation[], previous?: ConnectionRow) {
  if (previous?.external_org_id) return organisations.find((item) => item.id === previous.external_org_id)
  if (previous?.status !== 'select_organisation' && organisations.length === 1) return organisations[0]
  return undefined
}

let shared: BooksFiscalService | undefined

export function getBooksFiscalService() {
  shared ??= new BooksFiscalService()
  return shared
}
