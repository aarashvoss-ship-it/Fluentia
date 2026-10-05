"use client";

import { cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

type TooltipTriggerProps = {
  "aria-describedby"?: string;
  className?: string;
};

interface TooltipProps {
  content: string;
  children: ReactElement<TooltipTriggerProps>;
}

export function Tooltip({ content, children }: TooltipProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const suppressPointerFocusUntilLeave = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;
      const bounds = trigger.getBoundingClientRect();
      const viewportPadding = 8;
      const { width, height } = tooltip.getBoundingClientRect();
      const spaceAbove = bounds.top - viewportPadding;
      const spaceBelow = window.innerHeight - bounds.bottom - viewportPadding;
      const side = spaceAbove >= height || spaceAbove >= spaceBelow ? "top" : "bottom";
      const desiredTop = side === "top" ? bounds.top - height - viewportPadding : bounds.bottom + viewportPadding;
      const top = Math.max(viewportPadding, Math.min(desiredTop, window.innerHeight - height - viewportPadding));
      const centeredLeft = bounds.left + bounds.width / 2 - width / 2;
      const left = Math.max(viewportPadding, Math.min(centeredLeft, window.innerWidth - width - viewportPadding));
      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const closeWhenOutside = (event: Event) => {
      if (!triggerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeWhenOutside, true);
    document.addEventListener("focusin", closeWhenOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside, true);
      document.removeEventListener("focusin", closeWhenOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  if (!isValidElement<TooltipTriggerProps>(children)) return children;

  const describedBy = [children.props["aria-describedby"], tooltipId].filter(Boolean).join(" ");
  const className = [children.props.className, "fluentia-tooltip-target"].filter(Boolean).join(" ");
  return (
    <>
      <span
        ref={triggerRef}
        className="fluentia-tooltip-trigger"
        onPointerEnter={() => {
          if (!suppressPointerFocusUntilLeave.current) setIsOpen(true);
        }}
        onPointerLeave={() => {
          suppressPointerFocusUntilLeave.current = false;
          setIsOpen(false);
        }}
        onPointerDownCapture={() => {
          suppressPointerFocusUntilLeave.current = true;
          setIsOpen(false);
        }}
        onClickCapture={() => setIsOpen(false)}
        onFocusCapture={() => {
          if (!suppressPointerFocusUntilLeave.current) setIsOpen(true);
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOpen(false);
        }}
      >
        {cloneElement(children, { "aria-describedby": describedBy, className })}
      </span>
      {isOpen && typeof document !== "undefined" && createPortal(
        <span
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className="fluentia-tooltip-content"
          style={{ top: position.top, left: position.left }}
        >
          {content}
        </span>,
        document.body,
      )}
    </>
  );
}
