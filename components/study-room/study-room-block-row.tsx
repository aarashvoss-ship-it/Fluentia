import type { ReactNode } from "react";

interface StudyRoomBlockRowProps {
  children: ReactNode;
  sidebar?: ReactNode;
  fullWidth?: boolean;
}

export function StudyRoomBlockRow({ children, sidebar, fullWidth = false }: StudyRoomBlockRowProps) {
  return (
    <div className="grid h-auto min-h-fit w-full grid-cols-1 items-start gap-6 md:grid-cols-12">
      <div className={`h-auto min-h-fit min-w-0 w-full ${fullWidth ? "md:col-span-12" : "md:col-span-8"}`}>{children}</div>
      {!fullWidth && <div className="h-auto min-h-fit min-w-0 w-full space-y-4 md:col-span-4">{sidebar}</div>}
    </div>
  );
}
