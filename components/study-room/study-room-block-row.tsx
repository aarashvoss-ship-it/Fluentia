import type { ReactNode } from "react";

interface StudyRoomBlockRowProps {
  children: ReactNode;
  sidebar?: ReactNode;
  fullWidth?: boolean;
}

export function StudyRoomBlockRow({ children, sidebar, fullWidth = false }: StudyRoomBlockRowProps) {
  return (
    <div className="grid h-auto min-h-max w-full grid-cols-1 items-start gap-6 overflow-visible md:grid-cols-12">
      <div className={`h-auto min-h-max min-w-0 w-full overflow-visible ${fullWidth ? "md:col-span-12" : "md:col-span-8"}`}>{children}</div>
      {!fullWidth && <div className="h-auto min-h-max min-w-0 w-full space-y-4 overflow-visible md:col-span-4">{sidebar}</div>}
    </div>
  );
}
