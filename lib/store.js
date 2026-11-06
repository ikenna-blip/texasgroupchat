// Storage for the group chat feed, using Vercel Blob.
// Each post is its own small JSON file under posts/, named by time so the newest sorts last.
// A post is "pinned" (featured) when an empty marker file pins/<id> exists.
import { put, list, del } from '@vercel/blob';

async function listAll(prefix) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

export async function savePost(post) {
  const ts = Date.now();
  const id = ts.toString(36) + Math.random().toString(36).slice(2, 6);
  const record = { id, createdAt: new Date(ts).toISOString(), ...post };
  await put(`posts/${String(ts).padStart(15, '0')}-${id}.json`, JSON.stringify(record), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false
  });
  return record;
}

export async function saveImage(buffer, contentType, ext) {
  const blob = await put(`images/${Date.now()}.${ext}`, buffer, {
    access: 'public',
    contentType,
    addRandomSuffix: true
  });
  return blob.url;
}

export async function pin(id) {
  await put(`pins/${id}`, '1', {
    access: 'public',
    contentType: 'text/plain',
    addRandomSuffix: false,
    allowOverwrite: true
  });
}

export async function unpinAll() {
  const pins = await listAll('pins/');
  if (pins.length) await del(pins.map((b) => b.url));
  return pins.length;
}

function idFromPath(pathname) {
  return pathname.replace(/^posts\/\d+-/, '').replace(/\.json$/, '');
}

export async function deleteLatest() {
  const posts = (await listAll('posts/')).sort((a, b) => a.pathname.localeCompare(b.pathname));
  const last = posts[posts.length - 1];
  if (!last) return null;
  const id = idFromPath(last.pathname);
  const toDelete = [last.url];
  const pins = await listAll('pins/');
  pins.filter((p) => p.pathname === `pins/${id}`).forEach((p) => toDelete.push(p.url));
  await del(toDelete);
  return id;
}

export async function listPosts(limit = 40) {
  const [posts, pins] = await Promise.all([listAll('posts/'), listAll('pins/')]);
  const pinned = new Set(pins.map((p) => p.pathname.replace(/^pins\//, '')));
  const newest = posts.sort((a, b) => b.pathname.localeCompare(a.pathname));
  // Always include pinned posts, plus the newest `limit` posts.
  const chosen = newest.filter((b, i) => i < limit || pinned.has(idFromPath(b.pathname)));
  const records = await Promise.all(
    chosen.map(async (b) => {
      try {
        const r = await fetch(b.url);
        if (!r.ok) return null;
        const rec = await r.json();
        rec.pinned = pinned.has(rec.id);
        return rec;
      } catch (e) {
        return null;
      }
    })
  );
  return records.filter(Boolean);
}
