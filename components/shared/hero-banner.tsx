import type { ReactNode } from "react";
import { getBannerOverlayStyles, getBannerPositionStyles, type BannerFocalPosition } from "@/lib/banner-position";

interface HeroBannerProps {
  imageUrl?: string;
  position: BannerFocalPosition;
  dimness?: number;
  children: ReactNode;
  onImageError?: () => void;
  className?: string;
}

interface HeroBannerContentProps {
  logo: ReactNode;
  badge: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  footer?: ReactNode;
}

export function HeroBannerLogo() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-amber-500/40 bg-transparent p-1.5 md:h-14 md:w-14">
      <img src="/logo.png" alt="Fluentia" className="h-full w-full object-contain" />
    </div>
  );
}

export function HeroBannerContent({
  logo,
  badge,
  title,
  subtitle,
  footer,
}: HeroBannerContentProps) {
  return (
    <div className="flex flex-col items-start gap-2.5">
      <div>{logo}</div>
      <div>{badge}</div>
      <div>{title}</div>
      <div>{subtitle}</div>
      {footer && <div className="mt-1 flex items-center gap-2">{footer}</div>}
    </div>
  );
}

export function HeroBanner({
  imageUrl,
  position,
  dimness = 20,
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
        style={getBannerOverlayStyles(dimness)}
        className="absolute inset-0"
        aria-hidden="true"
      />
      <div className="absolute inset-0 z-10 flex flex-col items-start justify-start p-6 text-left md:p-8">
        {children}
      </div>
    </section>
  );
}
