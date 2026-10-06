import Layout from '@/components/Layout';
import JobCardsBoard from '@/components/workflows/JobCardsBoard';
import { Container } from '@mantine/core';

import { useRequireOrgContext } from '@/lib/portalContext';
export default function JobCardsPage() {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/inbox');

    return (
        <Layout title="Job Cards">
            <Container size="xl" py="md">
                <JobCardsBoard />
            </Container>
        </Layout>
    );
}
