import { createAppAuth } from "@octokit/auth-app";
import { request } from "@octokit/request";
import Router from "./router";
import { getCached, handleWebhook } from "./cache";

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowedOrigin =
      origin === env.UI_URL ||
      /^https:\/\/([^.]+\.)?sradams-co-uk-content\.pages\.dev$/.test(origin) ||
      /^https:\/\/[a-z0-9][a-z0-9-]*-\d+\.app\.github\.dev$/i.test(origin)
        ? origin
        : env.UI_URL;
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    const json = (body, status = 200, extra = {}) =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...corsHeaders, ...extra },
      });

    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // wrangler secrets
    const appId = env.APP_ID;
    const privateKey = env.PRIVATE_KEY;
    const installationId = env.INSTALL_ID;

    const router = new Router();

    // instantiate app
    // https://github.com/octokit/req.js/#authentication
    // The installation token is only requested when GitHub is actually called, which
    // with the KV cache is only on revalidation.
    const auth = createAppAuth({
      appId,
      privateKey,
      installationId,
    });

    const app = request.defaults({
      request: { hook: auth.hook },
      mediaType: { format: "raw" },
    });

    // GitHub push webhook from dendron-daily: marks the cache stale when notes change.
    router.post("/webhook/github", async () => {
      if (!env.WEBHOOK_SECRET || !env.BLOG_CACHE) {
        return json({ error: "webhook not configured" }, 503);
      }
      try {
        const { status, body } = await handleWebhook(req, env);
        return json(body, status);
      } catch (error) {
        return json({ error: error.message }, 400);
      }
    });

    router.get("/api/:path*", async ({ params }) => {
      try {
        const { body, cache } = await getCached(app, env.BLOG_CACHE, params.path);
        return json(body, 200, {
          "Cache-Control":
            cache === "STALE" ? "public, max-age=30" : "public, max-age=60",
          "X-Cache": cache,
        });
      } catch (error) {
        return json({ error: error.message }, 500, { "Cache-Control": "no-store" });
      }
    });

    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/webhook/")) {
      return (await router.handle(req)) || json({ error: "not found" }, 404);
    }
    return json(`{ "ok": true }`);
  },
};
