import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEffect, useRef, useState } from "react";

import type { ImageAttrs } from "./extensions";
import { monoStack } from "~/components/Marketing";
import { emailExtensions } from "./extensions";
import { fromEditorHtml, liquidSnippets, toEditorHtml } from "./html";

export interface MediaHandlers {
  upload: (file: File) => Promise<string>;
  video: (url: string) => Promise<ImageAttrs>;
  onError: (message: string) => void;
}

interface EmailEditorProps {
  html: string;
  media: MediaHandlers;
  onChange: (html: string) => void;
  onReady: (html: string) => void;
  onUnsupported: () => void;
}

interface MediaRequest {
  kind: "image" | "video";
  insert: (attrs: ImageAttrs) => void;
}

function imageFiles(files: FileList | null | undefined) {
  return Array.from(files ?? []).filter((file) =>
    file.type.startsWith("image/"),
  );
}

export function EmailEditor({
  html,
  media,
  onChange,
  onReady,
  onUnsupported,
}: EmailEditorProps) {
  const [request, setRequest] = useState<MediaRequest | null>(null);
  const mediaRef = useRef(media);
  useEffect(() => {
    mediaRef.current = media;
  }, [media]);

  const uploadAt = (editor: Editor, files: File[], position?: number) => {
    for (const file of files) {
      mediaRef.current
        .upload(file)
        .then((src) => {
          const content = { type: "image", attrs: { src, alt: "" } };
          if (position === undefined) {
            editor.chain().focus().insertContent(content).run();
          } else {
            editor.chain().focus().insertContentAt(position, content).run();
          }
        })
        .catch((error: unknown) =>
          mediaRef.current.onError(
            error instanceof Error
              ? error.message
              : "Couldn't upload that image",
          ),
        );
    }
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: emailExtensions({
      onImage: (insert) => setRequest({ kind: "image", insert }),
      onVideo: (insert) => setRequest({ kind: "video", insert }),
    }),
    content: toEditorHtml(html),
    editorProps: {
      attributes: { class: "email-content min-h-[320px] focus:outline-none" },
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (files.length === 0 || !editor) return false;
        uploadAt(editor, files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = imageFiles(event.dataTransfer?.files);
        if (moved || files.length === 0 || !editor) return false;
        const position = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })?.pos;
        uploadAt(editor, files, position);
        return true;
      },
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
      <ImageMenu editor={editor} />
      <EditorContent editor={editor} />
      {request && (
        <MediaDialog
          kind={request.kind}
          media={media}
          onClose={() => setRequest(null)}
          onInsert={(attrs) => {
            request.insert(attrs);
            setRequest(null);
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
      className="light border-border bg-background text-foreground flex items-center gap-0.5 border p-1 text-[13px]"
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
          <span className="bg-border mx-1 h-5 w-px" />
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
      className="light border-border bg-background text-foreground border p-2 text-[13px]"
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
        <span className="text-muted-foreground w-16">
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
          <span className="text-muted-foreground w-16">fallback</span>
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
        className="border-border hover:bg-background-50 self-end border px-2 py-1"
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
        className="text-foreground w-64 bg-transparent px-2 py-1 outline-none"
      />
      <button type="submit" className="hover:bg-background-50 px-2 py-1">
        Apply
      </button>
    </form>
  );
}

function MediaDialog({
  kind,
  media,
  onClose,
  onInsert,
}: {
  kind: "image" | "video";
  media: MediaHandlers;
  onClose: () => void;
  onInsert: (attrs: ImageAttrs) => void;
}) {
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const field =
    "mb-3 w-full border border-border bg-transparent px-3 py-2 outline-none";
  const button = "border border-border px-3 py-2 hover:bg-background-50";

  const run = async (task: () => Promise<ImageAttrs>) => {
    setPending(true);
    setError(null);
    try {
      onInsert(await task());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
      setPending(false);
    }
  };

  const upload = (file: File | undefined) => {
    if (file)
      void run(async () => ({ src: await media.upload(file), alt: "" }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={onClose}
    >
      <form
        style={{ fontFamily: monoStack }}
        className="light border-border bg-background text-foreground w-full max-w-md border p-5 text-[13px]"
        onMouseDown={(event) => event.stopPropagation()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (kind === "image") upload(event.dataTransfer.files[0]);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          const value = url.trim();
          if (!value) return;
          void run(async () =>
            kind === "video"
              ? { ...(await media.video(value)), align: "center" }
              : { src: value, alt: "" },
          );
        }}
      >
        <h2 className="mb-1 font-semibold">
          {kind === "video" ? "add a video" : "add an image"}
        </h2>
        <p className="text-muted-foreground mb-4">
          {kind === "video"
            ? "# paste a YouTube, Vimeo or Loom link. emails show its thumbnail with a play button, linked to the video."
            : "# upload a PNG, JPEG, GIF or WebP up to 5 MB, or paste a link."}
        </p>
        {kind === "image" && (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={(event) => upload(event.target.files?.[0])}
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => fileInput.current?.click()}
              className={`${button} mb-3 w-full`}
            >
              {pending ? "uploading…" : "choose a file, or drop it here"}
            </button>
          </>
        )}
        <input
          autoFocus={kind === "video"}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
          }}
          placeholder={
            kind === "video"
              ? "https://youtu.be/…"
              : "or paste https://example.com/image.png"
          }
          aria-label={kind === "video" ? "Video link" : "Image URL"}
          className={field}
        />
        {error && <p className="mb-3 text-red-600">✕ {error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground px-3 py-2"
          >
            cancel
          </button>
          <button
            type="submit"
            disabled={pending || !url.trim()}
            className={`${button} font-semibold disabled:opacity-50`}
          >
            {pending && kind === "video" ? "adding…" : "add"}
          </button>
        </div>
      </form>
    </div>
  );
}

const WIDTHS: { label: string; width: number | null }[] = [
  { label: "auto", width: null },
  { label: "half", width: 276 },
  { label: "full", width: 552 },
];

function ImageMenu({ editor }: { editor: Editor }) {
  const attrs = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor.isActive("image")
        ? (editor.getAttributes("image") as ImageAttrs)
        : null,
  });
  const set = (next: Partial<ImageAttrs>) =>
    editor.chain().focus().updateAttributes("image", next).run();
  const input =
    "w-48 border border-border bg-transparent px-2 py-1 outline-none";

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="imageMenu"
      options={{ placement: "bottom", offset: 8 }}
      shouldShow={({ editor }) => editor.isEditable && editor.isActive("image")}
      style={{ fontFamily: monoStack }}
      className="light border-border bg-background text-foreground flex flex-col gap-2 border p-2 text-[13px]"
    >
      {attrs && (
        <>
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground w-12">alt</span>
            <input
              key={`alt-${attrs.src}`}
              defaultValue={attrs.alt ?? ""}
              onBlur={(event) => set({ alt: event.target.value })}
              placeholder="describe the image"
              aria-label="Alt text"
              className={input}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground w-12">link</span>
            <input
              key={`href-${attrs.src}`}
              defaultValue={attrs.href ?? ""}
              onBlur={(event) =>
                set({ href: event.target.value.trim() || null })
              }
              placeholder="https://"
              aria-label="Image link"
              className={input}
            />
          </label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-12">size</span>
            {WIDTHS.map((option) => (
              <MenuButton
                key={option.label}
                label={`Width: ${option.label}`}
                active={(attrs.width ?? null) === option.width}
                onClick={() => set({ width: option.width })}
              >
                {option.label}
              </MenuButton>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-12">align</span>
            <MenuButton
              label="Align left"
              active={attrs.align !== "center"}
              onClick={() => set({ align: null })}
            >
              left
            </MenuButton>
            <MenuButton
              label="Align centre"
              active={attrs.align === "center"}
              onClick={() => set({ align: "center" })}
            >
              centre
            </MenuButton>
          </div>
        </>
      )}
    </BubbleMenu>
  );
}
