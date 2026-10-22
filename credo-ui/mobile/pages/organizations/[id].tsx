import React, { useEffect, useState } from 'react';
import {
  Box, Stack, Text, Title, Group, Button, Badge, Paper, ThemeIcon, Divider, Avatar, Modal, TextInput, Textarea, Skeleton, Alert, Select
} from '@mantine/core';
import {
  IconBuilding, IconShieldCheck, IconStar, IconWorld, IconPhone, IconMail, IconMapPin, IconArrowLeft, IconCheck, IconAlertCircle, IconFileText, IconQrcode, IconMessagePlus
} from '@tabler/icons-react';
import { useRouter } from 'next/router';
import { notifications } from '@mantine/notifications';
import AppShellMobile from '@/components/layout/AppShellMobile';
import { getPersonalWalletToken, getPreferredToken, getUserName, getWalletToken, isAuthenticated } from '@/lib/auth';
import api from '@/lib/api';

/** What a person can ask another organisation for. Same words as the Request sheet. */
type AskKind = 'quote' | 'invoice' | 'service';
const ASK_KINDS: Array<{ value: AskKind; label: string; hint: string }> = [
  { value: 'quote', label: 'Ask for a quote', hint: 'Tell them what you need and they send a price.' },
  { value: 'invoice', label: 'Ask for a bill', hint: 'They send a bill you can pay from the app.' },
  { value: 'service', label: 'Book a service', hint: 'They confirm and tell you what happens next.' },
];

interface Organization {
  id: string;
  tenantId: string;
  displayName: string;
  description?: string;
  logoUrl?: string;
  category: string;
  trustScore: number;
  verificationStatus: string;
  issuerDid: string;
  website?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
}

interface Service {
  id: string;
  name: string;
  description?: string;
  vcType?: string;
  workflowTemplateId?: string;
  requirements: string[];
  turnaroundTime?: string;
  feeAmount: number;
  feeCurrency: string;
  requestSchema: any;
  /** What asking for it creates: a quote, a bill, or a booked job. */
  requestType?: AskKind;
  /** Plain names of the cards the customer keeps. */
  youGet?: string[];
  workArea?: string;
}

interface OrganizationProfile {
  org: Organization;
  services: Service[];
  trustBadges?: TrustBadge[];
  paymentRails?: string[];
  isPublic?: boolean;
  qrCodeUrl?: string;
  didDocumentUrl?: string;
  catalogItems?: CatalogItem[];
  shopUrl?: string;
  memberSince?: string;
  workAreas?: string[];
  sellsGoods?: boolean;
}

interface TrustBadge {
  type: string;
  label: string;
  issuedAt: string;
  revoked: boolean;
}

interface StorefrontApiResponse {
  orgId: string;
  tenantId?: string;
  isPublic?: boolean;
  did: string;
  displayName: string;
  description?: string;
  logoUrl?: string;
  category: string;
  trustScore: number;
  verificationStatus: string;
  trustBadges: TrustBadge[];
  services: Service[];
  catalogItems?: CatalogItem[];
  paymentRails: string[];
  memberSince?: string;
  workAreas?: string[];
  sellsGoods?: boolean;
  contactLinks?: {
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    address?: string | null;
  };
  qrCodeUrl?: string;
  didDocumentUrl?: string;
  shopUrl?: string;
}

interface CatalogItem {
  id: string;
  merchantId: string;
  title: string;
  description?: string;
  price: number;
  currency: string;
  category?: string;
}

interface OrganizationProfileApiResponse extends Partial<Organization> {
  org?: Organization;
  services?: Service[];
}

function ServiceCard({ service, onRequest }: { service: Service; onRequest: () => void }) {
  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between">
          <Box style={{ flex: 1 }}>
            <Text size="sm" fw={600} mb={4}>
              {service.name}
            </Text>
            {service.workArea && (
              <Badge size="xs" variant="light" color="gray" mb={4}>{service.workArea}</Badge>
            )}
            {service.description && (
              <Text size="xs" c="dimmed" lineClamp={2}>
                {service.description}
              </Text>
            )}
          </Box>
        </Group>

        <Divider />

        <Stack gap={4}>
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              Turnaround:
            </Text>
            <Text size="xs" fw={500}>
              {service.turnaroundTime || 'Variable'}
            </Text>
          </Group>

          <Group gap="xs">
            <Text size="xs" c="dimmed">
              Fee:
            </Text>
            <Text size="xs" fw={500}>
              {service.feeAmount > 0 ? `${service.feeCurrency} ${service.feeAmount}` : 'Price on request'}
            </Text>
          </Group>

          {service.youGet && service.youGet.length > 0 && (
            <Group gap="xs" wrap="nowrap" align="start">
              <Text size="xs" c="dimmed">
                You get:
              </Text>
              <Text size="xs" fw={500}>
                {service.youGet.join(', ')}
              </Text>
            </Group>
          )}

          {service.requirements?.length > 0 && (
            <Box>
              <Text size="xs" c="dimmed" mb={4}>
                Requirements:
              </Text>
              <Stack gap={2}>
                {service.requirements.slice(0, 3).map((req, i) => (
                  <Group key={i} gap={4} wrap="nowrap">
                    <IconCheck size={12} color="green" />
                    <Text size="xs" lineClamp={1}>
                      {req}
                    </Text>
                  </Group>
                ))}
                {service.requirements.length > 3 && (
                  <Text size="xs" c="dimmed">
                    +{service.requirements.length - 3} more
                  </Text>
                )}
              </Stack>
            </Box>
          )}
        </Stack>

        <Button size="sm" fullWidth onClick={onRequest}>
          {service.requestType === 'quote' ? 'Ask for a quote' : service.requestType === 'invoice' ? 'Ask for a bill' : 'Book this'}
        </Button>
      </Stack>
    </Paper>
  );
}

export default function OrganizationDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const source = typeof router.query.source === 'string' ? router.query.source : 'discover';
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [askKind, setAskKind] = useState<AskKind>('quote');
  const [askText, setAskText] = useState('');
  const [askName, setAskName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const askFromHome = typeof router.query.ask === 'string' ? router.query.ask : '';

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login?redirect=' + encodeURIComponent(router.asPath));
      return;
    }
    setCheckingAuth(false);
  }, [router]);

  useEffect(() => {
    if (checkingAuth || !id) return;
    loadOrganizationProfile();
  }, [checkingAuth, id]);

  const loadOrganizationProfile = async () => {
    setLoading(true);
    try {
      try {
        // Owners see their own profile even while it is private; everyone else gets the public one.
        const ownerToken = source === 'my-orgs' ? getPreferredToken() : null;
        const storefrontResponse = ownerToken
          ? await api.get(`/api/organizations/${id}/offerings/preview`, { headers: { Authorization: 'Bearer ' + ownerToken } })
            .catch(() => api.get(`/api/discovery/organizations/${id}/storefront`))
          : await api.get(`/api/discovery/organizations/${id}/storefront`);
        const storefront = (storefrontResponse.data || {}) as StorefrontApiResponse;

        if (!storefront?.orgId) {
          throw new Error('Invalid storefront response');
        }

        setProfile({
          org: {
            id: storefront.orgId,
            tenantId: storefront.tenantId || storefront.orgId,
            displayName: storefront.displayName || 'Organization',
            description: storefront.description,
            logoUrl: storefront.logoUrl,
            category: storefront.category || 'other',
            trustScore: Number(storefront.trustScore || 0),
            verificationStatus: storefront.verificationStatus || 'unverified',
            issuerDid: storefront.did || '',
            website: storefront.contactLinks?.website || undefined,
            contactPhone: storefront.contactLinks?.phone || undefined,
            contactEmail: storefront.contactLinks?.email || undefined,
            address: storefront.contactLinks?.address || undefined,
          },
          memberSince: storefront.memberSince,
          workAreas: Array.isArray(storefront.workAreas) ? storefront.workAreas : [],
          sellsGoods: typeof storefront.sellsGoods === 'boolean' ? storefront.sellsGoods : undefined,
          services: Array.isArray(storefront.services) ? storefront.services : [],
          catalogItems: Array.isArray(storefront.catalogItems) ? storefront.catalogItems : [],
          trustBadges: Array.isArray(storefront.trustBadges) ? storefront.trustBadges : [],
          paymentRails: Array.isArray(storefront.paymentRails) ? storefront.paymentRails : [],
          isPublic: typeof storefront.isPublic === 'boolean' ? storefront.isPublic : undefined,
          qrCodeUrl: storefront.qrCodeUrl,
          didDocumentUrl: storefront.didDocumentUrl,
          shopUrl: storefront.shopUrl,
        });

        if (source === 'my-orgs') {
          notifications.show({
            title: 'Owner preview',
            message: 'This is how other wallets see your public profile.',
            color: 'blue',
          });
        }
        return;
      } catch (storefrontError: any) {
        console.warn('Storefront endpoint unavailable, falling back to profile endpoint:', storefrontError?.message);
      }

      if (source !== 'my-orgs') {
        const response = await api.get(`/api/discovery/organizations/${id}`);
        const data = (response.data || {}) as OrganizationProfileApiResponse;

        const normalizedOrg: Organization | undefined = data.org || (data.id
          ? {
            id: data.id,
            tenantId: data.tenantId || '',
            displayName: data.displayName || 'Organization',
            description: data.description,
            logoUrl: data.logoUrl,
            category: data.category || 'other',
            trustScore: Number(data.trustScore || 0),
            verificationStatus: data.verificationStatus || 'unverified',
            issuerDid: data.issuerDid || '',
            website: data.website,
            contactPhone: data.contactPhone,
            contactEmail: data.contactEmail,
            address: data.address,
          }
          : undefined);

        if (!normalizedOrg) throw new Error('Invalid organization profile response');

        setProfile({
          org: normalizedOrg,
          services: Array.isArray(data.services) ? data.services : [],
          catalogItems: [],
          trustBadges: [],
          paymentRails: [],
          isPublic: undefined,
        });
        return;
      }

      throw new Error('Use membership fallback for my-org context');
    } catch (error: any) {
      try {
        const token = getWalletToken();
        const res = await api.get('/api/organizations', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const memberships = Array.isArray(res.data) ? res.data : [];
        const ownOrg = memberships.find((m: any) => (m.orgTenantId || m.id) === id);
        if (!ownOrg) throw new Error('Organization not found in memberships');

        setProfile({
          org: {
            id: ownOrg.orgTenantId || ownOrg.id,
            tenantId: ownOrg.orgTenantId || ownOrg.id,
            displayName: ownOrg.name || ownOrg.label || 'My Organization',
            description: ownOrg.domain ? `Domain: ${ownOrg.domain}` : (ownOrg.issuerDid ? `Issuer DID: ${ownOrg.issuerDid}` : undefined),
            category: 'organization',
            trustScore: 0,
            verificationStatus: 'verified',
            issuerDid: ownOrg.issuerDid || '',
          },
          services: [],
          catalogItems: [],
          trustBadges: [],
          paymentRails: [],
          isPublic: undefined,
        });

        if (source === 'my-orgs') {
          notifications.show({
            title: 'My Organization',
            message: 'Loaded from your organization account context.',
            color: 'blue',
          });
        }
      } catch {
        console.error('Failed to load organization:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to load organization details',
          color: 'red',
        });
        router.push('/organizations');
      }
    } finally {
      setLoading(false);
    }
  };

  const openRequestModal = (service: Service | null, kind: AskKind = 'service') => {
    setSelectedService(service);
    setAskKind(service ? (service.requestType || 'service') : kind);
    setAskText('');
    setAskName(getUserName() || '');
    setRequestModalOpen(true);
  };

  // Came from Home → Request → "Ask for a quote / bill / service": open the form straight away.
  useEffect(() => {
    if (!profile || source !== 'discover' || !askFromHome) return;
    const kind = ASK_KINDS.find((entry) => entry.value === askFromHome)?.value;
    if (kind) openRequestModal(null, kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org.id, askFromHome]);

  /**
   * Ask this organisation for a quote, a bill, or a service. The organisation adds you to its
   * contacts if you are new, and the request lands with the person who handles it.
   */
  const submitRequest = async () => {
    if (!profile) return;
    const token = getPersonalWalletToken() || getWalletToken();
    if (!token) {
      notifications.show({ title: 'Sign in first', message: 'Sign in to send a request.', color: 'red' });
      return;
    }
    if (!askText.trim()) {
      notifications.show({ title: 'Say what you need', message: 'A sentence or two is enough.', color: 'orange' });
      return;
    }

    setSubmitting(true);
    try {
      const kindWords = ASK_KINDS.find((entry) => entry.value === askKind) || ASK_KINDS[0];
      await api.post(
        '/workflow-requests',
        {
          targetOrgTenantId: profile.org.tenantId || profile.org.id,
          requesterName: askName.trim() || undefined,
          requestType: askKind,
          payload: {
            title: selectedService ? selectedService.name : kindWords.label,
            description: askText.trim(),
            serviceId: selectedService?.id,
            serviceName: selectedService?.name,
            workflowTemplateId: selectedService?.workflowTemplateId,
          },
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      notifications.show({
        title: 'Sent',
        message: `${profile.org.displayName} has your request. Their answer arrives in your inbox.`,
        color: 'green',
        icon: <IconCheck />,
      });
      setRequestModalOpen(false);
      void router.push('/my-requests');
    } catch (error: any) {
      notifications.show({
        title: 'Not sent',
        message: error.response?.data?.message || error.message || 'Try again in a moment.',
        color: 'red',
        icon: <IconAlertCircle />,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingAuth || loading) {
    return (
      <AppShellMobile>
        <Box p="md">
          <Skeleton height={200} mb="md" />
          <Skeleton height={100} mb="md" />
          <Skeleton height={100} />
        </Box>
      </AppShellMobile>
    );
  }

  if (!profile) {
    return (
      <AppShellMobile>
        <Box p="md">
          <Alert color="red" icon={<IconAlertCircle />}>
            Organization not found
          </Alert>
          <Button mt="md" onClick={() => router.push('/organizations')}>
            Back to Organizations
          </Button>
        </Box>
      </AppShellMobile>
    );
  }

  const { org, services, catalogItems = [], trustBadges = [], paymentRails = [], qrCodeUrl, didDocumentUrl, shopUrl } = profile;
  const storeVisibilityLabel = profile.isPublic === false ? 'Private: not in Discover' : profile.isPublic === true ? 'Found in Discover' : 'Visibility unknown';
  // Goods (products bought in the shop) are separate from services (work you ask or book).
  const sellsGoods = profile.sellsGoods ?? catalogItems.length > 0;
  const workAreas = profile.workAreas || [];
  const memberSince = profile.memberSince ? new Date(profile.memberSince) : null;
  const openShop = () => {
    void router.push(`/shop?orgId=${encodeURIComponent(org.id)}&merchantId=${encodeURIComponent(org.tenantId || org.id)}`);
  };

  return (
    <AppShellMobile>
      <Box>
        {/* Header */}
        <Box
          p="md"
          style={{
            background: 'light-dark(color-mix(in srgb, var(--mantine-color-white) 74%, transparent), color-mix(in srgb, var(--mantine-color-dark-6) 78%, transparent))',
            borderBottom: '1px solid rgba(148,163,184,0.2)',
            backdropFilter: 'blur(12px) saturate(150%)',
          }}
        >
          <Group mb="md">
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => router.back()}
            >
              Back
            </Button>
          </Group>

          <Group align="flex-start" wrap="nowrap">
            <Avatar
              src={org.logoUrl}
              size={60}
              radius="md"
              style={{ background: '#f8fafc' }}
            >
              <IconBuilding size={32} />
            </Avatar>
            <Box style={{ flex: 1 }}>
              <Group gap="xs">
                <Text size="lg" fw={600}>
                  {org.displayName}
                </Text>
                {org.verificationStatus === 'verified' && (
                  <ThemeIcon size="sm" color="credentis" variant="light" radius="xl">
                    <IconShieldCheck size={14} />
                  </ThemeIcon>
                )}
              </Group>
              <Badge size="sm" variant="light" color="blue" mt={4}>
                {org.category}
              </Badge>
              {memberSince && !Number.isNaN(memberSince.getTime()) && (
                <Text size="xs" c="dimmed" mt={4}>
                  On Credentis since {memberSince.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                </Text>
              )}
              {workAreas.length > 0 && (
                <Text size="xs" c="dimmed">Works in: {workAreas.join(', ')}</Text>
              )}
              {org.trustScore > 0 && (
                <Group gap={4} mt={4}>
                  <IconStar size={14} color="#fbbf24" fill="#fbbf24" />
                  <Text size="sm" fw={500}>
                    {org.trustScore.toFixed(1)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Trust Score
                  </Text>
                </Group>
              )}
            </Box>
          </Group>

          {source === 'discover' && (
            <Stack mt="md" gap="sm">
              <Button
                fullWidth
                leftSection={<IconMessagePlus size={18} />}
                onClick={() => openRequestModal(null, 'quote')}
              >
                Ask for a quote or a service
              </Button>
              {sellsGoods && (
              <Button
                fullWidth
                variant="filled"
                color="teal"
                leftSection={<IconFileText size={18} />}
                onClick={openShop}
              >
                Shop their goods
              </Button>
              )}

              <Button
                fullWidth
                variant="light"
                color="teal"
                leftSection={<IconShieldCheck size={18} />}
                onClick={async () => {
                  try {
                    const token = getWalletToken();

                    await api.post('/api/contacts', {
                      name: org.displayName,
                      did: org.issuerDid,
                      contactScope: 'external',
                      notes: `Added from Trust Hub Discovery. Category: ${org.category}`,
                      inviteToWallet: false
                    }, {
                      headers: { Authorization: `Bearer ${token}` }
                    });

                    notifications.show({
                      title: 'Partner Added',
                      message: `${org.displayName} has been added to your Trust Network contacts.`,
                      color: 'teal'
                    });
                  } catch (error: any) {
                    notifications.show({
                      title: 'Action Failed',
                      message: error.response?.data?.message || 'Could not add partner',
                      color: 'red'
                    });
                  }
                }}
              >
                Partner as Supplier
              </Button>
            </Stack>
          )}

          {source === 'my-orgs' && (
            <Paper m="md" p="md" radius="md" withBorder style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.08), rgba(13,148,136,0.06))' }}>
              <Stack gap="sm">
                <Group justify="space-between" align="start">
                  <Box>
                    <Text size="sm" fw={700}>
                      Owner preview
                    </Text>
                    <Text size="xs" c="dimmed">
                      What other wallets see. Change it in Public profile.
                    </Text>
                  </Box>
                  <Badge variant="light" color={profile.isPublic === false ? 'gray' : 'green'}>
                    {storeVisibilityLabel}
                  </Badge>
                </Group>

                <Group gap="xs" wrap="wrap">
                  <Badge variant="light" color="blue">
                    {services.length} services
                  </Badge>
                  <Badge variant="light" color="teal">
                    {sellsGoods ? `${catalogItems.length} goods` : 'No goods'}
                  </Badge>
                  <Badge variant="light" color="violet">
                    {paymentRails.length} ways to pay
                  </Badge>
                </Group>

                <Group gap="xs" wrap="wrap">
                  <Button size="xs" onClick={() => router.push('/settings/org?section=store')}>
                    Edit public profile
                  </Button>
                  {sellsGoods && (
                    <Button size="xs" variant="outline" onClick={openShop}>
                      Preview shop
                    </Button>
                  )}
                </Group>
              </Stack>
            </Paper>
          )}
        </Box>

        {/* Content */}
        <Stack gap="md" p="md">
          {/* About */}
          {org.description && (
            <Paper p="md" radius="md" withBorder>
              <Text size="sm" fw={600} mb="xs">
                About
              </Text>
              <Text size="sm" c="dimmed">
                {org.description}
              </Text>
            </Paper>
          )}

          {/* Contact Info */}
          <Paper p="md" radius="md" withBorder>
            <Text size="sm" fw={600} mb="xs">
              Contact Information
            </Text>
            <Stack gap={8}>
              {org.website && (
                <Group gap="xs">
                  <IconWorld size={16} color="#94a3b8" />
                  <Text size="sm">{org.website}</Text>
                </Group>
              )}
              {org.contactPhone && (
                <Group gap="xs">
                  <IconPhone size={16} color="#94a3b8" />
                  <Text size="sm">{org.contactPhone}</Text>
                </Group>
              )}
              {org.contactEmail && (
                <Group gap="xs">
                  <IconMail size={16} color="#94a3b8" />
                  <Text size="sm">{org.contactEmail}</Text>
                </Group>
              )}
              {org.address && (
                <Group gap="xs">
                  <IconMapPin size={16} color="#94a3b8" />
                  <Text size="sm">{org.address}</Text>
                </Group>
              )}
            </Stack>
          </Paper>

          <Paper p="md" radius="md" withBorder>
            <Text size="sm" fw={600} mb="xs">
              Trust Badges
            </Text>
            {trustBadges.length === 0 ? (
              <Text size="sm" c="dimmed">No trust badges published yet.</Text>
            ) : (
              <Stack gap={6}>
                {trustBadges.map((badge) => (
                  <Group key={`${badge.type}-${badge.issuedAt}`} justify="space-between">
                    <Badge size="sm" variant="light" color={badge.revoked ? 'red' : 'green'}>
                      {badge.label}
                    </Badge>
                    <Text size="xs" c="dimmed">
                      {new Date(badge.issuedAt).toLocaleDateString()}
                    </Text>
                  </Group>
                ))}
              </Stack>
            )}
          </Paper>

          <Paper p="md" radius="md" withBorder>
            <Text size="sm" fw={600} mb="xs">
              Payment Rails
            </Text>
            {paymentRails.length === 0 ? (
              <Text size="sm" c="dimmed">No payment rails declared.</Text>
            ) : (
              <Group gap="xs">
                {paymentRails.map((rail) => (
                  <Badge key={rail} size="sm" variant="light" color="violet">
                    {rail}
                  </Badge>
                ))}
              </Group>
            )}
          </Paper>

          <Paper p="md" radius="md" withBorder>
            <Text size="sm" fw={600}>
              Services ({services.length})
            </Text>
            <Text size="xs" c="dimmed" mb="xs">
              Work you ask or book. They answer in your inbox and you keep the cards for it.
            </Text>
            {services.length === 0 ? (
              <Text size="sm" c="dimmed">
                {source === 'my-orgs' ? 'No services shown yet. Switch some on in Public profile.' : 'No services listed yet. You can still ask for a quote.'}
              </Text>
            ) : (
              <Stack gap="sm">
                {services.map((service) => (
                  <ServiceCard key={service.id} service={service} onRequest={() => openRequestModal(service)} />
                ))}
              </Stack>
            )}
          </Paper>

          {sellsGoods && (
          <Paper p="md" radius="md" withBorder>
            <Group justify="space-between" mb={4}>
              <Text size="sm" fw={600}>
                Goods ({catalogItems.length})
              </Text>
              <Button size="xs" variant="light" color="teal" onClick={openShop}>
                Open shop
              </Button>
            </Group>
            <Text size="xs" c="dimmed" mb="xs">
              Products you buy and pay for in their shop.
            </Text>
            {catalogItems.length === 0 ? (
              <Text size="sm" c="dimmed">No products listed yet.</Text>
            ) : (
              <Stack gap={8}>
                {catalogItems.slice(0, 6).map((item) => (
                  <Group key={item.id} justify="space-between" align="start">
                    <Box style={{ flex: 1 }}>
                      <Text size="sm" fw={500}>{item.title}</Text>
                      <Text size="xs" c="dimmed">{item.description || item.category || 'Product'}</Text>
                    </Box>
                    <Badge size="sm" variant="light" color="teal">
                      {item.currency} {Number(item.price || 0).toFixed(2)}
                    </Badge>
                  </Group>
                ))}
                {catalogItems.length > 6 && (
                  <Text size="xs" c="dimmed">+{catalogItems.length - 6} more in the shop</Text>
                )}
              </Stack>
            )}
          </Paper>
          )}

          {(qrCodeUrl || didDocumentUrl) && (
            <Paper p="md" radius="md" withBorder>
              <Group gap="xs" mb="xs">
                <IconQrcode size={16} color="#94a3b8" />
                <Text size="sm" fw={600}>Trust Links</Text>
              </Group>
              {qrCodeUrl && <Text size="xs" c="dimmed">QR: {qrCodeUrl}</Text>}
              {didDocumentUrl && <Text size="xs" c="dimmed">DID: {didDocumentUrl}</Text>}
            </Paper>
          )}

        </Stack>

        {/* Bottom Padding */}
        <Box style={{ height: 80 }} />
      </Box>

      {/* Request Modal */}
      <Modal
        opened={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        title={selectedService ? selectedService.name : `Ask ${org.displayName}`}
        size="lg"
      >
        <Stack gap="md">
          {selectedService ? (
            <Alert color="blue" icon={<IconAlertCircle />}>
              You are asking {org.displayName} for <strong>{selectedService.name}</strong>
              {selectedService.feeAmount > 0 ? ` (${selectedService.feeCurrency} ${selectedService.feeAmount})` : ''}.
            </Alert>
          ) : (
            <Select
              label="What do you want to ask for"
              data={ASK_KINDS.map((entry) => ({ value: entry.value, label: entry.label }))}
              value={askKind}
              onChange={(value) => setAskKind((value as AskKind) || 'quote')}
              description={ASK_KINDS.find((entry) => entry.value === askKind)?.hint}
            />
          )}

          {selectedService && selectedService.requirements?.length > 0 && (
            <Box>
              <Text size="sm" fw={500} mb="xs">They will need:</Text>
              <Stack gap={4}>
                {selectedService.requirements.map((req, i) => (
                  <Group key={i} gap={4} wrap="nowrap">
                    <IconCheck size={14} color="green" />
                    <Text size="sm">{req}</Text>
                  </Group>
                ))}
              </Stack>
            </Box>
          )}

          <Textarea
            label="What you need"
            placeholder="A sentence or two: what, how many, by when."
            minRows={3}
            value={askText}
            onChange={(e) => setAskText(e.currentTarget.value)}
            required
          />
          <TextInput
            label="Your name, as they should see it"
            value={askName}
            onChange={(e) => setAskName(e.currentTarget.value)}
          />

          <Text size="xs" c="dimmed">
            {org.displayName} sees your name and what you wrote, nothing else. Their answer arrives in your inbox.
          </Text>

          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setRequestModalOpen(false)}>Cancel</Button>
            <Button onClick={submitRequest} loading={submitting}>Send</Button>
          </Group>
        </Stack>
      </Modal>
    </AppShellMobile>
  );
}
