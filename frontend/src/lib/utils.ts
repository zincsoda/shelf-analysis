/** Resize image client-side to max width before upload (per PRD) */
export async function resizeImage(file: File, maxWidth = 1024): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      if (img.width <= maxWidth) {
        resolve(file);
        return;
      }

      const ratio = maxWidth / img.width;
      const canvas = document.createElement('canvas');
      canvas.width = maxWidth;
      canvas.height = Math.round(img.height * ratio);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to compress image'));
            return;
          }
          resolve(new File([blob], file.name, { type: file.type }));
        },
        file.type,
        0.85,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/** Format a percentage for display */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Format confidence as percentage */
export function formatConfidence(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

/** Format ISO date string */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}
