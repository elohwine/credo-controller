import { Checkbox } from "@mantine/core";

type Props = {
  name: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

export default function PolicyListItem({ name, value, onChange }: Props) {
  return (
    <Checkbox
      checked={value}
      onChange={(e) => onChange(e.currentTarget.checked)}
      label={name}
      radius="sm"
    />
  );
}
