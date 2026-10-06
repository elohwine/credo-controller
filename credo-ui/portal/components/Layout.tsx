import React, { ReactNode, useContext } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
    Anchor,
    Box,
    Container,
    Group,
    Menu,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
    IconChevronDown,
    IconHome,
    IconCertificate,
    IconFileCheck,
    IconBuildingStore,
    IconBuilding,
    IconShieldCheck,
    IconUserShield,
    IconUsersGroup,
    IconChecklist,
    IconInbox,
    IconReceipt,
    IconSchool,
    IconBriefcase,
    IconCoin,
    IconWallet,
    IconCreditCard,
    IconUsers,
} from '@tabler/icons-react';
import OrgSwitcher from '@/components/OrgSwitcher';
import { usePortalContext } from '@/lib/portalContext';

const LayoutNestingContext = React.createContext(false);

interface LayoutProps {
    children: ReactNode;
    title?: string;
}

// Credentis brand colors
const BRAND = {
    curious: '#2188CA',
    linkWater: '#D0E6F3',
    viking: '#6FB4DC',
    cornflower: '#88C4E3',
    dark: '#0A3D5C',
};

interface NavItem {
    label: string;
    href: string;
    icon?: React.ReactNode;
    description?: string;
}

interface NavCategory {
    label: string;
    items: NavItem[];
}

const Layout = ({ children, title = 'Credentis Portal' }: LayoutProps) => {
    const isNested = useContext(LayoutNestingContext);
    const router = useRouter();
    const { mounted, isOrg } = usePortalContext();
    const compactHeader = useMediaQuery('(max-width: 900px)');

    if (isNested) {
        return (
            <>
                <Head>
                    <title>{title} | Credentis</title>
                    <meta charSet="utf-8" />
                    <meta name="viewport" content="initial-scale=1.0, width=device-width" />
                </Head>
                {children}
            </>
        );
    }

    // Context-aware shell (mirrors mobile BottomNav):
    //   personal/holder session → Home · My Wallet · Activity · Verify · Shop
    //   organization session    → Home · Inbox · Verify + Work / Organization menus
    // Org-only surfaces (finance, requisitions, approvals, org admin) are never
    // advertised in a personal session; their pages also redirect via useRequireOrgContext.
    const primaryNav: NavItem[] = isOrg
        ? [
              { label: 'Home', href: '/', icon: <IconHome size={16} /> },
              { label: 'Inbox', href: '/inbox', icon: <IconInbox size={16} /> },
              { label: 'Verify', href: '/verify', icon: <IconFileCheck size={16} /> },
          ]
        : [
              { label: 'Home', href: '/', icon: <IconHome size={16} /> },
              { label: 'My Wallet', href: '/wallet', icon: <IconWallet size={16} /> },
              { label: 'Activity', href: '/inbox', icon: <IconInbox size={16} /> },
              { label: 'Verify', href: '/verify', icon: <IconFileCheck size={16} /> },
              { label: 'Shop', href: '/shop', icon: <IconBuildingStore size={16} /> },
          ];

    // Categorized menus — organization context only
    const categories: NavCategory[] = !isOrg ? [] : [
        {
            label: 'Work',
            items: [
                { label: 'Inbox', href: '/inbox', icon: <IconInbox size={16} />, description: 'Actions awaiting attention' },
                { label: 'Requests', href: '/requests', icon: <IconReceipt size={16} />, description: 'Organizational requests' },
                { label: 'Finance', href: '/finance', icon: <IconCoin size={16} />, description: 'AR, AP, requisitions, invoices, and field ops' },
                { label: 'Requisitions', href: '/finance/requisitions', icon: <IconReceipt size={16} />, description: 'Internal approval and release workflow' },
                { label: 'Job Cards', href: '/finance/job-cards', icon: <IconBriefcase size={16} />, description: 'Field Operations & Execution Jobs' },
                { label: 'School Fees', href: '/finance/school-fees', icon: <IconSchool size={16} />, description: 'Fee invoices and school payment flows' },
                { label: 'Approvals', href: '/approvals', icon: <IconShieldCheck size={16} />, description: 'Approval trails and decisions' },
                { label: 'Tasks', href: '/tasks', icon: <IconChecklist size={16} />, description: 'Open workflow tasks' },
            ],
        },
        {
            label: 'Organization',
            items: [
                { label: 'Organization Setup', href: '/organization/setup', icon: <IconChecklist size={16} />, description: 'Configure people, workflows, authority, and integrations' },
                { label: 'People', href: '/organization/people', icon: <IconCertificate size={16} />, description: 'Members, roles, invitations' },
                { label: 'Roles', href: '/organization/roles', icon: <IconUserShield size={16} />, description: 'Starter roles and permissions' },
                { label: 'Departments', href: '/organization/departments', icon: <IconBuilding size={16} />, description: 'Departments and cost centres' },
                { label: 'Authorities', href: '/organization/authorities', icon: <IconShieldCheck size={16} />, description: 'Approval authorities and thresholds' },
                { label: 'Who does what', href: '/organization/actors', icon: <IconUserShield size={16} />, description: 'Who handles each step of a job' },
                { label: 'What happens next', href: '/organization/handoffs', icon: <IconChecklist size={16} />, description: 'When one piece of work leads to another' },
                { label: 'Payments', href: '/organization/integrations', icon: <IconCreditCard size={16} />, description: 'Practice or live payment services' },
                { label: 'Trusted partners', href: '/organization/trusted-partners', icon: <IconUsers size={16} />, description: 'Organizations whose documents you accept' },
                { label: 'Stand-ins', href: '/organization/delegations', icon: <IconUsersGroup size={16} />, description: 'Who can act for someone who is away' },
                { label: 'Credentials', href: '/credential-models', icon: <IconCertificate size={16} />, description: 'Credential definitions' },
                { label: 'Issue / Verify', href: '/select-credentials', icon: <IconFileCheck size={16} />, description: 'Manual credential ops' },
            ],
        },

        /* PHASE 2+ - DEFERRED
        {
            label: 'Commerce',
            items: [
                { label: 'Catalog', href: '/catalog', icon: <IconBuildingStore size={16} />, description: 'Product catalog admin' },
                { label: 'Finance', href: '/finance', icon: <IconCoin size={16} />, description: 'Financial reports' },
                { label: 'Inventory', href: '/inventory/dashboard', icon: <IconPackage size={16} />, description: 'Stock management' },
                { label: 'Metrics', href: '/metrics', icon: <IconChartBar size={16} />, description: 'Analytics' },
            ],
        },
        {
            label: 'HR & Payroll',
            items: [
                { label: 'HR Operations', href: '/hr/operations', icon: <IconUsers size={16} />, description: 'Staff management' },
                { label: 'Onboarding', href: '/onboarding', icon: <IconUserPlus size={16} />, description: 'New employees' },
                { label: 'Payroll', href: '/payroll', icon: <IconCash size={16} />, description: 'Compensation' },
            ],
        },
        {
            label: 'Trust & Security',
            items: [
                { label: 'Trust Scores', href: '/trust', icon: <IconStars size={16} />, description: 'Reputation' },
                { label: 'WhatsApp', href: '/whatsapp', icon: <IconBrandWhatsapp size={16} />, description: 'WhatsApp commerce' },
                { label: 'Workflows', href: '/workflows', icon: <IconGitBranch size={16} />, description: 'Automation' },
            ],
        },
        */
    ];

    const isActive = (href: string) => {
        if (href === '/') return router.pathname === '/';
        // Handle exact match or subpath match
        const basePath = href.split('/').slice(0, 2).join('/');
        return router.pathname === href || router.pathname.startsWith(`${basePath}/`) || router.pathname === basePath;
    };

    const navLinkStyle = (active: boolean) => ({
        color: active ? BRAND.curious : '#374151',
        fontWeight: active ? 600 : 500,
        fontSize: 14,
        padding: '8px 12px',
        borderRadius: 8,
        backgroundColor: active ? BRAND.linkWater : 'transparent',
        transition: 'all 0.15s ease',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
    });

    return (
        <div className="min-h-screen bg-gray-50">
            <Head>
                <title>{title} | Credentis</title>
                <meta charSet="utf-8" />
                <meta name="viewport" content="initial-scale=1.0, width=device-width" />
            </Head>

            {/* Header */}
            <Box
                component="header"
                style={{
                    backgroundColor: '#ffffff',
                    borderBottom: `1px solid #E5E7EB`,
                    position: 'sticky',
                    top: 0,
                    zIndex: 40,
                }}
            >
                {/* Top accent bar */}
                <Box style={{ height: 3, background: `linear-gradient(90deg, ${BRAND.curious} 0%, ${BRAND.viking} 100%)` }} />

                <Container size="xl">
                    <Group justify="space-between" h={72} wrap="nowrap">
                        {/* Logo */}
                        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }}>
                            <img
                                src="/credentis-logo.png"
                                alt="Credentis"
                                style={{ height: 84, width: 'auto', display: 'block' }}
                            />
                        </Link>

                        {/* Navigation — scrollable. The account picker lives OUTSIDE this box so it is
                            always visible, even on narrow viewports where the nav overflows. */}
                        <Box style={{ overflow: 'auto', flex: 1, minWidth: 0, visibility: mounted ? 'visible' : 'hidden' }}>
                            <Group gap={4} wrap="nowrap" style={{ minWidth: 'max-content' }}>
                                {/* Primary nav items */}
                                {primaryNav.map((item) => {
                                    const active = isActive(item.href);
                                    return (
                                        <Anchor
                                            key={item.href}
                                            component={Link}
                                            href={item.href}
                                            underline="never"
                                            style={navLinkStyle(active)}
                                        >
                                            {item.icon}
                                            {item.label}
                                        </Anchor>
                                    );
                                })}

                                {/* Category dropdowns */}
                                {categories.map((category) => (
                                    <Menu
                                        key={category.label}
                                        trigger="hover"
                                        openDelay={100}
                                        closeDelay={200}
                                        withinPortal
                                        position="bottom-start"
                                        shadow="lg"
                                        radius="md"
                                        width={280}
                                    >
                                        <Menu.Target>
                                            <UnstyledButton
                                                style={{
                                                    ...navLinkStyle(false),
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                {category.label}
                                                <IconChevronDown size={14} style={{ marginLeft: 2 }} />
                                            </UnstyledButton>
                                        </Menu.Target>

                                        <Menu.Dropdown style={{ padding: 8 }}>
                                            <Text size="xs" fw={600} c="dimmed" px={12} py={6} tt="uppercase">
                                                {category.label}
                                            </Text>
                                            {category.items.map((item) => (
                                                <Menu.Item
                                                    key={item.href}
                                                    onClick={() => router.push(item.href)}
                                                    leftSection={
                                                        <Box
                                                            style={{
                                                                width: 32,
                                                                height: 32,
                                                                borderRadius: 8,
                                                                backgroundColor: BRAND.linkWater,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                color: BRAND.curious,
                                                            }}
                                                        >
                                                            {item.icon}
                                                        </Box>
                                                    }
                                                    style={{
                                                        borderRadius: 8,
                                                        padding: '10px 12px',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <Text size="sm" fw={500}>
                                                        {item.label}
                                                    </Text>
                                                    {item.description && (
                                                        <Text size="xs" c="dimmed" mt={2}>
                                                            {item.description}
                                                        </Text>
                                                    )}
                                                </Menu.Item>
                                            ))}
                                        </Menu.Dropdown>
                                    </Menu>
                                ))}
                            </Group>
                        </Box>

                        {/* Account / organization picker — fixed slot, compact on narrow viewports */}
                        <Box style={{ flexShrink: 0, minWidth: compactHeader ? undefined : 220, maxWidth: 340 }}>
                            <OrgSwitcher compact={!!compactHeader} />
                        </Box>
                    </Group>
                </Container>
            </Box>

            <LayoutNestingContext.Provider value={true}>
                <main style={{ paddingTop: 0 }}>
                    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">{children}</div>
                </main>
            </LayoutNestingContext.Provider>
        </div>
    );
};

export default Layout;
