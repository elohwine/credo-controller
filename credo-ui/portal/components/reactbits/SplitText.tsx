/**
 * SplitText - Animated text reveal
 * 
 * Adapted from React Bits (https://www.reactbits.dev/text-animations/split-text)
 * Uses GSAP for performant character/word animations
 * 
 * USE FOR:
 * - Hero headings
 * - Page titles (dashboard, wallet)
 * - Important announcements
 * 
 * DO NOT USE FOR:
 * - Body text
 * - Form labels
 * - Table content
 */

'use client';

import React, { useRef, useEffect, useMemo } from 'react';
import { gsap } from 'gsap';

interface SplitTextProps {
  text: string;
  className?: string;
  delay?: number;
  duration?: number;
  ease?: string;
  splitType?: 'chars' | 'words' | 'lines' | 'words, chars';
  from?: gsap.TweenVars;
  to?: gsap.TweenVars;
  threshold?: number;
  rootMargin?: string;
  textAlign?: 'left' | 'center' | 'right';
  onAnimationComplete?: () => void;
  tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'div';
}

const SplitText: React.FC<SplitTextProps> = ({
  text,
  className = '',
  delay = 50,
  duration = 0.6,
  ease = 'power3.out',
  splitType = 'chars',
  from = { opacity: 0, y: 40 },
  to = { opacity: 1, y: 0 },
  threshold = 0.1,
  rootMargin = '-50px',
  textAlign = 'center',
  onAnimationComplete,
  tag: Tag = 'div',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  // Split text into elements
  const elements = useMemo(() => {
    if (splitType === 'chars' || splitType === 'words, chars') {
      return text.split('').map((char, i) => (
        <span
          key={i}
          className="split-char inline-block"
          style={{ whiteSpace: char === ' ' ? 'pre' : 'normal' }}
        >
          {char}
        </span>
      ));
    } else if (splitType === 'words') {
      return text.split(' ').map((word, i, arr) => (
        <span key={i} className="split-word inline-block">
          {word}
          {i < arr.length - 1 && <span>&nbsp;</span>}
        </span>
      ));
    } else {
      // lines - treat whole text as one line for now
      return <span className="split-line inline-block">{text}</span>;
    }
  }, [text, splitType]);

  useEffect(() => {
    if (!containerRef.current || hasAnimated.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated.current) {
            hasAnimated.current = true;
            
            const targets = containerRef.current?.querySelectorAll(
              splitType === 'chars' || splitType === 'words, chars'
                ? '.split-char'
                : splitType === 'words'
                ? '.split-word'
                : '.split-line'
            );

            if (targets) {
              gsap.fromTo(
                targets,
                from,
                {
                  ...to,
                  duration,
                  ease,
                  stagger: delay / 1000,
                  onComplete: onAnimationComplete,
                }
              );
            }
            
            observer.disconnect();
          }
        });
      },
      { threshold, rootMargin }
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [delay, duration, ease, from, to, splitType, threshold, rootMargin, onAnimationComplete]);

  return (
    <Tag
      ref={containerRef}
      className={className}
      style={{ textAlign }}
    >
      {elements}
    </Tag>
  );
};

export default SplitText;
