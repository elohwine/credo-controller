/**
 * React Bits Components for Credentis
 * 
 * These are ENHANCEMENT components that layer ON TOP of Mantine.
 * They provide motion and delight for specific use cases.
 * 
 * Integration rules:
 * 1. React Bits = OPTIONAL ENHANCEMENT, never replacement
 * 2. If Mantine can do it → use Mantine
 * 3. Use React Bits only for "wow moments" (hero, trust, credential display)
 * 
 * Layer hierarchy:
 * - Layer 1: Mantine Theme (tokens)
 * - Layer 2: Mantine Components (structure)
 * - Layer 3: Glassmorphism CSS (visual skin for trust)
 * - Layer 4: React Bits (motion & delight) ← These components
 */

// Text animations
export { default as SplitText } from './SplitText';

// Backgrounds
export { default as Aurora } from './Aurora';

// Interactive cards
export { default as TiltCard } from './TiltCard';
export { default as SpotlightCard } from './SpotlightCard';

// Micro-interactions
export { default as Magnet } from './Magnet';
