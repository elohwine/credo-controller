import React from 'react';
import Layout from '@/components/Layout';
import { ActionCard } from '@/components/dashboard/ActionCard';
import { Container, Title, SimpleGrid, Box, Text, Divider } from '@mantine/core';
import {
    IconBuildingStore,
    IconCertificate,
    IconFileCheck,
    IconReceipt,
    IconUserPlus,
} from '@tabler/icons-react';

export default function Home() {
    return (
        <Layout title="Dashboard">
            <Container size="xl" py="xl">
                <Box mb="xl">
                    <Title order={2} size="h1" mb="sm" fw={900}>Welcome to Credentis</Title>
                    <Text c="dimmed" size="lg">Fast-lane verifiable commerce trust for Zimbabwe</Text>
                </Box>

                {/* MVP Core - Fastlane Commerce */}
                {/* MVP Core - Fastlane Commerce */}
                <Box mb="xl">
                    <Title order={4} mb="md" c="dimmed" tt="uppercase" size="sm" fw={700}>🚀 Fastlane MVP</Title>
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
                        <ActionCard 
                            title="Register / Login" 
                            description="Create account or sign in"
                            icon={IconUserPlus} 
                            href="/auth"
                        />
                        <ActionCard 
                            title="Live Shop" 
                            description="Buy products, get Receipt VC"
                            icon={IconBuildingStore} 
                            href="/shop"
                        />
                        <ActionCard 
                            title="My Wallet" 
                            description="View your receipts & credentials"
                            icon={IconReceipt} 
                            href="/wallet"
                        />
                        <ActionCard 
                            title="Driver Verify" 
                            description="Verify delivery with receipt"
                            icon={IconFileCheck} 
                            href="/verify"
                        />
                    </SimpleGrid>
                </Box>

                {/* Platform Admin */}
                <Box mb="xl">
                    <Title order={4} mb="md" c="dimmed" tt="uppercase" size="sm" fw={700}>⚙️ Platform Admin</Title>
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
                        <ActionCard 
                            title="Credentials" 
                            description="Manage credential schemas"
                            icon={IconCertificate} 
                            href="/credential-models"
                        />
                        <ActionCard 
                            title="Issue / Verify" 
                            description="Manual credential operations"
                            icon={IconFileCheck} 
                            href="/select-credentials"
                        />
                    </SimpleGrid>
                </Box>

                {/* Future Phases - Commented Out */}
                {/* ===== PHASE 2+ FEATURES - DEFERRED ===== */}

                {/* 
                <Box mb="xl">
                    <Title order={4} mb="md" c="dimmed" tt="uppercase" size="sm" fw={700}>📊 Business Operations (Phase 2)</Title>
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
                        <ActionCard title="Catalog Admin" description="Products & services" icon={IconBuildingStore} href="/catalog" />
                        <ActionCard title="Finance" description="Reports & statements" icon={IconCoin} href="/finance" />
                        <ActionCard title="Inventory" description="Stock management" icon={IconPackage} href="/inventory/dashboard" />
                        <ActionCard title="Metrics" description="System analytics" icon={IconChartBar} href="/metrics" />
                    </SimpleGrid>
                </Box>

                <Box mb="xl">
                    <Title order={4} mb="md" c="dimmed" tt="uppercase" size="sm" fw={700}>👥 HR & Payroll (Phase 3+)</Title>
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
                        <ActionCard title="HR Operations" description="Staff management" icon={IconUsers} href="/hr/operations" />
                        <ActionCard title="Onboarding" description="New employee setup" icon={IconUserPlus} href="/onboarding" />
                        <ActionCard title="Payroll" description="Salary & compensation" icon={IconCash} href="/payroll" />
                    </SimpleGrid>
                </Box>

                <Box>
                    <Title order={4} mb="md" c="dimmed" tt="uppercase" size="sm" fw={700}>🤝 Advanced Features (Phase 4+)</Title>
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
                        <ActionCard title="Trust Scores" description="Reputation management" icon={IconStars} href="/trust" />
                        <ActionCard title="Workflows" description="Automated processes" icon={IconGitBranch} href="/workflows" />
                        <ActionCard title="WhatsApp" description="Commerce integration" icon={IconBrandWhatsapp} href="/whatsapp" />
                    </SimpleGrid>
                </Box>
                */}

            </Container>
        </Layout>
    );
}
