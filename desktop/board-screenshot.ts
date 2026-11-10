import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { BrowserWindow } from "electron";

export type CaptureProof = { x: number; y: number; width: number; height: number; viewportWidth: number; viewportHeight: number; colors: number[] };

// NativeImage bitmap channel order differs by platform. Require one consistent
// ordering, opaque pixels and the entire fresh random strip, not a single pixel.
export function matchesCaptureProof(bitmap: Uint8Array, width: number, height: number, proof: CaptureProof) {
  if (bitmap.length !== width * height * 4 || !proof.colors.length || proof.colors.length % 3 ||
      proof.width <= 0 || proof.height <= 0 || proof.viewportWidth <= 0 || proof.viewportHeight <= 0) return false;
  const tiles = proof.colors.length / 3;
  return [[2, 1, 0, 3], [0, 1, 2, 3], [1, 2, 3, 0], [3, 2, 1, 0]].some(order => {
    for (let tile = 0; tile < tiles; tile++) {
      const x = Math.floor((proof.x + proof.width * (tile + .5) / tiles) * width / proof.viewportWidth);
      const y = Math.floor((proof.y + proof.height / 2) * height / proof.viewportHeight);
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      const offset = (y * width + x) * 4;
      if (bitmap[offset + order[3]] < 250 || order.slice(0, 3).some((channel, index) => Math.abs(bitmap[offset + channel] - proof.colors[tile * 3 + index]) > 24)) return false;
    }
    return true;
  });
}

function paintCaptureProof(colors: number[]): CaptureProof {
  document.getElementById("zebby-capture-proof")?.remove();
  const strip = document.createElement("div"); strip.id = "zebby-capture-proof";
  strip.style.cssText = "all:initial!important;position:fixed!important;top:0!important;left:0!important;display:flex!important;z-index:2147483647!important;pointer-events:none!important;opacity:1!important;height:8px!important;width:64px!important;transform:none!important";
  for (let at = 0; at < colors.length; at += 3) {
    const tile = document.createElement("div");
    tile.style.cssText = `all:initial!important;display:block!important;flex:1!important;height:8px!important;background:rgb(${colors.slice(at, at + 3).join(",")})!important;opacity:1!important`;
    strip.append(tile);
  }
  document.documentElement.append(strip);
  const rect = strip.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight, colors };
}

/** Never send a stale hidden-window surface to a model. Verify that the new
 * observation's paint reached the screenshot before encoding it for analysis. */
export async function captureBoardScreenshot(window: BrowserWindow, signal: AbortSignal) {
  signal.throwIfAborted();
  const colors = [...randomBytes(24)].map(value => 32 + value % 192);
  const proof = await window.webContents.mainFrame.executeJavaScript(`(${paintCaptureProof.toString()})(${JSON.stringify(colors)})`) as CaptureProof;
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      signal.throwIfAborted(); window.webContents.invalidate();
      await delay(180, undefined, { signal });
      const image = (await window.webContents.capturePage()).resize({ width: 1280, height: 900 });
      const bitmap = image.toBitmap({ scaleFactor: 1 });
      if (matchesCaptureProof(bitmap, 1280, 900, proof)) {
        // The proof is instrumentation, not page evidence. Blank that tiny
        // overlay so its random nonce cannot invalidate exact-result reuse.
        const left = Math.max(0, Math.floor(proof.x * 1280 / proof.viewportWidth));
        const right = Math.min(1280, Math.ceil((proof.x + proof.width) * 1280 / proof.viewportWidth));
        const top = Math.max(0, Math.floor(proof.y * 900 / proof.viewportHeight));
        const bottom = Math.min(900, Math.ceil((proof.y + proof.height) * 900 / proof.viewportHeight));
        for (let y = top; y < bottom; y++) bitmap.fill(255, (y * 1280 + left) * 4, (y * 1280 + right) * 4);
        const { nativeImage } = await import("electron");
        return nativeImage.createFromBitmap(bitmap, { width: 1280, height: 900 });
      }
    }
    throw new Error("The page image did not update to match the results. Resume to capture the current page. Your last successful check is unchanged.");
  } finally {
    if (!window.isDestroyed()) await window.webContents.mainFrame.executeJavaScript("document.getElementById('zebby-capture-proof')?.remove()").catch(() => undefined);
  }
}
