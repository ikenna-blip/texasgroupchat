// Finds links in a message and reads an article's preview details (title, image, site name).

const TWEET_RE = /^https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]+)\/status(?:es)?\/(\d+)/i;

export function firstUrl(text) {
  const m = (text || '').match(/https?:\/\/[^\s<>"]+/i);
  return m ? m[0].replace(/[).,!?]+$/, '') : null;
}

export function tweetUrl(url) {
  const m = (url || '').match(TWEET_RE);
  return m ? `https://twitter.com/${m[1]}/status/${m[2]}` : null;
}

function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .trim();
}

function meta(html, names) {
  for (const name of names) {
    const a = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
    const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i');
    const m = html.match(a) || html.match(b);
    if (m && m[1]) return decode(m[1]);
  }
  return '';
}

export function parsePreview(html, url) {
  const titleTag = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
  let image = meta(html, ['og:image', 'twitter:image', 'twitter:image:src']);
  if (image) {
    try { image = new URL(image, url).href; } catch (e) { image = ''; }
  }
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
  return {
    url,
    title: meta(html, ['og:title', 'twitter:title']) || decode(titleTag) || url,
    description: meta(html, ['og:description', 'twitter:description', 'description']).slice(0, 280),
    image: /^https?:\/\//.test(image) ? image : '',
    site: meta(html, ['og:site_name']) || host
  };
}

export async function fetchPreview(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TexasGroupChatBot/1.0)', Accept: 'text/html' }
    });
    const html = (await r.text()).slice(0, 400000);
    return parsePreview(html, r.url || url);
  } catch (e) {
    return parsePreview('', url);
  } finally {
    clearTimeout(timer);
  }
}
