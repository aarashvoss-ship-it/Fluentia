import type { ReactNode } from "react";
import { StudyRoomBlockRow } from "@/components/study-room/study-room-block-row";

export interface StudyRoomStageLayoutItem {
  id: string;
  layoutMode?: "global" | "inline-row";
  main: ReactNode;
  sidebar?: ReactNode;
  fullWidth?: boolean;
}

interface StudyRoomStageLayoutProps {
  items: StudyRoomStageLayoutItem[];
}

export function StudyRoomStageLayout({ items }: StudyRoomStageLayoutProps) {
  const sections: Array<{ type: "flow"; items: StudyRoomStageLayoutItem[] } | { type: "full-width"; item: StudyRoomStageLayoutItem }> = [];

  items.forEach((item) => {
    if (item.fullWidth) {
      sections.push({ type: "full-width", item });
      return;
    }

    const lastSection = sections[sections.length - 1];
    if (lastSection?.type === "flow") {
      lastSection.items.push(item);
    } else {
      sections.push({ type: "flow", items: [item] });
    }
  });

  return (
    <div className="h-auto min-h-fit w-full space-y-6 overflow-visible pb-8">
      {sections.map((section, sectionIndex) => section.type === "flow" ? (
        <div key={`flow-${sectionIndex}`} className="grid h-auto min-h-fit w-full grid-cols-1 items-start gap-6 overflow-visible md:grid-cols-12">
          <div className="min-w-0 space-y-6 overflow-visible md:col-span-8">
            {section.items.map((item) => <div key={item.id}>{item.main}</div>)}
          </div>
          <aside className="flex h-auto min-h-fit min-w-0 flex-col items-stretch gap-4 overflow-visible md:col-span-4">
            {section.items.flatMap((item) => item.sidebar ? (
              <div key={item.id} className="h-fit min-w-0 w-full">{item.sidebar}</div>
            ) : [])}
          </aside>
        </div>
      ) : (
        <StudyRoomBlockRow key={section.item.id} fullWidth sidebar={section.item.sidebar}>
          {section.item.main}
        </StudyRoomBlockRow>
      ))}
    </div>
  );
}
