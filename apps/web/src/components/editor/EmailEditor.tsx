import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEffect, useRef, useState } from "react";

import { monoStack } from "~/components/Marketing";
import { emailExtensions } from "./extensions";
import { fromEditorHtml, liquidSnippets, toEditorHtml } from "./html";

interface EmailEditorProps {
  html: string;
  onChange: (html: string) => void;
  onReady: (html: string) => void;
  onUnsupported: () => void;
}

export function EmailEditor({
  html,
  onChange,
  onReady,
  onUnsupported,
}: EmailEditorProps) {
  const [imageRequest, setImageRequest] = useState<
    ((src: string) => void) | null
  >(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: emailExtensions({
      onImage: (insert) => setImageRequest(() => insert),
    }),
    content: toEditorHtml(html),
    editorProps: {
      attributes: { class: "email-content min-h-[320px] focus:outline-none" },
    },
    onCreate: ({ editor }) => {
      const roundTrip = fromEditorHtml(editor.getHTML());
      if (
        liquidSnippets(roundTrip).join("\n") !== liquidSnippets(html).join("\n")
      ) {
        onUnsupported();
      } else {
        onReady(roundTrip);
      }
    },
    onUpdate: ({ editor }) => onChange(fromEditorHtml(editor.getHTML())),
  });

  if (!editor) return null;

  return (
    <>
      <FormattingMenu editor={editor} />
      <VariableMenu editor={editor} />
      <EditorContent editor={editor} />
      {imageRequest && (
        <ImageDialog
          onClose={() => setImageRequest(null)}
          onInsert={(src) => {
            imageRequest(src);
            setImageRequest(null);
          }}
        />
      )}
    </>
  );
}

function FormattingMenu({ editor }: { editor: Editor }) {
  const [editingLink, setEditingLink] = useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      link: editor.isActive("link"),
      button: editor.isActive("link", { class: "button" }),
      href: (editor.getAttributes("link").href as string | undefined) ?? "",
    }),
  });

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="formattingMenu"
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor, state: editorState }) =>
        editor.isEditable &&
        (!editorState.selection.empty || editor.isActive("link")) &&
        !editor.isActive("liquid") &&
        !editor.isActive("image")
      }
      style={{ fontFamily: monoStack }}
      className="light flex items-center gap-0.5 border border-border bg-background p-1 text-[13px] text-foreground"
    >
      {editingLink ? (
        <LinkInput
          initial={state.href}
          onDone={(href) => {
            const chain = editor.chain().focus().extendMarkRange("link");
            if (href) chain.setLink({ href }).run();
            else chain.unsetLink().run();
            setEditingLink(false);
          }}
        />
      ) : (
        <>
          <MenuButton
            label="Bold"
            active={state.bold}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <span className="font-bold">B</span>
          </MenuButton>
          <MenuButton
            label="Italic"
            active={state.italic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <span className="font-serif italic">I</span>
          </MenuButton>
          <MenuButton
            label="Underline"
            active={state.underline}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <span className="underline">U</span>
          </MenuButton>
          <MenuButton
            label="Strikethrough"
            active={state.strike}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <span className="line-through">S</span>
          </MenuButton>
          <span className="mx-1 h-5 w-px bg-border" />
          <MenuButton
            label="Link"
            active={state.link}
            onClick={() => setEditingLink(true)}
          >
            Link
          </MenuButton>
          {state.link && (
            <MenuButton
              label="Show as a button"
              active={state.button}
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .updateAttributes("link", {
                    class: state.button ? null : "button",
                  })
                  .run()
              }
            >
              Button
            </MenuButton>
          )}
        </>
      )}
    </BubbleMenu>
  );
}

const FALLBACK = /^(.*?)\s*\|\s*default:\s*(["'])(.*)\2\s*$/;

function parseVariable(code: string) {
  const inner = code.replace(/^\{\{-?\s*/, "").replace(/\s*-?\}\}$/, "");
  const match = FALLBACK.exec(inner);
  if (match) return { name: match[1] ?? "", fallback: match[3] ?? "" };
  return { name: inner, fallback: "" };
}

function buildVariable(name: string, fallback: string) {
  if (!fallback) return `{{ ${name} }}`;
  const quote = fallback.includes('"') ? "'" : '"';
  return `{{ ${name} | default: ${quote}${fallback}${quote} }}`;
}

function VariableMenu({ editor }: { editor: Editor }) {
  const code = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor.isActive("liquid")
        ? (editor.getAttributes("liquid").code as string)
        : null,
  });

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="variableMenu"
      options={{ placement: "bottom", offset: 8 }}
      shouldShow={({ editor }) =>
        editor.isEditable && editor.isActive("liquid")
      }
      style={{ fontFamily: monoStack }}
      className="light border border-border bg-background p-2 text-[13px] text-foreground"
    >
      {code && (
        <VariableForm
          key={code}
          code={code}
          onDone={(next) =>
            editor
              .chain()
              .focus()
              .updateAttributes("liquid", { code: next })
              .run()
          }
        />
      )}
    </BubbleMenu>
  );
}

function VariableForm({
  code,
  onDone,
}: {
  code: string;
  onDone: (code: string) => void;
}) {
  const isTag = code.startsWith("{%");
  const parsed = parseVariable(code);
  const [name, setName] = useState(isTag ? code : parsed.name);
  const [fallback, setFallback] = useState(parsed.fallback);
  const input =
    "w-56 border border-border bg-transparent px-2 py-1 outline-none";

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onDone(isTag ? name.trim() : buildVariable(name.trim(), fallback));
      }}
    >
      <label className="flex items-center gap-2">
        <span className="w-16 text-muted-foreground">
          {isTag ? "code" : "variable"}
        </span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label={isTag ? "Liquid code" : "Variable"}
          className={input}
        />
      </label>
      {!isTag && (
        <label className="flex items-center gap-2">
          <span className="w-16 text-muted-foreground">fallback</span>
          <input
            value={fallback}
            onChange={(event) => setFallback(event.target.value)}
            placeholder="if it's empty"
            aria-label="Fallback"
            className={input}
          />
        </label>
      )}
      <button
        type="submit"
        className="self-end border border-border px-2 py-1 hover:bg-background-50"
      >
        apply
      </button>
    </form>
  );
}

function MenuButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`min-w-8 px-2 py-1 ${
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function LinkInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (href: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.select(), []);

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        onDone(value.trim());
      }}
    >
      <input
        ref={input}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onDone(initial);
        }}
        placeholder="https://"
        aria-label="Link URL"
        className="w-64 bg-transparent px-2 py-1 text-foreground outline-none"
      />
      <button type="submit" className="px-2 py-1 hover:bg-background-50">
        Apply
      </button>
    </form>
  );
}

function ImageDialog({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (src: string) => void;
}) {
  const [src, setSrc] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={onClose}
    >
      <form
        className="w-full max-w-md border border-border bg-background p-5"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (src.trim()) onInsert(src.trim());
        }}
      >
        <h2 className="mb-1 font-semibold">Add an image</h2>
        <p className="mb-4 text-muted-foreground">
          Paste the URL of an image that&apos;s already hosted online.
        </p>
        <input
          autoFocus
          value={src}
          onChange={(event) => setSrc(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
          }}
          placeholder="https://example.com/image.png"
          aria-label="Image URL"
          className="mb-4 w-full border border-border bg-transparent px-3 py-2 outline-none"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="border border-border px-3 py-2 font-semibold hover:bg-background-50"
          >
            Add image
          </button>
        </div>
      </form>
    </div>
  );
}
