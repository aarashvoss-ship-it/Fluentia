import type { ReactNode } from "react";

interface StudyRoomBlockRowProps {
  children: ReactNode;
  sidebar?: ReactNode;
  fullWidth?: boolean;
}

export function StudyRoomBlockRow({ children, sidebar, fullWidth = false }: StudyRoomBlockRowProps) {
  return (
    <div className="my-6 grid w-full grid-cols-1 items-stretch gap-6 md:grid-cols-12">
      <div className={`h-full w-full ${fullWidth ? "md:col-span-12" : "md:col-span-8"}`}>{children}</div>
      {!fullWidth && <div className="h-full w-full space-y-4 md:col-span-4">{sidebar}</div>}
    </div>
  );
}
