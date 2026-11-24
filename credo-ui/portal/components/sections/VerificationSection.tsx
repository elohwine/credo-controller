import { PRODUCT_NAME } from '@/utils/orgProfile'
import RowCredential from "@/components/walt/credential/RowCredential";
import PolicyListItem from "@/components/walt/policy/PolicyListItem";
import {AvailableCredential} from "@/types/credentials";
import InputField from "@/components/walt/forms/Input";
import { Button, Divider, Group, Stack, Text, Title } from "@mantine/core";
import React, {useContext, useState} from "react";
import {CredentialsContext} from "@/pages/_app";
import {useRouter} from "next/router";

export default function VerificationSection() {
  const router = useRouter();
  const [AvailableCredentials] = useContext(CredentialsContext);

  const [signaturePolicy, setSignaturePolicy] = useState<boolean>(true);
  const [expiredPolicy, setExpiredPolicy] = useState<boolean>(true);
  const [notBeforePolicy, setNotBeforePolicy] = useState<boolean>(true);
  const [webhookPolicy, setWebhookPolicy] = useState<boolean>(false);
  const [webhook, setWebhook] = useState<string>('');

  function handleCancel() {
    router.push('/');
  }

  const params = router.query;

  // Safely parse idsToIssue from URL parameters
  const idsToIssue: string[] = React.useMemo(() => {
    const idsParam = (params as any)?.ids;
    if (!idsParam) return [];
    
    // Handle both comma-separated and single ID cases
    if (typeof idsParam === 'string') {
      return idsParam.includes(',') ? idsParam.split(',').filter(Boolean) : [idsParam];
    }
    
    // Handle array case
    if (Array.isArray(idsParam)) {
      return idsParam.filter(Boolean);
    }
    
    return [];
  }, [params]);
  
  const [credentialsToIssue, setCredentialsToIssue] = useState<
    AvailableCredential[]
  >([]);

  React.useEffect(() => {
    setCredentialsToIssue(
      AvailableCredentials.filter((cred) => {
        // Safety check: ensure we have valid IDs and credentials
        if (!cred?.id || idsToIssue.length === 0) return false;
        
        return idsToIssue.some(id => {
          // Safety check: ensure id exists and can be converted to string
          if (!id) return false;
          return String(id) === String(cred.id);
        });
      })
    );
  }, [AvailableCredentials, idsToIssue]);

  function handleVerify() {
    const vps = [];
    if (signaturePolicy) {
      vps.push('signature');
    }
    if (expiredPolicy) {
      vps.push('expired');
    }
    if (notBeforePolicy) {
      vps.push('not-before');
    }
    if (webhookPolicy) {
      if (webhook.length == 0) {
        alert('Please enter a webhook url');
        return;
      }
      vps.push('webhook=' + webhook);
    }

    const params = new URLSearchParams();
    params.append('ids', idsToIssue.join(','));
    if (vps.length) {
      params.append('vps', vps.join(','));
    }

    params.append(
      'format',
      (credentialsToIssue[0]?.selectedFormat ?? 'JWT + W3C VC') as string
    );
    router.push(`/verify?${params.toString()}`);
  }

  if (params.ids === undefined) {
    return <Button onClick={() => router.push('/select-credentials')}>Select records</Button>;
  }

  return (
    <>
      <Title order={1} ta="center">
        Customise check
      </Title>
      <Text mt="sm" c="dimmed">
        Choose the record format and the rules to check
      </Text>
      <Divider mt="xl" />
      <Text c="dimmed" ta="left" mt="xs" fw={600}>
        Record formats
      </Text>
      <Stack gap="lg" mt={48}>
        {credentialsToIssue.map((credential) => (
          <RowCredential
            credentialToEdit={credential}
            credentialsToIssue={credentialsToIssue}
            setCredentialsToIssue={setCredentialsToIssue}
            key={credential.title}
          />
        ))}
      </Stack>
      <Divider mt={48} />
      <Text c="dimmed" ta="left" mt="xs" fw={600}>
        Checks
      </Text>
      <Stack gap="sm" mt="xl" ta="left">
        <PolicyListItem
          name="Signature Policy"
          value={signaturePolicy}
          onChange={setSignaturePolicy}
        />
        <PolicyListItem
          name="Expired Policy"
          value={expiredPolicy}
          onChange={setExpiredPolicy}
        />
        <PolicyListItem
          name="Not Before Policy"
          value={notBeforePolicy}
          onChange={setNotBeforePolicy}
        />
        <Group justify="space-between" align="center">
          <PolicyListItem
            name="Webhook Policy"
            value={webhookPolicy}
            onChange={setWebhookPolicy}
          />
          <InputField
            error={false}
            label=""
            value={webhook}
            name=""
            type=""
            placeholder="https://webhook.site/..."
            onChange={setWebhook}
          />
        </Group>
      </Stack>
      <Divider mt={48} />
      <Group justify="center" gap="sm" mt={56}>
        <Button onClick={handleCancel} variant="subtle" color="gray">
          Cancel
        </Button>
        <Button onClick={handleVerify}>Verify</Button>
      </Group>
      <Group justify="center" gap="xs" mt={48}>
        <Text size="sm" c="dimmed">Secured by {PRODUCT_NAME}</Text>
        <img src="/brand-logo.svg" alt={PRODUCT_NAME} style={{ height: 15, width: 'auto' }} />
      </Group>
    </>
  );
}
