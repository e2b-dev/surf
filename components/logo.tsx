import Image, { type ImageProps } from "next/image";

export default function Logo({
  alt = "Invoke",
  ...props
}: Omit<ImageProps, "src" | "alt"> & { alt?: string }) {
  return <Image {...props} src="/invoke-logo.png" alt={alt} />;
}
