// The News tab reads the group chat feed from here.
import { listPosts } from '../lib/store.js';

export default async function handler(req, res) {
  try {
    const posts = await listPosts(40);
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    return res.status(200).json({ posts });
  } catch (e) {
    return res.status(500).json({ posts: [], error: 'Feed unavailable' });
  }
}
