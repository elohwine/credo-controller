/**
 * Magnet - Magnetic cursor attraction effect
 * 
 * Adapted from React Bits
 * Creates a subtle magnetic pull effect when cursor approaches
 * 
 * USE FOR:
 * - CTA buttons (sparingly)
 * - Key action items
 * - Interactive icons
 * 
 * DO NOT USE FOR:
 * - Navigation links
 * - Form inputs
 * - Dense UI areas
 */

'use client';

import React, { useRef, useState, ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

interface MagnetProps {
  children: ReactNode;
  className?: string;
  strength?: number;
  radius?: number;
  disabled?: boolean;
}

const Magnet: React.FC<MagnetProps> = ({
  children,
  className = '',
  strength = 0.3,
  radius = 200,
  disabled = false,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isNear, setIsNear] = useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { stiffness: 150, damping: 15, mass: 0.1 };
  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);

  const handleMouseMove = (event: React.MouseEvent) => {
    if (disabled || !ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const distanceX = event.clientX - centerX;
    const distanceY = event.clientY - centerY;
    const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

    if (distance < radius) {
      setIsNear(true);
      // Magnetic pull - stronger as cursor gets closer
      const pullStrength = (1 - distance / radius) * strength;
      x.set(distanceX * pullStrength);
      y.set(distanceY * pullStrength);
    } else {
      setIsNear(false);
      x.set(0);
      y.set(0);
    }
  };

  const handleMouseLeave = () => {
    setIsNear(false);
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className={`inline-block ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        x: springX,
        y: springY,
      }}
    >
      {children}
    </motion.div>
  );
};

export default Magnet;
