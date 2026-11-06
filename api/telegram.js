// Telegram sends every message you text the bot to this address.
// Only Telegram user IDs listed in ALLOWED_TELEGRAM_USER_IDS can post.
import { savePost, saveImage, pin, unpinAll, deleteLatest } from '../lib/store.js';
import { firstUrl, tweetUrl, fetchPreview } from '../lib/links.js';

const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

const HELP = [
  'Send me anything and it goes on the Texas Group Chat feed:',
  '• Text',
  '• A photo (with an optional caption)',
  '• A tweet link (shows as the real tweet)',
  '• An article link (shows as a headline card)',
  '',
  'Start a message with ⭐ or PIN to feature it at the top.',
  'Send UNPIN to clear featured posts.',
  'Send DELETE to remove your last post.'
].join('\n');

async function reply(chatId, text) {
  try {
    await fetch(`${API()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
    });
  } catch (e) {}
}

async function downloadPhoto(fileId) {
  const info = await (await fetch(`${API()}/getFile?file_id=${encodeURIComponent(fileId)}`)).json();
  if (!info.ok) throw new Error('Could not get the photo from Telegram');
  const path = info.result.file_path;
  const r = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${path}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const ext = (path.split('.').pop() || 'jpg').toLowerCase();
  const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return saveImage(buf, type, ext === 'png' || ext === 'webp' ? ext : 'jpg');
}

async function handle(msg) {
  const chatId = msg.chat.id;
  let text = (msg.text ?? msg.caption ?? '').trim();
  const upper = text.toUpperCase();

  if (upper === '/START' || upper === '/HELP' || upper === 'HELP') return reply(chatId, HELP);
  if (upper === 'UNPIN') {
    const n = await unpinAll();
    return reply(chatId, n ? 'Cleared featured posts.' : 'Nothing was featured.');
  }
  if (upper === 'DELETE') {
    const id = await deleteLatest();
    return reply(chatId, id ? 'Deleted your last post.' : 'There are no posts to delete.');
  }

  let featured = false;
  const pinMatch = text.match(/^(?:⭐️?|🌟|PIN\b:?)\s*/i);
  if (pinMatch) {
    featured = true;
    text = text.slice(pinMatch[0].length).trim();
  }

  const post = {};
  const photo = Array.isArray(msg.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1] : null;
  if (photo) post.image = await downloadPhoto(photo.file_id);

  const url = firstUrl(text);
  if (url) {
    const tweet = tweetUrl(url);
    if (tweet) post.tweet = tweet;
    else post.link = await fetchPreview(url);
    text = text.replace(url, '').trim();
  }
  if (text) post.text = text.slice(0, 2000);

  if (!post.text && !post.image && !post.tweet && !post.link) {
    return reply(chatId, 'I can post text, photos and links. Send HELP for the list.');
  }

  const saved = await savePost(post);
  if (featured) await pin(saved.id);
  return reply(chatId, featured ? 'Posted and featured at the top.' : 'Posted.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ok');
  if (!process.env.TELEGRAM_SECRET || req.headers['x-telegram-bot-api-secret-token'] !== process.env.TELEGRAM_SECRET) {
    return res.status(401).send('unauthorized');
  }
  const msg = req.body && (req.body.message || req.body.edited_message);
  if (!msg || !msg.chat) return res.status(200).send('ignored');

  const fromId = String((msg.from && msg.from.id) || '');
  const allowed = (process.env.ALLOWED_TELEGRAM_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowed.includes(fromId)) {
    await reply(msg.chat.id, `This bot is private. Your Telegram user ID is ${fromId}.`);
    return res.status(200).send('not allowed');
  }

  try {
    await handle(msg);
  } catch (e) {
    await reply(msg.chat.id, 'That did not post: ' + (e && e.message ? e.message : 'unknown error'));
  }
  // Always answer 200 so Telegram does not resend the same message.
  return res.status(200).send('ok');
}
