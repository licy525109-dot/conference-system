export interface ConferenceDetailImageSegment {
  url: string;
  width: number | null;
  height: number | null;
}

export interface ConferenceDetailLongImage {
  sourceUrl: string;
  width: number | null;
  height: number | null;
  segments: ConferenceDetailImageSegment[];
}

export function normalizeConferenceDetailLongImage(contentJson: unknown): ConferenceDetailLongImage | null {
  const content = readRecord(contentJson);
  const raw = content.detailLongImage ?? content.detailLongImageUrl ?? content.detailImage;
  const source = typeof raw === "string" ? { sourceUrl: raw } : readRecord(raw);
  const sourceUrl = readString(source.sourceUrl) || readString(source.url);
  const rawSegments = Array.isArray(source.segments) ? source.segments : [];
  const segments = rawSegments
    .map((item) => normalizeSegment(item))
    .filter((item): item is ConferenceDetailImageSegment => item !== null);

  const displayUrls = [
    ...readStringArray(source.displayUrls),
    ...readStringArray(content.detailImages),
    sourceUrl
  ].filter(Boolean);

  for (const url of uniqueStrings(displayUrls)) {
    if (!segments.some((segment) => segment.url === url)) {
      segments.push({ url, width: null, height: null });
    }
  }

  if (segments.length === 0) {
    return null;
  }

  return {
    sourceUrl: sourceUrl || segments[0].url,
    width: readPositiveNumber(source.width),
    height: readPositiveNumber(source.height),
    segments
  };
}

function normalizeSegment(value: unknown): ConferenceDetailImageSegment | null {
  if (typeof value === "string") {
    const url = readString(value);
    return url ? { url, width: null, height: null } : null;
  }

  const record = readRecord(value);
  const url = readString(record.url);
  if (!url) {
    return null;
  }

  return {
    url,
    width: readPositiveNumber(record.width),
    height: readPositiveNumber(record.height)
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readString).filter(Boolean) : [];
}

function readPositiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
