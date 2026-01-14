/**
 * SpotlightCard - Hover spotlight reveal effect
 * 
 * Creates a spotlight that follows the cursor on hover
 * 
 * USE FOR:
 * - Feature cards on landing pages
 * - Dashboard quick action cards
 * - Menu items that need emphasis
 * 
 * DO NOT USE FOR:
 * - Dense data displays
 * - Forms
 * - Admin screens
 */

'use client';

import React, { useRef, useState, ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
  spotlightSize?: number;
  borderRadius?: string;
}

const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className = '',
  spotlightColor = 'rgba(33, 136, 202, 0.15)', // Credentis Curious Blue
  spotlightSize = 300,
  borderRadius = '16px',
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { stiffness: 300, damping: 30 };
  const spotlightX = useSpring(mouseX, springConfig);
  const spotlightY = useSpring(mouseY, springConfig);

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    mouseX.set(event.clientX - rect.left);
    mouseY.set(event.clientY - rect.top);
  };

  return (
    <motion.div
      ref={ref}
      className={`relative overflow-hidden ${className}`}
      style={{ borderRadius }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Spotlight overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isHovering
            ? `radial-gradient(${spotlightSize}px circle at ${spotlightX.get()}px ${spotlightY.get()}px, ${spotlightColor}, transparent)`
            : 'transparent',
          borderRadius: 'inherit',
        }}
        animate={{
          opacity: isHovering ? 1 : 0,
        }}
        transition={{ duration: 0.2 }}
      />

      {/* Border glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: 'inherit',
          border: `1px solid ${isHovering ? 'rgba(33, 136, 202, 0.3)' : 'transparent'}`,
        }}
        animate={{
          opacity: isHovering ? 1 : 0,
        }}
        transition={{ duration: 0.3 }}
      />

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
};

export default SpotlightCard;
