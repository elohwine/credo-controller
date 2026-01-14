/**
 * VerifiedSeal - Animated verification success indicator
 * 
 * LAYERING:
 * - Mantine: ThemeIcon container, Text
 * - Glass: .glass-verified for trust glow
 * - React Bits/Framer: Animation
 * 
 * USE FOR: Successful verification displays, trust indicators
 */

'use client';

import React from 'react';
import { ThemeIcon, Text, Group, Box } from '@mantine/core';
import { motion } from 'framer-motion';

interface VerifiedSealProps {
  size?: number;
  showLabel?: boolean;
  animated?: boolean;
  className?: string;
}

export const VerifiedSeal: React.FC<VerifiedSealProps> = ({
  size = 32,
  showLabel = false,
  animated = true,
  className = '',
}) => {
  const iconSize = Math.round(size * 0.6);

  const sealContent = (
    <Group gap="xs" className={className}>
      <Box
        className="glass-verified"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ThemeIcon 
          size={size - 4} 
          radius="xl" 
          color="green" 
          variant="light"
        >
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M20 6L9 17l-5-5"
              initial={animated ? { pathLength: 0 } : { pathLength: 1 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.4, delay: 0.2, ease: 'easeOut' }}
            />
          </svg>
        </ThemeIcon>
      </Box>
      {showLabel && (
        <Text size="sm" fw={500} c="green.7">
          Verified
        </Text>
      )}
    </Group>
  );

  if (animated) {
    return (
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 15,
        }}
      >
        {sealContent}
      </motion.div>
    );
  }

  return sealContent;
};

/**
 * VerificationBadge - Larger, more prominent verification display
 * 
 * USE FOR: Post-verification screens, success states
 */
export const VerificationBadge: React.FC<{
  message?: string;
  timestamp?: string;
  className?: string;
}> = ({
  message = 'Credential Verified',
  timestamp,
  className = '',
}) => {
  return (
    <motion.div
      className={`glass-verified p-6 rounded-xl text-center ${className}`}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
    >
      <motion.div
        className="mb-4"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
      >
        <ThemeIcon size={64} radius="xl" color="green" variant="light">
          <svg
            width={32}
            height={32}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M20 6L9 17l-5-5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.4, ease: 'easeOut' }}
            />
          </svg>
        </ThemeIcon>
      </motion.div>

      <Text size="lg" fw={600} c="green.8" mb="xs">
        {message}
      </Text>

      {timestamp && (
        <Text size="sm" c="dimmed">
          Verified at {new Date(timestamp).toLocaleString()}
        </Text>
      )}
    </motion.div>
  );
};

export default VerifiedSeal;
