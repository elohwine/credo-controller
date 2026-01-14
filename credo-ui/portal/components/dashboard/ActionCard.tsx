import React, { useState } from 'react';
import { Paper, Text, Group, ThemeIcon, rem, UnstyledButton } from '@mantine/core';
import { useRouter } from 'next/router';

interface ActionCardProps {
    title: string;
    description?: string;
    icon: React.ElementType;
    href: string;
    color?: string;
}

export function ActionCard({ title, description, icon: Icon, href, color = 'blue' }: ActionCardProps) {
    const router = useRouter();
    const [isAnimating, setIsAnimating] = useState(false);

    const handleClick = () => {
        if (isAnimating) return;
        setIsAnimating(true);
        // Animate left then right (shake), then navigate
        setTimeout(() => {
            router.push(href);
        }, 400);
    };

    return (
        <>
            <style jsx global>{`
                @keyframes shake-horizontal {
                    0% { transform: translateX(0); }
                    25% { transform: translateX(-8px); }
                    50% { transform: translateX(8px); }
                    75% { transform: translateX(-4px); }
                    100% { transform: translateX(0); }
                }
                .shake-card {
                    animation: shake-horizontal 0.4s ease-in-out;
                }
            `}</style>
            <UnstyledButton onClick={handleClick} w="100%">
                <Paper 
                    withBorder 
                    p="lg" 
                    radius="md" 
                    className={`transition-all duration-200 hover:-translate-y-1 hover:shadow-md ${isAnimating ? 'shake-card' : ''}`}
                    bg="white"
                >
                    <Group justify="space-between" mb="xs">
                        <Text fw={600} size="lg" c="dark.9">{title}</Text>
                        <ThemeIcon color={color} variant="light" size="xl" radius="md">
                            <Icon style={{ width: rem(24), height: rem(24) }} stroke={1.5} />
                        </ThemeIcon>
                    </Group>
                    
                    {description && (
                        <Text size="sm" c="dimmed" mt="xs" lineClamp={2}>
                            {description}
                        </Text>
                    )}
                </Paper>
            </UnstyledButton>
        </>
    );
}
