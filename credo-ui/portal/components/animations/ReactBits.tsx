/**
 * React Bits Components for Credentis
 * 
 * These are adapted from https://www.reactbits.dev/
 * Used for micro-interactions and animations.
 * 
 * Dependencies: gsap, @gsap/react, motion (framer-motion)
 */

// ============================================
// BLUR TEXT - For hero headings
// ============================================
import React, { useRef, useEffect, useMemo } from 'react';
import { motion, useInView, Variants } from 'framer-motion';

interface BlurTextProps {
  text: string;
  delay?: number;
  direction?: 'top' | 'bottom';
  animateBy?: 'words' | 'letters';
  className?: string;
  onAnimationComplete?: () => void;
}

export const BlurText: React.FC<BlurTextProps> = ({
  text,
  delay = 200,
  direction = 'top',
  animateBy = 'words',
  className = '',
  onAnimationComplete,
}) => {
  const ref = useRef<HTMLParagraphElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  const elements = useMemo(() => {
    return animateBy === 'words' ? text.split(' ') : text.split('');
  }, [text, animateBy]);

  const variants: Variants = {
    hidden: {
      opacity: 0,
      filter: 'blur(10px)',
      y: direction === 'top' ? -20 : 20,
    },
    visible: (i: number) => ({
      opacity: 1,
      filter: 'blur(0px)',
      y: 0,
      transition: {
        delay: i * (delay / 1000),
        duration: 0.5,
        ease: 'easeOut',
      },
    }),
  };

  return (
    <p ref={ref} className={`flex flex-wrap ${className}`}>
      {elements.map((element, i) => (
        <motion.span
          key={i}
          custom={i}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={variants}
          className={animateBy === 'words' ? 'mr-2' : ''}
          onAnimationComplete={i === elements.length - 1 ? onAnimationComplete : undefined}
        >
          {element}
          {animateBy === 'letters' && element === ' ' && '\u00A0'}
        </motion.span>
      ))}
    </p>
  );
};

// ============================================
// GRADIENT TEXT - For branded headings
// ============================================
interface GradientTextProps {
  children: React.ReactNode;
  colors?: string[];
  animationSpeed?: number;
  direction?: 'horizontal' | 'vertical' | 'diagonal';
  className?: string;
}

export const GradientText: React.FC<GradientTextProps> = ({
  children,
  colors = ['#2188CA', '#6FB4DC', '#88C4E3', '#2188CA'], // Credentis palette
  animationSpeed = 8,
  direction = 'horizontal',
  className = '',
}) => {
  const gradientDirection = {
    horizontal: '90deg',
    vertical: '180deg',
    diagonal: '45deg',
  };

  return (
    <span
      className={`inline-block bg-clip-text text-transparent ${className}`}
      style={{
        backgroundImage: `linear-gradient(${gradientDirection[direction]}, ${colors.join(', ')})`,
        backgroundSize: '200% 200%',
        animation: `gradient ${animationSpeed}s ease infinite`,
      }}
    >
      {children}
      <style jsx>{`
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </span>
  );
};

// ============================================
// SHINY TEXT - For verified status, trust indicators
// ============================================
interface ShinyTextProps {
  text: string;
  color?: string;
  shineColor?: string;
  speed?: number;
  className?: string;
}

export const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  color = '#2188CA',
  shineColor = '#ffffff',
  speed = 2,
  className = '',
}) => {
  return (
    <span
      className={`relative inline-block ${className}`}
      style={{ color }}
    >
      {text}
      <span
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-50"
        style={{
          backgroundSize: '200% 100%',
          animation: `shine ${speed}s linear infinite`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          mixBlendMode: 'overlay',
        }}
      />
      <style jsx>{`
        @keyframes shine {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </span>
  );
};

// ============================================
// COUNT UP - For metrics, trust scores
// ============================================
interface CountUpProps {
  to: number;
  from?: number;
  duration?: number;
  delay?: number;
  separator?: string;
  className?: string;
  onEnd?: () => void;
}

export const CountUp: React.FC<CountUpProps> = ({
  to,
  from = 0,
  duration = 2,
  delay = 0,
  separator = '',
  className = '',
  onEnd,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const [count, setCount] = React.useState(from);

  useEffect(() => {
    if (!isInView) return;

    const timeout = setTimeout(() => {
      const startTime = Date.now();
      const endTime = startTime + duration * 1000;

      const updateCount = () => {
        const now = Date.now();
        const progress = Math.min((now - startTime) / (duration * 1000), 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        const currentCount = Math.round(from + (to - from) * easeProgress);
        
        setCount(currentCount);

        if (progress < 1) {
          requestAnimationFrame(updateCount);
        } else {
          onEnd?.();
        }
      };

      requestAnimationFrame(updateCount);
    }, delay * 1000);

    return () => clearTimeout(timeout);
  }, [isInView, from, to, duration, delay, onEnd]);

  const formattedCount = separator
    ? count.toLocaleString('en-US', { useGrouping: true }).replace(/,/g, separator)
    : count.toString();

  return (
    <span ref={ref} className={className}>
      {formattedCount}
    </span>
  );
};

// ============================================
// MAGNET - For interactive elements (credential cards)
// ============================================
interface MagnetProps {
  children: React.ReactNode;
  padding?: number;
  magnetStrength?: number;
  disabled?: boolean;
  className?: string;
}

export const Magnet: React.FC<MagnetProps> = ({
  children,
  padding = 100,
  magnetStrength = 2,
  disabled = false,
  className = '',
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (disabled || !ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const distX = e.clientX - centerX;
    const distY = e.clientY - centerY;
    
    setPosition({
      x: distX / magnetStrength,
      y: distY / magnetStrength,
    });
  };

  const handleMouseLeave = () => {
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div
      ref={ref}
      className={`inline-block ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ padding }}
    >
      <motion.div
        animate={{ x: position.x, y: position.y }}
        transition={{ type: 'spring', stiffness: 150, damping: 15 }}
      >
        {children}
      </motion.div>
    </div>
  );
};

// ============================================
// CLICK SPARK - For verification confirmations
// ============================================
interface ClickSparkProps {
  children: React.ReactNode;
  sparkColor?: string;
  sparkCount?: number;
  sparkSize?: number;
  duration?: number;
}

export const ClickSpark: React.FC<ClickSparkProps> = ({
  children,
  sparkColor = '#2188CA',
  sparkCount = 8,
  sparkSize = 10,
  duration = 400,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const createSpark = (x: number, y: number) => {
    if (!containerRef.current) return;

    for (let i = 0; i < sparkCount; i++) {
      const spark = document.createElement('div');
      const angle = (360 / sparkCount) * i;
      const radians = (angle * Math.PI) / 180;

      spark.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: ${sparkSize}px;
        height: 2px;
        background: ${sparkColor};
        border-radius: 1px;
        transform: rotate(${angle}deg);
        pointer-events: none;
        z-index: 9999;
      `;

      containerRef.current.appendChild(spark);

      const distance = 30 + Math.random() * 20;
      const endX = x + Math.cos(radians) * distance;
      const endY = y + Math.sin(radians) * distance;

      spark.animate(
        [
          { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 1 },
          { transform: `rotate(${angle}deg) translateX(${distance}px) scaleX(0)`, opacity: 0 },
        ],
        { duration, easing: 'ease-out' }
      ).onfinish = () => spark.remove();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    createSpark(e.clientX - rect.left, e.clientY - rect.top);
  };

  return (
    <div ref={containerRef} className="relative" onClick={handleClick}>
      {children}
    </div>
  );
};

// ============================================
// SPOTLIGHT CARD - For feature cards
// ============================================
interface SpotlightCardProps {
  children: React.ReactNode;
  spotlightColor?: string;
  className?: string;
}

export const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  spotlightColor = 'rgba(33, 136, 202, 0.15)', // Credentis Curious Blue
  className = '',
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = React.useState(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div
      ref={cardRef}
      className={`relative overflow-hidden rounded-xl bg-white border border-gray-200 ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Spotlight gradient */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 40%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
};

// ============================================
// TILTED CARD - For credential display
// ============================================
interface TiltedCardProps {
  children: React.ReactNode;
  rotateAmplitude?: number;
  scaleOnHover?: number;
  className?: string;
}

export const TiltedCard: React.FC<TiltedCardProps> = ({
  children,
  rotateAmplitude = 12,
  scaleOnHover = 1.05,
  className = '',
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotate, setRotate] = React.useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = React.useState(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const rotateX = ((mouseY - centerY) / centerY) * -rotateAmplitude;
    const rotateY = ((mouseX - centerX) / centerX) * rotateAmplitude;

    setRotate({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setRotate({ x: 0, y: 0 });
    setIsHovered(false);
  };

  return (
    <motion.div
      ref={cardRef}
      className={`${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      animate={{
        rotateX: rotate.x,
        rotateY: rotate.y,
        scale: isHovered ? scaleOnHover : 1,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      style={{ transformStyle: 'preserve-3d', perspective: 1000 }}
    >
      {children}
    </motion.div>
  );
};

export default {
  BlurText,
  GradientText,
  ShinyText,
  CountUp,
  Magnet,
  ClickSpark,
  SpotlightCard,
  TiltedCard,
};
