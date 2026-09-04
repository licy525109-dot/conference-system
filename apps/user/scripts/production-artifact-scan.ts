export interface ProductionArtifactViolation {
  label: string;
  value: string;
}

const forbiddenArtifactRules = [
  {
    label: "a local or private API URL",
    pattern: /https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(?=[:/"'\\\s]|$)/i
  },
  {
    label: "a VConsole runtime",
    pattern: /(?:\bnew\s+VConsole\b|\bVConsole\.prototype\b|vconsole(?:\.min)?\.js)/i
  }
] as const;

export function findForbiddenProductionArtifact(content: string): ProductionArtifactViolation | null {
  for (const rule of forbiddenArtifactRules) {
    const match = content.match(rule.pattern);
    if (match?.[0]) return { label: rule.label, value: match[0] };
  }
  return null;
}
