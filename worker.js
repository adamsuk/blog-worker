import { createAppAuth } from "@octokit/auth-app";
import { request } from "@octokit/request";
import Router from './router';
import { parseMarkdownMetadata, getMarkdown } from './utils';

export default {
  async fetch(req, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "https://sradams.co.uk",
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
      installationId
    });

    const app = request.defaults({
      request: { hook: auth.hook },
      mediaType: { format: 'raw' }
    })
    
    router.get("/api/:path*", async ({ params }) => {
      const res = await getMarkdown(app, params.path)

      return new Response(JSON.stringify(res),
        {
          headers: { "content-type": "application/json", ...corsHeaders },
        }
      );
    })

    if (url.pathname.startsWith('/api/')) {
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
