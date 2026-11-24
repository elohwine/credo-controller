import { Space } from "@mantine/core";
import {SpacerProps} from "@/components/walt/spacer/Spacer";

type Props = Pick<SpacerProps, 'size'>;

/** Horizontal gap; `size` keeps the legacy 0.25rem step. */
export default function VSpacer({ size }: Props) {
  return <Space w={`${size * 0.25}rem`} />;
}
