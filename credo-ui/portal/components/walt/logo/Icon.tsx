import { PRODUCT_NAME } from '@/utils/orgProfile'
import Image from "next/image";

type Props = {
  height: number;
  width: number;
  className?: string;
};

export default function WaltIcon({ width, height, className }: Props) {
  return (
    <Image
      src="/brand-logo.svg"
      alt={PRODUCT_NAME}
      width={width}
      height={height}
      className={className}
    />
  );
}
