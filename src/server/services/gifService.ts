import 'server-only';
import { isGiphyMediaUrl, type GifKind } from '@/lib/messages/giphyUrl';

// GIFs and stickers come from GIPHY. The search runs on the server, so the API key stays
// secret; the images themselves load from GIPHY in each person's browser. Without
// GIPHY_API_KEY the GIF and sticker button is left out of the chat.

export type GifResult = { id: string; title: string; url: string; width: number; height: number };

const resultsPerSearch = 24;

export function isGifSearchOn() {
  return Boolean(process.env.GIPHY_API_KEY?.trim());
}

type GiphyImage = { url?: string; webp?: string; width?: string; height?: string };
type GiphyItem = { id?: string; title?: string; images?: { fixed_width?: GiphyImage } };

// What is popular now when the search box is empty, otherwise what matches. Results are
// kept for 10 minutes, so the same search does not ask GIPHY again and the key's hourly
// limit lasts.
export async function searchGiphy(kind: GifKind, query: string): Promise<GifResult[]> {
  const key = process.env.GIPHY_API_KEY?.trim();
  if (!key) return [];

  const params = new URLSearchParams({ api_key: key, limit: String(resultsPerSearch), rating: 'g', bundle: 'messaging_non_clips' });
  if (query) params.set('q', query);
  const endpoint = `https://api.giphy.com/v1/${kind === 'sticker' ? 'stickers' : 'gifs'}/${query ? 'search' : 'trending'}`;

  const response = await fetch(`${endpoint}?${params.toString()}`, {
    signal: AbortSignal.timeout(6000),
    next: { revalidate: 600 },
  });
  if (!response.ok) throw new Error(`GIPHY answered ${response.status}`);

  const body = (await response.json()) as { data?: GiphyItem[] };
  return (body.data ?? []).flatMap((item) => {
    const image = item.images?.fixed_width;
    // The WebP version is far smaller than the GIF and plays the same.
    const url = image?.webp || image?.url;
    const width = Number(image?.width);
    const height = Number(image?.height);
    if (!item.id || !url || !isGiphyMediaUrl(url) || !(width > 0) || !(height > 0)) return [];
    return [{ id: item.id, title: (item.title ?? '').slice(0, 200), url, width: Math.min(width, 2000), height: Math.min(height, 2000) }];
  });
}
