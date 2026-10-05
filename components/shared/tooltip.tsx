"use client";

import { cloneElement, isValidElement, useId, useLayoutEffect, useRef, useState, type ReactElement } from "react";
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
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const isVisible = isHovered || isFocused;

  useLayoutEffect(() => {
    if (!isVisible) return;

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
  }, [isVisible]);

  if (!isValidElement<TooltipTriggerProps>(children)) return children;

  const describedBy = [children.props["aria-describedby"], tooltipId].filter(Boolean).join(" ");
  const className = [children.props.className, "fluentia-tooltip-target"].filter(Boolean).join(" ");
  return (
    <>
      <span
        ref={triggerRef}
        className="fluentia-tooltip-trigger"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocusCapture={() => setIsFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFocused(false);
        }}
      >
        {cloneElement(children, { "aria-describedby": describedBy, className })}
      </span>
      {isVisible && typeof document !== "undefined" && createPortal(
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
