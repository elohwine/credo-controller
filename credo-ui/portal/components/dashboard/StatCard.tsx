import React from 'react';
import { Box, Paper, Text, Group, Stack, ThemeIcon } from '@mantine/core';

interface StatCardProps {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    trend?: string; // e.g., "+12%" or "-5%"
    trendLabel?: string; // e.g., "vs last month"
    trendType?: 'positive' | 'negative' | 'neutral';
    iconColor?: string; // e.g., "blue", "green", "orange"
}

export const StatCard: React.FC<StatCardProps> = ({ 
    title, 
    value, 
    icon, 
    trend, 
    trendLabel, 
    trendType = 'positive',
    iconColor = 'blue' 
}) => {
    return (
        <Paper 
            p="lg" 
            radius="lg" 
            withBorder
            style={{ 
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
            // Hover effect can be added via classes or styled-system if using full Mantine styles
            className="hover:shadow-md hover:-translate-y-1 transition-all duration-200"
        >
            <Group justify="space-between" align="flex-start" mb="md">
                <Box>
                    <Text size="sm" c="dimmed" fw={600} tt="uppercase" opacity={0.7}>
                        {title}
                    </Text>
                    <Text size="xl" fw={700} mt={4} style={{ fontSize: '1.75rem', lineHeight: 1.2 }}>
                        {value}
                    </Text>
                </Box>
                
                <ThemeIcon 
                    size={48} 
                    radius="md" 
                    variant="light" 
                    color={iconColor}
                    style={{ opacity: 0.8 }}
                >
                    {icon}
                </ThemeIcon>
            </Group>
            
            {(trend || trendLabel) && (
                <Group gap={6} align="center">
                    {trend && (
                        <Text 
                            size="sm" 
                            fw={700}
                            c={trendType === 'positive' ? 'green' : trendType === 'negative' ? 'red' : 'gray'}
                        >
                            {trend}
                        </Text>
                    )}
                    {trendLabel && (
                        <Text size="sm" c="dimmed">
                            {trendLabel}
                        </Text>
                    )}
                </Group>
            )}
        </Paper>
    );
};
