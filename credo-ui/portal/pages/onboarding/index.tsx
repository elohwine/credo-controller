import { useEffect } from 'react';
import { useRouter } from 'next/router';

/** Team onboarding lives on Members: invite, send staff cards and see who is ready. */
export default function OnboardingRedirect() {
    const router = useRouter();
    useEffect(() => {
        void router.replace('/organization/people');
    }, [router]);
    return null;
}
