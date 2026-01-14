/**
 * PDF Template Renderers for Verifiable Credentials
 * 
 * These functions generate HTML that can be converted to PDF using:
 * - Puppeteer: page.setContent(html); page.pdf({ format: 'A4' })
 * - wkhtmltopdf: wkhtmltopdf - output.pdf < html
 * 
 * IMPORTANT: Generate PDFs server-side only for canonical/authoritative documents.
 * Embed PDF hash (sha256) into VC for tamper-proof verification.
 */

import type { VerifiableCredential } from './CanonicalCredentialCard';

// Credentis brand colors
const CRED_BLUE = '#2188CA';
const CRED_LIGHT = '#D0E6F3';
const CRED_DARK = '#102A43';

// Common styles for all PDF templates
const commonStyles = `
  body {
    font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
    color: ${CRED_DARK};
    margin: 0;
    padding: 0;
    line-height: 1.5;
  }
  .header {
    background: ${CRED_BLUE};
    color: white;
    padding: 24px 32px;
  }
  .header h1 {
    margin: 0 0 8px 0;
    font-size: 28px;
    font-weight: 600;
  }
  .header .subtitle {
    font-size: 14px;
    opacity: 0.9;
  }
  .content {
    padding: 32px;
  }
  .card {
    border: 1px solid ${CRED_LIGHT};
    border-radius: 8px;
    padding: 24px;
    margin-bottom: 24px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #f0f4f8;
  }
  .row:last-child {
    border-bottom: none;
  }
  .label {
    color: #6B7C93;
    font-size: 14px;
  }
  .value {
    font-weight: 500;
    font-size: 14px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    text-align: left;
    padding: 12px 8px;
    border-bottom: 2px solid ${CRED_LIGHT};
    color: #6B7C93;
    font-weight: 500;
    font-size: 13px;
  }
  th:last-child {
    text-align: right;
  }
  td {
    padding: 12px 8px;
    border-bottom: 1px solid #f0f4f8;
    font-size: 14px;
  }
  td:last-child {
    text-align: right;
  }
  .total-row td {
    border-top: 2px solid ${CRED_LIGHT};
    border-bottom: none;
    padding-top: 16px;
  }
  .total-label {
    color: ${CRED_BLUE};
    font-weight: 500;
  }
  .total-value {
    font-size: 18px;
    font-weight: 700;
  }
  .footer {
    margin-top: 32px;
    padding-top: 16px;
    border-top: 1px solid #f0f4f8;
    font-size: 12px;
    color: #6B7C93;
  }
  .verified-badge {
    display: inline-block;
    background: rgba(255,255,255,0.2);
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 12px;
    margin-top: 8px;
  }
`;

// Helper to safely access nested properties
const getIssuerName = (vc: VerifiableCredential): string => {
  if (typeof vc.issuer === 'string') return vc.issuer;
  return vc.issuer?.name || 'Credentis';
};

const getHolderName = (vc: VerifiableCredential): string => {
  if (typeof vc.holder === 'string') return vc.holder;
  const claims = vc.claims || vc.credentialSubject || {};
  return vc.holder?.name || (claims as Record<string, string>).name || 'Holder';
};

const getClaims = (vc: VerifiableCredential): Record<string, unknown> => {
  return vc.claims || vc.credentialSubject || {};
};

/**
 * Render Invoice VC to PDF-ready HTML
 */
export function renderInvoicePdfHtml(vc: VerifiableCredential): string {
  const claims = getClaims(vc);
  const items = (claims.items || claims.lineItems || []) as Array<{
    description: string;
    amount: string;
  }>;

  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td>${item.description}</td>
        <td>${item.amount}</td>
      </tr>
    `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${claims.invoiceNumber || ''}</title>
  <style>${commonStyles}</style>
</head>
<body>
  <div class="header">
    <h1>Invoice</h1>
    <div class="subtitle">Invoice #: ${claims.invoiceNumber || vc.id || 'N/A'}</div>
    <div class="verified-badge">✓ Verifiable Credential</div>
  </div>
  
  <div class="content">
    <div class="card">
      <div class="row">
        <span class="label">From</span>
        <span class="value">${getIssuerName(vc)}</span>
      </div>
      <div class="row">
        <span class="label">To</span>
        <span class="value">${getHolderName(vc)}</span>
      </div>
      <div class="row">
        <span class="label">Date</span>
        <span class="value">${claims.date || vc.issuanceDate || new Date().toISOString().split('T')[0]}</span>
      </div>
    </div>
    
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        <tr class="total-row">
          <td class="total-label">Total</td>
          <td class="total-value">${claims.total || '$0.00'}</td>
        </tr>
      </tbody>
    </table>
    
    <div class="footer">
      <div>Credential ID: ${vc.id || 'urn:uuid:' + crypto.randomUUID?.() || 'N/A'}</div>
      <div>Issued: ${vc.issuanceDate || new Date().toISOString()}</div>
      <div>This document is backed by a Verifiable Credential and can be cryptographically verified.</div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Render Quote VC to PDF-ready HTML
 */
export function renderQuotePdfHtml(vc: VerifiableCredential): string {
  const claims = getClaims(vc);
  const lines = (claims.lines || claims.items || []) as Array<{
    description: string;
    amount: string;
  }>;

  const lineRows = lines
    .map(
      (line) => `
      <tr>
        <td>${line.description}</td>
        <td>${line.amount}</td>
      </tr>
    `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Quote ${claims.quoteNumber || ''}</title>
  <style>${commonStyles}</style>
</head>
<body>
  <div class="header">
    <h1>Quote</h1>
    <div class="subtitle">Quote #: ${claims.quoteNumber || vc.id || 'N/A'}</div>
    <div class="verified-badge">✓ Verifiable Credential</div>
  </div>
  
  <div class="content">
    <div class="card">
      <div class="row">
        <span class="label">From</span>
        <span class="value">${getIssuerName(vc)}</span>
      </div>
      <div class="row">
        <span class="label">To</span>
        <span class="value">${getHolderName(vc)}</span>
      </div>
      <div class="row">
        <span class="label">Valid Until</span>
        <span class="value">${claims.validUntil || 'N/A'}</span>
      </div>
    </div>
    
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
        <tr class="total-row">
          <td class="total-label">Estimated Total</td>
          <td class="total-value">${claims.estimatedTotal || claims.total || '$0.00'}</td>
        </tr>
      </tbody>
    </table>
    
    <div class="footer">
      <div>Credential ID: ${vc.id || 'urn:uuid:' + crypto.randomUUID?.() || 'N/A'}</div>
      <div>Issued: ${vc.issuanceDate || new Date().toISOString()}</div>
      <div>This quote is backed by a Verifiable Credential and can be cryptographically verified.</div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * VC → PDF Template Mapping Configuration
 * 
 * Use this to dynamically map VC fields to template placeholders.
 */
export const invoiceTemplateMapping = {
  placeholders: {
    invoiceNumber: 'claims.invoiceNumber',
    date: 'claims.date',
    issuer_name: 'issuer.name',
    holder_name: 'holder.name',
    total: 'claims.total',
  },
  table: {
    items: 'claims.items',
    columns: ['description', 'amount'],
  },
};

export const quoteTemplateMapping = {
  placeholders: {
    quoteNumber: 'claims.quoteNumber',
    validUntil: 'claims.validUntil',
    issuer_name: 'issuer.name',
    holder_name: 'holder.name',
    estimatedTotal: 'claims.estimatedTotal',
  },
  table: {
    items: 'claims.lines',
    columns: ['description', 'amount'],
  },
};
