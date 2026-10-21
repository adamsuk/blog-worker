import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  getCached,
  handleWebhook,
  verifySignature,
  pushTouchesNotes,
  TTL_MS,
} from "../cache.js";

const fakeKV = () => {
  const store = new Map();
  return {
    store,
    async get(k, type) {
      const v = store.has(k) ? store.get(k) : null;
      return type === "json" && v !== null ? JSON.parse(v) : v;
    },
    async put(k, v) {
      store.set(k, v);
    },
    async delete(k) {
      store.delete(k);
    },
  };
};

const md = (meta, body = "Body") =>
  `---\n${Object.entries(meta)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}\n---\n${body}`;

// Fake GitHub: files is { name: { sha, text } }
const fakeGitHub = (files) => {
  const calls = [];
  let fail = false;
  const etag = () => `"${Object.values(files).map((f) => f.sha).join(",")}"`;
  const app = async (route, opts = {}) => {
    calls.push(route);
    if (fail) {
      const e = new Error("API rate limit exceeded");
      e.status = 403;
      throw e;
    }
    if (route.endsWith("/contents/notes")) {
      if (opts.headers?.["if-none-match"] === etag()) {
        const e = new Error("Not modified");
        e.status = 304;
        throw e;
      }
      return {
        data: Object.entries(files).map(([name, f]) => ({
          name,
          path: `notes/${name}`,
          sha: f.sha,
        })),
        headers: { etag: etag() },
      };
    }
    const sha = route.split("/").pop();
    const f = Object.values(files).find((x) => x.sha === sha);
    return { data: f.text, headers: {} };
  };
  return { app, calls, setFail: (v) => (fail = v) };
};

const baseFiles = () => ({
  "blog.md": { sha: "s0", text: md({ title: "Blog", sort: "desc" }) },
  "blog.a.md": { sha: "s1", text: md({ title: "A", public: true, date: "2026-01-01" }) },
  "blog.b.md": { sha: "s2", text: md({ title: "B", public: false }) },
  "cv.x.md": { sha: "s3", text: md({ title: "CV", public: true }) },
  "readme.txt": { sha: "s4", text: "nope" },
});

test("returns only public posts for the prefix, then serves from cache", async () => {
  const kv = fakeKV();
  const gh = fakeGitHub(baseFiles());
  const first = await getCached(gh.app, kv, "blog", 1000);
  assert.equal(first.cache, "MISS");
  const items = JSON.parse(first.body);
  assert.deepEqual(items.map((i) => i.slug), ["blog.a"]);
  assert.deepEqual(Object.keys(items[0]), ["name", "path", "slug", "meta", "content"]);
  assert.equal(items[0].path, "notes/blog.a.md");
  const callsAfterFirst = gh.calls.length;
  assert.equal(callsAfterFirst, 1 + 3); // listing + blog.md, blog.a.md, blog.b.md

  for (let i = 0; i < 20; i++) {
    const r = await getCached(gh.app, kv, "blog", 2000 + i);
    assert.equal(r.cache, "HIT");
    assert.equal(r.body, first.body);
  }
  assert.equal(gh.calls.length, callsAfterFirst, "cache hits make no GitHub calls");
});

test("after TTL, revalidates with If-None-Match and fetches no files on 304", async () => {
  const kv = fakeKV();
  const gh = fakeGitHub(baseFiles());
  const first = await getCached(gh.app, kv, "blog", 0);
  const n = gh.calls.length;
  const r = await getCached(gh.app, kv, "blog", TTL_MS + 1);
  assert.equal(r.cache, "REVALIDATED");
  assert.equal(r.body, first.body);
  assert.deepEqual(gh.calls.slice(n), ["GET /repos/adamsuk/dendron-daily/contents/notes"]);
});

test("serves the last good response when GitHub fails", async () => {
  const kv = fakeKV();
  const gh = fakeGitHub(baseFiles());
  const first = await getCached(gh.app, kv, "blog", 0);
  gh.setFail(true);
  const r = await getCached(gh.app, kv, "blog", TTL_MS + 5);
  assert.equal(r.cache, "STALE");
  assert.equal(r.body, first.body);
  // still throws when there is nothing cached
  await assert.rejects(() => getCached(gh.app, fakeKV(), "blog", 0), /rate limit/);
});

const sign = (secret, body) =>
  "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

const webhookReq = (secret, payload, event = "push", sig) => {
  const body = JSON.stringify(payload);
  return new Request("https://blog.example/webhook/github", {
    method: "POST",
    body,
    headers: {
      "X-GitHub-Event": event,
      "X-Hub-Signature-256": sig ?? sign(secret, body),
    },
  });
};

const pushPayload = (files) => ({
  ref: "refs/heads/main",
  after: "abcdef1234567",
  repository: { full_name: "adamsuk/dendron-daily", default_branch: "main" },
  commits: [{ added: files, modified: [], removed: [] }],
});

test("webhook push bust makes the next request pick up a new public post", async () => {
  const kv = fakeKV();
  const files = baseFiles();
  const gh = fakeGitHub(files);
  await getCached(gh.app, kv, "blog", 0);

  files["blog.c.md"] = { sha: "s5", text: md({ title: "C", public: true }) };
  const env = { WEBHOOK_SECRET: "shh", BLOG_CACHE: kv };
  const res = await handleWebhook(webhookReq("shh", pushPayload(["notes/blog.c.md"])), env, 10);
  assert.equal(res.status, 200);
  assert.equal(res.body.busted, true);

  const n = gh.calls.length;
  const r = await getCached(gh.app, kv, "blog", 20);
  assert.equal(r.cache, "REVALIDATED");
  assert.deepEqual(JSON.parse(r.body).map((i) => i.slug).sort(), ["blog.a", "blog.c"]);
  // full listing (no stale ETag) + only the new file's blob
  assert.deepEqual(gh.calls.slice(n), [
    "GET /repos/adamsuk/dendron-daily/contents/notes",
    "GET /repos/adamsuk/dendron-daily/git/blobs/s5",
  ]);
  assert.equal((await getCached(gh.app, kv, "blog", 30)).cache, "HIT");
});

test("webhook rejects bad signatures and ignores pushes that don't touch notes", async () => {
  const kv = fakeKV();
  const env = { WEBHOOK_SECRET: "shh", BLOG_CACHE: kv };
  const bad = await handleWebhook(
    webhookReq("shh", pushPayload(["notes/blog.c.md"]), "push", "sha256=deadbeef"),
    env
  );
  assert.equal(bad.status, 401);
  const wrong = await handleWebhook(webhookReq("other", pushPayload(["notes/x.md"])), env);
  assert.equal(wrong.status, 401);
  const unrelated = await handleWebhook(webhookReq("shh", pushPayload(["assets/x.png"])), env);
  assert.equal(unrelated.body.busted, false);
  const ping = await handleWebhook(webhookReq("shh", { zen: "hi" }, "ping"), env);
  assert.equal(ping.status, 200);
  assert.equal(kv.store.has("gen"), false);
});

test("verifySignature and pushTouchesNotes edge cases", async () => {
  assert.equal(await verifySignature("k", "x", sign("k", "x")), true);
  assert.equal(await verifySignature("k", "x", null), false);
  assert.equal(await verifySignature("", "x", sign("", "x")), false);
  assert.equal(pushTouchesNotes({ ...pushPayload(["notes/a.md"]), ref: "refs/heads/dev" }), false);
});
