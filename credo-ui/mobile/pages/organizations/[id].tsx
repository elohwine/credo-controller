import React, { useEffect, useState } from 'react';
import {
  Box, Stack, Text, Title, Group, Button, Badge, Paper, ThemeIcon, Divider, Avatar, Modal, TextInput, Textarea, Skeleton, Alert
} from '@mantine/core';
import {
  IconBuilding, IconShieldCheck, IconStar, IconWorld, IconPhone, IconMail, IconMapPin, IconArrowLeft, IconCheck, IconAlertCircle, IconFileText, IconQrcode
} from '@tabler/icons-react';
import { useRouter } from 'next/router';
import { notifications } from '@mantine/notifications';
import AppShellMobile from '@/components/layout/AppShellMobile';
import { getWalletToken, isAuthenticated } from '@/lib/auth';
import api from '@/lib/api';

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
  contactLinks?: {
    phone?: string | null;
    email?: string | null;
    website?: string | null;
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
              {service.feeAmount > 0 ? `${service.feeCurrency} ${service.feeAmount}` : 'Free'}
            </Text>
          </Group>

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
          Request Now
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
  const [requestPayload, setRequestPayload] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

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
        const storefrontResponse = await api.get(`/api/discovery/organizations/${id}/storefront`);
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
          },
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
            title: 'Store Review Loaded',
            message: 'Opened the owner view with storefront, services, products, and broadcast links.',
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

  const openRequestModal = (service: Service) => {
    setSelectedService(service);
    setRequestPayload({});
    setRequestModalOpen(true);
  };

  const submitRequest = async () => {
    if (!selectedService || !profile) return;

    setSubmitting(true);
    try {
      const token = getWalletToken();
      if (!token) {
        notifications.show({
          title: 'Authentication Required',
          message: 'Please log in to request credentials',
          color: 'red',
        });
        return;
      }

      // Use workflow execution endpoint from P4 if template is bound
      if (selectedService.workflowTemplateId) {
        await api.post(
          `/api/discovery/organizations/${profile.org.id}/workflows/${selectedService.workflowTemplateId}/execute`,
          {
            context: {
              serviceId: selectedService.id,
              serviceName: selectedService.name,
              ...requestPayload,
            },
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        notifications.show({
          title: 'Workflow Started',
          message: `Workflow for ${selectedService.name} has been initiated`,
          color: 'green',
          icon: <IconCheck />,
        });
      } else {
        // Fall back to legacy VC request flow for services without workflow templates
        await api.post(
          '/api/vc-requests',
          {
            serviceId: selectedService.id,
            requestPayload: requestPayload,
            consent: true,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        notifications.show({
          title: 'Request Submitted',
          message: `Your request for ${selectedService.name} has been submitted`,
          color: 'green',
          icon: <IconCheck />,
        });
      }

      setRequestModalOpen(false);
      router.push('/inbox'); // Navigate to inbox to track request
    } catch (error: any) {
      console.error('Failed to submit request:', error);
      notifications.show({
        title: 'Submission Failed',
        message: error.response?.data?.message || 'Failed to submit request',
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
  const storeVisibilityLabel = profile.isPublic === false ? 'Private storefront' : profile.isPublic === true ? 'Public storefront' : 'Store visibility unknown';

  return (
    <AppShellMobile>
      <Box>
        {/* Header */}
        <Box
          p="md"
          style={{
            background: 'rgba(255,255,255,0.74)',
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
                variant="filled"
                color="teal"
                leftSection={<IconFileText size={18} />}
                onClick={() => {
                  void router.push(`/shop?orgId=${encodeURIComponent(org.id)}&merchantId=${encodeURIComponent(org.tenantId || org.id)}`);
                }}
              >
                Open Mini Store
              </Button>

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
                      Org Store Review
                    </Text>
                    <Text size="xs" c="dimmed">
                      Review the storefront as an owner or manager before publishing changes.
                    </Text>
                  </Box>
                  <Badge variant="light" color={profile.isPublic === false ? 'gray' : 'green'}>
                    {storeVisibilityLabel}
                  </Badge>
                </Group>

                <Group gap="xs" wrap="wrap">
                  <Badge variant="light" color="teal">
                    {services.length} services
                  </Badge>
                  <Badge variant="light" color="blue">
                    {catalogItems.length} products
                  </Badge>
                  <Badge variant="light" color="violet">
                    {paymentRails.length} rails
                  </Badge>
                </Group>

                <Group gap="xs" wrap="wrap">
                  <Button
                    size="xs"
                    onClick={() => {
                      void router.push(`/shop?orgId=${encodeURIComponent(org.id)}&merchantId=${encodeURIComponent(org.tenantId || org.id)}`);
                    }}
                  >
                    Preview Mini Store
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => router.push('/settings/org')}
                  >
                    Configure Store Basics
                  </Button>
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
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={600}>
                Mini Storefront
              </Text>
              <Group gap={6}>
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => {
                    void router.push(`/shop?orgId=${encodeURIComponent(org.id)}&merchantId=${encodeURIComponent(org.tenantId || org.id)}`);
                  }}
                >
                  Open Shop
                </Button>
              </Group>
            </Group>

            <Stack gap="md">
              <Box>
                <Text size="sm" fw={500} mb="xs">
                  Services ({services.length})
                </Text>
                {services.length === 0 ? (
                  <Paper p="sm" radius="md" withBorder style={{ textAlign: 'center' }}>
                    <Text size="sm" fw={500} mb={4}>
                      {source === 'my-orgs' ? 'My Organization Account' : 'No Services Available'}
                    </Text>
                    <Text size="xs" c="dimmed" mb={source === 'my-orgs' ? 'sm' : 0}>
                      {source === 'my-orgs'
                        ? 'Manage onboarding, switching, and workflow activation for this org.'
                        : 'This organization has not published any services yet.'}
                    </Text>
                    {source === 'my-orgs' && (
                      <Button
                        size="xs"
                        onClick={() => {
                          void router.push('/settings/org');
                        }}
                      >
                        Open Store Basics
                      </Button>
                    )}
                  </Paper>
                ) : (
                  <Stack gap="sm">
                    {services.map((service) => (
                      <ServiceCard key={service.id} service={service} onRequest={() => openRequestModal(service)} />
                    ))}
                  </Stack>
                )}
              </Box>

              <Divider />

              <Box>
                <Text size="sm" fw={500} mb="xs">
                  Products & Goods ({catalogItems.length})
                </Text>
                {catalogItems.length === 0 ? (
                  <Text size="sm" c="dimmed">No published products yet.</Text>
                ) : (
                  <Stack gap={8}>
                    {catalogItems.slice(0, 4).map((item) => (
                      <Group key={item.id} justify="space-between" align="start">
                        <Box style={{ flex: 1 }}>
                          <Text size="sm" fw={500}>{item.title}</Text>
                          <Text size="xs" c="dimmed">{item.description || item.category || 'Published product'}</Text>
                        </Box>
                        <Badge size="sm" variant="light" color="teal">
                          {item.currency} {Number(item.price || 0).toFixed(2)}
                        </Badge>
                      </Group>
                    ))}
                  </Stack>
                )}
              </Box>
            </Stack>
          </Paper>

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
        title={selectedService?.name}
        size="lg"
      >
        {selectedService && (
          <Stack gap="md">
            <Alert color="blue" icon={<IconAlertCircle />}>
              You are about to request: <strong>{selectedService.name}</strong>
            </Alert>

            {selectedService.requirements?.length > 0 && (
              <Box>
                <Text size="sm" fw={500} mb="xs">
                  Requirements:
                </Text>
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

            <TextInput label="Notes (Optional)" placeholder="Add any additional information..." />

            <Textarea
              label="Request Details"
              placeholder="Provide information as per requirements..."
              minRows={3}
              value={JSON.stringify(requestPayload, null, 2)}
              onChange={(e) => {
                try {
                  setRequestPayload(JSON.parse(e.target.value || '{}'));
                } catch {
                  // Invalid JSON, ignore
                }
              }}
            />

            <Text size="xs" c="dimmed">
              Note: Your request will be reviewed by {org.displayName}. You'll be notified once processed.
            </Text>

            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setRequestModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitRequest} loading={submitting}>
                Submit Request
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </AppShellMobile>
  );
}
