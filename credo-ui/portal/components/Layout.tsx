import React, { ReactNode, useContext, useEffect, useState } from 'react';
import { BrandMark } from '../../shared/BrandMark';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
    ActionIcon,
    Alert,
    AppShell,
    Badge,
    Box,
    Burger,
    Button,
    Group,
    NavLink,
    Text,
    useMantineColorScheme,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
    IconMoon,
    IconLogin2,
    IconSun,
    IconHome,
    IconCertificate,
    IconBuilding,
    IconShieldCheck,
    IconUserShield,
    IconUsersGroup,
    IconChecklist,
    IconInbox,
    IconReceipt,
    IconBriefcase,
    IconCoin,
    IconWallet,
    IconCreditCard,
    IconBrandWhatsapp,
    IconPalette,
    IconUsers,
    IconSchool,
    IconShoppingBag,
    IconReportMoney,
} from '@tabler/icons-react';
import OrgSwitcher from '@/components/OrgSwitcher';
import { endPortalTask, usePortalContext, usePortalTaskGuard } from '@/lib/portalContext';
import { getOrgScopedToken, getPersonalToken } from '@/utils/organizationContext';
import { readOrgProfile } from '@/utils/orgProfile';
import { getWorkflowCapabilityFlags } from '@/lib/workflowCapabilities';
import { openInboxOffers } from '@/lib/inboxAttention';

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

const Layout = ({ children, title = 'Credentis Portal' }: LayoutProps) => {
    const isNested = useContext(LayoutNestingContext);
    const router = useRouter();
    const { mounted, isOrg, activeOrg } = usePortalContext();
    const task = usePortalTaskGuard(!isNested);
    const compactHeader = useMediaQuery('(max-width: 900px)');
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const [schemeReady, setSchemeReady] = useState(false);
    useEffect(() => {
        setSchemeReady(true);
        const color = colorScheme === 'dark' ? '#121417' : '#f7fbff';
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', 'theme-color');
            document.head.appendChild(meta);
        }
        meta.setAttribute('content', color);
    }, [colorScheme]);
    const dark = schemeReady && colorScheme === 'dark';
    const [navOpened, setNavOpened] = useState(false);
    const [counts, setCounts] = useState({ inbox: 0, requests: 0, jobs: 0 });
    const [workflowTypes, setWorkflowTypes] = useState<string[]>([]);
    const canManageOrg = ['owner', 'admin'].includes(String(activeOrg?.role || '').toLowerCase());

    useEffect(() => {
        setNavOpened(false);
    }, [router.pathname]);

    useEffect(() => {
        if (!mounted || isNested || task) return;
        const token = (isOrg ? getOrgScopedToken() : null) || getPersonalToken();
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        const backend = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000';
        let cancelled = false;
        const load = async () => {
            const [offers, receipts, inbound, runs, workflows] = await Promise.all([
                fetch(`${backend}/api/wallet/credentials/pending-offers?status=open`, { headers }).then((res) => res.json()).catch(() => null),
                fetch(`${backend}/api/wallet/credentials/pending-receipts`, { headers }).then((res) => res.json()).catch(() => null),
                isOrg ? fetch(`${backend}/workflow-requests/inbound?status=pending&limit=20`, { headers }).then((res) => res.json()).catch(() => null) : Promise.resolve(null),
                isOrg ? fetch(`${backend}/workflows/runs?limit=30`, { headers }).then((res) => res.json()).catch(() => null) : Promise.resolve(null),
                isOrg && activeOrg?.orgTenantId
                    ? fetch(`${backend}/api/organizations/${encodeURIComponent(activeOrg.orgTenantId)}/workflows`, { headers }).then((res) => res.json()).catch(() => null)
                    : Promise.resolve(null),
            ]);
            if (cancelled) return;
            const offerRows = openInboxOffers(offers);
            const pendingReceipts = Array.isArray(receipts) ? receipts : [];
            const receiptRows = pendingReceipts.filter((row: any) => String(row?.sourceType || '').toLowerCase() === 'payment');
            const requestRows = Array.isArray(inbound) ? inbound : [];
            const runRows = Array.isArray(runs) ? runs : [];
            const openJobs = runRows.filter((run) => !['completed', 'cancelled', 'reconciled'].includes(String(run?.status || '').toLowerCase())).length;
            setCounts({ inbox: offerRows.length + receiptRows.length, requests: requestRows.length, jobs: openJobs });
            setWorkflowTypes(Array.isArray(workflows?.workflowTypes) ? workflows.workflowTypes : []);
        };
        void load();
        return () => { cancelled = true; };
    }, [mounted, isOrg, activeOrg?.orgTenantId, isNested, task]);

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

    const countFor = (href: string) => {
        if (href === '/inbox') return counts.inbox;
        if (href === '/requests') return counts.requests;
        if (href === '/finance/job-cards') return counts.jobs;
        return 0;
    };

    const profile = readOrgProfile();
    const capabilityFlags = getWorkflowCapabilityFlags(workflowTypes.map((workflowType) => ({ workflowType })));
    const kinds = profile?.kinds || [];
    const modules = profile?.modules || [];
    const hasJobs = capabilityFlags.fieldExecution || kinds.includes('field');
    const hasSchool = capabilityFlags.educationFees || kinds.includes('school');
    const hasCommerce = capabilityFlags.cashCounter || capabilityFlags.ecommerce || kinds.includes('shop');
    const hasPeople = capabilityFlags.hrOps || modules.includes('people_payroll');

    const groups: Array<{ label: string; items: Array<{ label: string; href: string; icon: React.ReactNode }> }> = [
        {
            label: 'Work',
            items: isOrg
                ? [
                    { label: 'Home', href: '/', icon: <IconHome size={18} /> },
                    { label: 'Inbox', href: '/inbox', icon: <IconInbox size={18} /> },
                    { label: 'Approvals', href: '/approvals', icon: <IconShieldCheck size={18} /> },
                    { label: 'All requests', href: '/requests', icon: <IconReceipt size={18} /> },
                ]
                : [
                    { label: 'Home', href: '/', icon: <IconHome size={18} /> },
                    { label: 'Inbox', href: '/inbox', icon: <IconInbox size={18} /> },
                    { label: 'My requests', href: '/requests/mine', icon: <IconReceipt size={18} /> },
                ],
        },
        ...(isOrg ? [{
            label: 'Operations',
            items: [
                ...(hasJobs ? [{ label: 'Jobs', href: '/finance/job-cards', icon: <IconBriefcase size={18} /> }] : []),
                { label: 'Purchase requests', href: '/finance/requisitions', icon: <IconChecklist size={18} /> },
                ...(hasSchool ? [{ label: 'School fees', href: '/finance/school-fees', icon: <IconSchool size={18} /> }] : []),
                ...(hasCommerce ? [{ label: 'Shop & services', href: '/shop', icon: <IconShoppingBag size={18} /> }] : []),
            ],
        }, {
            label: 'Money',
            items: [
                { label: 'Money in', href: '/finance?tab=ar', icon: <IconCoin size={18} /> },
                { label: 'Money out', href: '/finance?tab=ap', icon: <IconCreditCard size={18} /> },
                { label: 'Reports', href: '/finance/reports', icon: <IconReportMoney size={18} /> },
            ],
        }, ...(hasPeople ? [{
            label: 'People',
            items: [
                { label: 'Staff requests', href: '/requests?tab=people', icon: <IconUsers size={18} /> },
                { label: 'Payroll', href: '/payroll', icon: <IconReceipt size={18} /> },
            ],
        }] : [])] : []),
        {
            label: 'Records',
            items: [
                {
                    label: isOrg && canManageOrg ? 'Organisation records' : 'My records',
                    href: isOrg && canManageOrg ? '/wallet?holder=organization' : '/wallet',
                    icon: <IconWallet size={18} />,
                },
                { label: 'Account security', href: '/account-security', icon: <IconUserShield size={18} /> },
            ],
        },
    ];

    if (isOrg && canManageOrg) {
        groups.push({
            label: 'Organisation',
            items: [
                { label: 'Members', href: '/organization/people', icon: <IconUsers size={18} /> },
                { label: 'Workflows', href: '/workflows', icon: <IconChecklist size={18} /> },
                { label: 'Record settings', href: '/organization/setup#records', icon: <IconCertificate size={18} /> },
                { label: 'Setup', href: '/organization/setup', icon: <IconBuilding size={18} /> },
                { label: 'Who does what', href: '/organization/actors', icon: <IconUserShield size={18} /> },
                { label: 'What happens next', href: '/organization/handoffs', icon: <IconChecklist size={18} /> },
                { label: 'Credential operations', href: '/organization/credential-operations', icon: <IconCertificate size={18} /> },
                { label: 'Departments', href: '/organization/departments', icon: <IconBuilding size={18} /> },
                { label: 'Payments', href: '/organization/integrations', icon: <IconCreditCard size={18} /> },
                { label: 'WhatsApp alerts', href: '/organization/whatsapp', icon: <IconBrandWhatsapp size={18} /> },
                { label: 'Brand and documents', href: '/organization/brand', icon: <IconPalette size={18} /> },
                { label: 'Connected systems', href: '/organization/sign-in-partners', icon: <IconLogin2 size={18} /> },
                { label: 'Stand-ins', href: '/organization/delegations', icon: <IconUsersGroup size={18} /> },
            ],
        });
    }

    const isActive = (href: string) => {
        const [pathWithQuery] = href.split('#');
        const [path, queryString] = pathWithQuery.split('?');
        if (path === '/') return router.pathname === '/';
        if (queryString) {
            const expected = new URLSearchParams(queryString);
            return router.pathname === path && Array.from(expected.entries()).every(([key, value]) => String(router.query[key] || '') === value);
        }
        return router.pathname === path || router.pathname.startsWith(`${path}/`);
    };

    return (
        <AppShell
            header={{ height: 64 }}
            navbar={{ width: 260, breakpoint: '900px', collapsed: { mobile: !navOpened || Boolean(task), desktop: Boolean(task) } }}
            padding="md"
            styles={{
                header: { background: 'var(--mantine-color-body)', borderBottom: '1px solid var(--mantine-color-default-border)' },
                navbar: { background: 'var(--mantine-color-body)', borderRight: '1px solid var(--mantine-color-default-border)' },
                main: { background: 'var(--mantine-color-body)', color: 'var(--mantine-color-text)' },
            }}
        >
            <Head>
                <title>{title} | Credentis</title>
                <meta charSet="utf-8" />
                <meta name="viewport" content="initial-scale=1.0, width=device-width" />
            </Head>
            <AppShell.Header>
                <Box style={{ height: 3, background: `linear-gradient(90deg, ${BRAND.curious} 0%, ${BRAND.viking} 100%)` }} />
                <Group justify="space-between" h={61} px="md" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                        {compactHeader && (
                            <Burger opened={navOpened} onClick={() => setNavOpened((open) => !open)} aria-label="Open menu" />
                        )}
                        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                            <Group gap={6} wrap="nowrap" c={dark ? '#88C4E3' : BRAND.curious}>
                                <BrandMark size={40} />
                                <Text fw={700} size="lg">Credentis</Text>
                            </Group>
                        </Link>
                    </Group>
                    <Group gap="sm" wrap="nowrap">
                        <ActionIcon
                            variant="default"
                            size={44}
                            radius="md"
                            aria-label={dark ? 'Switch to Light mode' : 'Switch to Dark mode'}
                            onClick={() => toggleColorScheme()}
                        >
                            {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
                        </ActionIcon>
                        <Box style={{ flexShrink: 0, minWidth: compactHeader ? undefined : 220, maxWidth: 340 }}>
                            <OrgSwitcher compact={!!compactHeader} />
                        </Box>
                    </Group>
                </Group>
            </AppShell.Header>
            <AppShell.Navbar p="sm">
                <Box style={{ visibility: mounted ? 'visible' : 'hidden' }}>
                    {!task && groups.map((group) => (
                        <Box key={group.label} mb="md">
                            <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" mb={4}>{group.label}</Text>
                            {group.items.map((item) => {
                                const count = countFor(item.href);
                                return (
                                    <NavLink
                                        key={`${group.label}-${item.label}`}
                                        component={Link}
                                        href={item.href}
                                        label={item.label}
                                        leftSection={item.icon}
                                        active={isActive(item.href)}
                                        rightSection={count > 0 ? <Badge size="sm" circle>{count > 9 ? '9+' : count}</Badge> : undefined}
                                        onClick={() => setNavOpened(false)}
                                    />
                                );
                            })}
                        </Box>
                    ))}
                </Box>
            </AppShell.Navbar>
            <AppShell.Main>
                <LayoutNestingContext.Provider value={true}>
                    <div className="max-w-7xl mx-auto">
                        {task && (
                            <Alert mb="sm">
                                <Group justify="space-between">
                                    <Text size="sm">Opened for {activeOrg?.name || 'your organisation'}</Text>
                                    <Button size="xs" onClick={() => { endPortalTask(); void router.replace('/inbox'); }}>Back to inbox</Button>
                                </Group>
                            </Alert>
                        )}
                        {children}
                    </div>
                </LayoutNestingContext.Provider>
            </AppShell.Main>
        </AppShell>
    );
};

export default Layout;
