/**
 * Credentis Unified Brand Theme
 * 
 * All portal pages should use these constants for consistent branding.
 * The Payroll page was the reference for this style guide.
 */

// Core brand colors
export const BRAND = {
  curious: '#2188CA',      // Primary blue
  linkWater: '#D0E6F3',    // Light blue background
  viking: '#6FB4DC',       // Accent blue
  cornflower: '#88C4E3',   // Soft blue
  dark: '#0A3D5C',         // Dark blue for text/headings
} as const;

// Status badge configurations
export const STATUS_STYLES = {
  completed: { bg: 'bg-green-100', text: 'text-green-800' },
  active: { bg: 'bg-green-100', text: 'text-green-800' },
  approved: { bg: 'bg-green-100', text: 'text-green-800' },
  success: { bg: 'bg-green-100', text: 'text-green-800' },
  draft: { bg: 'bg-gray-100', text: 'text-gray-800' },
  pending: { bg: 'bg-orange-100', text: 'text-orange-800' },
  processing: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  paid: { bg: 'bg-blue-100', text: 'text-blue-800' },
  filed: { bg: 'bg-blue-100', text: 'text-blue-800' },
  confirmed: { bg: 'bg-green-100', text: 'text-green-800' },
  rejected: { bg: 'bg-red-100', text: 'text-red-800' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-800' },
  error: { bg: 'bg-red-100', text: 'text-red-800' },
  inactive: { bg: 'bg-gray-100', text: 'text-gray-600' },
} as const;

// Common component class names
export const CLASSES = {
  // Page header with gradient
  pageHeaderGradient: `p-6 rounded-xl mb-8`,
  pageHeaderGradientStyle: {
    background: `linear-gradient(135deg, ${BRAND.dark} 0%, ${BRAND.curious} 100%)`,
  },
  
  // Section headers
  sectionTitle: 'text-3xl font-bold text-white',
  sectionSubtitle: 'text-sm mt-2',
  
  // Cards
  statCard: 'relative overflow-hidden rounded-xl p-6 shadow-sm hover:shadow-md transition-all',
  statCardStyle: { backgroundColor: BRAND.linkWater },
  
  // Tables
  tableWrapper: 'overflow-hidden rounded-xl shadow ring-1 ring-black ring-opacity-5',
  tableHeader: 'px-6 py-3 text-left text-xs font-semibold uppercase',
  tableHeaderStyle: { backgroundColor: BRAND.linkWater, color: BRAND.dark },
  tableRow: 'hover:bg-gray-50 transition-colors',
  tableCell: 'px-6 py-4 text-sm',
  
  // Buttons
  primaryButton: 'inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-md disabled:opacity-50',
  primaryButtonStyle: { backgroundColor: BRAND.curious },
  secondaryButton: 'inline-flex items-center rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all hover:shadow-md',
  secondaryButtonStyle: { borderColor: BRAND.curious, color: BRAND.curious, backgroundColor: 'white' },
  
  // Tabs
  tabActive: 'border-current',
  tabInactive: 'border-transparent hover:border-gray-300',
  tabStyle: (active: boolean) => ({
    color: active ? BRAND.curious : '#6B7280',
    borderColor: active ? BRAND.curious : undefined,
  }),
  
  // Forms
  inputBorder: { borderColor: BRAND.viking },
  label: 'block text-sm font-medium mb-1',
  labelStyle: { color: BRAND.dark },
  
  // Modals
  modalBackdrop: 'fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[100]',
  modalContent: 'bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl',
  modalHeader: 'flex items-center gap-3 mb-6',
  modalIconWrapper: 'p-2 rounded-lg',
  modalIconWrapperStyle: { backgroundColor: BRAND.linkWater },
  modalTitle: 'text-xl font-semibold',
  modalTitleStyle: { color: BRAND.dark },
  
  // Info boxes
  infoBox: 'p-4 rounded-lg',
  infoBoxStyle: { backgroundColor: BRAND.linkWater },
  
  // Empty state
  emptyState: 'px-6 py-12 text-center text-sm text-gray-500',
} as const;

// Helper function to format currency
export const formatCurrency = (amount: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

// Helper function to get status styles
export const getStatusStyle = (status: string) => {
  const normalizedStatus = status.toLowerCase().replace(/\s+/g, '_');
  return STATUS_STYLES[normalizedStatus as keyof typeof STATUS_STYLES] || STATUS_STYLES.pending;
};
