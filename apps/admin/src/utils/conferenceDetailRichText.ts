import {
  CONFERENCE_DETAIL_RICH_TEXT_ELEMENTS,
  serializeConferenceDetailRichText,
  type ConferenceDetailContentBlock,
  type ConferenceDetailRichTextContent,
  type ConferenceDetailRichTextElementName,
  type ConferenceDetailRichTextNode
} from "@conference/shared";

const allowedElements = new Set<string>(CONFERENCE_DETAIL_RICH_TEXT_ELEMENTS);
const allowedStyles = [
  "color",
  "background-color",
  "font-size",
  "font-weight",
  "font-style",
  "text-decoration",
  "text-align",
  "line-height",
  "letter-spacing",
  "margin-left",
  "padding-left",
  "width",
  "max-width",
  "height",
  "display",
  "border-radius"
] as const;
const voidElements = new Set(["br", "hr", "img"]);

export function createConferenceDetailRichText(html: string): ConferenceDetailRichTextContent {
  if (typeof DOMParser === "undefined") {
    return serializeConferenceDetailRichText("", []);
  }
  const document = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const nodes = Array.from(document.body.childNodes).flatMap(convertDomNode);
  return serializeConferenceDetailRichText(nodesToHtml(nodes), nodes);
}

export function conferenceDetailRichTextToEditorHtml(content: ConferenceDetailRichTextContent): string {
  const source = content.html.trim();
  if (source) return createConferenceDetailRichText(source).html;
  return nodesToHtml(content.nodes);
}

export function conferenceDetailBlocksToEditorHtml(blocks: ConferenceDetailContentBlock[]): string {
  return blocks
    .filter((block) => block.enabled)
    .map((block) => {
      if (block.type === "heading") {
        const color = block.tone === "accent" ? "color:#8b6822;" : block.tone === "muted" ? "color:#7a8798;" : "";
        return `<h2 style="text-align:${block.align};${color}">${escapeHtml(block.title)}</h2>`;
      }
      if (block.type === "paragraph") {
        return `<p style="text-align:${block.align}">${escapeHtml(block.text).replace(/\n/g, "<br>")}</p>`;
      }
      if (block.type === "quote") {
        return `<blockquote style="text-align:${block.align}">${escapeHtml(block.text).replace(/\n/g, "<br>")}</blockquote>`;
      }
      if (block.type === "list") {
        return `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
      }
      if (block.type === "image" && isSafeUrl(block.imageUrl)) {
        const caption = block.caption ? `<p style="text-align:center;color:#7a8798;font-size:14px">${escapeHtml(block.caption)}</p>` : "";
        return `<p style="text-align:center"><img src="${escapeAttribute(block.imageUrl)}" alt="${escapeAttribute(block.caption)}" style="width:100%;max-width:100%;height:auto;display:block"></p>${caption}`;
      }
      if (block.type === "divider") return "<hr>";
      if (block.type === "button" && block.buttonText) {
        return `<p style="text-align:center"><strong>${escapeHtml(block.buttonText)}</strong></p>`;
      }
      return "";
    })
    .join("");
}

export function isConferenceDetailEditorEmpty(html: string): boolean {
  if (typeof DOMParser === "undefined") return !html.trim();
  const document = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return !document.body.textContent?.trim() && !document.body.querySelector("img,hr");
}

function convertDomNode(node: Node): ConferenceDetailRichTextNode[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text ? [{ type: "text", text }] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const element = node as HTMLElement;
  const name = element.tagName.toLowerCase();
  const children = Array.from(element.childNodes).flatMap(convertDomNode);
  if (!allowedElements.has(name)) return children;

  return [{
    name: name as ConferenceDetailRichTextElementName,
    attrs: readSafeAttributes(element, name),
    children
  }];
}

function readSafeAttributes(element: HTMLElement, name: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const title = element.getAttribute("title")?.trim();
  if (title) attrs.title = title.slice(0, 500);

  if (name === "img") {
    const src = element.getAttribute("src")?.trim() ?? "";
    const alt = element.getAttribute("alt")?.trim() ?? "";
    if (isSafeUrl(src)) attrs.src = src;
    if (alt) attrs.alt = alt.slice(0, 500);
  }
  if (name === "a") {
    const href = element.getAttribute("href")?.trim() ?? "";
    if (isSafeUrl(href)) {
      attrs.href = href;
      attrs.target = "_blank";
      attrs.rel = "noopener noreferrer";
    }
  }

  const styleParts = allowedStyles
    .map((property) => {
      const value = element.style.getPropertyValue(property).trim();
      if (!value || /url\s*\(|expression|javascript:/i.test(value)) return "";
      return `${property}:${value}`;
    })
    .filter(Boolean);
  if (name === "img") {
    mergeStyle(styleParts, "width", element.style.width || "100%");
    mergeStyle(styleParts, "max-width", "100%");
    mergeStyle(styleParts, "height", "auto");
    mergeStyle(styleParts, "display", "block");
  }
  if (styleParts.length) attrs.style = styleParts.join(";");
  return attrs;
}

function mergeStyle(styles: string[], property: string, value: string) {
  const prefix = `${property}:`;
  const index = styles.findIndex((style) => style.startsWith(prefix));
  if (index >= 0) styles[index] = `${property}:${value}`;
  else styles.push(`${property}:${value}`);
}

function nodesToHtml(nodes: ConferenceDetailRichTextNode[]): string {
  return nodes.map((node) => {
    if ("text" in node) return escapeHtml(node.text);
    const attrs = Object.entries(node.attrs)
      .map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`)
      .join("");
    if (voidElements.has(node.name)) return `<${node.name}${attrs}>`;
    return `<${node.name}${attrs}>${nodesToHtml(node.children)}</${node.name}>`;
  }).join("");
}

function isSafeUrl(value: string): boolean {
  return /^(https?:\/\/|\/)/i.test(value) && !/^javascript:/i.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
