import { ImgHTMLAttributes } from "react";

interface AccessibleImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
}

export function AccessibleImage({
  src,
  alt,
  className = "",
  ...rest
}: AccessibleImageProps) {
  if (process.env.NODE_ENV === "development" && alt === undefined) {
    console.error(
      `[AccessibleImage] Missing alt prop for image: ${src}. Use alt="" for decorative images.`
    );
  }

  return (
    <img
      src={src}
      alt={alt ?? ""}
      className={className}
      loading="lazy"
      decoding="async"
      {...rest}
    />
  );
}
