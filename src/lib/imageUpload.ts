"use client";

/**
 * Normalizes any picked/captured image into a real JPEG Blob by decoding it
 * through an <img> element and re-drawing it onto a canvas.
 *
 * This matters for uploads that go straight to Supabase Storage (avatar,
 * profile gallery, progress photos): iPhones can hand the browser a HEIC
 * file even when the input is just labeled "image/*", and while Storage
 * will happily accept and store those bytes under a ".jpg" path, most
 * browsers can't decode HEIC in an <img> tag — so the photo silently
 * "disappears" (uploads fine, never renders) instead of failing loudly.
 * Routing every upload through this first guarantees what lands in Storage
 * is bytes any browser can actually display.
 *
 * (The food-scan flow already did the equivalent of this inline, which is
 * why photo scanning worked while these other upload paths didn't.)
 */
export function compressImageForUpload(file: File, maxDim = 1600, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not process image"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) {
            reject(new Error("Could not process image"));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that image — try a different photo."));
    };
    img.src = objectUrl;
  });
}
