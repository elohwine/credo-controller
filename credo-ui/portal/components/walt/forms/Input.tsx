/**
 * Input - Mantine-based text input with Credentis branding
 */

import { TextInput } from '@mantine/core';

type Props = {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  name: string;
  label: string;
  placeholder?: string;
  error?: boolean;
  errorText?: string;
  disabled?: boolean;
  showLabel?: boolean;
  required?: boolean;
  description?: string;
};

export default function InputField({
  value,
  onChange,
  type = 'text',
  label,
  placeholder,
  name,
  error = false,
  errorText,
  disabled = false,
  showLabel = true,
  required = false,
  description,
}: Props) {
  return (
    <TextInput
      value={value}
      onChange={(e) => onChange(e.target.value)}
      type={type}
      name={name}
      id={name}
      label={showLabel ? label : undefined}
      placeholder={placeholder}
      disabled={disabled}
      error={error ? errorText : undefined}
      required={required}
      description={description}
      radius="md"
      styles={{
        input: {
          '&:focus': {
            borderColor: 'var(--mantine-color-credentis-5)',
          },
        },
      }}
    />
  );
}
