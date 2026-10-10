"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { DynamicLucideIcon } from "@/components/shared/lucide-icon-picker";

function InlineLucideIconView({ node }: NodeViewProps) {
  const name = typeof node.attrs.name === "string" ? node.attrs.name : "CircleHelp";
  const color = typeof node.attrs.color === "string" ? node.attrs.color : undefined;
  return (
    <NodeViewWrapper as="span" className="inline-flex align-middle text-current" style={{ color }} title={name}>
      <DynamicLucideIcon name={name} className="h-4 w-4" aria-label={name} />
    </NodeViewWrapper>
  );
}

export const InlineLucideIcon = Node.create({
  name: "inlineLucideIcon",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      name: { default: "CircleHelp" },
      color: {
        default: null,
        parseHTML: (element) => (element as HTMLElement).style.color || null,
        renderHTML: (attributes) => typeof attributes.color === "string"
          ? { style: `color: ${attributes.color}` }
          : {},
      },
    };
  },
  parseHTML() {
    return [{
      tag: "span[data-lucide-icon]",
      getAttrs: (element) => ({
        name: (element as HTMLElement).dataset.lucideIcon,
        color: (element as HTMLElement).style.color || null,
      }),
    }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-lucide-icon": HTMLAttributes.name })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(InlineLucideIconView);
  },
  markdownTokenName: "inlineLucideIcon",
  markdownTokenizer: {
    name: "inlineLucideIcon",
    level: "inline",
    start: (source) => source.indexOf("{{lucide:"),
    tokenize: (source) => {
      const match = source.match(/^\{\{lucide:([A-Za-z][A-Za-z0-9]*)(?:\|(#[A-Fa-f0-9]{3,8}))?\}\}/);
      return match ? { type: "inlineLucideIcon", raw: match[0], name: match[1], color: match[2] || null } : undefined;
    },
  },
  parseMarkdown(token) {
    return { type: this.name, attrs: { name: token.name, color: token.color || null } };
  },
  renderMarkdown(node) {
    const name = typeof node.attrs?.name === "string" ? node.attrs.name : "CircleHelp";
    const color = typeof node.attrs?.color === "string" && /^#[A-Fa-f0-9]{3,8}$/.test(node.attrs.color)
      ? `|${node.attrs.color}`
      : "";
    return `{{lucide:${name}${color}}}`;
  },
});