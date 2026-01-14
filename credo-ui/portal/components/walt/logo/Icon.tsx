import Image from "next/image";

type Props = {
  height: number;
  width: number;
  className?: string;
};

export default function WaltIcon({ width, height, className }: Props) {
  return (
    <Image
      src="/credentis-logo.png"
      alt="Credentis"
      width={width}
      height={height}
      className={className}
    />
  );
}
