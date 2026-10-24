import api from '@/lib/api'
import { buildDocumentPdf, type DocumentBrand, type DocumentModel } from '@/lib/brandedDocument'
import { saveBinaryExport } from '@/lib/exportFile'

/** The organisation's brand as it stood at `at` (usually when the document was issued). */
export async function fetchOrgBrand(orgTenantId?: string, at?: string): Promise<DocumentBrand | undefined> {
  if (!orgTenantId) return undefined
  try {
    const response = await api.get(`/api/public/orgs/${encodeURIComponent(orgTenantId)}/brand`, {
      params: at ? { at } : undefined,
    })
    return response.data as DocumentBrand
  } catch {
    return undefined
  }
}

/** Save the document as a PDF: a download on the web, the share sheet in the Android app. */
export async function downloadDocumentPdf(model: DocumentModel, brand: DocumentBrand): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const pdf = await buildDocumentPdf(jsPDF as any, model, brand)
  await saveBinaryExport(pdf.fileName, 'application/pdf', pdf.bytes, pdf.base64)
}
