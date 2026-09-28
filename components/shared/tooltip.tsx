import { cloneElement, isValidElement, useId, type ReactElement } from "react";

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
  if (!isValidElement<TooltipTriggerProps>(children)) return children;

  const describedBy = [children.props["aria-describedby"], tooltipId].filter(Boolean).join(" ");
  const className = [children.props.className, "fluentia-tooltip-target"].filter(Boolean).join(" ");
  return (
    <span className="fluentia-tooltip-trigger">
      {cloneElement(children, { "aria-describedby": describedBy, className })}
      <span id={tooltipId} role="tooltip" className="fluentia-tooltip-content">
        {content}
      </span>
    </span>
  );
}
