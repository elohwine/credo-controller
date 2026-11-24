import { PRODUCT_NAME } from '@/utils/orgProfile'
import {useRouter} from "next/router";
import { IconScan, IconRubberStamp } from "@tabler/icons-react";
import {useEffect, useState} from "react";
import SelectButton from "@/components/walt/forms/SelectButton";
import IssueSection from "@/components/sections/IssueSection";
import VerificationSection from "@/components/sections/VerificationSection";
import {addQueryParamToCurrentURL} from "@/lib/helper/addQueryParamToCurrentURL";
import { Group, Paper, Stack, UnstyledButton } from "@mantine/core";

const ISSUE_MODE = 'issuance';
const VERIFY_MODE = 'verification';

type PortalMode = typeof ISSUE_MODE | typeof VERIFY_MODE;

export default function Credentials() {
  const [portalType, setPortalType] = useState<PortalMode>(ISSUE_MODE);

  const issuanceMode = portalType === ISSUE_MODE;
  const verificationMode = portalType === VERIFY_MODE;

  const router = useRouter();
  const params = router.query;

  useEffect(() => {
    if (!router.isReady) return;
    if (params.mode !== VERIFY_MODE) {
      void router.replace('/organization/credential-operations');
      return;
    }

    const ids = params?.ids;
    const hasIds =
      (typeof ids === 'string' && ids.trim().length > 0) ||
      (Array.isArray(ids) && ids.some((v) => typeof v === 'string' && v.trim().length > 0));

    // If user navigated here directly (e.g., via menu/bookmark) without selecting credentials,
    // send them through the credential selection flow.
    if (!hasIds) {
      router.replace('/select-credentials?mode=verification');
    }
  }, [router.isReady, params, router]);

  function handlePortalModeChange() {
    if (portalType === VERIFY_MODE) {
      void router.push('/organization/credential-operations');
    } else {
      setPortalType(VERIFY_MODE);
      addQueryParamToCurrentURL('mode', VERIFY_MODE);
    }
  }

  useEffect(() => {
    const { mode } = params;
    if (mode !== undefined) {
      if ((mode as unknown as PortalMode) === ISSUE_MODE) {
        setPortalType(ISSUE_MODE);
      } else {
        setPortalType(VERIFY_MODE);
      }
    }
  }, [params]);

  // While redirecting, keep the page quiet (prevents brief flashes of the old UI).
  if (router.isReady) {
    const ids = params?.ids;
    const hasIds =
      (typeof ids === 'string' && ids.trim().length > 0) ||
      (Array.isArray(ids) && ids.some((v) => typeof v === 'string' && v.trim().length > 0));
    if (!hasIds || params.mode !== VERIFY_MODE) return null;
  }

  return (
    <Stack align="center" gap="lg" py="xl" px="sm">
      <UnstyledButton onClick={() => router.push('/')} aria-label={`${PRODUCT_NAME} home`}>
        <img src="/brand-logo.svg" alt={PRODUCT_NAME} style={{ height: 35, width: 'auto', display: 'block' }} />
      </UnstyledButton>
      <Paper radius="md" p={6} bg="var(--mantine-color-default-hover)">
        <Group gap="xs">
          <SelectButton
            icon={IconRubberStamp}
            selected={issuanceMode}
            onClick={handlePortalModeChange}
          >
            Issue
          </SelectButton>
          <SelectButton
            icon={IconScan}
            selected={verificationMode}
            onClick={handlePortalModeChange}
          >
            Verify
          </SelectButton>
        </Group>
      </Paper>

      <Paper shadow="xl" radius="md" withBorder py="xl" px={{ base: 'md', sm: 40 }} w={{ base: '92%', md: '58%' }} maw={960} ta="center">
        {issuanceMode && <IssueSection />}
        {verificationMode && <VerificationSection />}
      </Paper>
    </Stack>
  );
}
