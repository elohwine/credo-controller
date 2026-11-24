import React from 'react';
import { Badge, Box, Button, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconFolder, IconPlayerPlay, IconSettings } from '@tabler/icons-react';

interface Workflow {
    id: string;
    name: string;
    category: string;
    description: string;
    provider: string;
}

interface WorkflowListProps {
    workflows: Workflow[];
    onSelect: (workflow: Workflow) => void;
}

const WorkflowList: React.FC<WorkflowListProps> = ({ workflows = [], onSelect }) => {
    // Safety check: ensure workflows is an array
    const workflowsArray = Array.isArray(workflows) ? workflows : [];
    
    // Group by category
    const grouped = workflowsArray.reduce((acc, wf) => {
        if (!acc[wf.category]) acc[wf.category] = [];
        acc[wf.category].push(wf);
        return acc;
    }, {} as Record<string, Workflow[]>);

    if (workflowsArray.length === 0) {
        return (
            <Paper withBorder radius="md" py={48} px="md">
                <Stack align="center" gap={4}>
                    <Box c="dimmed" mb="xs" style={{ display: 'flex' }}><IconSettings size={44} stroke={1.5} /></Box>
                    <Text size="lg">No workflows available.</Text>
                    <Text size="sm" c="dimmed">Workflows will appear here once configured.</Text>
                </Stack>
            </Paper>
        );
    }

    return (
        <Stack gap="xl">
            {Object.entries(grouped).map(([category, items]) => (
                <Stack key={category} gap="md">
                    <Group gap="sm" pb="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
                        <Box c="dimmed" style={{ display: 'flex' }}><IconFolder size={22} /></Box>
                        <Title order={3}>{category}</Title>
                        <Text size="sm" c="dimmed">({items.length} workflows)</Text>
                    </Group>
                    <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
                        {items.map((wf) => (
                            <Paper key={wf.id} withBorder radius="md" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <Box p="md" style={{ flex: 1 }}>
                                    <Group align="flex-start" gap="sm" wrap="nowrap">
                                        <ThemeIcon variant="light" color="gray" size="lg" radius="md">
                                            <IconSettings size={18} />
                                        </ThemeIcon>
                                        <div>
                                            <Text fw={600} size="lg">{wf.name}</Text>
                                            <Badge variant="default" radius="xl" size="sm" tt="none" mt={4}>
                                                {wf.provider}
                                            </Badge>
                                        </div>
                                    </Group>
                                    <Text mt="sm" size="sm" c="dimmed" lineClamp={2}>{wf.description}</Text>
                                </Box>
                                <Box px="md" py="sm" bg="var(--mantine-color-default-hover)">
                                    <Button fullWidth leftSection={<IconPlayerPlay size={16} />} onClick={() => onSelect(wf)}>
                                        Select Workflow
                                    </Button>
                                </Box>
                            </Paper>
                        ))}
                    </SimpleGrid>
                </Stack>
            ))}
        </Stack>
    );
};

export default WorkflowList;
