import Database from 'better-sqlite3'
import { jest } from '@jest/globals'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { accountsPayableLedgerService } from '../AccountsPayableLedgerService'
import { BusinessTransactionService } from '../BusinessTransactionService'
import { paymentLinkService } from '../PaymentLinkService'
import { notificationService } from '../NotificationService'
import { receivablePlanService } from '../ReceivablePlanService'
import { receivableReminderService } from '../ReceivableReminderService'

describe('BusinessTransactionService', () => {
  let db: Database.Database
  let restore: ReturnType<typeof jest.spyOn>

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE requests (
        id TEXT PRIMARY KEY, tenant_id TEXT, parent_request_id TEXT, title TEXT, context_json TEXT
      );
      CREATE TABLE business_transactions (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, transaction_type TEXT NOT NULL,
        reference TEXT, title TEXT NOT NULL, status TEXT NOT NULL, parent_transaction_id TEXT,
        source_type TEXT NOT NULL, source_id TEXT NOT NULL, metadata TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, source_type, source_id)
      );
      CREATE TABLE business_transaction_links (
        id TEXT PRIMARY KEY, business_transaction_id TEXT NOT NULL, link_type TEXT NOT NULL,
        link_id TEXT NOT NULL, relation TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(link_type, link_id, relation)
      );
      CREATE TABLE financial_obligations (
        id TEXT PRIMARY KEY, business_transaction_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
        direction TEXT NOT NULL, counterparty_ref TEXT, counterparty_name TEXT,
        description TEXT NOT NULL, original_amount REAL NOT NULL, currency TEXT NOT NULL,
        due_date TEXT, balance_due REAL NOT NULL, status TEXT NOT NULL, source_type TEXT NOT NULL,
        source_id TEXT NOT NULL, metadata TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, direction, source_type, source_id)
      );
      CREATE TABLE settlement_allocations (
        id TEXT PRIMARY KEY, obligation_id TEXT NOT NULL, settlement_type TEXT NOT NULL,
        settlement_id TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL,
        status TEXT NOT NULL, applied_at TEXT NOT NULL, metadata TEXT NOT NULL,
        unapplied_amount REAL NOT NULL DEFAULT 0,
        UNIQUE(obligation_id, settlement_type, settlement_id)
      );
      CREATE TABLE ap_suppliers (
        id TEXT PRIMARY KEY, buyer_tenant_id TEXT NOT NULL, supplier_name TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE purchase_receipts (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, business_transaction_id TEXT NOT NULL,
        purchase_request_id TEXT, purchase_order_id TEXT, receipt_ref TEXT NOT NULL,
        received_amount REAL, evidence_url TEXT, received_at TEXT NOT NULL, metadata TEXT NOT NULL,
        receipt_kind TEXT NOT NULL DEFAULT 'goods', receiving_required INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE ap_invoices (
        id TEXT PRIMARY KEY, buyer_tenant_id TEXT NOT NULL, supplier_id TEXT NOT NULL,
        invoice_ref TEXT NOT NULL, description TEXT NOT NULL, amount REAL NOT NULL,
        currency TEXT NOT NULL, due_date TEXT, status TEXT NOT NULL, balance_due REAL NOT NULL,
        source_type TEXT, source_request_id TEXT, project_ref TEXT, workflow_stage TEXT,
        last_action_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        business_transaction_id TEXT, obligation_id TEXT, purchase_receipt_id TEXT,
        match_status TEXT, match_note TEXT
      );
      CREATE TABLE ar_payment_plans (
        id TEXT PRIMARY KEY, buyer_tenant_id TEXT, payer_name TEXT, payer_phone TEXT, payer_email TEXT,
        description TEXT, total_amount REAL, currency TEXT, plan_type TEXT, cadence TEXT,
        installments_total INTEGER, installments_paid INTEGER, amount_collected REAL, status TEXT,
        created_at TEXT, updated_at TEXT, business_transaction_id TEXT, source_workflow_run_id TEXT,
        next_notification_at TEXT
      );
      CREATE TABLE ar_plan_installments (
        id TEXT PRIMARY KEY, plan_id TEXT, payment_link_id TEXT, installment_number INTEGER,
        amount REAL, due_date TEXT, status TEXT, created_at TEXT, obligation_id TEXT,
        notified_at TEXT, reminder_sent_at TEXT
      );
      CREATE TABLE payment_links (
        id TEXT PRIMARY KEY, merchant_id TEXT, merchant_name TEXT, description TEXT, amount REAL,
        currency TEXT, invoice_ref TEXT, status TEXT, sector TEXT, expiry TEXT, shortlink_code TEXT,
        shortlink_url TEXT, created_at TEXT, business_transaction_id TEXT, obligation_id TEXT
      );
    `)
    restore = jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db)
  })

  afterEach(() => {
    restore.mockRestore()
    db.close()
  })

  it('keeps a purchase, its payable and partial payments as separate linked records', () => {
    db.prepare(`INSERT INTO requests VALUES (?, ?, NULL, ?, ?)`).run(
      'REQ-ROOT',
      'tenant-1',
      'Materials',
      JSON.stringify({ projectRef: 'JOB-7' }),
    )
    db.prepare(`INSERT INTO requests VALUES (?, ?, ?, ?, ?)`).run(
      'PO-1',
      'tenant-1',
      'REQ-ROOT',
      'Purchase order',
      '{}',
    )

    const service = new BusinessTransactionService()
    const transactionId = service.ensurePurchaseTransaction('tenant-1', 'PO-1')
    const obligationId = service.ensureObligation({
      transactionId,
      tenantId: 'tenant-1',
      direction: 'payable',
      sourceType: 'ap_invoice',
      sourceId: 'INV-1',
      description: 'Supplier bill',
      amount: 100,
      currency: 'USD',
    })

    service.allocateSettlement({
      obligationId,
      settlementType: 'ap_payment',
      settlementId: 'PAY-1',
      amount: 40,
      currency: 'USD',
    })
    // A replay with the same natural settlement key is a no-op.
    service.allocateSettlement({
      obligationId,
      settlementType: 'ap_payment',
      settlementId: 'PAY-1',
      amount: 40,
      currency: 'USD',
    })

    const obligation = service.obligationForSource('ap_invoice', 'INV-1', 'payable')
    expect(obligation).toMatchObject({
      transactionId,
      originalAmount: 100,
      settledAmount: 40,
      balanceDue: 60,
      status: 'partially_settled',
    })
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM settlement_allocations WHERE obligation_id = ?`).get(obligationId),
    ).toEqual({ n: 1 })
    expect(
      db
        .prepare(
          `SELECT link_id, relation FROM business_transaction_links WHERE business_transaction_id = ? ORDER BY link_id`,
        )
        .all(transactionId),
    ).toEqual([
      { link_id: 'PO-1', relation: 'child' },
      { link_id: 'REQ-ROOT', relation: 'source' },
    ])
  })

  it('keeps every instalment as its own receivable under one collection plan', () => {
    const service = new BusinessTransactionService()
    const transactionId = service.ensureTransaction({
      tenantId: 'tenant-1',
      transactionType: 'collection_plan',
      sourceType: 'ar_plan',
      sourceId: 'PLAN-1',
      title: 'School fees',
    })
    service.ensureObligation({
      transactionId,
      tenantId: 'tenant-1',
      direction: 'receivable',
      sourceType: 'ar_installment',
      sourceId: 'TERM-1',
      description: 'Term 1',
      amount: 50,
    })
    service.ensureObligation({
      transactionId,
      tenantId: 'tenant-1',
      direction: 'receivable',
      sourceType: 'ar_installment',
      sourceId: 'TERM-2',
      description: 'Term 2',
      amount: 50,
    })

    expect(service.obligationsForTransaction(transactionId)).toHaveLength(2)
  })

  it('caps an overpayment and records the unapplied remainder explicitly', () => {
    const service = new BusinessTransactionService()
    const transactionId = service.ensureTransaction({
      tenantId: 'tenant-1',
      transactionType: 'collection_plan',
      sourceType: 'ar_plan',
      sourceId: 'PLAN-OVER',
      title: 'Overpayment',
    })
    const obligationId = service.ensureObligation({
      transactionId,
      tenantId: 'tenant-1',
      direction: 'receivable',
      sourceType: 'ar_installment',
      sourceId: 'TERM-OVER',
      description: 'One payment',
      amount: 100,
    })
    service.allocateSettlement({
      obligationId,
      settlementType: 'payment_link',
      settlementId: 'LINK-OVER',
      amount: 125,
      currency: 'USD',
    })

    expect(service.obligationForSource('ar_installment', 'TERM-OVER', 'receivable')).toMatchObject({
      settledAmount: 100,
      balanceDue: 0,
      status: 'settled',
    })
    expect(db.prepare(`SELECT amount, unapplied_amount FROM settlement_allocations`).get()).toEqual({
      amount: 100,
      unapplied_amount: 25,
    })
  })

  it('splits a job plan exactly and keeps an optional first payment on the job transaction', () => {
    let sequence = 0
    const createLink = jest.spyOn(paymentLinkService, 'create').mockImplementation((input: any) => {
      sequence += 1
      const id = `LINK-${sequence}`
      const obligationId = new BusinessTransactionService().ensureObligation({
        transactionId: input.transactionId,
        tenantId: input.merchantId,
        direction: 'receivable',
        sourceType: input.obligationSourceType,
        sourceId: input.obligationSourceId,
        description: input.description,
        amount: input.amount,
        currency: input.currency,
      })
      const now = new Date().toISOString()
      db.prepare(`INSERT INTO payment_links VALUES (?, ?, NULL, ?, ?, ?, NULL, 'active', NULL, ?, ?, ?, ?, ?, ?)`).run(
        id,
        input.merchantId,
        input.description,
        input.amount,
        input.currency,
        now,
        `CODE-${sequence}`,
        `https://pay/${sequence}`,
        now,
        input.transactionId,
        obligationId,
      )
      return {
        id,
        merchantId: input.merchantId,
        description: input.description,
        amount: input.amount,
        currency: input.currency,
        status: 'active',
        sector: input.sector || 'general',
        expiry: now,
        shortlinkCode: `CODE-${sequence}`,
        shortlinkUrl: `https://pay/${sequence}`,
        createdAt: now,
      }
    })

    const created = receivablePlanService.createForJob({
      tenantId: 'tenant-1',
      jobRunId: 'JOB-RUN-1',
      billingRunId: 'BILL-RUN-1',
      title: 'Field job client bill',
      amount: 100,
      currency: 'USD',
      terms: 'instalment',
      instalments: 3,
      firstPaymentAmount: 20,
    })

    expect(db.prepare(`SELECT amount FROM ar_plan_installments ORDER BY installment_number`).all()).toEqual([
      { amount: 20 },
      { amount: 40 },
      { amount: 40 },
    ])
    expect(db.prepare(`SELECT SUM(original_amount) AS total FROM financial_obligations`).get()).toEqual({ total: 100 })
    expect(
      db
        .prepare(`SELECT transaction_type, source_type, source_id FROM business_transactions WHERE id = ?`)
        .get(created.transactionId),
    ).toEqual({
      transaction_type: 'field_job',
      source_type: 'workflow_run',
      source_id: 'JOB-RUN-1',
    })
    createLink.mockRestore()
  })

  it('separates the receipt and supplier bill and disputes an amount mismatch', () => {
    db.prepare(`INSERT INTO requests VALUES (?, ?, NULL, ?, ?)`).run('PO-2', 'tenant-1', 'Purchase order', '{}')

    expect(
      accountsPayableLedgerService.recordFromRequestCompletion({
        tenantId: 'tenant-1',
        requestId: 'PO-2',
        requestType: 'finance.purchase_order',
        title: 'Timber',
        amount: 100,
        currency: 'USD',
        context: { supplierRef: 'Supplier A' },
        payload: { receiptRef: 'DEL-2', receivedAmount: 90, invoiceRef: 'BILL-2', amount: 100 },
      }),
    ).toBe('disputed')

    const invoice = db.prepare(`SELECT * FROM ap_invoices WHERE source_request_id = 'PO-2'`).get() as any
    expect(invoice).toMatchObject({ status: 'disputed', match_status: 'disputed', balance_due: 100 })
    expect(db.prepare(`SELECT received_amount FROM purchase_receipts WHERE purchase_order_id = 'PO-2'`).get()).toEqual({
      received_amount: 90,
    })
    expect(db.prepare(`SELECT status FROM financial_obligations WHERE id = ?`).get(invoice.obligation_id)).toEqual({
      status: 'disputed',
    })
    // Replaying completion does not create a second bill or receipt.
    expect(
      accountsPayableLedgerService.recordFromRequestCompletion({
        tenantId: 'tenant-1',
        requestId: 'PO-2',
        requestType: 'finance.purchase_order',
        amount: 100,
        context: { supplierRef: 'Supplier A' },
        payload: { receiptRef: 'DEL-2', receivedAmount: 90, invoiceRef: 'BILL-2', amount: 100 },
      }),
    ).toBe('disputed')
    expect(db.prepare(`SELECT COUNT(*) AS n FROM ap_invoices`).get()).toEqual({ n: 1 })
    expect(db.prepare(`SELECT COUNT(*) AS n FROM purchase_receipts`).get()).toEqual({ n: 1 })
  })

  it('uses two-way matching without inventing delivery evidence when confirmation is not required', () => {
    db.prepare(`INSERT INTO requests VALUES (?, ?, NULL, ?, ?)`).run('PO-3', 'tenant-1', 'Service order', '{}')

    expect(
      accountsPayableLedgerService.recordFromRequestCompletion({
        tenantId: 'tenant-1',
        requestId: 'PO-3',
        requestType: 'finance.purchase_order',
        title: 'Remote advice',
        amount: 100,
        currency: 'USD',
        context: { supplierRef: 'Supplier B', itemType: 'service', receivingRequired: false },
        payload: { invoiceRef: 'BILL-3', amount: 100 },
      }),
    ).toBe('matched')

    expect(db.prepare(`SELECT COUNT(*) AS n FROM purchase_receipts WHERE purchase_order_id = 'PO-3'`).get()).toEqual({
      n: 0,
    })
    expect(
      db.prepare(`SELECT match_status, purchase_receipt_id FROM ap_invoices WHERE source_request_id = 'PO-3'`).get(),
    ).toEqual({
      match_status: 'matched',
      purchase_receipt_id: null,
    })
  })

  it('deduplicates the first notice and weekly reminder', async () => {
    const notify = jest
      .spyOn(notificationService, 'dispatchContactNotification')
      .mockResolvedValue({ accepted: true, channels: [{ channel: 'email', status: 'accepted' }] })
    db.prepare(
      `INSERT INTO ar_payment_plans
       (id, payer_name, payer_phone, currency, status) VALUES ('PLAN-NOTIFY', 'Client', '+263700000001', 'USD', 'active')`,
    ).run()
    db.prepare(
      `INSERT INTO payment_links
       (id, shortlink_url) VALUES ('LINK-NOTIFY', 'https://pay/notify')`,
    ).run()
    db.prepare(
      `INSERT INTO ar_plan_installments
       (id, plan_id, payment_link_id, amount, status) VALUES ('TERM-NOTIFY', 'PLAN-NOTIFY', 'LINK-NOTIFY', 25, 'pending')`,
    ).run()

    notify.mockResolvedValueOnce({ accepted: false, channels: [{ channel: 'whatsapp', status: 'queued' }] })
    await expect(receivableReminderService.sendInstallment('TERM-NOTIFY')).resolves.toBe(false)
    expect(db.prepare('SELECT notified_at FROM ar_plan_installments WHERE id = ?').get('TERM-NOTIFY')).toEqual({
      notified_at: null,
    })
    await expect(receivableReminderService.sendInstallment('TERM-NOTIFY')).resolves.toBe(true)
    await expect(receivableReminderService.sendInstallment('TERM-NOTIFY')).resolves.toBe(false)
    await expect(receivableReminderService.sendInstallment('TERM-NOTIFY', true)).resolves.toBe(true)
    await expect(receivableReminderService.sendInstallment('TERM-NOTIFY', true)).resolves.toBe(false)
    expect(notify).toHaveBeenCalledTimes(3)
    notify.mockRestore()
  })
})
