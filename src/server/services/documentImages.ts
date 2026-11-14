import 'server-only';
import sharp from 'sharp';

const acceptedTypes = ['image/png', 'image/jpeg', 'image/webp'];

// Shrinks an uploaded image (a signature, seal or UPI QR code) to the size it prints
// at, keeping any transparency, so it can be stored in its row and printed the same on
// every database. Returns a data: address, or what is wrong with the file.
export async function toStoredImage(
  file: File,
  box: { width: number; height: number },
  options: { trim?: boolean } = {},
): Promise<{ error: string } | { image: string }> {
  if (!acceptedTypes.includes(file.type)) return { error: 'Use a PNG, JPG or WebP image.' };
  if (file.size > 5 * 1024 * 1024) return { error: 'The image can be up to 5 MB.' };
  try {
    let image = sharp(Buffer.from(await file.arrayBuffer())).rotate();
    if (options.trim !== false) image = image.trim({ threshold: 10 });
    const output = await image
      .resize({ width: box.width, height: box.height, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90, alphaQuality: 100 })
      .toBuffer();
    return { image: `data:image/webp;base64,${output.toString('base64')}` };
  } catch {
    return { error: 'This image could not be read. Try another file.' };
  }
}

// The file chosen in a form field, if any.
export function chosenFile(formData: FormData, name: string) {
  const file = formData.get(name);
  return file instanceof File && file.size > 0 ? file : null;
}
