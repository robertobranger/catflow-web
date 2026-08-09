/**
 * Receipt photo processing: downscale + JPEG-encode client side so the
 * payload fits comfortably in an Apps Script POST.
 */

// Long edge target: 2048 px keeps receipt text legible.
const MAX_LONG_EDGE = 2048;
// ~4M base64 chars ≈ 3 MB binary — safe headroom under backend limits.
const MAX_BASE64_CHARS = 4_000_000;

/**
 * Process a picked/captured image file into `{ data, mimeType }` where
 * `data` is base64 JPEG WITHOUT the `data:...;base64,` prefix.
 * Throws if the photo cannot be compressed under the size limit.
 */
export async function processPhoto(file) {
  const image = await loadImage(file);
  try {
    let data = encode(image, MAX_LONG_EDGE, 0.85);
    if (data.length > MAX_BASE64_CHARS) data = encode(image, MAX_LONG_EDGE, 0.7);
    if (data.length > MAX_BASE64_CHARS) data = encode(image, 1600, 0.7);
    if (data.length > MAX_BASE64_CHARS) {
      throw new Error('Photo too large even after compression');
    }
    return { data, mimeType: 'image/jpeg' };
  } finally {
    if (typeof image.close === 'function') image.close();
  }
}

/** Data URL for previewing a processed photo as a thumbnail. */
export function photoPreviewUrl(photo) {
  return `data:${photo.mimeType};base64,${photo.data}`;
}

async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to the <img> fallback (e.g. unsupported format handling).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Draw the image onto a canvas at most `maxLongEdge` px wide/tall (never
 *  upscale) and return the base64 JPEG payload without the data: prefix. */
function encode(image, maxLongEdge, quality) {
  const srcW = image.width || image.naturalWidth;
  const srcH = image.height || image.naturalHeight;
  const scale = Math.min(1, maxLongEdge / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(image, 0, 0, w, h);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
