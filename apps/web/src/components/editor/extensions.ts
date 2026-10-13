import type { Editor, Range } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { PluginKey } from "@tiptap/pm/state";
import { Extension, mergeAttributes, Node, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Suggestion from "@tiptap/suggestion";

import type { MenuItem, SuggestionListHandle } from "./SuggestionList";
import { SuggestionList } from "./SuggestionList";

export function liquidLabel(code: string): string {
  return code
    .replace(/^\{[{%]-?\s*/, "")
    .replace(/\s*-?[%}]\}$/, "")
    .replace(/\s*\|.*$/, "");
}

export const Liquid = Node.create({
  name: "liquid",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      code: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-liquid") ?? "",
        renderHTML: (attributes) => ({
          "data-liquid": attributes.code as string,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-liquid]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const code = node.attrs.code as string;
    return [
      "span",
      {
        ...HTMLAttributes,
        class: code.startsWith("{%") ? "liquid-chip liquid-tag" : "liquid-chip",
        title: code,
      },
      liquidLabel(code),
    ];
  },

  renderText({ node }) {
    return node.attrs.code as string;
  },
});

function suggestionRenderer(): SuggestionOptions<MenuItem, MenuItem>["render"] {
  return () => {
    let renderer: ReactRenderer<SuggestionListHandle> | undefined;
    let unmount: (() => void) | undefined;

    return {
      onStart: (props: SuggestionProps<MenuItem, MenuItem>) => {
        renderer = new ReactRenderer(SuggestionList, {
          props,
          editor: props.editor,
        });
        unmount = props.mount(renderer.element);
      },
      onUpdate: (props: SuggestionProps<MenuItem, MenuItem>) => {
        renderer?.updateProps(props);
      },
      onKeyDown: ({ event }) => {
        if (event.key === "Escape") {
          unmount?.();
          unmount = undefined;
          return true;
        }
        return renderer?.ref?.onKeyDown(event) ?? false;
      },
      onExit: () => {
        unmount?.();
        renderer?.destroy();
      },
    };
  };
}

function suggestionExtension(
  name: string,
  options: Omit<SuggestionOptions<MenuItem, MenuItem>, "editor">,
) {
  return Extension.create({
    name,
    addProseMirrorPlugins() {
      return [
        Suggestion<MenuItem, MenuItem>({
          editor: this.editor,
          pluginKey: new PluginKey(name),
          render: suggestionRenderer(),
          command: ({ editor, range, props }) => props.run(editor, range),
          ...options,
        }),
      ];
    },
  });
}

export const VARIABLES = [
  { code: "{{ subscriber.firstName }}", label: "First name" },
  { code: "{{ subscriber.lastName }}", label: "Last name" },
  { code: "{{ subscriber.name }}", label: "Full name" },
  { code: "{{ subscriber.email }}", label: "Email" },
  { code: "{{ unsubscribeUrl }}", label: "Unsubscribe link" },
];

export function insertVariable(editor: Editor, range: Range, code: string) {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent([
      { type: "liquid", attrs: { code } },
      { type: "text", text: " " },
    ])
    .run();
}

function variableItems(query: string): MenuItem[] {
  const search = query.trim().toLowerCase();
  const items: MenuItem[] = VARIABLES.filter(
    (variable) =>
      variable.label.toLowerCase().includes(search) ||
      variable.code.toLowerCase().includes(search),
  ).map((variable) => ({
    title: variable.label,
    hint: liquidLabel(variable.code),
    run: (editor, range) => insertVariable(editor, range, variable.code),
  }));
  const custom = query.replace(/\}+\s*$/, "").trim();
  if (custom && /^[\w.[\]"' |:-]+$/.test(custom)) {
    items.push({
      title: `Use "${custom}"`,
      hint: "custom field",
      run: (editor, range) => insertVariable(editor, range, `{{ ${custom} }}`),
    });
  }
  return items;
}

export const VariableSuggestion = suggestionExtension("variableSuggestion", {
  char: "{{",
  allowSpaces: true,
  items: ({ query }) => variableItems(query),
});

export interface ImageAttrs {
  src: string;
  alt?: string | null;
  href?: string | null;
  align?: "center" | null;
  width?: number | null;
}

export const EmailImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      href: {
        default: null,
        parseHTML: (element) =>
          element.parentElement?.tagName === "A"
            ? element.parentElement.getAttribute("href")
            : null,
        renderHTML: () => ({}),
      },
      align: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-align"),
        renderHTML: (attributes) =>
          attributes.align ? { "data-align": attributes.align as string } : {},
      },
    };
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("img");
      const apply = (attrs: Record<string, unknown>) => {
        const values: Record<string, unknown> = {
          src: attrs.src,
          alt: attrs.alt,
          title: attrs.title,
          width: attrs.width,
          height: attrs.height,
          "data-align": attrs.align,
          "data-href": attrs.href,
        };
        for (const [name, value] of Object.entries(values)) {
          if (typeof value === "string" || typeof value === "number") {
            dom.setAttribute(name, String(value));
          } else {
            dom.removeAttribute(name);
          }
        }
      };
      apply(node.attrs);
      return {
        dom,
        update: (updated) => {
          if (updated.type !== node.type) return false;
          apply(updated.attrs);
          return true;
        },
      };
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const image = [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
    ] as const;
    const href = node.attrs.href as string | null;
    return href ? ["a", { href }, image] : image;
  },
});

export interface SlashCommandOptions {
  onImage: (insert: (attrs: ImageAttrs) => void) => void;
  onVideo: (insert: (attrs: ImageAttrs) => void) => void;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return { onImage: () => undefined, onVideo: () => undefined };
  },

  addProseMirrorPlugins() {
    const { onImage, onVideo } = this.options;
    const items: MenuItem[] = [
      {
        title: "Text",
        hint: "Plain paragraph",
        run: (editor, range) =>
          editor.chain().focus().deleteRange(range).setParagraph().run(),
      },
      ...(
        [
          [1, "Large title"],
          [2, "Section heading"],
          [3, "Small heading"],
        ] as const
      ).map(([level, hint]) => ({
        title: `Heading ${level}`,
        hint,
        run: (editor: Editor, range: Range) =>
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .setNode("heading", { level })
            .run(),
      })),
      {
        title: "Button",
        hint: "Call to action link",
        run: (editor, range) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent(
              '<p><a class="button" href="https://">Button text</a></p>',
            )
            .run();
          const { $from } = editor.state.selection;
          editor
            .chain()
            .setTextSelection({ from: $from.start(), to: $from.end() })
            .run();
        },
      },
      {
        title: "Image",
        hint: "Upload or link",
        run: (editor, range) => {
          editor.chain().focus().deleteRange(range).run();
          onImage((attrs) =>
            editor
              .chain()
              .focus()
              .insertContent({ type: "image", attrs })
              .run(),
          );
        },
      },
      {
        title: "Video",
        hint: "YouTube, Vimeo, Loom",
        run: (editor, range) => {
          editor.chain().focus().deleteRange(range).run();
          onVideo((attrs) =>
            editor
              .chain()
              .focus()
              .insertContent({ type: "image", attrs })
              .run(),
          );
        },
      },
      {
        title: "Bulleted list",
        hint: "Simple list",
        run: (editor, range) =>
          editor.chain().focus().deleteRange(range).toggleBulletList().run(),
      },
      {
        title: "Numbered list",
        hint: "Ordered steps",
        run: (editor, range) =>
          editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
      },
      {
        title: "Quote",
        hint: "Highlighted quote",
        run: (editor, range) =>
          editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
      },
      {
        title: "Divider",
        hint: "Horizontal line",
        run: (editor, range) =>
          editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
      },
      {
        title: "Variable",
        hint: "First name, email…",
        run: (editor, range) =>
          editor.chain().focus().deleteRange(range).insertContent("{{").run(),
      },
    ];

    return [
      Suggestion<MenuItem, MenuItem>({
        editor: this.editor,
        pluginKey: new PluginKey("slashCommand"),
        char: "/",
        render: suggestionRenderer(),
        command: ({ editor, range, props }) => props.run(editor, range),
        items: ({ query }) =>
          items.filter((item) =>
            item.title.toLowerCase().includes(query.toLowerCase()),
          ),
      }),
    ];
  },
});

export function emailExtensions(options: SlashCommandOptions) {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { target: null, rel: null, class: null },
        isAllowedUri: (url, { defaultValidate }) =>
          url.trim().startsWith("{{") || defaultValidate(url),
      },
    }),
    EmailImage,
    Liquid,
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === "heading"
          ? "Heading"
          : "type / for blocks and {{ for variables",
    }),
    VariableSuggestion,
    SlashCommand.configure(options),
  ];
}
