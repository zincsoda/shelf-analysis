import type { CameraZone } from '@shelf-analysis/shared';

/** Matches the zone canvas aspect ratio used when drawing zones */
export const ZONE_CONTAINER_ASPECT = 16 / 9;

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Map container-normalized zone coords to pixel rect on the source image */
export function containerZoneToImageRect(
  zone: Pick<CameraZone, 'x' | 'y' | 'width' | 'height'>,
  imageWidth: number,
  imageHeight: number,
  containerAspect = ZONE_CONTAINER_ASPECT,
): PixelRect {
  const imageAspect = imageWidth / imageHeight;

  let displayX: number;
  let displayY: number;
  let displayW: number;
  let displayH: number;

  if (imageAspect > containerAspect) {
    displayW = 1;
    displayH = containerAspect / imageAspect;
    displayX = 0;
    displayY = (1 - displayH) / 2;
  } else {
    displayH = 1;
    displayW = imageAspect / containerAspect;
    displayX = (1 - displayW) / 2;
    displayY = 0;
  }

  const relX = (zone.x - displayX) / displayW;
  const relY = (zone.y - displayY) / displayH;
  const relW = zone.width / displayW;
  const relH = zone.height / displayH;

  const x = Math.max(0, Math.min(1, relX));
  const y = Math.max(0, Math.min(1, relY));
  const right = Math.max(x, Math.min(1, relX + relW));
  const bottom = Math.max(y, Math.min(1, relY + relH));

  return {
    x: Math.round(x * imageWidth),
    y: Math.round(y * imageHeight),
    width: Math.max(1, Math.round((right - x) * imageWidth)),
    height: Math.max(1, Math.round((bottom - y) * imageHeight)),
  };
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

function canvasToFile(canvas: HTMLCanvasElement, name: string, type = 'image/jpeg'): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode cropped image'));
          return;
        }
        resolve(new File([blob], name, { type }));
      },
      type,
      0.9,
    );
  });
}

/** Crop a camera snapshot to the selected zone */
export async function cropImageFromZone(
  blob: Blob,
  zone: Pick<CameraZone, 'x' | 'y' | 'width' | 'height' | 'name'>,
): Promise<File> {
  const img = await loadImageFromBlob(blob);
  const rect = containerZoneToImageRect(zone, img.naturalWidth, img.naturalHeight);

  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  ctx.drawImage(
    img,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height,
  );

  const safeName = zone.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'zone';
  return canvasToFile(canvas, `${safeName}-crop.jpg`);
}

/** Render a cropped preview data URL for display */
export async function cropImagePreviewUrl(
  blob: Blob,
  zone: Pick<CameraZone, 'x' | 'y' | 'width' | 'height'>,
): Promise<string> {
  const img = await loadImageFromBlob(blob);
  const rect = containerZoneToImageRect(zone, img.naturalWidth, img.naturalHeight);

  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  ctx.drawImage(
    img,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height,
  );

  return canvas.toDataURL('image/jpeg', 0.85);
}
