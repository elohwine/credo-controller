import React, { useEffect, useState } from 'react'
import { Button, Group, SegmentedControl } from '@mantine/core'
import { IconDownload, IconLayoutGrid, IconTable } from '@tabler/icons-react'
import { canExportReports } from '@/lib/exportFile'
import type { FinanceListView } from './FinanceListTable'

/**
 * Cards / Table switch for the finance lists, remembered on this device. Same file on the
 * website (`credo-ui/portal/components/finance/FinanceViewToggle.tsx`) and the phone
 * (`credo-ui/mobile/components/shared/FinanceViewToggle.tsx`).
 */

const STORAGE_KEY = 'credoFinanceListView'

export function useFinanceListView(): [FinanceListView, (view: FinanceListView) => void] {
  const [view, setViewState] = useState<FinanceListView>('cards')
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === 'table' || stored === 'cards') setViewState(stored)
    } catch {
      // storage unavailable: keep cards
    }
  }, [])
  const setView = (next: FinanceListView) => {
    setViewState(next)
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  }
  return [view, setView]
}

export function FinanceViewToggle({
  view,
  onChange,
  onExport,
  exporting = false,
}: {
  view: FinanceListView
  onChange: (view: FinanceListView) => void
  /** When given and the person may export, an "Export CSV" button downloads the visible table. */
  onExport?: () => void
  exporting?: boolean
}) {
  const [canExport, setCanExport] = useState(false)
  useEffect(() => { setCanExport(canExportReports()) }, [])
  return (
    <Group gap="xs" wrap="nowrap">
      {onExport && canExport && view === 'table' && (
        <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} onClick={onExport} loading={exporting}>
          Export CSV
        </Button>
      )}
      <SegmentedControl
        size="xs"
        value={view}
        onChange={(value) => onChange(value as FinanceListView)}
        aria-label="List layout"
        data={[
          { value: 'cards', label: <Group gap={4} wrap="nowrap"><IconLayoutGrid size={14} /><span>Cards</span></Group> },
          { value: 'table', label: <Group gap={4} wrap="nowrap"><IconTable size={14} /><span>Table</span></Group> },
        ]}
      />
    </Group>
  )
}
