"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Extension, type Editor } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
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
  Eraser,
  Highlighter,
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
  Underline as UnderlineIcon,
} from "lucide-react";
import { Tooltip } from "@/components/shared/tooltip";
import {
  DynamicLucideIcon,
  filterLucideIconNames,
  IconPickerErrorBoundary,
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

const ParagraphFontSize = Extension.create({
  name: "paragraphFontSize",

  addGlobalAttributes() {
    return [{
      types: ["paragraph"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (element) => element.style.fontSize || null,
          renderHTML: (attributes) => attributes.fontSize
            ? { style: `font-size: ${attributes.fontSize}` }
            : {},
        },
      },
    }];
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
  return /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|pre|code|table|thead|tbody|tr|th|td|a|strong|em|s|u|del|mark|span|div|hr|br)\b/i.test(value);
}

function isDarkPastedColor(value: string) {
  const probe = document.createElement("span");
  probe.style.color = value;
  if (!probe.style.color) return false;
  document.body.appendChild(probe);
  const computedColor = window.getComputedStyle(probe).color;
  probe.remove();
  const channels = computedColor.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) return false;
  const [red, green, blue] = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue < 0.18;
}

function stripDarkPastedTextColors(html: string) {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    const color = element.style.color;
    if (color && isDarkPastedColor(color)) element.style.removeProperty("color");
    if (!element.getAttribute("style")?.trim()) element.removeAttribute("style");
  });
  container.querySelectorAll<HTMLElement>("font[color]").forEach((element) => {
    const color = element.getAttribute("color");
    if (color && isDarkPastedColor(color)) element.removeAttribute("color");
  });
  return container.innerHTML;
}

type TiptapEditorProps = {
  value: string;
  onChange: (html: string) => void;
  onHtmlChange?: (html: string) => void;
  placeholder?: string;
  ariaLabel: string;
  compact?: boolean;
  wrapToolbar?: boolean;
  defaultBold?: boolean;
};

function ToolbarButton({
  label,
  active = false,
  compact = false,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  active?: boolean;
  compact?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        className={`flex items-center justify-center rounded transition disabled:cursor-not-allowed disabled:opacity-40 ${compact ? "h-6 min-w-6 px-1 text-[10px]" : "h-7 min-w-7 px-1.5 text-[11px]"} ${active ? "bg-amber-500/20 text-amber-400" : "text-stone-300 hover:bg-[#293343] hover:text-white"}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function restoreWindowScrollPosition(scrollX: number, scrollY: number) {
  window.requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
}

function TiptapIconPicker({ editor, compact }: { editor: Editor | null; compact: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const selectionRef = useRef<{ from: number; to: number } | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const normalizedSearch = normalizeIconSearch(search);
  const popularIcons = ["BookOpen", "Check", "Star", "Play", "Lightbulb", "Target", "Sparkles", "Heart", "Clock", "Award", "Bookmark"];
  const visibleIcons = useMemo(
    () => filterLucideIconNames(normalizedSearch ? LUCIDE_ICON_NAMES : popularIcons, normalizedSearch).slice(0, 60),
    [normalizedSearch],
  );
  const safeFilteredIcons = Array.isArray(visibleIcons) ? visibleIcons : [];

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - 16);
    const height = Math.min(320, window.innerHeight - 16);
    const left = Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8));
    const top = bounds.bottom + height + 8 <= window.innerHeight
      ? bounds.bottom + 8
      : Math.max(8, bounds.top - height - 8);
    setPosition({ top, left });
  };

  useEffect(() => {
    if (!isOpen) return;
    searchInputRef.current?.focus({ preventScroll: true });
    updatePosition();
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node
        && !triggerRef.current?.contains(event.target)
        && !popoverRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <Tooltip content="Insert Icon">
        <button
          ref={triggerRef}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault();
            const scrollX = window.scrollX;
            const scrollY = window.scrollY;
            if (!editor) return;
            selectionRef.current = { from: editor.state.selection.from, to: editor.state.selection.to };
            setSearch("");
            if (!isOpen) updatePosition();
            setIsOpen((open) => !open);
            restoreWindowScrollPosition(scrollX, scrollY);
          }}
          aria-label="Insert Icon"
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          className={`flex items-center justify-center rounded transition ${compact ? "h-6 min-w-6 px-1" : "h-7 min-w-7 px-1.5"} text-stone-300 hover:bg-[#293343] hover:text-white`}
        >
          <PlusCircle className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
      {isOpen && typeof document !== "undefined" && createPortal(
        <IconPickerErrorBoundary>
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Choose an icon to insert"
            style={{ position: "fixed", top: position.top, left: position.left, zIndex: 10000 }}
            className="w-72 max-w-[calc(100vw-1rem)] rounded-md border border-[#394252] bg-[#171d28] p-3 shadow-2xl"
          >
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="Search icons"
              aria-label="Search icons by name"
              className="h-9 w-full rounded border border-[#394252] bg-[#0c1017] px-3 text-xs text-stone-200 outline-none focus:border-amber-500/40"
            />
            <div className="mt-2 grid max-h-48 grid-cols-6 gap-1 overflow-y-auto" aria-label="Available icons">
              {safeFilteredIcons.map((name) => isLucideIconName(name) ? (
                <Tooltip key={name} content={name}>
                  <button
                  type="button"
                  aria-label={name}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.preventDefault();
                    const scrollX = window.scrollX;
                    const scrollY = window.scrollY;
                    if (!editor || !isLucideIconName(name)) return;
                    const selection = selectionRef.current || editor.state.selection;
                    const maxPosition = editor.state.doc.content.size;
                    const from = Math.min(selection.from, maxPosition);
                    const to = Math.min(selection.to, maxPosition);
                    editor.chain().insertContentAt({ from, to }, {
                      type: "inlineLucideIcon",
                      attrs: { name },
                    }).focus(undefined, { scrollIntoView: false }).run();
                    setIsOpen(false);
                    restoreWindowScrollPosition(scrollX, scrollY);
                  }}
                  className="flex h-8 items-center justify-center rounded border border-transparent text-stone-300 hover:border-amber-500/40 hover:bg-amber-500/20 hover:text-amber-400"
                  >
                    <DynamicLucideIcon name={name} className="h-4 w-4" aria-hidden="true" />
                  </button>
                </Tooltip>
              ) : null)}
              {safeFilteredIcons.length === 0 && <p className="col-span-full py-4 text-center text-xs text-stone-500">No icons found.</p>}
            </div>
          </div>
        </IconPickerErrorBoundary>,
        document.body,
      )}
    </>
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
  defaultBold = false,
}: TiptapEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onHtmlChangeRef = useRef(onHtmlChange);
  onHtmlChangeRef.current = onHtmlChange;
  const [isColorPaletteOpen, setIsColorPaletteOpen] = useState(false);
  const colorPaletteRef = useRef<HTMLDivElement | null>(null);
  const [isHighlightPaletteOpen, setIsHighlightPaletteOpen] = useState(false);
  const highlightPaletteRef = useRef<HTMLDivElement | null>(null);
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const tableMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const tableMenuRef = useRef<HTMLDivElement | null>(null);
  const [tableMenuPosition, setTableMenuPosition] = useState({ top: 0, left: 0 });
  const defaultBoldEditorRef = useRef<Editor | null>(null);
  const valueIsHtml = isHtmlContent(value);
  const normalizedValue = valueIsHtml ? value : normalizeLegacyMarkdown(value);
  const lastPropValueRef = useRef(normalizedValue);
  const lastEditorHtmlRef = useRef<string | null>(null);

  const extensions = useMemo(() => [
    StarterKit.configure({ link: false, underline: false, heading: { levels: [1, 2, 3, 4] } }),
    Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
    Underline,
    Highlight.configure({ multicolor: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder }),
    ParagraphFontSize,
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
        class: "prose prose-invert max-w-none min-h-[100px] outline-none [&_p]:mb-[0.85em] [&_p]:leading-[1.7] [&_p]:text-base [&_h1]:mt-[1em] [&_h1]:mb-[0.5em] [&_h1]:text-[36px] [&_h1]:leading-[1.4] [&_h2]:mt-[1em] [&_h2]:mb-[0.5em] [&_h2]:text-[32px] [&_h2]:leading-[1.4] [&_h3]:mt-[1em] [&_h3]:mb-[0.5em] [&_h3]:text-[28px] [&_h3]:leading-[1.4] [&_h4]:mt-[1em] [&_h4]:mb-[0.5em] [&_h4]:text-[24px] [&_h4]:leading-[1.4] [&_ul]:mb-3 [&_ol]:mb-3",
      },
      transformPastedHTML: stripDarkPastedTextColors,
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const html = updatedEditor.isEmpty ? "" : updatedEditor.getHTML();
      lastEditorHtmlRef.current = html;
      onChangeRef.current(html);
      onHtmlChangeRef.current?.(html);
    },
  }, [extensions]);

  useEffect(() => {
    if (!editor) return;
    if (lastPropValueRef.current === normalizedValue) {
      const html = editor.isEmpty ? "" : editor.getHTML();
      onHtmlChangeRef.current?.(html);
      return;
    }
    lastPropValueRef.current = normalizedValue;
    if (lastEditorHtmlRef.current === normalizedValue) {
      lastEditorHtmlRef.current = null;
      return;
    }
    if (valueIsHtml) {
      if (editor.getHTML() !== normalizedValue) {
        editor.commands.setContent(normalizedValue, { contentType: "html", emitUpdate: false });
      }
    } else {
      editor.commands.setContent(normalizedValue, { contentType: "markdown", emitUpdate: false });
    }
    const html = editor.isEmpty ? "" : editor.getHTML();
    onHtmlChangeRef.current?.(html);
  }, [editor, normalizedValue, valueIsHtml]);

  useEffect(() => {
    if (!defaultBold || !editor || defaultBoldEditorRef.current === editor) return;
    defaultBoldEditorRef.current = editor;
    if (editor.isEmpty) editor.commands.setMark("bold");
  }, [defaultBold, editor]);

  const activeStates = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      paragraph: currentEditor?.isActive("paragraph") ?? false,
      paragraphFontSize: currentEditor?.getAttributes("paragraph").fontSize as string | null,
      heading1: currentEditor?.isActive("heading", { level: 1 }) ?? false,
      heading2: currentEditor?.isActive("heading", { level: 2 }) ?? false,
      heading3: currentEditor?.isActive("heading", { level: 3 }) ?? false,
      heading4: currentEditor?.isActive("heading", { level: 4 }) ?? false,
      bold: currentEditor?.isActive("bold") ?? false,
      italic: currentEditor?.isActive("italic") ?? false,
      strike: currentEditor?.isActive("strike") ?? false,
      underline: currentEditor?.isActive("underline") ?? false,
      highlight: currentEditor?.isActive("highlight") ?? false,
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
    paragraphFontSize: null,
    heading1: false,
    heading2: false,
    heading3: false,
    heading4: false,
    bold: false,
    italic: false,
    strike: false,
    underline: false,
    highlight: false,
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
    if (!isHighlightPaletteOpen) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !highlightPaletteRef.current?.contains(event.target)) {
        setIsHighlightPaletteOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [isHighlightPaletteOpen]);

  useEffect(() => {
    if (!isTableMenuOpen) return;
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
      if (isTableMenuOpen) setTableMenuPosition(positionPopover(tableMenuButtonRef.current, 192, 220));
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (isTableMenuOpen
        && !tableMenuButtonRef.current?.contains(event.target)
        && !tableMenuRef.current?.contains(event.target)) {
        setIsTableMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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
  }, [isTableMenuOpen]);

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
  const highlightColors = [
    { label: "Yellow", color: "rgba(234, 179, 8, 0.3)" },
    { label: "Green", color: "rgba(34, 197, 94, 0.3)" },
    { label: "Blue", color: "rgba(59, 130, 246, 0.3)" },
    { label: "Rose", color: "rgba(244, 63, 94, 0.3)" },
  ];
  return (
    <div className="tiptap-editor w-full min-w-0 space-y-2">
      <div className="w-full min-w-0">
        <div className={`box-border flex w-full min-w-0 items-center justify-start rounded border border-[#202631] bg-[#0c1017] p-1 ${wrapToolbar ? "flex-wrap" : ""} ${compact ? "gap-0.5" : "gap-1.5"}`} role="toolbar" aria-label="Rich text formatting">
          <ToolbarButton compact={compact} label="Normal (16px)" active={active.paragraph && !active.paragraphFontSize} onClick={() => editor?.chain().focus().setParagraph().updateAttributes("paragraph", { fontSize: null }).run()}>P</ToolbarButton>
          <ToolbarButton compact={compact} label="Lead (18px)" active={active.paragraph && active.paragraphFontSize === "18px"} onClick={() => editor?.chain().focus().setParagraph().updateAttributes("paragraph", { fontSize: "18px" }).run()}>P1</ToolbarButton>
          <ToolbarButton compact={compact} label="Sub-heading (20px)" active={active.paragraph && active.paragraphFontSize === "20px"} onClick={() => editor?.chain().focus().setParagraph().updateAttributes("paragraph", { fontSize: "20px" }).run()}>P2</ToolbarButton>
          <ToolbarButton compact={compact} label="Heading 4 (24px)" active={active.heading4} onClick={() => editor?.chain().focus().setHeading({ level: 4 }).run()}>H4</ToolbarButton>
          <ToolbarButton compact={compact} label="Heading 3 (28px)" active={active.heading3} onClick={() => editor?.chain().focus().setHeading({ level: 3 }).run()}>H3</ToolbarButton>
          <ToolbarButton compact={compact} label="Heading 2 (32px)" active={active.heading2} onClick={() => editor?.chain().focus().setHeading({ level: 2 }).run()}>H2</ToolbarButton>
          <ToolbarButton compact={compact} label="Heading 1 (36px)" active={active.heading1} onClick={() => editor?.chain().focus().setHeading({ level: 1 }).run()}>H1</ToolbarButton>
          {!compact && <span className="mx-1 h-4 w-px shrink-0 bg-[#394252]" aria-hidden="true" />}
          <ToolbarButton compact={compact} label="Bold" active={active.bold} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Italic" active={active.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Underline (Ctrl/Cmd+U)" active={active.underline} onClick={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Strikethrough" active={active.strike} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough className="h-3.5 w-3.5" /></ToolbarButton>
          <div ref={highlightPaletteRef} className="relative shrink-0">
            <ToolbarButton compact={compact} label="Highlight color" active={active.highlight} onClick={() => setIsHighlightPaletteOpen((open) => !open)}><Highlighter className="h-3.5 w-3.5" /></ToolbarButton>
            {isHighlightPaletteOpen && (
              <div className="absolute left-0 top-full z-40 mt-2 flex gap-2 rounded-md border border-[#394252] bg-[#171d28] p-2 shadow-xl" role="dialog" aria-label="Choose highlight color">
                {highlightColors.map(({ label, color }) => (
                  <Tooltip key={label} content={`${label} highlight`}>
                    <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      editor?.chain().focus().toggleHighlight({ color }).run();
                      setIsHighlightPaletteOpen(false);
                    }}
                    className="h-6 w-6 rounded-full border border-white/40 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    style={{ backgroundColor: color }}
                    aria-label={`${label} highlight`}
                  />
                  </Tooltip>
                ))}
              </div>
            )}
          </div>
          {!compact && <span className="mx-1 h-4 w-px shrink-0 bg-[#394252]" aria-hidden="true" />}
          <ToolbarButton compact={compact} label="Bullet list" active={active.bulletList} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Numbered list" active={active.orderedList} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Callout / blockquote" active={active.blockquote} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Lightbulb className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Code block" active={active.codeBlock} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}><Code2 className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton compact={compact} label="Horizontal rule" onClick={() => editor?.chain().focus().setHorizontalRule().run()}><Minus className="h-3.5 w-3.5" /></ToolbarButton>
          {!compact && <span className="mx-1 h-4 w-px shrink-0 bg-[#394252]" aria-hidden="true" />}
          <ToolbarButton compact={compact} label={active.link ? "Remove link" : "Add link"} active={active.link} onClick={applyLink}><Link2 className="h-3.5 w-3.5" /></ToolbarButton>
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
          <div className="shrink-0">
            <TiptapIconPicker editor={editor} compact={compact} />
          </div>
          <div ref={colorPaletteRef} className="relative shrink-0">
            <ToolbarButton compact={compact} label="Text color" active={active.textStyle} onClick={() => setIsColorPaletteOpen((open) => !open)}><Palette className="h-3.5 w-3.5" /></ToolbarButton>
            {isColorPaletteOpen && (
              <div className="absolute right-0 top-full z-40 mt-2 grid w-36 grid-cols-4 gap-2 rounded-md border border-[#394252] bg-[#171d28] p-3 shadow-xl" role="dialog" aria-label="Choose text color">
                {textColors.map((color) => (
                  <Tooltip key={color} content={`Set text color ${color}`}>
                    <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      editor?.chain().focus().setColor(color).run();
                      setIsColorPaletteOpen(false);
                    }}
                    className="h-6 w-6 rounded-full border border-white/30 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    style={{ backgroundColor: color }}
                    aria-label={`Set text color ${color}`}
                  />
                  </Tooltip>
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
          {!compact && <span className="mx-1 h-4 w-px shrink-0 bg-[#394252]" aria-hidden="true" />}
          <ToolbarButton compact={compact} label="Clear formatting" onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser className="h-3.5 w-3.5" /></ToolbarButton>
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
      <div className="overflow-x-auto rounded border border-[#202631] bg-[#0c1017] px-3 py-2 text-xs text-stone-200 outline-none transition focus-within:border-amber-500/40 [&_.ProseMirror]:min-h-[100px] [&_.ProseMirror]:outline-none [&_.ProseMirror_p]:mb-[0.85em] [&_.ProseMirror_p]:text-base [&_.ProseMirror_p]:leading-[1.7] [&_.ProseMirror_h1]:mt-[1em] [&_.ProseMirror_h1]:mb-[0.5em] [&_.ProseMirror_h1]:text-[36px] [&_.ProseMirror_h1]:leading-[1.4] [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h2]:mt-[1em] [&_.ProseMirror_h2]:mb-[0.5em] [&_.ProseMirror_h2]:text-[32px] [&_.ProseMirror_h2]:leading-[1.4] [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h3]:mt-[1em] [&_.ProseMirror_h3]:mb-[0.5em] [&_.ProseMirror_h3]:text-[28px] [&_.ProseMirror_h3]:leading-[1.4] [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h4]:mt-[1em] [&_.ProseMirror_h4]:mb-[0.5em] [&_.ProseMirror_h4]:text-[24px] [&_.ProseMirror_h4]:leading-[1.4] [&_.ProseMirror_h4]:font-semibold [&_.ProseMirror_blockquote]:my-2 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-amber-500/40 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_pre]:my-2 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded [&_.ProseMirror_pre]:bg-[#171d28] [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-[#171d28] [&_.ProseMirror_code]:px-1 [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:mb-3 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:mb-3 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_hr]:my-3 [&_.ProseMirror_a]:text-amber-400 [&_.ProseMirror_a]:underline [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table_th]:border [&_.ProseMirror_table_th]:border-[#394252] [&_.ProseMirror_table_th]:bg-[#171d28] [&_.ProseMirror_table_th]:p-2 [&_.ProseMirror_table_td]:border [&_.ProseMirror_table_td]:border-[#394252] [&_.ProseMirror_table_td]:p-2 [&_.ProseMirror_mark]:text-inherit">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
