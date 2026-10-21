import { parseMarkdownMetadata, sortItems } from "./utils.js";

// Workers KV cache for GitHub-derived responses.
//
// Keys:
//   gen            - cache generation, bumped by the GitHub push webhook
//   listing:notes  - { etag, gen, entries: [{ name, path, sha }] } for notes/
//   blob:<sha>     - raw markdown for one file version (immutable)
//   resp:<prefix>  - { body, sig, gen, fetchedAt } for /api/<prefix>
//
// A response is served from KV while its gen matches and it is younger than TTL_MS.
// After that the notes listing is revalidated with If-None-Match (a 304 doesn't count
// against GitHub's rate limit) and only files whose blob sha changed are re-fetched.
// If GitHub fails, the last good response is served instead of an error.

export const TTL_MS = 60 * 60 * 1000;
export const GEN_KEY = "gen";
export const LISTING_KEY = "listing:notes";
const REPO = "/repos/adamsuk/dendron-daily";

const respKey = (prefix) => `resp:${prefix || ""}`;

// KV allows one write per key per second; a failed cache write must never fail a request.
const safePut = async (kv, key, value) => {
  try {
    await kv.put(key, value);
  } catch {}
};

export const fetchListing = async (app, kv, gen) => {
  const cached = await kv.get(LISTING_KEY, "json");
  // Only revalidate against an ETag fetched in the current generation, so a webhook bust
  // always forces a full listing fetch.
  const etag = cached && cached.gen === gen ? cached.etag : null;
  try {
    const res = await app(`GET ${REPO}/contents/notes`, {
      headers: etag ? { "if-none-match": etag } : {},
    });
    let data = res.data;
    if (typeof data === "string") data = JSON.parse(data);
    const entries = (Array.isArray(data) ? data : [])
      .filter(({ name }) => name.endsWith(".md"))
      .map(({ name, path, sha }) => ({ name, path, sha }));
    await safePut(
      kv,
      LISTING_KEY,
      JSON.stringify({ etag: res.headers?.etag || null, gen, entries })
    );
    return { entries, notModified: false };
  } catch (error) {
    if (error.status === 304 && cached) {
      return { entries: cached.entries, notModified: true };
    }
    throw error;
  }
};

const getBlob = async (app, kv, { sha }) => {
  const cached = await kv.get(`blob:${sha}`);
  if (cached !== null && cached !== undefined) return cached;
  const { data } = await app(`GET ${REPO}/git/blobs/${sha}`);
  const text =
    typeof data === "string"
      ? data
      : data instanceof ArrayBuffer
      ? new TextDecoder().decode(data)
      : String(data);
  await safePut(kv, `blob:${sha}`, text);
  return text;
};

const matchesPrefix = (prefix) => ({ name }) =>
  (prefix ? name.startsWith(`${prefix}.`) : true) && name.endsWith(".md");

// Same output as the original getMarkdown + sort: every matching file contributes to
// sortDirMap, only meta.public === true files are returned.
export const buildItems = async (app, kv, prefix, entries) => {
  const sortDirMap = {};
  const items = [];
  const matching = entries.filter(matchesPrefix(prefix));
  await Promise.all(
    matching.map(async (entry) => {
      const parsed = parseMarkdownMetadata(await getBlob(app, kv, entry));
      const filePrefix = entry.name.slice(0, -3);
      const sortEntry = {};
      if (parsed.meta?.sort != null) sortEntry.sort = parsed.meta.sort;
      if (parsed.meta?.order != null) sortEntry.order = parsed.meta.order;
      if (Object.keys(sortEntry).length > 0) sortDirMap[filePrefix] = sortEntry;

      if (parsed.meta && parsed.meta.public === true) {
        const slug = parsed.meta.slug || entry.name.replace(/\.md$/, "");
        items.push({ name: entry.name, path: entry.path, slug, ...parsed });
      }
    })
  );
  sortItems(items, sortDirMap, prefix);
  return items;
};

const signature = (prefix, entries) =>
  entries
    .filter(matchesPrefix(prefix))
    .map(({ name, sha }) => `${name}@${sha}`)
    .sort()
    .join("\n");

// De-duplicate concurrent revalidations within one isolate (e.g. a site build).
const inflight = new Map();

const revalidate = async (app, kv, prefix, gen, entry, now) => {
  const { entries, notModified } = await fetchListing(app, kv, gen);
  const sig = signature(prefix, entries);
  let body;
  if (entry && (notModified || entry.sig === sig)) {
    body = entry.body;
  } else {
    body = JSON.stringify(await buildItems(app, kv, prefix, entries));
  }
  await safePut(kv, respKey(prefix), JSON.stringify({ body, sig, gen, fetchedAt: now }));
  return body;
};

// Returns { body, cache } where cache is HIT, REVALIDATED, MISS or STALE.
export const getCached = async (app, kv, prefix, now = Date.now()) => {
  const [entry, storedGen] = await Promise.all([
    kv.get(respKey(prefix), "json"),
    kv.get(GEN_KEY),
  ]);
  const gen = storedGen || "0";
  if (entry && entry.gen === gen && now - entry.fetchedAt < TTL_MS) {
    return { body: entry.body, cache: "HIT" };
  }

  const key = `${prefix}|${gen}`;
  let pending = inflight.get(key);
  if (!pending) {
    pending = revalidate(app, kv, prefix, gen, entry, now).finally(() =>
      inflight.delete(key)
    );
    inflight.set(key, pending);
  }

  try {
    const body = await pending;
    return { body, cache: entry ? "REVALIDATED" : "MISS" };
  } catch (error) {
    if (entry) return { body: entry.body, cache: "STALE", error: error.message };
    throw error;
  }
};

// ---- GitHub push webhook ----

const toHex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export const verifySignature = async (secret, payload, header) => {
  if (!secret || !header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = toHex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
  );
  const given = header.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  }
  return diff === 0;
};

// Does this push touch any markdown note on the default branch?
export const pushTouchesNotes = (payload) => {
  const branch = payload?.repository?.default_branch || "main";
  if (payload?.ref !== `refs/heads/${branch}`) return false;
  const commits = payload.commits || [];
  // GitHub caps commits at 2048 per payload; bust if it may have been truncated.
  if (commits.length === 0 || commits.length >= 2048) return true;
  return commits.some((c) =>
    [...(c.added || []), ...(c.modified || []), ...(c.removed || [])].some(
      (f) => f.startsWith("notes/") && f.endsWith(".md")
    )
  );
};

export const handleWebhook = async (req, env, now = Date.now()) => {
  const payload = await req.text();
  const ok = await verifySignature(
    env.WEBHOOK_SECRET,
    payload,
    req.headers.get("X-Hub-Signature-256")
  );
  if (!ok) return { status: 401, body: { error: "invalid signature" } };

  const event = req.headers.get("X-GitHub-Event");
  if (event === "ping") return { status: 200, body: { ok: true, ping: true } };
  if (event !== "push") return { status: 202, body: { ok: true, ignored: event } };

  const data = JSON.parse(payload);
  if (data?.repository?.full_name !== "adamsuk/dendron-daily") {
    return { status: 202, body: { ok: true, ignored: data?.repository?.full_name } };
  }
  if (!pushTouchesNotes(data)) {
    return { status: 200, body: { ok: true, busted: false } };
  }
  const gen = `${now}-${String(data.after || "").slice(0, 7)}`;
  await env.BLOG_CACHE.put(GEN_KEY, gen);
  return { status: 200, body: { ok: true, busted: true, gen } };
};
