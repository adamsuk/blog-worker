import { createAppAuth } from "@octokit/auth-app";
import { request } from "@octokit/request";
import Router from "./router";
import { getMarkdown } from "./utils";

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowedOrigin =
      origin === env.UI_URL ||
      /^https:\/\/([^.]+\.)?sradams-co-uk-content\.pages\.dev$/.test(origin)
        ? origin
        : env.UI_URL;
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Max-Age": "86400",
    };

    const url = new URL(req.url);

    // wrangler secrets
    const appId = env.APP_ID;
    const privateKey = env.PRIVATE_KEY;
    const installationId = env.INSTALL_ID;

    const router = new Router();

    // instantiate app
    // https://github.com/octokit/req.js/#authentication
    const auth = createAppAuth({
      appId,
      privateKey,
      installationId,
    });

    const app = request.defaults({
      request: { hook: auth.hook },
      mediaType: { format: "raw" },
    });

    router.get("/api/:path*", async ({ params }) => {
      try {
        const { items, sortDirMap } = await getMarkdown(app, params.path);
        const prefix = params.path;

        // Returns the first path segment below the base prefix (the "root section"),
        // and whether this item IS that section header (a direct child of prefix).
        // e.g. prefix="cv", name="cv.experience.job1.md"
        //   → { rootSection: "experience", isDirectChild: false }
        // e.g. prefix="cv", name="cv.experience.md"
        //   → { rootSection: "experience", isDirectChild: true }
        function segInfo(name) {
          const noMd = name.slice(0, -3);
          const after = prefix ? noMd.slice(prefix.length + 1) : noMd;
          const dot = after.indexOf(".");
          return dot === -1
            ? { rootSection: after, isDirectChild: true }
            : { rootSection: after.slice(0, dot), isDirectChild: false };
        }

        function orderCmp(aOrder, bOrder, aItem, bItem) {
          if (aOrder !== null && bOrder !== null) return aOrder - bOrder;
          if (aOrder !== null) return -1;
          if (bOrder !== null) return 1;
          return aItem.path.localeCompare(bItem.path);
        }

        items.sort((a, b) => {
          const ai = segInfo(a.name);
          const bi = segInfo(b.name);

          if (ai.rootSection !== bi.rootSection) {
            // Cross-section: sort sections by their own order field
            const aKey = prefix ? `${prefix}.${ai.rootSection}` : ai.rootSection;
            const bKey = prefix ? `${prefix}.${bi.rootSection}` : bi.rootSection;
            const aOrder = sortDirMap[aKey]?.order ?? null;
            const bOrder = sortDirMap[bKey]?.order ?? null;
            const topDir = sortDirMap[prefix]?.sort || "asc";
            const cmp = orderCmp(aOrder, bOrder, a, b);
            return topDir === "desc" ? -cmp : cmp;
          }

          // Same section: section header always appears before its children
          if (ai.isDirectChild !== bi.isDirectChild) {
            return ai.isDirectChild ? -1 : 1;
          }

          // Same section, same depth: sort by order using this section's sort direction
          const sectionKey = prefix
            ? `${prefix}.${ai.rootSection}`
            : ai.rootSection;
          const dir = ai.isDirectChild
            ? sortDirMap[prefix]?.sort || "asc"
            : sortDirMap[sectionKey]?.sort || "asc";
          const cmp = orderCmp(
            a.meta?.order ?? null,
            b.meta?.order ?? null,
            a,
            b
          );
          return dir === "desc" ? -cmp : cmp;
        });

        return new Response(JSON.stringify(items), {
          headers: { "content-type": "application/json", ...corsHeaders },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "content-type": "application/json", ...corsHeaders },
        });
      }
    });

    if (url.pathname.startsWith("/api/")) {
      return router.handle(req);
    } else {
      try {
        return new Response(`{ "ok": true }`, {
          headers: { "content-type": "application/json", ...corsHeaders },
        });
      } catch (error) {
        app.log.error(error);

        return new Response(`{ "error": "${error.message}" }`, {
          status: 500,
          headers: { "content-type": "application/json", ...corsHeaders },
        });
      }
    }
  },
};
