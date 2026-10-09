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
  const sections: Array<{ type: "global"; items: StudyRoomStageLayoutItem[] } | { type: "inline"; item: StudyRoomStageLayoutItem }> = [];

  items.forEach((item) => {
    if (item.layoutMode === "inline-row") {
      sections.push({ type: "inline", item });
      return;
    }

    const lastSection = sections[sections.length - 1];
    if (lastSection?.type === "global") {
      lastSection.items.push(item);
    } else {
      sections.push({ type: "global", items: [item] });
    }
  });

  return (
    <div className="h-auto min-h-fit w-full space-y-6 overflow-visible pb-8">
      {sections.map((section, sectionIndex) => section.type === "global" ? (
        <div key={`global-${sectionIndex}`} className="grid h-auto min-h-fit w-full grid-cols-1 items-start gap-6 overflow-visible md:grid-cols-12">
          <div className="min-w-0 space-y-6 overflow-visible md:col-span-8">
            {section.items.map((item) => <div key={item.id} className="min-w-0">{item.main}</div>)}
          </div>
          <aside className="min-w-0 space-y-4 overflow-visible md:col-span-4">
            {section.items.map((item) => item.sidebar ? <div key={item.id} className="min-w-0">{item.sidebar}</div> : null)}
          </aside>
        </div>
      ) : (
        <StudyRoomBlockRow key={section.item.id} fullWidth={section.item.fullWidth} sidebar={section.item.sidebar}>
          {section.item.main}
        </StudyRoomBlockRow>
      ))}
    </div>
  );
}
