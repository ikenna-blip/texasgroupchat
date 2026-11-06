// One-time setup: visit /api/setup?key=YOUR_TELEGRAM_SECRET to connect the bot to this site.
export default async function handler(req, res) {
  const key = (req.query && req.query.key) || '';
  if (!process.env.TELEGRAM_SECRET || key !== process.env.TELEGRAM_SECRET) {
    return res.status(401).send('Add ?key= with your TELEGRAM_SECRET value.');
  }
  if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(500).send('TELEGRAM_BOT_TOKEN is not set in Vercel.');
  const url = `https://${req.headers.host}/api/telegram`;
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: process.env.TELEGRAM_SECRET, allowed_updates: ['message', 'edited_message'] })
  });
  const out = await r.json();
  if (!out.ok) return res.status(500).send('Telegram said: ' + (out.description || 'error'));
  return res.status(200).send(`Connected. Telegram will now send your bot messages to ${url}. Message your bot to post.`);
}
