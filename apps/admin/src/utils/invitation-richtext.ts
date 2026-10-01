import {
  normalizeInvitationRichText,
  type InvitationRichNode,
} from "@conference/shared";
export function invitationNodesFromHtml(
  html: string,
  uploadOrigin: string,
): InvitationRichNode[] {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  function convert(nodes: NodeListOf<ChildNode>): InvitationRichNode[] {
    return Array.from(nodes).flatMap((node): InvitationRichNode[] => {
      if (node.nodeType === Node.TEXT_NODE)
        return [{ text: node.textContent || "" }];
      if (!(node instanceof HTMLElement)) return [];
      const tag = node.tagName.toLowerCase();
      if (["script", "style", "iframe", "object", "svg", "math"].includes(tag))
        return [];
      const attrs: Record<string, string> = {};
      for (const key of ["href", "src", "alt", "style"]) {
        let value = node.getAttribute(key);
        if (key === "src" && value?.startsWith(`${uploadOrigin}/uploads/`))
          value = value.slice(uploadOrigin.length);
        if (value) attrs[key] = value;
      }
      if (tag === "div")
        return [{ tag: "p", attrs, children: convert(node.childNodes) }];
      return [{ tag, attrs, children: convert(node.childNodes) }];
    });
  }
  return normalizeInvitationRichText(convert(parsed.body.childNodes));
}
