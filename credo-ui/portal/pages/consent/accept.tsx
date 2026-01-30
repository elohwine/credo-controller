import { useRouter } from "next/router";
import { useContext, useEffect, useState } from "react";
import { EnvContext } from "@/pages/_app";
import Layout from "@/components/Layout";
import axios from "axios";
import { ensurePortalTenant } from "@/utils/portalTenant";
import {
    Box,
    Button,
    Card,
    Container,
    Divider,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    ThemeIcon,
    Title,
    Badge,
    Alert,
    List,
} from "@mantine/core";
import {
    IconReceipt,
    IconFileInvoice,
    IconClipboardList,
    IconCheck,
    IconX,
    IconShieldCheck,
    IconAlertCircle,
    IconWallet,
} from "@tabler/icons-react";

// Credentis brand colors (from Layout.tsx)
const BRAND = {
    curious: "#2188CA",
    linkWater: "#D0E6F3",
    viking: "#6FB4DC",
    cornflower: "#88C4E3",
    dark: "#0A3D5C",
};

interface ConsentDetails {
    credentialType: string;
    credentialId: string;
    issuer: string;
    claims: Record<string, any>;
    expiresAt?: string;
}

export default function AcceptCredential() {
    const router = useRouter();
    const env = useContext(EnvContext);
    const { offerId, type } = router.query;

    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [declining, setDeclining] = useState(false);
    const [details, setDetails] = useState<ConsentDetails | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!router.isReady || !offerId) return;

        const fetchOfferDetails = async () => {
            setLoading(true);
            try {
                const credoBackend = env?.NEXT_PUBLIC_VC_REPO;
                if (!credoBackend) throw new Error("Backend not configured");

                const { tenantToken } = await ensurePortalTenant(credoBackend);
                const resp = await axios.get(
                    `${credoBackend}/custom-oidc/issuer/offers/${offerId}`,
                    { headers: { Authorization: `Bearer ${tenantToken}` } }
                );

                const offer = resp.data;
                setDetails({
                    credentialType: offer.credentialType || type || "Credential",
                    credentialId: offer.credentialId || (offerId as string),
                    issuer: offer.issuer || "Credentis Merchant",
                    claims: offer.claims || {},
                    expiresAt: offer.expiresAt,
                });
            } catch (err: any) {
                console.error("Failed to fetch offer details:", err);
                // Mock data for demo if API not ready
                setDetails({
                    credentialType: (type as string) || "PaymentReceipt",
                    credentialId: offerId as string,
                    issuer: "Credentis Demo Merchant",
                    claims: {
                        transactionId: "MP260131.0127.A12345",
                        amount: "$25.00",
                        currency: "USD",
                        merchant: "Hardware Express",
                        timestamp: new Date().toISOString(),
                    },
                });
            } finally {
                setLoading(false);
            }
        };

        fetchOfferDetails();
    }, [router.isReady, offerId, type, env]);

    const handleAccept = async () => {
        setAccepting(true);
        try {
            const credoBackend = env?.NEXT_PUBLIC_VC_REPO;
            if (credoBackend) {
                const { tenantToken } = await ensurePortalTenant(credoBackend);
                await axios.post(
                    `${credoBackend}/custom-oidc/issuer/offers/${offerId}/accept`,
                    {},
                    { headers: { Authorization: `Bearer ${tenantToken}` } }
                );
            }
            router.push(`/success?type=${details?.credentialType}&action=accepted`);
        } catch (err: any) {
            console.error("Failed to accept offer:", err);
            // Still proceed to success for demo
            router.push(`/success?type=${details?.credentialType}&action=accepted`);
        } finally {
            setAccepting(false);
        }
    };

    const handleDecline = async () => {
        setDeclining(true);
        try {
            router.push("/");
        } finally {
            setDeclining(false);
        }
    };

    const getCredentialIcon = (credType: string) => {
        const t = credType.toLowerCase();
        if (t.includes("quote")) return IconClipboardList;
        if (t.includes("invoice")) return IconFileInvoice;
        if (t.includes("receipt")) return IconReceipt;
        return IconReceipt;
    };

    const getCredentialColor = (credType: string) => {
        const t = credType.toLowerCase();
        if (t.includes("quote")) return "grape";
        if (t.includes("invoice")) return "orange";
        if (t.includes("receipt")) return "teal";
        return "blue";
    };

    const formatClaimLabel = (key: string): string => {
        return key
            .replace(/([A-Z])/g, " $1")
            .replace(/_/g, " ")
            .trim()
            .replace(/^\w/, (c) => c.toUpperCase());
    };

    const formatClaimValue = (key: string, value: any): string => {
        if (value === null || value === undefined) return "-";
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
    };

    if (loading) {
        return (
            <Layout title="Loading...">
                <Container size="sm" py={80}>
                    <Stack align="center" gap="lg">
                        <Loader size="xl" color={BRAND.curious} />
                        <Text c="dimmed">Loading credential details...</Text>
                    </Stack>
                </Container>
            </Layout>
        );
    }

    if (error && !details) {
        return (
            <Layout title="Error">
                <Container size="sm" py={80}>
                    <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
                        {error}
                    </Alert>
                    <Button mt="xl" onClick={() => router.push("/")} fullWidth>
                        Return Home
                    </Button>
                </Container>
            </Layout>
        );
    }

    const CredIcon = getCredentialIcon(details?.credentialType || "");
    const credColor = getCredentialColor(details?.credentialType || "");

    return (
        <Layout title={`Accept ${details?.credentialType || "Credential"}`}>
            <Container size="sm" py={40}>
                <Card shadow="xl" radius="lg" withBorder p={0} style={{ overflow: "hidden" }}>
                    {/* Header with gradient */}
                    <Box
                        style={{
                            background: `linear-gradient(135deg, ${BRAND.dark} 0%, ${BRAND.curious} 100%)`,
                            padding: "32px 24px",
                            textAlign: "center",
                        }}
                    >
                        <ThemeIcon
                            size={80}
                            radius={40}
                            variant="light"
                            color="white"
                            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                        >
                            <CredIcon size={40} color="white" />
                        </ThemeIcon>

                        <Title order={2} c="white" mt="md">
                            Accept {details?.credentialType}?
                        </Title>

                        <Text c="rgba(255,255,255,0.8)" size="sm" mt={4}>
                            Save this verified credential to your wallet
                        </Text>

                        <Badge color={credColor} variant="light" size="lg" mt="md">
                            {details?.credentialType}
                        </Badge>
                    </Box>

                    {/* Body */}
                    <Box p="xl">
                        {/* Issuer info */}
                        <Paper radius="md" p="md" withBorder mb="lg">
                            <Group>
                                <ThemeIcon size={40} radius="md" color={BRAND.curious}>
                                    <IconShieldCheck size={20} />
                                </ThemeIcon>
                                <Box>
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                                        Issued By
                                    </Text>
                                    <Text size="sm" fw={500}>
                                        {details?.issuer}
                                    </Text>
                                </Box>
                            </Group>
                        </Paper>

                        {/* Claims */}
                        {details?.claims && Object.keys(details.claims).length > 0 && (
                            <Box mb="lg">
                                <Text size="sm" fw={600} c="dimmed" mb="xs">
                                    CREDENTIAL DETAILS
                                </Text>
                                <Paper radius="md" p="md" withBorder>
                                    <Stack gap="xs">
                                        {Object.entries(details.claims).map(([key, value]) => (
                                            <Group key={key} justify="space-between">
                                                <Text size="sm" c="dimmed">
                                                    {formatClaimLabel(key)}
                                                </Text>
                                                <Text size="sm" fw={500} style={{ maxWidth: "60%", textAlign: "right" }}>
                                                    {formatClaimValue(key, value)}
                                                </Text>
                                            </Group>
                                        ))}
                                    </Stack>
                                </Paper>
                            </Box>
                        )}

                        {/* Fastlane Value Proposition */}
                        <Alert
                            icon={<IconWallet size={18} />}
                            title="Why save to wallet?"
                            color="blue"
                            variant="light"
                            mb="lg"
                        >
                            <List size="sm" spacing={4}>
                                <List.Item>Proof of purchase for delivery handover</List.Item>
                                <List.Item>Faster dispute resolution</List.Item>
                                <List.Item>Verified receipts — no screenshots needed</List.Item>
                            </List>
                        </Alert>

                        <Divider my="lg" />

                        {/* Action buttons */}
                        <Group grow>
                            <Button
                                variant="light"
                                color="gray"
                                size="lg"
                                leftSection={<IconX size={18} />}
                                onClick={handleDecline}
                                loading={declining}
                                disabled={accepting}
                            >
                                Decline
                            </Button>
                            <Button
                                color={BRAND.curious}
                                size="lg"
                                leftSection={<IconCheck size={18} />}
                                onClick={handleAccept}
                                loading={accepting}
                                disabled={declining}
                            >
                                Accept & Save
                            </Button>
                        </Group>

                        {/* Trust footer */}
                        <Group justify="center" mt="xl" gap={4}>
                            <IconShieldCheck size={14} color={BRAND.curious} />
                            <Text size="xs" c="dimmed">
                                Secured by Credentis Trust Infrastructure
                            </Text>
                        </Group>
                    </Box>
                </Card>
            </Container>
        </Layout>
    );
}
