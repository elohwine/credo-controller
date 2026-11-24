import { Space } from "@mantine/core";
import {SpacerProps} from "@/components/walt/spacer/Spacer";

type Props = Pick<SpacerProps, 'size'>;

/** Vertical gap; `size` keeps the legacy 0.25rem step. */
export default function HSpacer({ size }: Props) {
  return <Space h={`${size * 0.25}rem`} />;
}
