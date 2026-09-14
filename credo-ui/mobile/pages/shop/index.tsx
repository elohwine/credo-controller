import React, { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Paper,
  Modal,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconBuildingStore,
  IconCheck,
  IconChevronRight,
  IconHeart,
  IconQrcode,
  IconShoppingBag,
  IconShieldCheck,
  IconStarFilled,
  IconTool,
} from '@tabler/icons-react';
import { useRouter } from 'next/router';
import axios from 'axios';
import AppShellMobile from '@/components/layout/AppShellMobile';
import { notifications } from '@mantine/notifications';
import { getOrgToken, getPersonalWalletToken } from '@/lib/auth';
import { resolveMobileApiBaseUrl } from '@/lib/baseUrl';

type StorefrontService = {
  id: string;
  name: string;
  description?: string;
  serviceType: string;
  vcType?: string;
  workflowTemplateId?: string;
  requirements?: string[];
  feeAmount?: number;
  feeCurrency?: string;
  requestSchema?: Record<string, any>;
};

type CatalogItem = {
  id: string;
  merchantId: string;
  title: string;
  description?: string;
  price: number;
  currency: string;
  category?: string;
  images: string[];
};

type StorefrontSummary = {
  orgId: string;
  tenantId: string;
  displayName: string;
  description?: string;
  category?: string;
  verificationStatus?: string;
  trustScore?: number;
  paymentRails?: string[];
  trustBadges?: Array<{ type: string; label: string; issuedAt: string; revoked: boolean }>;
  services?: StorefrontService[];
  qrCodeUrl?: string;
  didDocumentUrl?: string;
};

type RequestField = {
  key: string;
  label: string;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  type?: string;
};

function getStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePaymentCodeFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const payIndex = parts.findIndex((part) => part === 'pay' || part === 'v');
    if (payIndex >= 0 && parts[payIndex + 1]) {
      return decodeURIComponent(parts[payIndex + 1]);
    }
  } catch {
    const match = url.match(/\/(?:pay|v)\/([^/?#]+)/i);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

function buildRequestFields(service: StorefrontService | null): RequestField[] {
  if (!service?.requestSchema || typeof service.requestSchema !== 'object') {
    return (service?.requirements || []).map((requirement, index) => ({
      key: `requirement_${index}`,
      label: requirement,
      required: true,
      placeholder: requirement,
      type: 'text',
    }));
  }

  const schema: any = service.requestSchema;
  const requiredKeys = new Set<string>(Array.isArray(schema.required) ? schema.required.map(String) : []);
  const fields: RequestField[] = [];

  if (Array.isArray(schema.fields)) {
    for (const field of schema.fields) {
      if (!field) continue;
      const key = String(field.key || field.name || field.id || field.label || '').trim();
      if (!key) continue;
      fields.push({
        key,
        label: String(field.label || field.title || key),
        required: Boolean(field.required ?? requiredKeys.has(key)),
        placeholder: getStringValue(field.placeholder) || undefined,
        helpText: getStringValue(field.helpText) || undefined,
        type: String(field.type || 'text'),
      });
    }
    if (fields.length > 0) return fields;
  }

  if (schema.properties && typeof schema.properties === 'object') {
    for (const [key, property] of Object.entries(schema.properties)) {
      const prop: any = property || {};
      fields.push({
        key,
        label: String(prop.title || prop.label || key),
        required: requiredKeys.has(key),
        placeholder: getStringValue(prop.description) || undefined,
        helpText: getStringValue(prop.examples?.[0]) || undefined,
        type: String(prop.type || 'text'),
      });
    }
  }

  if (fields.length > 0) return fields;

  return (service?.requirements || []).map((requirement, index) => ({
    key: `requirement_${index}`,
    label: requirement,
    required: true,
    placeholder: requirement,
    type: 'text',
  }));
}

function getQueryValue(asPath: string, key: string): string {
  const directMatch = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get(key);
  if (directMatch && directMatch.trim().length > 0) {
    return directMatch.trim().replace(/=+$/, '');
  }

  const queryIndex = asPath.indexOf('?');
  if (queryIndex === -1) return '';

  const rawQuery = asPath.slice(queryIndex + 1);
  if (!rawQuery) return '';

  const decodedQuery = (() => {
    try {
      return decodeURIComponent(rawQuery);
    } catch {
      return rawQuery;
    }
  })();

  const patterns = [
    new RegExp(`(?:^|&)${key}=([^&]+)`),
    new RegExp(`(?:^|&)${key}%3D([^&]+)`, 'i'),
    new RegExp(`(?:^|&)${key}=([^&]+)=?`),
  ];

  for (const candidate of [rawQuery, decodedQuery]) {
    for (const pattern of patterns) {
      const match = candidate.match(pattern);
      if (match?.[1]) {
        return match[1].trim().replace(/=+$/, '');
      }
    }
  }

  const params = new URLSearchParams(decodedQuery);
  const value = params.get(key) || '';
  return value.trim().replace(/=+$/, '');
}

function ServiceCard({ service, dark }: { service: StorefrontService; dark: boolean }) {
  const fee = Number(service.feeAmount || 0);
  return (
    <Paper
      withBorder
      radius="xl"
      p="md"
      style={{
        background: dark
          ? 'linear-gradient(160deg, rgba(17,24,39,0.92), rgba(15,23,42,0.95))'
          : 'linear-gradient(160deg, rgba(255,255,255,0.95), rgba(240,252,250,0.92))',
        borderColor: dark ? 'rgba(45,212,191,0.28)' : 'rgba(13,148,136,0.18)',
      }}
    >
      <Stack gap={8}>
        <Group justify="space-between" align="start" wrap="nowrap">
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text fw={700} size="sm" truncate c={dark ? 'gray.0' : undefined}>
              {service.name}
            </Text>
            <Text size="xs" c="dimmed" mt={4} lineClamp={2}>
              {service.description || service.vcType || service.serviceType}
            </Text>
          </Box>
          <ThemeIcon variant="light" color="teal" radius="xl" size={34}>
            <IconTool size={16} />
          </ThemeIcon>
        </Group>

        <Group gap={6} wrap="wrap">
          {service.vcType && (
            <Badge size="sm" variant="light" color="teal">
              {service.vcType}
            </Badge>
          )}
          {service.workflowTemplateId && (
            <Badge size="sm" variant="light" color="grape">
              Workflow
            </Badge>
          )}
          {typeof service.feeAmount === 'number' && (
            <Badge size="sm" variant="light" color="blue">
              {service.feeCurrency || 'USD'} {service.feeAmount.toFixed(2)}
            </Badge>
          )}
        </Group>

        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            {fee > 0 ? 'Paid request' : 'Free request'}
          </Text>
          <Group gap={4} align="center">
            <IconStarFilled size={12} color="#f59e0b" />
            <Text size="xs" fw={600} c={dark ? 'gray.0' : 'dark'}>
              Trusted service
            </Text>
          </Group>
        </Group>

        {Array.isArray(service.requirements) && service.requirements.length > 0 && (
          <Stack gap={4}>
            {service.requirements.slice(0, 3).map((req) => (
              <Group key={req} gap={6} wrap="nowrap" align="flex-start">
                <IconCheck size={12} color="green" style={{ marginTop: 3 }} />
                <Text size="xs" c="dimmed">
                  {req}
                </Text>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

function ProductCard({ item, dark }: { item: CatalogItem; dark: boolean }) {
  return (
    <Paper
      withBorder
      radius="xl"
      p="md"
      style={{
        background: dark
          ? 'linear-gradient(165deg, rgba(17,24,39,0.94), rgba(30,41,59,0.88))'
          : 'linear-gradient(165deg, rgba(255,255,255,0.96), rgba(239,246,255,0.9))',
        borderColor: dark ? 'rgba(56,189,248,0.24)' : 'rgba(2,132,199,0.2)',
      }}
    >
      <Stack gap={10}>
        <Box
          style={{
            height: 120,
            borderRadius: 14,
            background: 'linear-gradient(145deg, #dbeafe, #f8fafc 60%, #cffafe)',
            border: '1px solid rgba(148,163,184,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ThemeIcon variant="white" color="blue" radius="xl" size={40}>
            <IconShoppingBag size={20} />
          </ThemeIcon>
        </Box>

        <Group justify="space-between" align="start" wrap="nowrap">
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text fw={700} size="sm" truncate>
              {item.title}
            </Text>
            <Text size="xs" c="dimmed" mt={4} lineClamp={2}>
              {item.description || item.category || 'Published good'}
            </Text>
          </Box>
          <ActionIcon variant="light" color="gray" radius="xl" size={32}>
            <IconHeart size={16} />
          </ActionIcon>
        </Group>

        <Group justify="space-between" align="center">
          <Badge size="lg" variant="light" color="blue">
            {item.currency} {Number(item.price || 0).toFixed(2)}
          </Badge>
          {item.category && (
            <Text size="xs" c="dimmed" fw={600}>
              {item.category}
            </Text>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}

function pickFieldValue(field: RequestField, values: Record<string, string>): string {
  return values[field.key] || '';
}

async function fetchJsonWithGuards(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
  });

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!res.ok) {
    throw new Error(`Storefront unavailable (${res.status})`);
  }

  if (!contentType.includes('application/json')) {
    throw new Error('Storefront endpoint returned HTML instead of JSON. Check active API tunnel/host.');
  }

  return await res.json();
}

export default function ShopPage() {
  const router = useRouter();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storefront, setStorefront] = useState<StorefrontSummary | null>(null);
  const [services, setServices] = useState<StorefrontService[]>([]);
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [selectedService, setSelectedService] = useState<StorefrontService | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<CatalogItem | null>(null);
  const [requestNotes, setRequestNotes] = useState('');
  const [requestValues, setRequestValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [activeView, setActiveView] = useState<'products' | 'services'>('products');

  const backendUrl = resolveMobileApiBaseUrl();

  const orgId = useMemo(() => {
    if (!router.isReady) return '';
    return getQueryValue(router.asPath, 'orgId') || getQueryValue(router.asPath, 'merchantId');
  }, [router.asPath, router.isReady]);

  const merchantId = useMemo(() => {
    if (!router.isReady) return '';
    return getQueryValue(router.asPath, 'merchantId') || getQueryValue(router.asPath, 'orgTenantId');
  }, [router.asPath, router.isReady]);

  const groupedProducts = useMemo(() => {
    const groups: Record<string, CatalogItem[]> = {};
    for (const item of products) {
      const key = item.category || 'Uncategorized';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [products]);

  const productCategories = useMemo(() => Object.keys(groupedProducts).sort(), [groupedProducts]);
  const selectedServiceFields = useMemo(() => buildRequestFields(selectedService), [selectedService]);
  const selectedServiceHasFee = Number(selectedService?.feeAmount || 0) > 0;

  const clearActionModal = () => {
    setSelectedService(null);
    setSelectedProduct(null);
    setRequestNotes('');
    setRequestValues({});
  };

  const openServiceFlow = (service: StorefrontService) => {
    setSelectedProduct(null);
    setSelectedService(service);
    setRequestNotes('');
    setRequestValues({});
  };

  const openProductFlow = (item: CatalogItem) => {
    setSelectedService(null);
    setSelectedProduct(item);
    setRequestNotes('');
    setRequestValues({});
  };

  const createPaymentLink = async (payload: {
    description: string;
    amount: number;
    currency: string;
    invoiceRef: string;
    productId?: string;
    serviceId?: string;
  }) => {
    const orgToken = getOrgToken();
    let code: string | null = null;
    let linkId: string | null = null;

    if (orgToken) {
      const res = await axios.post(
        `${backendUrl}/api/payment-links`,
        {
          description: payload.description,
          amount: payload.amount,
          currency: payload.currency,
          invoiceRef: payload.invoiceRef,
          merchantName: storefront?.displayName || 'Organization Store',
          sector: 'general',
        },
        {
          headers: {
            Authorization: `Bearer ${orgToken}`,
            'x-idempotency-key': `mobile-shop-payment-link:${payload.invoiceRef}:${payload.amount}:${payload.currency}:${payload.productId || payload.serviceId || 'catalog'}`,
          },
        }
      );

      linkId = res.data?.link?.id || null;
      const shortUrl = res.data?.shortUrl || res.data?.link?.shortlinkUrl;
      code = res.data?.link?.shortlinkCode || parsePaymentCodeFromUrl(shortUrl);
    } else {
      const res = await axios.post(`${backendUrl}/api/public/pay/storefront/checkout-link`, {
        orgId: storefront?.orgId || orgId,
        merchantId: storefront?.tenantId || merchantId,
        productId: payload.productId,
        serviceId: payload.serviceId,
      });

      linkId = res.data?.linkId || null;
      code = res.data?.code || parsePaymentCodeFromUrl(res.data?.url);
    }

    const routeToken = code || linkId;
    if (!routeToken) {
      throw new Error('Payment link created, but no checkout reference was returned.');
    }

    await router.push(`/pay/${encodeURIComponent(routeToken)}?orgTenantId=${encodeURIComponent(storefront?.tenantId || orgId)}`);
  };

  const submitServiceFlow = async () => {
    if (!selectedService) return;

    const walletToken = getPersonalWalletToken();
    if (!walletToken) {
      notifications.show({
        title: 'Login required',
        message: 'Please sign in with your wallet to request this service.',
        color: 'blue',
      });
      void router.push(`/login?returnTo=${encodeURIComponent(router.asPath)}`);
      return;
    }

    setSubmitting(true);
    try {
      const requestPayload: Record<string, any> = {};
      for (const field of selectedServiceFields) {
        const value = pickFieldValue(field, requestValues);
        if (field.required && !value.trim()) {
          throw new Error(`Please provide ${field.label}.`);
        }
        if (value.trim()) requestPayload[field.key] = value.trim();
      }

      if (requestNotes.trim()) {
        requestPayload.notes = requestNotes.trim();
      }

      requestPayload.source = 'mobile-mini-store';
      requestPayload.orgId = storefront?.orgId;
      requestPayload.orgName = storefront?.displayName;
      requestPayload.serviceName = selectedService.name;
      requestPayload.serviceType = selectedService.serviceType;
      requestPayload.vcType = selectedService.vcType;

      const response = await axios.post(
        `${backendUrl}/api/vc-requests`,
        {
          serviceId: selectedService.id,
          requestPayload,
          consent: true,
        },
        {
          headers: { Authorization: `Bearer ${walletToken}` },
        }
      );

      notifications.show({
        title: 'Service request started',
        message: `${selectedService.name} has been submitted successfully.`,
        color: 'green',
      });

      const requestId = response.data?.id || response.data?.requestId;
      if (selectedServiceHasFee) {
        await createPaymentLink({
          description: `${storefront?.displayName || 'Organization'} - ${selectedService.name}`,
          amount: Number(selectedService.feeAmount || 0),
          currency: selectedService.feeCurrency || 'USD',
          invoiceRef: requestId || selectedService.id,
          serviceId: selectedService.id,
        });
        return;
      }

      clearActionModal();
    } catch (e: any) {
      notifications.show({
        title: 'Service request failed',
        message: e?.response?.data?.message || e?.message || 'Unable to start service request.',
        color: 'red',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitProductFlow = async () => {
    if (!selectedProduct) return;

    setSubmitting(true);
    try {
      await createPaymentLink({
        description: `${storefront?.displayName || 'Organization'} - ${selectedProduct.title}`,
        amount: Number(selectedProduct.price || 0),
        currency: selectedProduct.currency || 'USD',
        invoiceRef: selectedProduct.id,
        productId: selectedProduct.id,
      });
    } catch (e: any) {
      notifications.show({
        title: 'Payment flow unavailable',
        message: e?.message || 'Unable to open checkout from this context.',
        color: 'red',
      });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!router.isReady) return;

    let cancelled = false;

    const loadStorefront = async () => {
      setLoading(true);
      setError('');

      if (!orgId) {
        setStorefront(null);
        setServices([]);
        setProducts([]);
        setError('Missing organization reference for this storefront.');
        setLoading(false);
        return;
      }

      try {
        const storefrontCandidates = [orgId, merchantId].filter(Boolean);
        let loaded = false;

        for (const candidate of storefrontCandidates) {
          try {
            const data = await fetchJsonWithGuards(
              `${backendUrl}/api/discovery/organizations/${encodeURIComponent(candidate)}/storefront`
            );
            if (cancelled) return;

            const resolvedServices = Array.isArray(data?.services) ? data.services : [];
            const resolvedProducts = Array.isArray(data?.catalogItems) ? data.catalogItems : [];

            setStorefront({
              orgId: data?.orgId || candidate,
              tenantId: data?.tenantId || candidate,
              displayName: data?.displayName || 'Organization Store',
              description: data?.description,
              category: data?.category,
              verificationStatus: data?.verificationStatus,
              trustScore: Number(data?.trustScore || 0),
              paymentRails: Array.isArray(data?.paymentRails) ? data.paymentRails : [],
              trustBadges: Array.isArray(data?.trustBadges) ? data.trustBadges : [],
              services: resolvedServices,
              qrCodeUrl: data?.qrCodeUrl,
              didDocumentUrl: data?.didDocumentUrl,
            });
            setServices(resolvedServices);
            setProducts(resolvedProducts);
            loaded = true;
            break;
          } catch {
            // try next candidate
          }
        }

        if (!loaded && merchantId) {
          const catalogRes = await fetchJsonWithGuards(
            `${backendUrl}/api/catalog/merchant/${encodeURIComponent(merchantId)}/items`
          );
          if (cancelled) return;

          const catalogItems = Array.isArray(catalogRes)
            ? catalogRes
            : Array.isArray(catalogRes?.items)
              ? catalogRes.items
              : [];

          setStorefront({
            orgId: orgId || merchantId,
            tenantId: merchantId,
            displayName: 'Organization Store',
            paymentRails: [],
            trustBadges: [],
            services: [],
          });
          setServices([]);
          setProducts(catalogItems as CatalogItem[]);
          loaded = true;
        }

        if (!loaded) {
          throw new Error('Failed to load storefront.');
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load storefront.');
          setStorefront(null);
          setServices([]);
          setProducts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadStorefront();

    return () => {
      cancelled = true;
    };
  }, [backendUrl, merchantId, orgId, router.isReady]);

  return (
    <AppShellMobile>
      <Box p="md">
        <Group justify="space-between" align="center" mb="md">
          <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => router.back()}>
            Back
          </Button>
          <Text size="sm" c="dimmed">
            Mini Store
          </Text>
        </Group>

        {loading ? (
          <Stack align="center" gap="md" py="xl">
            <Loader />
            <Text size="sm" c="dimmed">
              Loading organization mini store...
            </Text>
          </Stack>
        ) : error ? (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {error}
          </Alert>
        ) : storefront ? (
          <Stack gap="md">
            <Paper
              withBorder
              radius="xl"
              p="lg"
              style={{
                background: isDark
                  ? 'linear-gradient(145deg, #111827 0%, #0f172a 58%, #020617 100%)'
                  : 'linear-gradient(145deg, #ffffff 0%, #eef2ff 58%, #ecfeff 100%)',
                color: isDark ? '#f8fafc' : '#0f172a',
                borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(2,132,199,0.16)',
              }}
            >
              <Stack gap="sm">
                <Group gap="xs">
                  <ThemeIcon variant="filled" color="teal" radius="xl">
                    <IconBuildingStore size={18} />
                  </ThemeIcon>
                  <Badge color="teal" variant="filled">
                    {storefront.verificationStatus || 'published'}
                  </Badge>
                  {typeof storefront.trustScore === 'number' && (
                    <Badge color="blue" variant="filled">
                      Trust {storefront.trustScore.toFixed(0)}
                    </Badge>
                  )}
                </Group>

                <Title order={2} style={{ letterSpacing: 0.2 }}>
                  {storefront.displayName}
                </Title>
                <Text size="sm" c={isDark ? 'gray.3' : 'dimmed'}>
                  {storefront.description || 'Browse this organization’s services and goods in one mini store.'}
                </Text>

                <Progress
                  value={Math.max(8, Math.min(100, Number((storefront.trustScore || 0) * 20)))}
                  color="teal"
                  radius="xl"
                  size="sm"
                />

                <Group gap="xs" wrap="wrap">
                  {Array.isArray(storefront.paymentRails) && storefront.paymentRails.map((rail) => (
                    <Badge key={rail} size="sm" variant="white" color="cyan">
                      {rail}
                    </Badge>
                  ))}
                </Group>
              </Stack>
            </Paper>

            <Paper withBorder radius="xl" p="md">
              <Stack gap="md">
                <SegmentedControl
                  value={activeView}
                  onChange={(value) => setActiveView(value as 'products' | 'services')}
                  fullWidth
                  data={[
                    { label: `Products (${products.length})`, value: 'products' },
                    { label: `Services (${services.length})`, value: 'services' },
                  ]}
                />

                {activeView === 'services' ? (
                  services.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      No services published for this organization yet.
                    </Text>
                  ) : (
                    <Stack gap="sm">
                      {services.map((service) => (
                        <Box key={service.id} onClick={() => openServiceFlow(service)} style={{ cursor: 'pointer' }}>
                          <ServiceCard service={service} dark={isDark} />
                        </Box>
                      ))}
                    </Stack>
                  )
                ) : products.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No products or goods published for this organization yet.
                  </Text>
                ) : (
                  <Stack gap="md">
                    {productCategories.map((category) => (
                      <Box key={category}>
                        <Group justify="space-between" mb="xs">
                          <Text fw={700} size="sm">
                            {category}
                          </Text>
                          <Badge size="sm" variant="light" color="gray">
                            {groupedProducts[category].length}
                          </Badge>
                        </Group>
                        <SimpleGrid cols={1} spacing="sm">
                          {groupedProducts[category].map((item) => (
                            <Box key={item.id} onClick={() => openProductFlow(item)} style={{ cursor: 'pointer' }}>
                                <ProductCard item={item} dark={isDark} />
                            </Box>
                          ))}
                        </SimpleGrid>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Paper>

            {(storefront.qrCodeUrl || storefront.didDocumentUrl) && (
              <Paper withBorder radius="lg" p="md">
                <Group gap="xs" mb="sm">
                  <IconShieldCheck size={16} />
                  <Text fw={700}>Trust Links</Text>
                </Group>
                <Stack gap={4}>
                  {storefront.qrCodeUrl && (
                    <Text size="xs" c="dimmed">
                      <IconQrcode size={12} style={{ display: 'inline', marginRight: 6 }} />
                      QR: {storefront.qrCodeUrl}
                    </Text>
                  )}
                  {storefront.didDocumentUrl && (
                    <Text size="xs" c="dimmed">
                      DID: {storefront.didDocumentUrl}
                    </Text>
                  )}
                </Stack>
              </Paper>
            )}
          </Stack>
        ) : (
          <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
            This organization storefront could not be loaded.
          </Alert>
        )}

        <Modal
          opened={Boolean(selectedService || selectedProduct)}
          onClose={clearActionModal}
          title={selectedService?.name || selectedProduct?.title || 'Start Flow'}
          centered
        >
          {selectedService ? (
            <Stack gap="md">
              <Paper
                withBorder
                radius="xl"
                p="md"
                style={{ background: 'linear-gradient(145deg, rgba(20,184,166,0.12), rgba(14,116,144,0.08))' }}
              >
                <Group justify="space-between" align="start">
                  <Box style={{ flex: 1 }}>
                    <Text fw={700}>{selectedService.name}</Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      {selectedService.description || selectedService.vcType || selectedService.serviceType}
                    </Text>
                  </Box>
                  <Badge color={selectedServiceHasFee ? 'blue' : 'teal'} variant="light">
                    {selectedServiceHasFee
                      ? `${selectedService.feeCurrency || 'USD'} ${Number(selectedService.feeAmount || 0).toFixed(2)}`
                      : 'Free'}
                  </Badge>
                </Group>
              </Paper>

              <Alert color="teal" icon={<IconTool size={16} />}>
                {selectedService.description || selectedService.vcType || selectedService.serviceType}
              </Alert>

              <Divider label="Request details" labelPosition="center" />

              <Paper withBorder radius="md" p="sm">
                <Stack gap={6}>
                  <Group justify="space-between">
                    <Text size="sm" fw={600}>Mandatory items</Text>
                    <Badge size="sm" variant="light">{selectedServiceFields.filter((field) => field.required).length}</Badge>
                  </Group>
                  {selectedServiceFields.filter((field) => field.required).length === 0 ? (
                    <Text size="xs" c="dimmed">No mandatory fields. You can proceed with notes only.</Text>
                  ) : (
                    selectedServiceFields.filter((field) => field.required).map((field) => (
                      <TextInput
                        key={field.key}
                        label={field.label}
                        placeholder={field.placeholder || field.label}
                        value={requestValues[field.key] || ''}
                        onChange={(event) => setRequestValues((current) => ({ ...current, [field.key]: event.currentTarget.value }))}
                        required
                      />
                    ))
                  )}
                </Stack>
              </Paper>

              {selectedServiceFields.some((field) => !field.required) && (
                <Paper withBorder radius="md" p="sm">
                  <Stack gap={6}>
                    <Group justify="space-between">
                      <Text size="sm" fw={600}>Optional items</Text>
                      <Badge size="sm" variant="light">{selectedServiceFields.filter((field) => !field.required).length}</Badge>
                    </Group>
                    {selectedServiceFields.filter((field) => !field.required).map((field) => (
                      <TextInput
                        key={field.key}
                        label={field.label}
                        placeholder={field.placeholder || field.label}
                        value={requestValues[field.key] || ''}
                        onChange={(event) => setRequestValues((current) => ({ ...current, [field.key]: event.currentTarget.value }))}
                      />
                    ))}
                  </Stack>
                </Paper>
              )}

              {selectedService.requirements?.length ? (
                <Paper withBorder radius="md" p="sm">
                  <Text size="sm" fw={600} mb="xs">Required checks</Text>
                  <Stack gap={4}>
                    {selectedService.requirements.map((requirement) => (
                      <Group key={requirement} gap={6} wrap="nowrap" align="flex-start">
                        <IconCheck size={12} color="green" style={{ marginTop: 3 }} />
                        <Text size="xs" c="dimmed">{requirement}</Text>
                      </Group>
                    ))}
                  </Stack>
                </Paper>
              ) : null}

              <Textarea
                label="Notes"
                placeholder="Describe timing, delivery, extras, or special instructions."
                value={requestNotes}
                onChange={(event) => setRequestNotes(event.currentTarget.value)}
                minRows={3}
              />

              <Button
                onClick={submitServiceFlow}
                loading={submitting}
                rightSection={selectedServiceHasFee ? <IconChevronRight size={16} /> : undefined}
                radius="xl"
              >
                {selectedServiceHasFee ? 'Continue to Payment' : 'Submit Service Request'}
              </Button>
            </Stack>
          ) : selectedProduct ? (
            <Stack gap="md">
              <Paper
                withBorder
                radius="xl"
                p="md"
                style={{ background: 'linear-gradient(145deg, rgba(59,130,246,0.13), rgba(14,165,233,0.07))' }}
              >
                <Stack gap={8}>
                  <Box
                    style={{
                      height: 132,
                      borderRadius: 14,
                      background: 'linear-gradient(145deg, #eff6ff, #f8fafc 65%, #cffafe)',
                      border: '1px solid rgba(148,163,184,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ThemeIcon variant="white" color="blue" radius="xl" size={44}>
                      <IconShoppingBag size={22} />
                    </ThemeIcon>
                  </Box>
                  <Group justify="space-between" align="start">
                    <Box style={{ flex: 1 }}>
                      <Text fw={700}>{selectedProduct.title}</Text>
                      <Text size="xs" c="dimmed" mt={4}>
                        {selectedProduct.description || selectedProduct.category || 'Published product'}
                      </Text>
                    </Box>
                    <Badge color="blue" variant="filled" size="lg">
                      {selectedProduct.currency} {Number(selectedProduct.price || 0).toFixed(2)}
                    </Badge>
                  </Group>
                </Stack>
              </Paper>

              <Paper withBorder radius="md" p="sm">
                <Text size="sm" fw={600}>Checkout</Text>
                <Text size="xs" c="dimmed" mt={4}>
                  You will be taken to the secure checkout screen for payment and receipt capture.
                </Text>
              </Paper>

              <Button
                onClick={submitProductFlow}
                loading={submitting}
                rightSection={<IconChevronRight size={16} />}
                radius="xl"
              >
                Buy Now
              </Button>
            </Stack>
          ) : null}
        </Modal>
      </Box>
    </AppShellMobile>
  );
}