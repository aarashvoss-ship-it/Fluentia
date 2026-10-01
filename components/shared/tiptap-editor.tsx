"use client";

import { useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import {
  Bold,
  Code2,
  HelpCircle,
  Italic,
  Link2,
  List,
  ListOrdered,
  Lightbulb,
  Minus,
  Quote,
  Strikethrough,
} from "lucide-react";
import { Tooltip } from "@/components/shared/tooltip";
import { LucideIconPicker } from "@/components/shared/lucide-icon-picker";
import { InlineLucideIcon } from "@/components/shared/inline-lucide-icon";

type TiptapEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  ariaLabel: string;
  onHelp?: () => void;
};

function ToolbarButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
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
        className={`flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-[11px] transition ${active ? "bg-amber-500/15 text-amber-300" : "text-stone-300 hover:bg-[#293343] hover:text-white"}`}
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
  onHelp,
}: TiptapEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const extensions = useMemo(() => [
    StarterKit.configure({ link: false }),
    Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
    Placeholder.configure({ placeholder }),
    InlineLucideIcon,
    Markdown,
  ], [placeholder]);

  const editor = useEditor({
    extensions,
    content: value,
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
    if (!editor || editor.getMarkdown() === value) return;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  const applyLink = () => {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const href = window.prompt("Enter link URL", "https://");
    if (href?.trim()) editor.chain().focus().setLink({ href: href.trim() }).run();
  };

  return (
    <div className="tiptap-editor space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {onHelp && (
          <Tooltip content="View Markdown formatting help">
            <button
              type="button"
              onClick={onHelp}
              className="inline-flex items-center gap-1 text-[10px] uppercase text-stone-500 hover:text-amber-300"
              aria-label="Open Markdown help"
            >
              Markdown <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        )}
        <div className="flex flex-wrap items-center gap-0.5 rounded border border-[#202631] bg-[#0c1017] p-1" role="toolbar" aria-label="Rich text formatting">
          <ToolbarButton label="Heading 1" active={!!editor?.isActive("heading", { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
          <ToolbarButton label="Heading 2" active={!!editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
          <ToolbarButton label="Heading 3" active={!!editor?.isActive("heading", { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>
          <span className="mx-1 h-4 w-px bg-[#394252]" aria-hidden="true" />
          <ToolbarButton label="Bold" active={!!editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton label="Italic" active={!!editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton label="Strikethrough" active={!!editor?.isActive("strike")} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough className="h-3.5 w-3.5" /></ToolbarButton>
          <span className="mx-1 h-4 w-px bg-[#394252]" aria-hidden="true" />
          <ToolbarButton label="Bullet list" active={!!editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton label="Numbered list" active={!!editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></ToolbarButton>
          <span className="mx-1 h-4 w-px bg-[#394252]" aria-hidden="true" />
          <ToolbarButton label="Callout / blockquote" active={!!editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Lightbulb className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton label="Code block" active={!!editor?.isActive("codeBlock")} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}><Code2 className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton label="Horizontal rule" onClick={() => editor?.chain().focus().setHorizontalRule().run()}><Minus className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton label={editor?.isActive("link") ? "Remove link" : "Add link"} active={!!editor?.isActive("link")} onClick={applyLink}><Link2 className="h-3.5 w-3.5" /></ToolbarButton>
          <LucideIconPicker
            triggerLabel="Icon"
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
