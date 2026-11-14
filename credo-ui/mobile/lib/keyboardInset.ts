import { useEffect } from 'react';

/**
 * Keeps sheets and dialogs above the on-screen keyboard. The Android app reports the keyboard height
 * as `--keyboard-inset-bottom` (edge-to-edge means the WebView is never shrunk for it). A browser
 * reports it through `visualViewport`, written here as `--vv-keyboard-inset`. CSS lifts sheets by the
 * larger of the two; this hook also scrolls a focused field back into view once the sheet has moved.
 */

/** Below this the change is a browser toolbar showing or hiding, not a keyboard. */
const MIN_KEYBOARD_PX = 120;

export function visualKeyboardInset(layoutHeight: number, visualHeight: number, visualTop: number): number {
  const hidden = Math.round(layoutHeight - visualHeight - visualTop);
  return hidden >= MIN_KEYBOARD_PX ? hidden : 0;
}

function isTextField(node: EventTarget | null): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  if (node.isContentEditable || node instanceof HTMLTextAreaElement) return true;
  if (!(node instanceof HTMLInputElement)) return false;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'hidden'].includes(node.type);
}

export function useKeyboardInset() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let reveal = 0;

    const measure = () => {
      if (!viewport) return;
      const inset = visualKeyboardInset(window.innerHeight, viewport.height, viewport.offsetTop);
      const value = `${inset}px`;
      if (root.style.getPropertyValue('--vv-keyboard-inset') !== value) root.style.setProperty('--vv-keyboard-inset', value);
    };

    const revealFocused = () => {
      window.clearTimeout(reveal);
      // Wait for the keyboard and the sheet transition, then bring the field to the middle of what is left.
      reveal = window.setTimeout(() => {
        const field = document.activeElement;
        if (!isTextField(field)) return;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        field.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      }, 280);
    };

    const onFocusIn = (event: FocusEvent) => {
      if (isTextField(event.target)) revealFocused();
    };
    const onViewport = () => {
      measure();
      if (isTextField(document.activeElement)) revealFocused();
    };

    measure();
    viewport?.addEventListener('resize', onViewport);
    viewport?.addEventListener('scroll', measure);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.clearTimeout(reveal);
      viewport?.removeEventListener('resize', onViewport);
      viewport?.removeEventListener('scroll', measure);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);
}
