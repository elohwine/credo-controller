import React from 'react';
import Layout from '@/components/Layout';
import { ActionCard } from '@/components/dashboard/ActionCard';
import { Container, Title, SimpleGrid, Box, Text, Divider } from '@mantine/core';
import {
    IconBuildingStore,
    IconCoin,
    IconPackage,
    IconChartBar,
    IconUsers,
    IconUserPlus,
    IconCash,
    IconCertificate,
    IconFileCheck,
    IconGitBranch,
    IconStars,
    IconShieldOff,
    IconBrandWhatsapp,
} from '@tabler/icons-react';

export default function Home() {
    return (
        <Layout title="Dashboard">
            <Container size="xl" py="xl">
                <Box mb="xl">
                    <Title order={2} size="h1" mb="sm" fw={900}>Welcome to Credentis</Title>
                    <Text c="dimmed" size="lg">Select a module to manage your verifiable commerce operations.</Text>
                </Box>

                {/* Core Modules - Prominent */}
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg" mb={50}>
                     <ActionCard 
                        title="Credentials" 
                        description="Manage credential definitions and schemas"
                        icon={IconCertificate} 
                        href="/credential-models"
                    />
                    <ActionCard 
                        title="Issue / Verify" 
                        description="Issue credentials to wallets or verify presentations"
                        icon={IconFileCheck} 
                        href="/select-credentials"
                    />
                    <ActionCard 
                        title="Workflows" 
                        description="Monitor automated business processes"
                        icon={IconGitBranch} 
                        href="/workflows"
                    />
                </SimpleGrid>

                <Divider my="xl" label="Modules" labelPosition="center" />
                
                {/* Business */}
                <Box mb="xl">
                    <Title order={4} mb="md" c="dimmed" tt="uppercase" size="sm" fw={700}>Business Operations</Title>
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
                        <ActionCard title="Catalog" description="Products & services" icon={IconBuildingStore} href="/catalog" />
                        <ActionCard title="Finance" description="Reports & statements" icon={IconCoin} href="/finance" />
                        <ActionCard title="Inventory" description="Stock management" icon={IconPackage} href="/inventory/dashboard" />
                        <ActionCard title="Metrics" description="System analytics" icon={IconChartBar} href="/metrics" />
                    </SimpleGrid>
                </Box>

                {/* People */}
                <Box mb="xl">
                    <Title order={4} mb="md" c="dimmed" tt="uppercase" size="sm" fw={700}>People & HR</Title>
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
                        <ActionCard title="HR Ops" description="Staff management" icon={IconUsers} href="/hr/operations" />
                        <ActionCard title="Onboarding" description="New employee setup" icon={IconUserPlus} href="/onboarding" />
                        <ActionCard title="Payroll" description="Salary & compensation" icon={IconCash} href="/payroll" />
                    </SimpleGrid>
                </Box>

                {/* Trust */}
                <Box>
                    <Title order={4} mb="md" c="dimmed" tt="uppercase" size="sm" fw={700}>Trust & Security</Title>
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
                        <ActionCard title="Trust Scores" description="Reputation management" icon={IconStars} href="/trust" />
                        <ActionCard title="Revocation" description="Manage invalid credentials" icon={IconShieldOff} href="/revocation" />
                        <ActionCard title="WhatsApp" description="Commerce integration" icon={IconBrandWhatsapp} href="/whatsapp" />
                    </SimpleGrid>
                </Box>

            </Container>
        </Layout>
    );
}
