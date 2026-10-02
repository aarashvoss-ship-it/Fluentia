import type { ReactNode } from "react";
import { getBannerPositionStyles, type BannerFocalPosition } from "@/lib/banner-position";

interface HeroBannerProps {
  imageUrl?: string;
  position: BannerFocalPosition;
  children: ReactNode;
  onImageError?: () => void;
  className?: string;
}

export function HeroBanner({
  imageUrl,
  position,
  children,
  onImageError,
  className = "",
}: HeroBannerProps) {
  return (
    <section className={`relative h-[280px] w-full overflow-hidden rounded-2xl bg-slate-950 md:h-[320px] ${className}`}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          onError={onImageError}
          style={getBannerPositionStyles(position)}
          className="absolute inset-0 h-full w-full object-cover"
          aria-hidden="true"
        />
      ) : (
        <div className="absolute inset-0 bg-slate-950" aria-hidden="true" />
      )}
      <div
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,16,23,.72),rgba(12,16,23,.24)),linear-gradient(0deg,rgba(12,16,23,.92),transparent_65%)]"
        aria-hidden="true"
      />
      <div className="absolute inset-0 z-10 flex flex-col items-start justify-end p-6 text-left md:p-8">
        {children}
      </div>
    </section>
  );
}
