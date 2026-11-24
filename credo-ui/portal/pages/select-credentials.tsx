import React, { useMemo, useState } from "react";
import Credential from "@/components/walt/credential/Credential";
import { AvailableCredential } from "@/types/credentials";
import { CredentialsContext, EnvContext } from "@/pages/_app";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import axios from "axios";
import { ensurePortalTenant } from "@/utils/portalTenant";
import { Box, Button, Group, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";

type CredentialToIssue = AvailableCredential & {
  selected: boolean;
};

export default function SelectCredentials() {
  const [AvailableCredentials] = React.useContext(CredentialsContext);
  const env = React.useContext(EnvContext);
  const router = useRouter();
  const verification = router.query.mode === 'verification';

  React.useEffect(() => {
    if (router.isReady && !verification) void router.replace('/organization/credential-operations');
  }, [router.isReady, router, verification]);

  const [definitionTypeById, setDefinitionTypeById] = useState<Record<string, string>>({});

  const [credentialsToIssue, setCredentialsToIssue] = useState<CredentialToIssue[]>(
    prepareCredentialsToIssue
  );
  const [searchTerm, setSearchTerm] = useState<string>("");

  const showButton = credentialsToIssue.some((cred) => cred.selected);

  function prepareCredentialsToIssue(): CredentialToIssue[] {
    return AvailableCredentials.map((cred: AvailableCredential) => {
      return {
        ...cred,
        selected: false,
      };
    });
  }

  React.useEffect(() => {
    setCredentialsToIssue(prepareCredentialsToIssue());
  }, [AvailableCredentials]);

  React.useEffect(() => {
    const loadDefinitions = async () => {
      const credoBackend = env?.NEXT_PUBLIC_VC_REPO;
      if (!credoBackend) return;

      try {
        const { tenantToken } = await ensurePortalTenant(credoBackend);
        const resp = await axios.get(`${credoBackend}/oidc/credential-definitions`, {
          headers: { Authorization: `Bearer ${tenantToken}` },
        });

        const defs: any[] = Array.isArray(resp.data) ? resp.data : [];
        const map: Record<string, string> = {};

        for (const def of defs) {
          const typeKey =
            Array.isArray(def?.credentialType) && def.credentialType.length
              ? def.credentialType[def.credentialType.length - 1]
              : undefined;
          if (!typeKey) continue;

          if (def?.credentialDefinitionId) map[String(def.credentialDefinitionId)] = String(typeKey);
          if (def?.name) map[String(def.name)] = String(typeKey);
        }

        setDefinitionTypeById(map);
      } catch {
        console.warn('[select-credentials] Failed to load credential definitions for grouping');
      }
    };

    loadDefinitions();
  }, [env?.NEXT_PUBLIC_VC_REPO]);

  const groupedCredentials = useMemo(() => {
    const groups: Record<string, CredentialToIssue[]> = {};

    const filtered = !searchTerm
      ? credentialsToIssue
      : credentialsToIssue.filter((credential) =>
          credential.title.toLowerCase().includes(searchTerm.toLowerCase())
        );

    for (const cred of filtered) {
      const typeKey = definitionTypeById[cred.id] || definitionTypeById[cred.title] || 'Other';
      if (!groups[typeKey]) groups[typeKey] = [];
      groups[typeKey].push(cred);
    }

    const ordered: Record<string, CredentialToIssue[]> = {};
    const keys = Object.keys(groups).sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });
    for (const k of keys) ordered[k] = groups[k];
    return ordered;
  }, [credentialsToIssue, definitionTypeById, searchTerm]);

  const totalVisible = Object.values(groupedCredentials).reduce((sum, arr) => sum + arr.length, 0);

  function getIdsForCredentialsToIssue() {
    const ids: string[] = [];
    credentialsToIssue.forEach((cred) => {
      if (cred.selected) {
        ids.push(cred.id);
      }
    });

    return ids;
  }

  function handleCredentialSelect(id: string) {
    const updatedCreds = credentialsToIssue.map((cred) => {
      if (cred.id === id) {
        return {
          ...cred,
          selected: !cred.selected,
        };
      } else {
        return cred;
      }
    });

    setCredentialsToIssue(updatedCreds);
  }

  function handleStartIssuance() {
    const idsToIssue = getIdsForCredentialsToIssue();

    const params = new URLSearchParams();
    params.append("ids", idsToIssue.join(","));
    params.append("mode", "verification");

    router.push(`/credentials?${params.toString()}`);
  }

  function handleSearchTermChange(e: any) {
    const value = e.target.value;
    setSearchTerm(value);
  }

  if (!router.isReady || !verification) return null;

  return (
    <Layout title="Select records">
      <Box maw={1024} mx="auto" px="md" py="xl">
        <Stack align="center" gap="xs" mb={40} mt="md">
          <Title order={1} ta="center">
            Select records
          </Title>
          <Text size="lg" c="dimmed" ta="center">
            Choose the record(s) to check
          </Text>
        </Stack>

        <Stack component="main" align="center" gap="lg">
          <Group w="100%" maw={768} px="md" gap="md" wrap="nowrap">
            <TextInput
              flex={1}
              size="md"
              placeholder="Search records..."
              aria-label="Search records"
              leftSection={<IconSearch size={18} />}
              onChange={handleSearchTermChange}
            />
            {showButton && (
              <Button size="lg" onClick={handleStartIssuance} style={{ flexShrink: 0 }}>
                Continue
              </Button>
            )}
          </Group>

          {totalVisible === 0 && (
            <Text c="dimmed" ta="center" mt={40}>
              No records found matching "{searchTerm}"
            </Text>
          )}

          <Stack w="100%" maw={768} mt={40} gap={40}>
            {Object.entries(groupedCredentials).map(([typeKey, items]) => (
              <Stack key={typeKey} gap="md">
                <Group
                  justify="space-between"
                  pb="xs"
                  style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
                >
                  <Title order={2} size="h4">
                    {typeKey}
                  </Title>
                  <Text size="sm" c="dimmed">
                    {items.length}
                  </Text>
                </Group>
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" verticalSpacing={40}>
                  {items.map(({ id, title, selected }) => (
                    <Credential
                      id={id}
                      title={title}
                      selected={selected}
                      onClick={handleCredentialSelect}
                      key={id}
                    />
                  ))}
                </SimpleGrid>
              </Stack>
            ))}
          </Stack>
        </Stack>
      </Box>
    </Layout>
  );
}
