import { PRODUCT_NAME } from '@/utils/orgProfile'
import React, {useContext, useEffect, useState} from "react";
import { ActionIcon, Anchor, Box, Center, Group, Paper, SimpleGrid, Text, Textarea, ThemeIcon, Title } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconCircleCheck, IconCircleX } from '@tabler/icons-react';
import {useRouter} from "next/router";
import axios from "axios";
import { appUrls } from '@/lib/appUrls';
import Modal from "@/components/walt/modal/BaseModal";
import {EnvContext} from "@/pages/_app";

export default function Success() {
  const env = useContext(EnvContext);
  const router = useRouter();
  const [vctName, setVctName] = useState<string | null>(null);

  const [policyResults, setPolicyResults] = useState<
    Array<{
      policyResults: Array<{
        policy: string;
        is_success: boolean;
      }>;
    }>
  >([]);
  const [credentials, setCredentials] = useState<
    Array<{
      type: Array<string>;
      vct: Array<string>;
      credentialSubject: {
        [key: string]: string;
      };
    }>
  >([]);
  const [index, setIndex] = useState<number>(0);
  const [modal, setModal] = useState<boolean>(false);
  const [flipped, setFlipped] = useState<boolean>(false);

  function parseJwt(token: string) {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  }

  const fetchVctName = async (vctUrl: string) => {
    try {
      const response = await axios.get(vctUrl);
      const bodyJson = response.data;
      return bodyJson['name'];
    } catch (error) {
      console.error('Error fetching vct:', error);
      return 'Unknown VCT'; // Fallback value if the request fails
    }
  };

  useEffect(() => {
    if (!router.isReady) return;
    axios
      .get(
        `${env.NEXT_PUBLIC_VERIFIER ? env.NEXT_PUBLIC_VERIFIER : appUrls.NEXT_PUBLIC_VERIFIER}/openid4vc/session/${router.query.sessionId}`
      )
      .then((response) => {
        let parsedToken = parseJwt(response.data.tokenResponse.vp_token);
        let containsVP = !!parsedToken.vp?.verifiableCredential;
        let vcs = containsVP
          ? parsedToken.vp?.verifiableCredential
          : [response.data.tokenResponse.vp_token];

        setCredentials(
          Array.isArray(vcs)
            ? vcs.map((vc: string) => {
              if (typeof vc !== 'string') {
                console.error(
                  'Invalid VC format: expected a string but got',
                  vc
                );
                return vc;
              }
              let split = vc.split('~');
              let parsed = parseJwt(split[0]);

              if (split.length === 1) return parsed.vc ? parsed.vc : parsed;
              else {
                let credentialWithSdJWTAttributes = { ...parsed };
                split.slice(1).forEach((item) => {
                  // If it is key binding jwt, skip
                  if (item.split('.').length === 3) return;

                  let parsedItem = JSON.parse(
                    Buffer.from(item, 'base64').toString()
                  );
                  credentialWithSdJWTAttributes.credentialSubject = {
                    [parsedItem[1]]: parsedItem[2],
                    ...credentialWithSdJWTAttributes.credentialSubject,
                  };
                  // credentialWithSdJWTAttributes.credentialSubject._sd.map((sdItem: string) => {
                  //   if (sdItem === parsedItem[0]) {
                  //     return `${parsedItem[1]}: ${parsedItem[2]}`
                  //   }
                  //   return sdItem;
                  // })
                });
                credentialWithSdJWTAttributes.type = parsed.vc?.type
                return credentialWithSdJWTAttributes;
              }
            })
            : []
        );

        setPolicyResults(() => {
          if (containsVP) {
            return response.data.policyResults.results;
          } else {
            //add a new entry to the policy results, since its start index +1
            return [
              {
                policyResults: [
                  {
                    policy: 'New Policy',
                    is_success: true,
                  },
                ],
              },
              ...response.data.policyResults.results,
            ];
          }
        });

        if (!containsVP) {
          const vct = parsedToken['vct'];
          const vctUrl = new URL(vct);
          const vctResolutionUrl = `${vctUrl.origin}/.well-known/vct${vctUrl.pathname}`;
          fetchVctName(vctResolutionUrl).then((name) => setVctName(name));
        }
      });
  }, [router.isReady, env]);

  const subject = credentials[index]?.credentialSubject;
  const shortFields = subject
    ? Object.keys(subject)
        .filter((key) => typeof subject[key] === 'string' && subject[key].length > 0 && subject[key].length < 20)
        .map((key) => ({
          key: (key.charAt(0).toUpperCase() + key.slice(1)).replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
          value: subject[key],
        }))
    : [];

  const faceStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: 'var(--mantine-radius-lg)',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
  };

  return (
    <Center mih="100vh" bg="var(--mantine-color-body)">
      <Modal show={modal} securedByWalt={false} onClose={() => setModal(false)}>
        <Textarea
          value={JSON.stringify(
            credentials[index]?.credentialSubject ?? credentials[index],
            null,
            4
          )}
          disabled={true}
          aria-label="Record JSON"
          rows={8}
          styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
        />
      </Modal>
      <Paper
        pos="relative"
        shadow="xl"
        radius="md"
        withBorder
        py="xl"
        px={40}
        w={{ base: '100%', sm: '83%', md: '66%', lg: '50%' }}
        mih={{ base: '100vh', sm: 'auto' }}
        ta="center"
      >
        <Title order={1} mb={40}>
          Shared records
        </Title>
        <Center>
          {index !== 0 && (
            <ActionIcon
              onClick={() => setIndex(index - 1)}
              variant="subtle"
              color="gray"
              size="lg"
              pos="absolute"
              left={40}
              aria-label="Previous record"
            >
              <IconChevronLeft size={24} />
            </ActionIcon>
          )}
          <Box
            h={225}
            w={400}
            maw="100%"
            style={{ perspective: 1000 }}
            onMouseEnter={() => setFlipped(true)}
            onMouseLeave={() => setFlipped(false)}
          >
            <Box
              pos="relative"
              h="100%"
              w="100%"
              style={{
                borderRadius: 'var(--mantine-radius-lg)',
                boxShadow: 'var(--mantine-shadow-xl)',
                transition: 'transform 500ms',
                transformStyle: 'preserve-3d',
                transform: flipped ? 'rotateY(180deg)' : undefined,
              }}
            >
              <Box
                py={28}
                px="xl"
                ta="left"
                style={{
                  ...faceStyle,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  color: 'var(--mantine-color-white)',
                  background: 'linear-gradient(to right, var(--mantine-color-green-7), var(--mantine-color-green-9))',
                }}
              >
                <img src="/brand-logo.svg" alt={PRODUCT_NAME} style={{ height: 35, width: 'auto' }} />
                <Title order={3} c="white" mt={48} lineClamp={1}>
                  {credentials[index]?.type
                    ? credentials[index]?.type[
                      credentials[index].type.length - 1
                    ].replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                    : credentials[index]?.vct
                      ? vctName
                      : credentials[index]?.vct}
                </Title>
              </Box>
              <Paper
                p="lg"
                withBorder
                style={{ ...faceStyle, transform: 'rotateY(180deg)', overflowY: 'scroll' }}
              >
                {shortFields.map((item, fieldIndex) => (
                  <Group key={fieldIndex} gap={0} py={4} wrap="nowrap" align="flex-start" ta="left">
                    <Text w="50%" c="dimmed" tt="capitalize" lh={1.1}>
                      {item.key}
                    </Text>
                    <Text w="50%" lh={1.1}>
                      {item.value}
                    </Text>
                  </Group>
                ))}
                <Anchor component="button" type="button" c="dimmed" w="100%" py={4} onClick={() => setModal(true)}>
                  View record as JSON
                </Anchor>
              </Paper>
            </Box>
          </Box>
          {index !== credentials.length - 1 && (
            <ActionIcon
              onClick={() => setIndex(index + 1)}
              variant="subtle"
              color="gray"
              size="lg"
              pos="absolute"
              right={40}
              aria-label="Next record"
            >
              <IconChevronRight size={24} />
            </ActionIcon>
          )}
        </Center>
        <Box mt={40} px={{ base: 0, sm: 'xl' }}>
          <Text c="dimmed" mb="md">
            {policyResults[index + 1]?.policyResults.length
              ? 'The shared proof was checked against:'
              : 'The shared proof was not checked against any rules'}
          </Text>
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            {policyResults[index + 1]?.policyResults
              .map((policy) => {
                return {
                  name:
                    policy.policy.charAt(0).toUpperCase() +
                    policy.policy.slice(1) +
                    ' Policy',
                  is_success: policy.is_success,
                };
              })
              .map((policy) => (
                <Group key={policy.name} gap="sm" wrap="nowrap" style={{ overflow: 'hidden' }}>
                  <ThemeIcon variant="light" color={policy.is_success ? 'green' : 'red'} size="sm" radius="xl">
                    {policy.is_success ? <IconCircleCheck size={14} /> : <IconCircleX size={14} />}
                  </ThemeIcon>
                  <Text truncate="end">{policy.name}</Text>
                </Group>
              ))}
          </SimpleGrid>
        </Box>
        <Group justify="center" gap="xs" mt={48}>
          <Text size="sm" c="dimmed">Secured by {PRODUCT_NAME}</Text>
          <img src="/brand-logo.svg" alt={PRODUCT_NAME} style={{ height: 15, width: 'auto' }} />
        </Group>
      </Paper>
    </Center>
  );
}
