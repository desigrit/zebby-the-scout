import { z } from "zod";

export const boardImageSchema = z.object({ mediaType: z.enum(["image/jpeg", "image/png"]),
  data: z.string().min(40).max(1_400_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  width: z.number().int().min(32).max(1600), height: z.number().int().min(32).max(1200),
}).strict().refine(image => validImageDimensions(image), "The board screenshot is invalid or too large.");
export type BoardImage = z.infer<typeof boardImageSchema>;
function validImageDimensions(image: { mediaType: string; data: string; width: number; height: number }) {
  try {
    const bytes = Uint8Array.from(atob(image.data), letter => letter.charCodeAt(0));
    if (image.mediaType === "image/png") {
      const view = new DataView(bytes.buffer);
      return view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a &&
        view.getUint32(12) === 0x49484452 && view.getUint32(16) === image.width && view.getUint32(20) === image.height;
    }
    if (bytes[0] !== 255 || bytes[1] !== 216) return false;
    for (let at = 2; at + 8 < bytes.length;) {
      if (bytes[at++] !== 255) return false;
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 217 || marker === 218) return false;
      const length = bytes[at] * 256 + bytes[at + 1];
      if (length < 2 || at + length > bytes.length) return false;
      if ([192, 193, 194].includes(marker)) return bytes[at + 3] * 256 + bytes[at + 4] === image.height &&
        bytes[at + 5] * 256 + bytes[at + 6] === image.width;
      at += length;
    }
  } catch { return false; }
  return false;
}
