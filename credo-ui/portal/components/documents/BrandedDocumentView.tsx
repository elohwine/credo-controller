import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Group, Loader, Stack, Text } from '@mantine/core';
import { IconDownload, IconPrinter } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

import { DOCUMENT_TITLES, renderDocumentHtml, type DocumentBrand, type DocumentModel } from '@/lib/brandedDocument';
import { downloadDocumentPdf, fetchOrgBrand } from '@/lib/documentDownload';
import { isCapacitorNativeRuntime } from '@/lib/documentRuntime';

interface Props {
  model: DocumentModel;
  /** Whose brand to use. Fetched as it stood at `model.issuedAt`. */
  orgTenantId?: string;
  /** Used when the organisation is unknown or has not set a brand yet. */
  fallbackName?: string;
  brand?: DocumentBrand;
  height?: number;
}

/** A quote, invoice or receipt in the issuing organisation's brand, with PDF download and printing. */
export default function BrandedDocumentView({ model, orgTenantId, fallbackName, brand: givenBrand, height = 520 }: Props) {
  const [brand, setBrand] = useState<DocumentBrand | undefined>(givenBrand);
  const [loading, setLoading] = useState(!givenBrand && Boolean(orgTenantId));
  const [saving, setSaving] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (givenBrand) {
      setBrand(givenBrand);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(Boolean(orgTenantId));
    fetchOrgBrand(orgTenantId, model.issuedAt).then((found) => {
      if (!live) return;
      setBrand(found);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [givenBrand, orgTenantId, model.issuedAt]);

  const effective: DocumentBrand = useMemo(
    () => brand || { displayName: fallbackName || 'Organisation' },
    [brand, fallbackName],
  );
  const html = useMemo(() => renderDocumentHtml(model, effective), [model, effective]);
  const canPrint = typeof window !== 'undefined' && !isCapacitorNativeRuntime();

  const download = async () => {
    setSaving(true);
    try {
      await downloadDocumentPdf(model, effective);
    } catch (error: any) {
      notifications.show({ color: 'red', title: 'Could not save the PDF', message: error?.message || 'Try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Group justify="center" py="lg">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">Loading {DOCUMENT_TITLES[model.kind].toLowerCase()}…</Text>
      </Group>
    );
  }

  return (
    <Stack gap="xs">
      <iframe
        ref={frame}
        title={DOCUMENT_TITLES[model.kind]}
        srcDoc={html}
        sandbox="allow-same-origin allow-modals"
        style={{ width: '100%', height, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}
      />
      <Group grow>
        <Button leftSection={<IconDownload size={16} />} loading={saving} onClick={download}>
          {isCapacitorNativeRuntime() ? 'Save or send PDF' : 'Download PDF'}
        </Button>
        {canPrint ? (
          <Button variant="light" leftSection={<IconPrinter size={16} />} onClick={() => frame.current?.contentWindow?.print()}>
            Print
          </Button>
        ) : null}
      </Group>
      {!brand?.configured ? (
        <Text size="xs" c="dimmed">This organisation has not set up its brand yet, so a plain layout is used.</Text>
      ) : null}
    </Stack>
  );
}
