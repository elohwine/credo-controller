/**
 * Aurora - Animated gradient background
 * 
 * Adapted from React Bits (https://www.reactbits.dev/backgrounds/aurora)
 * Creates a subtle, animated aurora borealis effect
 * 
 * USE FOR:
 * - Wallet/holder view backgrounds
 * - Hero sections
 * - Trust presentation screens
 * 
 * DO NOT USE FOR:
 * - Admin dashboards
 * - Tables/forms
 * - Dense content areas
 * 
 * LAYER: Positioned BEHIND content (z-0), content goes on top (z-10+)
 */

'use client';

import React, { useEffect, useRef } from 'react';

interface AuroraProps {
  className?: string;
  colorStops?: string[];
  speed?: number;
  blur?: number;
  opacity?: number;
}

const Aurora: React.FC<AuroraProps> = ({
  className = '',
  // Credentis palette colors
  colorStops = [
    'rgba(33, 136, 202, 0.3)',   // Curious Blue
    'rgba(111, 180, 220, 0.25)', // Viking
    'rgba(136, 196, 227, 0.2)',  // Cornflower
    'rgba(208, 230, 243, 0.15)', // Link Water
  ],
  speed = 1,
  blur = 60,
  opacity = 0.6,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width = canvas.offsetWidth;
    let height = canvas.height = canvas.offsetHeight;

    // Aurora blob positions
    const blobs = colorStops.map((color, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 300 + 200,
      color,
      vx: (Math.random() - 0.5) * speed,
      vy: (Math.random() - 0.5) * speed,
      offset: Math.random() * Math.PI * 2,
    }));

    const animate = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      blobs.forEach((blob) => {
        // Organic movement
        blob.x += blob.vx + Math.sin(time * 0.001 + blob.offset) * 0.5;
        blob.y += blob.vy + Math.cos(time * 0.001 + blob.offset) * 0.5;

        // Wrap around edges
        if (blob.x < -blob.radius) blob.x = width + blob.radius;
        if (blob.x > width + blob.radius) blob.x = -blob.radius;
        if (blob.y < -blob.radius) blob.y = height + blob.radius;
        if (blob.y > height + blob.radius) blob.y = -blob.radius;

        // Draw gradient blob
        const gradient = ctx.createRadialGradient(
          blob.x, blob.y, 0,
          blob.x, blob.y, blob.radius
        );
        gradient.addColorStop(0, blob.color);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(blob.x, blob.y, blob.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };

    window.addEventListener('resize', handleResize);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [colorStops, speed]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      style={{
        filter: `blur(${blur}px)`,
        opacity,
      }}
    />
  );
};

export default Aurora;
