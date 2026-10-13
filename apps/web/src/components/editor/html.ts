const LIQUID = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  p: [],
  h1: [],
  h2: [],
  h3: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  u: [],
  s: [],
  code: [],
  br: [],
  ul: [],
  ol: [],
  li: [],
  hr: [],
  blockquote: [],
  a: ["href", "class", "target", "rel", "title"],
  img: ["src", "alt", "title", "width", "height"],
};

const BLOCK_CONTAINERS = new Set(["UL", "OL"]);

export function isFullHtmlDocument(html: string): boolean {
  return /<(html|body)[\s>]/i.test(html);
}

export function liquidSnippets(html: string): string[] {
  return (html.match(LIQUID) ?? []).sort();
}

function parse(html: string): HTMLElement {
  return new DOMParser().parseFromString(`<body>${html}</body>`, "text/html")
    .body;
}

function plainTextToHtml(text: string): string {
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escape(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function canEditVisually(html: string, layout: string): boolean {
  if (layout === "none" || isFullHtmlDocument(html)) return false;
  const body = parse(html);
  for (const element of Array.from(body.querySelectorAll("*"))) {
    const tag = element.tagName.toLowerCase();
    const allowed = ALLOWED_ATTRIBUTES[tag];
    if (!allowed) return false;
    if (tag === "a" && !element.getAttribute("href")) return false;
    for (const attribute of Array.from(element.attributes)) {
      if (!allowed.includes(attribute.name)) return false;
      if (
        tag === "a" &&
        attribute.name === "class" &&
        attribute.value !== "button"
      ) {
        return false;
      }
    }
    if (BLOCK_CONTAINERS.has(element.tagName)) {
      for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
          return false;
        }
      }
    }
  }
  return true;
}

export function toEditorHtml(html: string): string {
  const source = /<[a-z][\s\S]*>/i.test(html) ? html : plainTextToHtml(html);
  const body = parse(source);
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  for (const node of textNodes) {
    const text = node.data;
    if (text.search(LIQUID) === -1) continue;
    const fragment = document.createDocumentFragment();
    let last = 0;
    for (const match of text.matchAll(LIQUID)) {
      const index = match.index;
      if (index > last) {
        fragment.append(text.slice(last, index));
      }
      const chip = document.createElement("span");
      chip.setAttribute("data-liquid", match[0]);
      fragment.append(chip);
      last = index + match[0].length;
    }
    if (last < text.length) fragment.append(text.slice(last));
    node.replaceWith(fragment);
  }
  return body.innerHTML;
}

export function fromEditorHtml(html: string): string {
  const body = parse(html);
  for (const chip of Array.from(body.querySelectorAll("span[data-liquid]"))) {
    chip.replaceWith(chip.getAttribute("data-liquid") ?? "");
  }
  for (const item of Array.from(body.querySelectorAll("li, blockquote"))) {
    const only = item.children.length === 1 ? item.firstElementChild : null;
    if (only?.tagName === "P" && item.childNodes.length === 1) {
      only.replaceWith(...Array.from(only.childNodes));
    }
  }
  return body.innerHTML
    .replace(/^(<p><\/p>)+|(<p><\/p>)+$/g, "")
    .replace(LIQUID, (snippet) =>
      snippet
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&"),
    );
}
