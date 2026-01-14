/**
 * VC to PDF Template Mapping
 * 
 * Converts Verifiable Credentials to PDF-ready HTML templates
 * for Invoice and Quote credentials.
 * 
 * Usage:
 * 1. Take a VC JSON (e.g., InvoiceCredential)
 * 2. Pass to renderInvoiceHtml() or renderQuoteHtml()
 * 3. Use Puppeteer/wkhtmltopdf to convert HTML → PDF
 * 4. Hash the PDF (sha256) and embed in a presentation proof
 */

const CREDENTIS_BLUE = '#2188CA';
const CREDENTIS_LIGHT = '#D0E6F3';

interface VerifiableCredential {
  '@context': string[];
  type: string[];
  id: string;
  issuer: { id: string; name: string };
  holder: { id: string; name: string };
  issuanceDate: string;
  claims: Record<string, any>;
}

/**
 * Template mapping for Invoice credentials
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
    items: 'claims.items', // array path
    columns: ['description', 'amount'], // keys in each item
  },
};

/**
 * Template mapping for Quote credentials
 */
export const quoteTemplateMapping = {
  placeholders: {
    quoteNumber: 'claims.quoteNumber',
    validUntil: 'claims.validUntil',
    issuer_name: 'issuer.name',
    holder_name: 'holder.name',
    estimatedTotal: 'claims.estimatedTotal',
  },
  table: {
    lines: 'claims.lines',
    columns: ['description', 'amount'],
  },
};

/**
 * Render Invoice VC as HTML template
 */
export function renderInvoiceHtml(vc: VerifiableCredential): string {
  const items = (vc.claims.items || [])
    .map(
      (i: any) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${i.description}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${i.amount}</td>
    </tr>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { 
      font-family: Arial, Helvetica, sans-serif;
      color: #102A43;
      margin: 0;
      padding: 20px;
    }
    .header {
      background: ${CREDENTIS_BLUE};
      color: white;
      padding: 24px;
      border-radius: 8px 8px 0 0;
    }
    .header h1 {
      margin: 0 0 8px 0;
      font-size: 32px;
    }
    .header .meta {
      font-size: 14px;
      opacity: 0.9;
    }
    .card {
      padding: 24px;
      border: 1px solid #E0E7ED;
      border-radius: 0 0 8px 8px;
      background: white;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 24px;
    }
    .info-row > div {
      flex: 1;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    th {
      text-align: left;
      padding: 12px 8px;
      background: ${CREDENTIS_LIGHT};
      font-weight: 600;
    }
    .total-row {
      text-align: right;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 2px solid ${CREDENTIS_BLUE};
    }
    .total-row strong {
      font-size: 24px;
      color: ${CREDENTIS_BLUE};
    }
    .logo {
      text-align: center;
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <div class="logo">
    <img src="/credentis-logo.png" alt="Credentis" style="height: 48px; width: auto;" />
  </div>
  
  <div class="header">
    <h1>Invoice</h1>
    <div class="meta">Invoice #: ${vc.claims.invoiceNumber}</div>
  </div>
  
  <div class="card">
    <div class="info-row">
      <div>
        <strong>From:</strong><br/>
        ${vc.issuer.name}
      </div>
      <div>
        <strong>To:</strong><br/>
        ${vc.holder.name}
      </div>
      <div>
        <strong>Date:</strong><br/>
        ${vc.claims.date}
      </div>
    </div>
    
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${items}
      </tbody>
    </table>
    
    <div class="total-row">
      <strong>Total: ${vc.claims.total}</strong>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Render Quote VC as HTML template
 */
export function renderQuoteHtml(vc: VerifiableCredential): string {
  const lines = (vc.claims.lines || [])
    .map(
      (line: any) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${line.description}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${line.amount}</td>
    </tr>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { 
      font-family: Arial, Helvetica, sans-serif;
      color: #102A43;
      margin: 0;
      padding: 20px;
    }
    .header {
      background: ${CREDENTIS_BLUE};
      color: white;
      padding: 24px;
      border-radius: 8px 8px 0 0;
    }
    .header h1 {
      margin: 0 0 8px 0;
      font-size: 32px;
    }
    .header .meta {
      font-size: 14px;
      opacity: 0.9;
    }
    .card {
      padding: 24px;
      border: 1px solid #E0E7ED;
      border-radius: 0 0 8px 8px;
      background: white;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 24px;
    }
    .info-row > div {
      flex: 1;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    th {
      text-align: left;
      padding: 12px 8px;
      background: ${CREDENTIS_LIGHT};
      font-weight: 600;
    }
    .total-row {
      text-align: right;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 2px solid ${CREDENTIS_BLUE};
    }
    .total-row strong {
      font-size: 24px;
      color: ${CREDENTIS_BLUE};
    }
    .logo {
      text-align: center;
      margin-bottom: 16px;
    }
    .validity {
      background: #FFF8E6;
      padding: 12px;
      border-left: 4px solid #FFC82E;
      margin-top: 16px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="logo">
    <img src="/credentis-logo.png" alt="Credentis" style="height: 48px; width: auto;" />
  </div>
  
  <div class="header">
    <h1>Quote</h1>
    <div class="meta">Quote #: ${vc.claims.quoteNumber}</div>
  </div>
  
  <div class="card">
    <div class="info-row">
      <div>
        <strong>From:</strong><br/>
        ${vc.issuer.name}
      </div>
      <div>
        <strong>To:</strong><br/>
        ${vc.holder.name}
      </div>
    </div>
    
    <div class="validity">
      <strong>Valid Until:</strong> ${vc.claims.validUntil}
    </div>
    
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lines}
      </tbody>
    </table>
    
    <div class="total-row">
      <strong>Estimated Total: ${vc.claims.estimatedTotal}</strong>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Example: How to generate PDFs from VCs
 * 
 * SERVER-SIDE (trusted environment):
 * 
 * ```typescript
 * import puppeteer from 'puppeteer';
 * import { renderInvoiceHtml } from './vcToPdfTemplates';
 * 
 * async function generateInvoicePdf(vc: VerifiableCredential) {
 *   const html = renderInvoiceHtml(vc);
 *   
 *   const browser = await puppeteer.launch();
 *   const page = await browser.newPage();
 *   await page.setContent(html);
 *   
 *   const pdf = await page.pdf({
 *     format: 'A4',
 *     printBackground: true,
 *   });
 *   
 *   await browser.close();
 *   
 *   // Hash the PDF to prove it matches the VC
 *   const hash = crypto.createHash('sha256').update(pdf).digest('hex');
 *   
 *   return { pdf, hash };
 * }
 * ```
 * 
 * IMPORTANT: Generate PDFs server-side (issuer backend) for canonical documents.
 * Do NOT rely on client-side PDF generation for authoritative documents.
 */
