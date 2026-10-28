import type { ReactNode } from "react";
import { getBannerOverlayStyles, type BannerFocalPosition } from "@/lib/banner-position";

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
    <section className={`relative flex aspect-video min-h-[280px] w-full flex-col overflow-hidden rounded-2xl bg-slate-950 ${className}`}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          onError={onImageError}
          style={{ objectPosition: `${position.x}% ${position.y}%` }}
          className="absolute inset-0 h-full w-full object-contain"
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
      <div
        className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent"
        aria-hidden="true"
      />
      <div className="relative z-10 flex min-h-[280px] flex-1 flex-col items-start justify-end p-6 text-left md:px-12 md:py-8">
        {children}
      </div>
    </section>
  );
}
