import {ReactNode} from "react";
import { Button } from "@mantine/core";

type Props = {
  children: ReactNode;
  selected?: boolean;
  icon?: any;
  [x: string]: any;
};

export default function SelectButton({
  children,
  selected = false,
  icon: Icon,
  ...otherProps
}: Props) {
  return (
    <Button
      variant={selected ? 'default' : 'subtle'}
      color={selected ? undefined : 'gray'}
      fw={selected ? 600 : 400}
      px="xl"
      radius="md"
      aria-pressed={selected}
      leftSection={
        Icon ? (
          <Icon
            aria-hidden
            style={{
              width: 16,
              height: 16,
              color: selected ? 'var(--mantine-primary-color-filled)' : 'var(--mantine-color-dimmed)',
            }}
          />
        ) : undefined
      }
      {...otherProps}
    >
      {children}
    </Button>
  );
}
