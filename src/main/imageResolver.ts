import * as fs from 'fs';
import * as path from 'path';
import { MessageMedia } from 'whatsapp-web.js';

const IMAGES_DIR = path.join(process.cwd(), 'images');

// Matches [Image: filename.ext] — distinct enough to never clash with timestamp brackets
const IMAGE_PLACEHOLDER_REGEX = /^\[Image:\s*([^\]]+\.(png|jpg|jpeg|gif|webp|bmp))\]$/i;

export interface SegmentResolution {
  type: 'text' | 'image';
  text?: string;
  media?: MessageMedia;
  filename?: string;
}

/**
 * Reads the images directory and returns a list of available image filenames.
 * Returns an empty array if the directory doesn't exist.
 */
export function getAvailableImages(): string[] {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    return [];
  }

  const supportedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];

  return fs.readdirSync(IMAGES_DIR).filter(file =>
    supportedExtensions.includes(path.extname(file).toLowerCase())
  );
}

/**
 * Checks if a segment is an [Image: filename.ext] placeholder and resolves it.
 * Falls back to plain text for anything that doesn't match or if the file is missing.
 */
export function resolveSegment(segment: string): SegmentResolution {
  const match = segment.trim().match(IMAGE_PLACEHOLDER_REGEX);

  if (!match) {
    return { type: 'text', text: segment };
  }

  const filename = match[1].trim();
  const imagePath = path.join(IMAGES_DIR, filename);

  if (!fs.existsSync(imagePath)) {
    console.warn(`[imageResolver] Image file not found: ${imagePath}, skipping segment`);
    // Return null-like signal so the caller can skip this segment entirely
    return { type: 'image', filename, media: undefined };
  }

  const media = MessageMedia.fromFilePath(imagePath);
  return { type: 'image', media, filename };
}