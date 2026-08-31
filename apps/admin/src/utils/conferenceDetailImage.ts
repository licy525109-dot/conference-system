const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 48_000_000;
const TARGET_WIDTH = 750;
const SEGMENT_HEIGHT = 2400;
const MAX_SEGMENT_BYTES = 2 * 1024 * 1024;

export interface PreparedConferenceDetailSegment {
  file: File;
  width: number;
  height: number;
}

export interface PreparedConferenceDetailImage {
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  segments: PreparedConferenceDetailSegment[];
}

export async function prepareConferenceDetailImage(file: File): Promise<PreparedConferenceDetailImage> {
  validateSourceFile(file);
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("无法读取图片尺寸，请更换图片后重试");
  if (sourceWidth * sourceHeight > MAX_SOURCE_PIXELS) {
    throw new Error("图片像素过大，请先压缩到 4800 万像素以内");
  }

  const width = Math.min(TARGET_WIDTH, sourceWidth);
  const scale = width / sourceWidth;
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const total = Math.ceil(height / SEGMENT_HEIGHT);
  const segments: PreparedConferenceDetailSegment[] = [];

  for (let index = 0; index < total; index += 1) {
    const top = index * SEGMENT_HEIGHT;
    const segmentHeight = Math.min(SEGMENT_HEIGHT, height - top);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = segmentHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("当前浏览器无法处理图片，请升级浏览器后重试");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, segmentHeight);
    context.drawImage(
      image,
      0,
      top / scale,
      sourceWidth,
      segmentHeight / scale,
      0,
      0,
      width,
      segmentHeight
    );
    const blob = await encodeImage(canvas);
    const suffix = total > 1 ? `-${String(index + 1).padStart(2, "0")}` : "";
    const extension = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
    const fileName = `${stripExtension(file.name) || "conference-detail"}${suffix}.${extension}`;
    segments.push({ file: new File([blob], fileName, { type: blob.type }), width, height: segmentHeight });
  }

  return { sourceWidth, sourceHeight, width, height, segments };
}

export function isConferenceDetailImageAsset(fileType: string, url: string): boolean {
  return ACCEPTED_IMAGE_TYPES.has(fileType) || /\.(jpe?g|png|webp)(\?|$)/i.test(url);
}

function validateSourceFile(file: File) {
  const extensionAllowed = /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!ACCEPTED_IMAGE_TYPES.has(file.type) && !extensionAllowed) {
    throw new Error("详情长图仅支持 JPG、PNG 或 WebP");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("原图不能超过 20MB，请压缩后重新上传");
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败，请确认文件没有损坏"));
    };
    image.src = url;
  });
}

async function encodeImage(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const quality of [0.88, 0.76, 0.64]) {
    const blob = await canvasToBlob(canvas, "image/webp", quality);
    if (blob.size <= MAX_SEGMENT_BYTES) return blob;
  }
  for (const quality of [0.82, 0.7, 0.58]) {
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (blob.size <= MAX_SEGMENT_BYTES) return blob;
  }
  throw new Error("图片细节过多，自动压缩后仍超过单图 2MB，请先降低图片质量");
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片压缩失败，请更换浏览器后重试")), type, quality);
  });
}

function stripExtension(value: string): string {
  return value.replace(/\.[^.]+$/, "").trim();
}
