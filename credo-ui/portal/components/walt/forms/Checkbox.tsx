import { Checkbox as MantineCheckbox } from '@mantine/core';
import { ReactNode } from 'react';

type Props = {
  value: boolean;
  onChange: (value: boolean) => void;
  children?: ReactNode;
  label?: string;
};

export default function Checkbox({ value, onChange, children, label }: Props) {
  return (
    <MantineCheckbox
      checked={value}
      onChange={(e) => onChange(e.currentTarget.checked)}
      label={children || label}
      radius="sm"
      color="credentis"
      wrapperProps={{
        className: 'flex items-center'
      }}
    />
  );
}
