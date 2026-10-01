"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as LucideIcons from "lucide-react";
import { CircleHelp, Search } from "lucide-react";
import type { LucideIcon, LucideProps } from "lucide-react";

const ICON_COMPONENTS = LucideIcons as unknown as Record<string, LucideIcon>;

const ICON_CATEGORIES = [
  {
    id: "popular",
    label: "Popular",
    icons: ["BookOpen", "Check", "Star", "Play", "Lightbulb", "Target", "Sparkles", "Heart", "Clock", "Award", "Bookmark"],
  },
  {
    id: "education",
    label: "Education",
    icons: ["GraduationCap", "Book", "BookOpen", "BookMarked", "Pencil", "Languages", "School", "Brain", "Library", "ClipboardList"],
  },
  {
    id: "media",
    label: "Media",
    icons: ["Play", "Pause", "Headphones", "Volume2", "Video", "Image", "Music", "Mic", "Radio", "Camera", "FileAudio"],
  },
  {
    id: "arrows",
    label: "Arrows",
    icons: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "ChevronLeft", "ChevronRight", "ChevronUp", "ChevronDown", "MoveUpRight", "CornerDownRight"],
  },
  {
    id: "general",
    label: "General",
    icons: ["Home", "UserRound", "Settings", "Search", "Plus", "X", "CheckCircle2", "Info", "AlertTriangle", "CalendarDays", "Globe", "Link", "Zap"],
  },
] as const;

function isRenderableIcon(value: unknown): value is LucideIcon {
  return typeof value === "function"
    || (typeof value === "object" && value !== null && "$$typeof" in value);
}

const ALL_ICON_NAMES = Object.keys(ICON_COMPONENTS)
  .filter((name) => /^[A-Z]/.test(name) && isRenderableIcon(ICON_COMPONENTS[name]))
  .sort((first, second) => first.localeCompare(second));

export function DynamicLucideIcon({
  name,
  fallback: Fallback = CircleHelp,
  ...props
}: LucideProps & { name?: string | null; fallback?: LucideIcon }) {
  const candidate = name ? ICON_COMPONENTS[name] : undefined;
  const Icon = isRenderableIcon(candidate) ? candidate : Fallback;
  return <Icon {...props} />;
}

export function LucideIconPicker({
  value,
  onChange,
  triggerLabel,
  triggerIcon,
}: {
  value?: string;
  onChange: (iconName: string) => void;
  triggerLabel?: string;
  triggerIcon?: LucideIcon;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<(typeof ICON_CATEGORIES)[number]["id"]>("popular");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const selectedName = value && isRenderableIcon(ICON_COMPONENTS[value]) ? value : "";
  const TriggerIcon = triggerIcon ?? (selectedName ? ICON_COMPONENTS[selectedName] : CircleHelp);
  const normalizedSearch = search.trim().toLowerCase();

  const updatePopoverPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const popoverWidth = Math.min(336, window.innerWidth - 32);
    const popoverHeight = Math.min(390, window.innerHeight - 32);
    const left = Math.max(16, Math.min(bounds.left, window.innerWidth - popoverWidth - 16));
    const hasRoomBelow = bounds.bottom + popoverHeight + 8 <= window.innerHeight - 16;
    const top = hasRoomBelow
      ? bounds.bottom + 8
      : Math.max(16, bounds.top - popoverHeight - 8);
    setPopoverPosition({ top, left });
  };

  const visibleIcons = useMemo(() => {
    const names = normalizedSearch
      ? ALL_ICON_NAMES
      : ICON_CATEGORIES.find((category) => category.id === activeCategory)?.icons || [];
    return names.filter((name) => name.toLowerCase().includes(normalizedSearch));
  }, [activeCategory, normalizedSearch]);

  useEffect(() => {
    if (!isOpen) return;
    updatePopoverPosition();
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node
        && !rootRef.current?.contains(event.target)
        && !popoverRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!isOpen) updatePopoverPosition();
          setIsOpen((open) => !open);
        }}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={selectedName ? `Selected icon: ${selectedName}` : "Choose icon"}
        className="inline-flex min-h-9 min-w-28 items-center justify-center gap-2 rounded border border-amber-500/40 bg-[#0c1017] px-3 text-xs font-medium text-stone-200 hover:border-amber-500/80"
      >
        <TriggerIcon className="h-4 w-4 text-amber-300" aria-hidden="true" />
        {triggerLabel || selectedName || "Choose icon"}
      </button>
      {isOpen && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Choose a Lucide icon"
          style={{ position: "fixed", top: popoverPosition.top, left: popoverPosition.left, zIndex: 10000 }}
          className="w-[min(21rem,calc(100vw-2rem))] rounded-md border border-[#394252] bg-[#171d28] p-3 shadow-2xl"
        >
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-stone-500" aria-hidden="true" />
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search icons"
              aria-label="Search icons by name"
              className="h-9 w-full rounded border border-[#394252] bg-[#0c1017] pl-8 pr-3 text-xs text-stone-200 outline-none focus:border-amber-500"
            />
          </label>
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Icon categories">
            {ICON_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={activeCategory === category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`shrink-0 rounded px-2 py-1.5 text-[10px] font-medium ${activeCategory === category.id ? "bg-amber-500 text-slate-950" : "text-stone-400 hover:bg-[#202631] hover:text-stone-200"}`}
              >
                {category.label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid max-h-52 grid-cols-5 gap-1 overflow-y-auto sm:grid-cols-6" role="listbox" aria-label="Available icons">
            {visibleIcons.map((iconName) => (
              <button
                key={iconName}
                type="button"
                role="option"
                aria-selected={selectedName === iconName}
                title={iconName}
                aria-label={iconName}
                onClick={() => {
                  onChange(iconName);
                  setIsOpen(false);
                }}
                className={`flex aspect-square items-center justify-center rounded border transition hover:border-amber-500/70 hover:bg-amber-500/10 ${selectedName === iconName ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-transparent text-stone-300"}`}
              >
                <DynamicLucideIcon name={iconName} className="h-4 w-4" aria-hidden="true" />
              </button>
            ))}
            {visibleIcons.length === 0 && <p className="col-span-full py-6 text-center text-xs text-stone-500">No icons found.</p>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}