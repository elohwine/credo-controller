/**
 * Button - Mantine-based button with Credentis branding
 */

import { Button as MantineButton } from '@mantine/core';
import { ReactNode } from 'react';

type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type ButtonVariant = 'filled' | 'light' | 'outline' | 'subtle' | 'transparent';

type ButtonProps = {
  size?: ButtonSize;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  loadingText?: string;
  variant?: ButtonVariant;
  color?: 'credentis' | 'gray' | 'green' | 'red';
  className?: string;
  fullWidth?: boolean;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  style?: 'button' | 'link'; // Legacy prop for compatibility
};

export default function Button({
  size = 'md',
  children,
  onClick,
  disabled = false,
  loading = false,
  type = 'button',
  loadingText,
  variant = 'filled',
  color = 'credentis',
  className = '',
  fullWidth = false,
  leftSection,
  rightSection,
  style = 'button',
}: ButtonProps) {
  // Map legacy style prop to variant
  const mappedVariant = style === 'link' ? 'subtle' : variant;

  return (
    <MantineButton
      size={size}
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      type={type}
      variant={mappedVariant}
      color={color}
      className={className}
      fullWidth={fullWidth}
      leftSection={leftSection}
      rightSection={rightSection}
      radius="md"
      loaderProps={{ type: 'dots' }}
    >
      {loading && loadingText ? loadingText : children}
    </MantineButton>
  );
}
