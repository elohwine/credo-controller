import React, { useState, useEffect, useContext } from 'react';
import Layout from '@/components/Layout';
import { EnvContext } from '@/pages/_app';
import { Badge, Button, Group, Modal, Paper, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconBan, IconCircleCheck, IconFileCertificate, IconSearch } from '@tabler/icons-react';
import { StatTile } from '../../../shared/StatTile';

interface Credential {
    id: string;
    type: string;
    subjectId: string;
    issuer: string;
    issuedAt: string;
    revoked: boolean;
    revokedAt?: string;
}

export default function RevocationPage() {
    const [credentials, setCredentials] = useState<Credential[]>([]);
    const env = useContext(EnvContext);
    const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const [searchTerm, setSearchTerm] = useState('');
    const [showRevokeModal, setShowRevokeModal] = useState(false);
    const [selectedCredential, setSelectedCredential] = useState<Credential | null>(null);

    useEffect(() => {
        if (env.NEXT_PUBLIC_BACKEND_URL) fetchCredentials();
    }, [env.NEXT_PUBLIC_BACKEND_URL]);

    const fetchCredentials = async () => {
        try {
            const res = await fetch(`${backendUrl}/api/revocation/credentials`);
            const data = await res.json();
            setCredentials(data.credentials || []);
        } catch (error) {
            console.warn('Failed to fetch credentials:', error);
        }
    };

    const handleRevoke = async (credentialId: string) => {
        try {
            const res = await fetch(`${backendUrl}/api/revocation/revoke/${credentialId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'Manual revocation' })
            });
            if (res.ok) {
                setShowRevokeModal(false);
                setSelectedCredential(null);
                fetchCredentials();
            }
        } catch (error) {
            console.error('Failed to revoke credential:', error);
        }
    };

    const filteredCredentials = credentials.filter(c =>
        c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.subjectId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.type.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const closeRevokeModal = () => {
        setShowRevokeModal(false);
        setSelectedCredential(null);
    };

    return (
        <Layout title="Revocation">
            <Stack gap="lg" p={{ base: 'sm', sm: 'lg' }}>
                <div>
                    <Title order={2}>Revocation</Title>
                    <Text size="sm" c="dimmed" mt={4}>
                        Withdraw signed records that should no longer be trusted
                    </Text>
                </div>

                {/* Stats */}
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                    <StatTile label="Signed records" value={credentials.length} icon={IconFileCertificate} />
                    <StatTile label="Active" value={credentials.filter(c => !c.revoked).length} icon={IconCircleCheck} />
                    <StatTile label="Revoked" value={credentials.filter(c => c.revoked).length} icon={IconBan} />
                </SimpleGrid>

                <TextInput
                    placeholder="Search by ID, issued to, or type..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.currentTarget.value)}
                    leftSection={<IconSearch size={16} />}
                    aria-label="Search records"
                />

                <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                    <Table.ScrollContainer minWidth={720}>
                        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                            <Table.Thead bg="var(--mantine-color-default-hover)">
                                <Table.Tr>
                                    <Table.Th>Record ID</Table.Th>
                                    <Table.Th>Type</Table.Th>
                                    <Table.Th>Issued to</Table.Th>
                                    <Table.Th>Issued</Table.Th>
                                    <Table.Th>Status</Table.Th>
                                    <Table.Th>Actions</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {filteredCredentials.map((cred) => (
                                    <Table.Tr key={cred.id}>
                                        <Table.Td><Text size="sm" ff="monospace">{cred.id.substring(0, 16)}...</Text></Table.Td>
                                        <Table.Td><Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{cred.type}</Text></Table.Td>
                                        <Table.Td><Text size="sm" c="dimmed">{cred.subjectId}</Text></Table.Td>
                                        <Table.Td><Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{new Date(cred.issuedAt).toLocaleDateString()}</Text></Table.Td>
                                        <Table.Td>
                                            {cred.revoked ? (
                                                <Badge variant="light" color="red" leftSection={<IconBan size={12} />}>Revoked</Badge>
                                            ) : (
                                                <Badge variant="light" color="green" leftSection={<IconCircleCheck size={12} />}>Active</Badge>
                                            )}
                                        </Table.Td>
                                        <Table.Td>
                                            {!cred.revoked && (
                                                <Button
                                                    size="xs"
                                                    color="red"
                                                    variant="light"
                                                    onClick={() => {
                                                        setSelectedCredential(cred);
                                                        setShowRevokeModal(true);
                                                    }}
                                                >
                                                    Revoke
                                                </Button>
                                            )}
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                                {filteredCredentials.length === 0 && (
                                    <Table.Tr>
                                        <Table.Td colSpan={6}>
                                            <Text ta="center" c="dimmed" size="sm" py="lg">No records found</Text>
                                        </Table.Td>
                                    </Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Paper>

                <Modal
                    opened={showRevokeModal && !!selectedCredential}
                    onClose={closeRevokeModal}
                    centered
                    title={
                        <Group gap="xs">
                            <IconBan size={20} color="var(--mantine-color-red-filled)" />
                            <Text fw={600}>Revoke record</Text>
                        </Group>
                    }
                >
                    {selectedCredential && (
                        <Stack gap="md">
                            <Text size="sm">
                                Are you sure you want to revoke this record? This action cannot be undone.
                            </Text>
                            <Paper withBorder radius="sm" p="sm" bg="var(--mantine-color-default-hover)">
                                <Stack gap="xs">
                                    <div>
                                        <Text size="xs" c="dimmed" fw={500}>Type</Text>
                                        <Text size="sm">{selectedCredential.type}</Text>
                                    </div>
                                    <div>
                                        <Text size="xs" c="dimmed" fw={500}>Issued to</Text>
                                        <Text size="sm">{selectedCredential.subjectId}</Text>
                                    </div>
                                </Stack>
                            </Paper>
                            <Group justify="flex-end" gap="sm">
                                <Button variant="default" onClick={closeRevokeModal}>Cancel</Button>
                                <Button color="red" onClick={() => handleRevoke(selectedCredential.id)}>Revoke</Button>
                            </Group>
                        </Stack>
                    )}
                </Modal>
            </Stack>
        </Layout>
    );
}
