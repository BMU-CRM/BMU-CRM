// Converts JPG and PNG files in public/images to WebP, then removes the originals.
// Usage: npm run images:webp
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const imagesFolder = path.join(process.cwd(), 'public', 'images');
const convertibleImage = /\.(jpe?g|png)$/i;

async function findImages(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(folder, entry.name);
      if (entry.isDirectory()) return findImages(entryPath);
      return Promise.resolve(convertibleImage.test(entry.name) ? [entryPath] : []);
    }),
  );
  return nested.flat();
}

async function convertImages() {
  const images = await findImages(imagesFolder);

  for (const image of images) {
    const output = image.replace(convertibleImage, '.webp');
    await sharp(image).webp({ quality: 82 }).toFile(output);
    await rm(image);
    console.log(`Converted ${path.relative(process.cwd(), output)}`);
  }

  console.log(`Done. ${images.length} image(s) converted.`);
}

convertImages().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
