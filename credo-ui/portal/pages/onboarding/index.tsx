import { useEffect } from 'react';
import { useRouter } from 'next/router';

/** Team onboarding lives in People & payroll: invite, send staff cards and see who is ready. */
export default function OnboardingRedirect() {
    const router = useRouter();
    useEffect(() => {
        void router.replace('/payroll?tab=employees');
    }, [router]);
    return null;
}
