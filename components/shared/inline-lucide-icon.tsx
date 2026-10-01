"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { DynamicLucideIcon } from "@/components/shared/lucide-icon-picker";

function InlineLucideIconView({ node }: NodeViewProps) {
  const name = typeof node.attrs.name === "string" ? node.attrs.name : "CircleHelp";
  return (
    <NodeViewWrapper as="span" className="inline-flex align-middle text-amber-300" title={name}>
      <DynamicLucideIcon name={name} className="h-4 w-4" aria-label={name} />
    </NodeViewWrapper>
  );
}

export const InlineLucideIcon = Node.create({
  name: "inlineLucideIcon",
  inline: true,
  group: "inline",
  atom: true,
  selectable: false,
  addAttributes() {
    return { name: { default: "CircleHelp" } };
  },
  parseHTML() {
    return [{ tag: "span[data-lucide-icon]", getAttrs: (element) => ({ name: (element as HTMLElement).dataset.lucideIcon }) }];
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
      const match = source.match(/^\{\{lucide:([A-Za-z][A-Za-z0-9]*)\}\}/);
      return match ? { type: "inlineLucideIcon", raw: match[0], name: match[1] } : undefined;
    },
  },
  parseMarkdown(token) {
    return { type: this.name, attrs: { name: token.name } };
  },
  renderMarkdown(node) {
    const name = typeof node.attrs?.name === "string" ? node.attrs.name : "CircleHelp";
    return `{{lucide:${name}}}`;
  },
});