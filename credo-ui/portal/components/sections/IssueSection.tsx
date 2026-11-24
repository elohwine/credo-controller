import { PRODUCT_NAME } from '@/utils/orgProfile'
import RowCredential from "@/components/walt/credential/RowCredential";
import Dropdown from "@/components/walt/forms/Dropdown";
import {AuthenticationMethods, AvailableCredential, VpProfiles} from "@/types/credentials";
import Checkbox from "@/components/walt/forms/Checkbox";
import InputField from "@/components/walt/forms/Input";
import {CredentialsContext, EnvContext} from "@/pages/_app";
import React, {useState} from "react";
import {useRouter} from "next/router";
import {getOfferUrl} from "@/utils/getOfferUrl";
import {sendToWebWallet} from "@/utils/sendToWebWallet";
import { appUrls } from '@/lib/appUrls';
import { Button, Divider, Group, Stack, Text, Title } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";

export default function IssueSection() {
  const env = React.useContext(EnvContext);
  const [AvailableCredentials] = React.useContext(CredentialsContext);

  const [selectedAuthenticationMethod, setSelectedAuthenticationMethod] =
    React.useState(AuthenticationMethods[0]);
  const [requirePin, setRequirePin] = useState<boolean>(false);
  const [pin, setPin] = useState<string>('0235');
  const [requireVpRequestValue, setRequireVpRequestValue] =
    useState<boolean>(false);
  const [vpRequestValue, setVpRequestValue] = useState<string>(
    'NaturalPersonVerifiableID'
  );
  const [requireVpProfile, setRequireVpProfile] = useState<boolean>(false);
  const [selectedVpProfile, setSelectedVpProfile] = React.useState(
    VpProfiles[0]
  );

  const router = useRouter();
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
  }, [AvailableCredentials]);

  function handleCancel() {
    router.push('/');
  }

  async function handleIssue() {
    if (checkCallbackUrlParameter()) {
      const offer = await getOfferUrl(
        credentialsToIssue,
        env.NEXT_PUBLIC_VC_REPO ??
          appUrls.NEXT_PUBLIC_VC_REPO,
        env.NEXT_PUBLIC_ISSUER ??
          appUrls.NEXT_PUBLIC_ISSUER
      );
      sendToWebWallet(
        decodeURI(params.callback!.toString()),
        'api/siop/initiateIssuance',
        offer.data
      );
    } else {
      console.log('show qr-offer');
      localStorage.setItem('offer', JSON.stringify(credentialsToIssue));
      let url = `/offer?ids=${idsToIssue.join(',')}`;
      url = url + `&authenticationMethod=${selectedAuthenticationMethod}`;
      if (requireVpRequestValue && vpRequestValue?.trim().length) {
        url = url + `&vpRequestValue=${vpRequestValue}`;
      }
      if (requireVpProfile && selectedVpProfile?.trim().length) {
        url = url + `&vpProfile=${selectedVpProfile}`;
      }

      await router.push(url);
    }
  }

  function checkCallbackUrlParameter(): Boolean {
    const callback = params.callback;
    return !(callback === undefined || callback === null || callback === '');
  }

  if (params.ids === undefined) {
    return <Button onClick={() => router.push('/select-credentials')}>Select records</Button>;
  }

  const issueDisabled = !(
    credentialsToIssue.length > 0 &&
    (credentialsToIssue.length < 2 ||
      credentialsToIssue.filter(
        (cred) =>
          cred.selectedFormat === 'SD-JWT + W3C VC' ||
          cred.selectedFormat === 'SD-JWT + IETF SD-JWT VC'
      ).length === credentialsToIssue.length ||
      credentialsToIssue.filter(
        (cred) =>
          !cred.selectedFormat ||
          cred.selectedFormat === 'JWT + W3C VC'
      ).length === credentialsToIssue.length)
  );

  return (
    <>
      <Title order={1} ta="center">
        Customise issuance
      </Title>
      <Text mt="sm" c="dimmed">
        Adjust record details, format and security
      </Text>
      <Divider mt="xl" />
      <Text c="dimmed" ta="left" mt="xs" fw={600}>
        Record settings
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
      <Divider mt={40} />
      <Text c="dimmed" ta="left" mt="xs" fw={600}>
        Security settings
      </Text>
      <Stack gap="sm" mt="lg" ta="left">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <IconLock size={20} />
            <Text>Sign-in method</Text>
          </Group>
          <Dropdown
            values={AuthenticationMethods}
            selected={selectedAuthenticationMethod}
            setSelected={setSelectedAuthenticationMethod}
          />
        </Group>
        <Group justify="space-between" align="center">
          <Checkbox value={requirePin} onChange={setRequirePin}>
            Require User Pin
          </Checkbox>
          <InputField
            error={false}
            label="Test"
            value={pin}
            name="test"
            type="id"
            placeholder=""
            onChange={setPin}
          />
        </Group>
        <Group justify="space-between" align="center">
          <Checkbox
            value={requireVpRequestValue}
            onChange={setRequireVpRequestValue}
          >
            Requested proof value
          </Checkbox>
          <InputField
            error={false}
            label="Test"
            value={vpRequestValue}
            name="test"
            type="id"
            placeholder=""
            onChange={setVpRequestValue}
          />
        </Group>
        <Group justify="space-between" align="center">
          <Checkbox value={requireVpProfile} onChange={setRequireVpProfile}>
            Requested proof profile
          </Checkbox>
          <Dropdown
            values={VpProfiles}
            selected={selectedVpProfile}
            setSelected={setSelectedVpProfile}
          />
        </Group>
      </Stack>

      <Divider my="lg" />
      <Group justify="center" gap="sm" mt={56}>
        <Button onClick={handleCancel} variant="subtle" color="gray">
          Cancel
        </Button>
        <Button disabled={issueDisabled} onClick={handleIssue}>
          Issue
        </Button>
      </Group>
      <Group justify="center" gap="xs" mt={48}>
        <Text size="sm" c="dimmed">Secured by {PRODUCT_NAME}</Text>
        <img src="/brand-logo.svg" alt={PRODUCT_NAME} style={{ height: 15, width: 'auto' }} />
      </Group>
    </>
  );
}
