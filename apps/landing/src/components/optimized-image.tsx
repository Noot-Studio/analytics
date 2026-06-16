interface Picture {
  sources: Record<string, string>;
  img: { src: string; w: number; h: number };
}

interface OptimizedImageProps {
  /** A `?…&as=picture` import produced by vite-imagetools. */
  picture: Picture;
  alt: string;
  className?: string;
  sizes?: string;
  /** Use "eager" for above-the-fold images (e.g. the hero). */
  loading?: "eager" | "lazy";
}

// Renders a vite-imagetools picture: one <source> per generated format (AVIF,
// WebP, …) with the largest fallback format on the <img>. width/height come
// straight from the build so the browser reserves space and never shifts.
const OptimizedImage = ({
  picture,
  alt,
  className,
  sizes,
  loading = "lazy",
}: OptimizedImageProps) => (
  // `block`, not `display:contents`: contents would hoist the <source> tags
  // into a parent grid/flex as stray items and shove the <img> out of place.
  <picture className="block">
    {Object.entries(picture.sources).map(([format, srcSet]) => (
      <source
        key={format}
        type={`image/${format}`}
        srcSet={srcSet}
        sizes={sizes}
      />
    ))}
    <img
      src={picture.img.src}
      width={picture.img.w}
      height={picture.img.h}
      alt={alt}
      loading={loading}
      sizes={sizes}
      className={className}
    />
  </picture>
);

export { OptimizedImage };
