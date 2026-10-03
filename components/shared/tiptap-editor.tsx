"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { Markdown } from "@tiptap/markdown";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import {
  Bold,
  Code2,
  ChevronDown,
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
import { Tooltip } from "@/components/shared/tooltip";
import {
  DynamicLucideIcon,
  filterLucideIconNames,
  isLucideIconName,
  LUCIDE_ICON_NAMES,
  normalizeIconSearch,
} from "@/components/shared/lucide-icon-picker";
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

function normalizeLegacyMarkdown(markdown: string) {
  const unwrapped = markdown.startsWith('"') && markdown.endsWith('"')
    ? markdown.slice(1, -1).replace(/\\"/g, '"')
    : markdown;
  return normalizeEscapedBoldMarkdown(unwrapped.replace(/\\n/g, "\n"));
}

function isHtmlContent(value: string) {
  return /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|pre|code|table|thead|tbody|tr|th|td|a|strong|em|s|span|hr|br)\b/i.test(value);
}

type TiptapEditorProps = {
  value: string;
  onChange: (html: string) => void;
  onHtmlChange?: (html: string) => void;
  placeholder?: string;
  ariaLabel: string;
  compact?: boolean;
  wrapToolbar?: boolean;
};

function ToolbarButton({
  label,
  active = false,
  compact = false,
  onClick,
  children,
  title,
  disabled = false,
}: {
  label: string;
  active?: boolean;
  compact?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        aria-label={label}
        title={title || label}
        aria-pressed={active}
        disabled={disabled}
        className={`flex items-center justify-center rounded transition disabled:cursor-not-allowed disabled:opacity-40 ${compact ? "h-6 min-w-6 px-1 text-[10px]" : "h-7 min-w-7 px-1.5 text-[11px]"} ${active ? "bg-amber-500/20 text-amber-400" : "text-stone-300 hover:bg-[#293343] hover:text-white"}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function TiptapEditor({
  value,
  onChange,
  onHtmlChange,
  placeholder = "Start typing lesson content or use formatting options...",
  ariaLabel,
  compact = false,
  wrapToolbar = true,
}: TiptapEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onHtmlChangeRef = useRef(onHtmlChange);
  onHtmlChangeRef.current = onHtmlChange;
  const [isColorPaletteOpen, setIsColorPaletteOpen] = useState(false);
  const colorPaletteRef = useRef<HTMLDivElement | null>(null);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const iconSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const iconPickerButtonRef = useRef<HTMLButtonElement | null>(null);
  const iconPickerRef = useRef<HTMLDivElement | null>(null);
  const [iconPickerPosition, setIconPickerPosition] = useState({ top: 0, left: 0 });
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const tableMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const tableMenuRef = useRef<HTMLDivElement | null>(null);
  const [tableMenuPosition, setTableMenuPosition] = useState({ top: 0, left: 0 });
  const valueIsHtml = isHtmlContent(value);
  const normalizedValue = valueIsHtml ? value : normalizeLegacyMarkdown(value);

  const extensions = useMemo(() => [
    StarterKit.configure({ link: false, heading: { levels: [1, 2, 3, 4] } }),
    Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder }),
    MarkdownTextStyle,
    Color.configure({ types: ["textStyle"] }),
    InlineLucideIcon,
    Markdown,
  ], [placeholder]);

  const editor = useEditor({
    extensions,
    content: normalizedValue,
    contentType: valueIsHtml ? "html" : "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        class: "min-h-[100px] outline-none",
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const html = updatedEditor.isEmpty ? "" : updatedEditor.getHTML();
      onChangeRef.current(html);
      onHtmlChangeRef.current?.(html);
    },
  }, [extensions]);

  useEffect(() => {
    if (!editor) return;
    if (valueIsHtml) {
      if (editor.getHTML() !== normalizedValue) {
        editor.commands.setContent(normalizedValue, { contentType: "html", emitUpdate: false });
      }
    } else {
      editor.commands.setContent(normalizedValue, { contentType: "markdown", emitUpdate: false });
    }
    const html = editor.isEmpty ? "" : editor.getHTML();
    onHtmlChangeRef.current?.(html);
    if (!valueIsHtml && html !== value) onChangeRef.current(html);
  }, [editor, normalizedValue, value, valueIsHtml]);

  const activeStates = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      paragraph: currentEditor?.isActive("paragraph") ?? false,
      heading1: currentEditor?.isActive("heading", { level: 1 }) ?? false,
      heading2: currentEditor?.isActive("heading", { level: 2 }) ?? false,
      heading3: currentEditor?.isActive("heading", { level: 3 }) ?? false,
      heading4: currentEditor?.isActive("heading", { level: 4 }) ?? false,
      bold: currentEditor?.isActive("bold") ?? false,
      italic: currentEditor?.isActive("italic") ?? false,
      strike: currentEditor?.isActive("strike") ?? false,
      bulletList: currentEditor?.isActive("bulletList") ?? false,
      orderedList: currentEditor?.isActive("orderedList") ?? false,
      blockquote: currentEditor?.isActive("blockquote") ?? false,
      codeBlock: currentEditor?.isActive("codeBlock") ?? false,
      link: currentEditor?.isActive("link") ?? false,
      textStyle: currentEditor?.isActive("textStyle") ?? false,
      table: currentEditor?.isActive("table") ?? false,
    }),
  });
  const active = activeStates ?? {
    paragraph: false,
    heading1: false,
    heading2: false,
    heading3: false,
    heading4: false,
    bold: false,
    italic: false,
    strike: false,
    bulletList: false,
    orderedList: false,
    blockquote: false,
    codeBlock: false,
    link: false,
    textStyle: false,
    table: false,
  };

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

  useEffect(() => {
    if (!isIconPickerOpen && !isTableMenuOpen) return;
    const updatePopoverPositions = () => {
      const positionPopover = (trigger: HTMLButtonElement | null, width: number, height: number) => {
        if (!trigger) return { top: 0, left: 0 };
        const bounds = trigger.getBoundingClientRect();
        const left = Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8));
        const top = bounds.bottom + height + 8 <= window.innerHeight
          ? bounds.bottom + 8
          : Math.max(8, bounds.top - height - 8);
        return { top, left };
      };
      if (isIconPickerOpen) setIconPickerPosition(positionPopover(iconPickerButtonRef.current, 288, 320));
      if (isTableMenuOpen) setTableMenuPosition(positionPopover(tableMenuButtonRef.current, 192, 220));
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (isIconPickerOpen
        && !iconPickerButtonRef.current?.contains(event.target)
        && !iconPickerRef.current?.contains(event.target)) {
        setIsIconPickerOpen(false);
      }
      if (isTableMenuOpen
        && !tableMenuButtonRef.current?.contains(event.target)
        && !tableMenuRef.current?.contains(event.target)) {
        setIsTableMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsIconPickerOpen(false);
        setIsTableMenuOpen(false);
      }
    };
    updatePopoverPositions();
    window.addEventListener("resize", updatePopoverPositions);
    window.addEventListener("scroll", updatePopoverPositions, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", updatePopoverPositions);
      window.removeEventListener("scroll", updatePopoverPositions, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isIconPickerOpen, isTableMenuOpen]);

  const applyLink = () => {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const href = window.prompt("Enter link URL", "https://");
    if (href?.trim()) editor.chain().focus().setLink({ href: href.trim() }).run();
  };

  const textColors = ["#f3f4f6", "#fbbf24", "#ef4444", "#10b981", "#06b6d4", "#a78bfa", "#f472b6", "#9ca3af"];
  const popularIcons = ["BookOpen", "Check", "Star", "Play", "Lightbulb", "Target", "Sparkles", "Heart", "Clock", "Award", "Bookmark"];
  const normalizedIconSearch = normalizeIconSearch(iconSearch);
  const visibleIcons = useMemo(
    () => filterLucideIconNames(normalizedIconSearch ? LUCIDE_ICON_NAMES : popularIcons, normalizedIconSearch).slice(0, 60),
    [normalizedIconSearch],
  );

  return (
    <div className="tiptap-editor w-full min-w-0 space-y-2">
      <div className="w-full min-w-0">
        <div className={`box-border flex w-full min-w-0 items-center justify-start rounded border border-[#202631] bg-[#0c1017] p-1 ${wrapToolbar ? "flex-wrap" : ""} ${compact ? "gap-0.5" : "gap-1.5"}`} role="toolbar" aria-label="Rich text formatting">
          <ToolbarButton compact={compact} label="Normal paragraph" active={active.paragraph} onClick={() => editor?.chain().focus().setParagraph().run()}>P</ToolbarButton>
          <ToolbarButton compact={compact} label="Heading 1" active={active.heading1} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
          <ToolbarButton compact={compact} label="Heading 2" active={active.heading2} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
          <ToolbarButton compact={compact} label="Heading 3" active={active.heading3} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>
          <ToolbarButton compact={compact} label="Heading 4" active={active.heading4} onClick={() => editor?.chain().focus().toggleHeading({ level: 4 }).run()}>H4</ToolbarButton>
          {!compact && <span className="mx-1 h-4 w-px shrink-0 bg-[#394252]" aria-hidden="true" />}
          <ToolbarButton compact={compact} label="Bold" active={active.bold} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Italic" active={active.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Strikethrough" active={active.strike} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough className="h-3.5 w-3.5" /></ToolbarButton>
          {!compact && <span className="mx-1 h-4 w-px shrink-0 bg-[#394252]" aria-hidden="true" />}
          <ToolbarButton compact={compact} label="Bullet list" active={active.bulletList} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Numbered list" active={active.orderedList} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></ToolbarButton>
          {!compact && <span className="mx-1 h-4 w-px shrink-0 bg-[#394252]" aria-hidden="true" />}
          <ToolbarButton compact={compact} label="Callout / blockquote" active={active.blockquote} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Lightbulb className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Code block" active={active.codeBlock} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}><Code2 className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Horizontal rule" onClick={() => editor?.chain().focus().setHorizontalRule().run()}><Minus className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label={active.link ? "Remove link" : "Add link"} active={active.link} onClick={applyLink}><Link2 className="h-3.5 w-3.5" /></ToolbarButton>
          {!compact && <span className="mx-1 h-4 w-px shrink-0 bg-[#394252]" aria-hidden="true" />}
          <div className="shrink-0">
            <Tooltip content="Table controls">
              <button
                ref={tableMenuButtonRef}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (!isTableMenuOpen) {
                    const bounds = tableMenuButtonRef.current?.getBoundingClientRect();
                    if (bounds) setTableMenuPosition({ top: bounds.bottom + 8, left: Math.max(8, Math.min(bounds.right - 192, window.innerWidth - 200)) });
                  }
                  setIsTableMenuOpen((open) => !open);
                }}
                aria-label="Table controls"
                aria-expanded={isTableMenuOpen}
                aria-haspopup="menu"
                className={`flex items-center justify-center gap-1 rounded text-[10px] text-stone-300 transition hover:bg-[#293343] hover:text-white ${compact ? "h-6 px-1" : "h-7 px-1.5"}`}
              >
                Table <ChevronDown className="h-3 w-3" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
          <div ref={colorPaletteRef} className="relative shrink-0">
            <ToolbarButton compact={compact} label="Text color" active={active.textStyle} onClick={() => setIsColorPaletteOpen((open) => !open)}><Palette className="h-3.5 w-3.5" /></ToolbarButton>
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
                    className="h-6 w-6 rounded-full border border-white/30 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
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
                  className="col-span-4 rounded border border-[#394252] px-2 py-1 text-[10px] text-stone-300 hover:border-amber-500/40"
                >
                  Clear color
                </button>
              </div>
            )}
          </div>
          <div className="shrink-0">
            <Tooltip content="Insert Icon">
              <button
                ref={iconPickerButtonRef}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (!editor || !isLucideIconName(name)) return;
                  iconSelectionRef.current = { from: editor.state.selection.from, to: editor.state.selection.to };
                  setIconSearch("");
                  setIsIconPickerOpen((open) => !open);
                }}
                aria-label="Insert Icon"
                aria-expanded={isIconPickerOpen}
                aria-haspopup="dialog"
                className={`flex items-center justify-center rounded transition ${compact ? "h-6 min-w-6 px-1" : "h-7 min-w-7 px-1.5"} text-stone-300 hover:bg-[#293343] hover:text-white`}
              >
                <PlusCircle className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            {isIconPickerOpen && typeof document !== "undefined" && createPortal(
              <div ref={iconPickerRef} role="dialog" aria-label="Choose an icon to insert" style={{ position: "fixed", top: iconPickerPosition.top, left: iconPickerPosition.left, zIndex: 10000 }} className="w-72 max-w-[calc(100vw-1rem)] rounded-md border border-[#394252] bg-[#171d28] p-3 shadow-2xl">
                <input
                  autoFocus
                  type="search"
                  value={iconSearch}
                  onChange={(event) => setIconSearch(event.target.value)}
                  placeholder="Search icons"
                  aria-label="Search icons by name"
                  className="h-9 w-full rounded border border-[#394252] bg-[#0c1017] px-3 text-xs text-stone-200 outline-none focus:border-amber-500/40"
                />
                <div className="mt-2 grid max-h-48 grid-cols-6 gap-1 overflow-y-auto" aria-label="Available icons">
                  {visibleIcons.map((name) => (
                    <button
                      key={name}
                      type="button"
                      aria-label={name}
                      title={name}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (!editor) return;
                        const selection = iconSelectionRef.current || editor.state.selection;
                        const maxPosition = editor.state.doc.content.size;
                        const from = Math.min(selection.from, maxPosition);
                        const to = Math.min(selection.to, maxPosition);
                        editor.chain().insertContentAt({ from, to }, {
                          type: "inlineLucideIcon",
                          attrs: { name },
                        }).focus().run();
                        setIsIconPickerOpen(false);
                      }}
                      className="flex h-8 items-center justify-center rounded border border-transparent text-stone-300 hover:border-amber-500/40 hover:bg-amber-500/20 hover:text-amber-400"
                    >
                      <DynamicLucideIcon name={name} className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ))}
                  {visibleIcons.length === 0 && <p className="col-span-full py-4 text-center text-xs text-stone-500">No icons found.</p>}
                </div>
              </div>,
              document.body,
            )}
          </div>
        </div>
      </div>
      {isTableMenuOpen && typeof document !== "undefined" && createPortal(
        <div
          ref={tableMenuRef}
          role="menu"
          aria-label="Table controls"
          style={{ position: "fixed", top: tableMenuPosition.top, left: tableMenuPosition.left, zIndex: 10000 }}
          className="grid w-48 grid-cols-2 gap-1 rounded-md border border-[#394252] bg-[#171d28] p-2 shadow-2xl"
        >
          {[
            { label: "Insert table", action: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), disabled: false },
            { label: "Add row", action: () => editor?.chain().focus().addRowAfter().run(), disabled: !active.table },
            { label: "Delete row", action: () => editor?.chain().focus().deleteRow().run(), disabled: !active.table },
            { label: "Add column", action: () => editor?.chain().focus().addColumnAfter().run(), disabled: !active.table },
            { label: "Delete column", action: () => editor?.chain().focus().deleteColumn().run(), disabled: !active.table },
            { label: "Header row", action: () => editor?.chain().focus().toggleHeaderRow().run(), disabled: !active.table },
            { label: "Delete table", action: () => editor?.chain().focus().deleteTable().run(), disabled: !active.table },
          ].map(({ label, action, disabled }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                action();
                setIsTableMenuOpen(false);
              }}
              className="rounded px-2 py-1.5 text-left text-[11px] text-stone-300 hover:bg-[#293343] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {label}
            </button>
          ))}
        </div>,
        document.body,
      )}
      <div className="overflow-x-auto rounded border border-[#202631] bg-[#0c1017] px-3 py-2 text-xs text-stone-200 outline-none transition focus-within:border-amber-500/40 [&_.ProseMirror]:min-h-[100px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:leading-relaxed [&_.ProseMirror_h1]:my-3 [&_.ProseMirror_h1]:text-xl [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h2]:my-2 [&_.ProseMirror_h2]:text-lg [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h3]:my-2 [&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h4]:my-2 [&_.ProseMirror_h4]:text-lg [&_.ProseMirror_h4]:font-semibold [&_.ProseMirror_h4]:leading-7 [&_.ProseMirror_blockquote]:my-2 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-amber-500/40 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_pre]:my-2 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded [&_.ProseMirror_pre]:bg-[#171d28] [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-[#171d28] [&_.ProseMirror_code]:px-1 [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_hr]:my-3 [&_.ProseMirror_a]:text-amber-400 [&_.ProseMirror_a]:underline [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table_th]:border [&_.ProseMirror_table_th]:border-[#394252] [&_.ProseMirror_table_th]:bg-[#171d28] [&_.ProseMirror_table_th]:p-2 [&_.ProseMirror_table_td]:border [&_.ProseMirror_table_td]:border-[#394252] [&_.ProseMirror_table_td]:p-2">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
