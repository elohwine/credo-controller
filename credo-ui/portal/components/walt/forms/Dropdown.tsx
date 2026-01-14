import { Select } from '@mantine/core';

type Props = {
  values: string[];
  selected: string;
  setSelected: (value: string) => void;
  label?: string;
};

export default function Dropdown({ values, selected, setSelected, label }: Props) {
  return (
    <Select
      data={values}
      value={selected}
      onChange={(val) => val && setSelected(val)}
      label={label}
      allowDeselect={false}
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
