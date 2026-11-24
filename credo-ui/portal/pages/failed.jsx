import { PRODUCT_NAME } from '@/utils/orgProfile'
import {useState} from "react";
import { Box, Center, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconCircleX } from '@tabler/icons-react';

export default function Failed() {
  const [verificationPolicies, setVerificationPolicies] = useState([
    'SignaturePolicy',
    'ChallengePolicy',
    'PresentationDefinitionPolicy',
  ]);

  return (
    <Center mih="100vh" p={{ base: 0, sm: 'md' }} bg="var(--mantine-color-body)">
      <Paper
        shadow="xl"
        radius="md"
        withBorder
        py="xl"
        px={{ base: 'md', sm: 40 }}
        w={{ base: '100%', sm: '83%', md: '66%', lg: '50%' }}
        ta="center"
      >
        <Title order={1} mb={40}>
          Shared records
        </Title>
        <Center>
          <Paper
            radius="lg"
            shadow="sm"
            py={28}
            px="xl"
            w={{ base: 320, sm: 400 }}
            h={{ base: 240, sm: 225 }}
            ta="left"
            style={{
              overflow: 'hidden',
              color: 'var(--mantine-color-white)',
              background: 'linear-gradient(to right, var(--mantine-color-red-7), var(--mantine-color-red-9))',
            }}
          >
            <img src="/brand-logo.svg" alt={PRODUCT_NAME} style={{ height: 35, width: 'auto' }} />
            <Title order={3} c="white" mt={48}>
              Failed to verify
            </Title>
          </Paper>
        </Center>
        <Box mt={40} px={{ base: 0, sm: 'xl' }}>
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            {verificationPolicies.map((policy) => (
              <Group key={policy} gap="sm">
                <ThemeIcon variant="light" color="red" size="sm" radius="xl">
                  <IconCircleX size={14} />
                </ThemeIcon>
                <Text>{policy}</Text>
              </Group>
            ))}
          </SimpleGrid>
        </Box>
        <Stack align="center" mt={48}>
          <Group gap="xs">
            <Text size="sm" c="dimmed">Secured by {PRODUCT_NAME}</Text>
            <img src="/brand-logo.svg" alt={PRODUCT_NAME} style={{ height: 15, width: 'auto' }} />
          </Group>
        </Stack>
      </Paper>
    </Center>
  );
}
