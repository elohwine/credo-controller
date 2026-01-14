/**
 * TiltCard - Interactive 3D tilt effect
 * 
 * Adapted from React Bits (https://www.reactbits.dev/components/tilted-card)
 * Creates a 3D tilt effect on hover for cards
 * 
 * USE FOR:
 * - Credential cards
 * - Trust proof displays
 * - Featured content cards
 * 
 * DO NOT USE FOR:
 * - Form containers
 * - Data tables
 * - Navigation elements
 * 
 * COMBINE WITH: glass-credential or glass-card CSS classes
 */

'use client';

import React, { useRef, useState, ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  tiltAmount?: number;
  scale?: number;
  perspective?: number;
  glareEnabled?: boolean;
  glareMaxOpacity?: number;
}

const TiltCard: React.FC<TiltCardProps> = ({
  children,
  className = '',
  tiltAmount = 15,
  scale = 1.02,
  perspective = 1000,
  glareEnabled = true,
  glareMaxOpacity = 0.15,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);

  // Motion values for smooth animation
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Spring config for smooth movement
  const springConfig = { stiffness: 300, damping: 30 };
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [tiltAmount, -tiltAmount]), springConfig);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-tiltAmount, tiltAmount]), springConfig);

  // Glare position
  const glareX = useSpring(useTransform(x, [-0.5, 0.5], [0, 100]), springConfig);
  const glareY = useSpring(useTransform(y, [-0.5, 0.5], [0, 100]), springConfig);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Calculate normalized position (-0.5 to 0.5)
    const normalizedX = (event.clientX - centerX) / rect.width;
    const normalizedY = (event.clientY - centerY) / rect.height;

    x.set(normalizedX);
    y.set(normalizedY);
  };

  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={cardRef}
      className={`relative ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        perspective,
        transformStyle: 'preserve-3d',
      }}
      animate={{
        scale: isHovering ? scale : 1,
      }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        className="w-full h-full"
      >
        {/* Card content */}
        {children}

        {/* Glare effect */}
        {glareEnabled && (
          <motion.div
            className="absolute inset-0 pointer-events-none rounded-inherit overflow-hidden"
            style={{
              background: useTransform(
                [glareX, glareY],
                ([gx, gy]) =>
                  `radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,${isHovering ? glareMaxOpacity : 0}) 0%, transparent 50%)`
              ),
              borderRadius: 'inherit',
            }}
          />
        )}
      </motion.div>
    </motion.div>
  );
};

export default TiltCard;
