import axios from 'axios'

import { buildDocumentPdf, type DocumentBrand, type DocumentModel } from '@/lib/brandedDocument'
import { saveBinaryExport } from '@/lib/exportFile'

const backendUrl = () => process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

/** The organisation's brand as it stood at `at` (usually when the document was issued). */
export async function fetchOrgBrand(orgTenantId?: string, at?: string): Promise<DocumentBrand | undefined> {
  if (!orgTenantId) return undefined
  try {
    const response = await axios.get(`${backendUrl()}/api/public/orgs/${encodeURIComponent(orgTenantId)}/brand`, {
      params: at ? { at } : undefined,
    })
    return response.data as DocumentBrand
  } catch {
    return undefined
  }
}

export async function downloadDocumentPdf(model: DocumentModel, brand: DocumentBrand): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const pdf = await buildDocumentPdf(jsPDF as any, model, brand)
  await saveBinaryExport(pdf.fileName, 'application/pdf', pdf.bytes)
}
