"use client";

import { useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { Markdown } from "@tiptap/markdown";
import {
  Bold,
  Code2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Lightbulb,
  Minus,
  Palette,
  PlusCircle,
  Quote,
  Strikethrough,
} from "lucide-react";
import { useState } from "react";
import { Tooltip } from "@/components/shared/tooltip";
import { LucideIconPicker } from "@/components/shared/lucide-icon-picker";
import { InlineLucideIcon } from "@/components/shared/inline-lucide-icon";

const MarkdownTextStyle = TextStyle.extend({
  renderMarkdown(node, helpers) {
    const content = helpers.renderChildren(node.content || []);
    const color = typeof node.attrs?.color === "string" ? node.attrs.color : "";
    return color ? `<span style="color: ${color}">${content}</span>` : content;
  },
});

function normalizeEscapedBoldMarkdown(markdown: string) {
  return markdown.replace(/\\\*\s*\\\*\s*(.+?)\s*\\\*\s*\\\*/g, "**$1**");
}

type TiptapEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  ariaLabel: string;
  compact?: boolean;
};

function ToolbarButton({
  label,
  active = false,
  compact = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  compact?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={`flex items-center justify-center rounded transition ${compact ? "h-6 min-w-6 px-1 text-[10px]" : "h-7 min-w-7 px-1.5 text-[11px]"} ${active ? "bg-amber-500/15 text-amber-300" : "text-stone-300 hover:bg-[#293343] hover:text-white"}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function TiptapEditor({
  value,
  onChange,
  placeholder = "Start typing lesson content or use formatting options...",
  ariaLabel,
  compact = false,
}: TiptapEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [isColorPaletteOpen, setIsColorPaletteOpen] = useState(false);
  const colorPaletteRef = useRef<HTMLDivElement | null>(null);
  const normalizedValue = normalizeEscapedBoldMarkdown(value);

  const extensions = useMemo(() => [
    StarterKit.configure({ link: false }),
    Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
    Placeholder.configure({ placeholder }),
    MarkdownTextStyle,
    Color.configure({ types: ["textStyle"] }),
    InlineLucideIcon,
    Markdown,
  ], [placeholder]);

  const editor = useEditor({
    extensions,
    content: normalizedValue,
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        class: "min-h-[100px] outline-none",
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      onChangeRef.current(updatedEditor.getMarkdown());
    },
  }, [extensions]);

  useEffect(() => {
    if (!editor) return;
    if (editor.getMarkdown() !== normalizedValue) {
      editor.commands.setContent(normalizedValue, { contentType: "markdown", emitUpdate: false });
    }
    if (normalizedValue !== value) onChangeRef.current(normalizedValue);
  }, [editor, normalizedValue, value]);

  useEffect(() => {
    if (!isColorPaletteOpen) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !colorPaletteRef.current?.contains(event.target)) {
        setIsColorPaletteOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [isColorPaletteOpen]);

  const applyLink = () => {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const href = window.prompt("Enter link URL", "https://");
    if (href?.trim()) editor.chain().focus().setLink({ href: href.trim() }).run();
  };

  const textColors = ["#f3f4f6", "#f59e0b", "#ef4444", "#10b981", "#06b6d4", "#a78bfa", "#f472b6", "#9ca3af"];

  return (
    <div className="tiptap-editor w-full min-w-0 space-y-2">
      <div className="w-full min-w-0">
        <div className={`box-border flex w-full min-w-0 flex-wrap items-center justify-center rounded border border-[#202631] bg-[#0c1017] p-1 ${compact ? "gap-1" : "gap-1.5"}`} role="toolbar" aria-label="Rich text formatting">
          <ToolbarButton compact={compact} label="Heading 1" active={!!editor?.isActive("heading", { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
          <ToolbarButton compact={compact} label="Heading 2" active={!!editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
          <ToolbarButton compact={compact} label="Heading 3" active={!!editor?.isActive("heading", { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>
          <span className={`${compact ? "mx-0.5" : "mx-1"} h-4 w-px bg-[#394252]`} aria-hidden="true" />
          <ToolbarButton compact={compact} label="Bold" active={!!editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Italic" active={!!editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Strikethrough" active={!!editor?.isActive("strike")} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough className="h-3.5 w-3.5" /></ToolbarButton>
          <span className={`${compact ? "mx-0.5" : "mx-1"} h-4 w-px bg-[#394252]`} aria-hidden="true" />
          <ToolbarButton compact={compact} label="Bullet list" active={!!editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Numbered list" active={!!editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></ToolbarButton>
          <span className={`${compact ? "mx-0.5" : "mx-1"} h-4 w-px bg-[#394252]`} aria-hidden="true" />
          <ToolbarButton compact={compact} label="Callout / blockquote" active={!!editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Lightbulb className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Code block" active={!!editor?.isActive("codeBlock")} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}><Code2 className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Horizontal rule" onClick={() => editor?.chain().focus().setHorizontalRule().run()}><Minus className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label={editor?.isActive("link") ? "Remove link" : "Add link"} active={!!editor?.isActive("link")} onClick={applyLink}><Link2 className="h-3.5 w-3.5" /></ToolbarButton>
          <div ref={colorPaletteRef} className="relative">
            <ToolbarButton compact={compact} label="Text color" active={!!editor?.isActive("textStyle")} onClick={() => setIsColorPaletteOpen((open) => !open)}><Palette className="h-3.5 w-3.5" /></ToolbarButton>
            {isColorPaletteOpen && (
              <div className="absolute right-0 top-full z-40 mt-2 grid w-36 grid-cols-4 gap-2 rounded-md border border-[#394252] bg-[#171d28] p-3 shadow-xl" role="dialog" aria-label="Choose text color">
                {textColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      editor?.chain().focus().setColor(color).run();
                      setIsColorPaletteOpen(false);
                    }}
                    className="h-6 w-6 rounded-full border border-white/30 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    style={{ backgroundColor: color }}
                    aria-label={`Set text color ${color}`}
                    title={color}
                  />
                ))}
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    editor?.chain().focus().unsetColor().run();
                    setIsColorPaletteOpen(false);
                  }}
                  className="col-span-4 rounded border border-[#394252] px-2 py-1 text-[10px] text-stone-300 hover:border-amber-500/60"
                >
                  Clear color
                </button>
              </div>
            )}
          </div>
          <LucideIconPicker
            triggerLabel="Insert Icon"
            triggerIcon={PlusCircle}
            compact={compact}
            onChange={(name) => editor?.chain().focus().insertContent({ type: "inlineLucideIcon", attrs: { name } }).run()}
          />
        </div>
      </div>
      <div className="rounded border border-[#202631] bg-[#0c1017] px-3 py-2 text-xs text-stone-200 outline-none transition focus-within:border-amber-500 [&_.ProseMirror]:min-h-[100px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:leading-relaxed [&_.ProseMirror_h1]:my-3 [&_.ProseMirror_h1]:text-xl [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h2]:my-2 [&_.ProseMirror_h2]:text-lg [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h3]:my-2 [&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_blockquote]:my-2 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-amber-500 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_pre]:my-2 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded [&_.ProseMirror_pre]:bg-[#171d28] [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-[#171d28] [&_.ProseMirror_code]:px-1 [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_hr]:my-3 [&_.ProseMirror_a]:text-amber-300 [&_.ProseMirror_a]:underline">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
