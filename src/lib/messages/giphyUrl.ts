// GIFs and stickers are shown straight from GIPHY's image servers. Only those addresses
// are accepted, here and by the database (messages.gif_url), so a chat message can never
// load an image from anywhere else.
const giphyHost = /^(media[0-9]*|i)\.giphy\.com$/;

export function isGiphyMediaUrl(value: string) {
  if (value.length > 1000 || /[\s"'<>\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && giphyHost.test(url.hostname) && url.pathname.length > 1 && !url.port && !url.username;
  } catch {
    return false;
  }
}

export type GifKind = 'gif' | 'sticker';

export const gifKindLabels: Record<GifKind, string> = { gif: 'GIF', sticker: 'Sticker' };
