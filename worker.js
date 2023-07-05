import { createAppAuth } from "@octokit/auth-app";
import { request } from "@octokit/request";
import Router from './router';
import { parseMarkdownMetadata } from './utils';

export default {
  async fetch(req, env) {
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
      const { data } = await app(`GET /repos/adamsuk/blog/contents/${params.path}`);

      var res = {};

      if (Array.isArray(data)) {
        res = data.map(({name, path}) => ({ name, path }))

        // check for item.md
        res.map(async (child) => {
          if (child.name.endsWith('.md')) {
            const { data: raw } = await app(`GET /repos/adamsuk/blog/contents/${child.path}`);
            return { ...child, ...parseMarkdownMetadata(raw) }
          }
        })
      } else if (params.path.endsWith('.md')) {
        res = { ...parseMarkdownMetadata(data), content: data }
      }

      return new Response(JSON.stringify(res),
        {
          headers: { "content-type": "application/json" },
        }
      );
    })

    if (url.pathname.startsWith('/api/')) {
      return router.handle(req);
    } else {
      try {
        return new Response(`{ "ok": true }`, {
          headers: { "content-type": "application/json" },
        });
      } catch (error) {
        app.log.error(error);

        return new Response(`{ "error": "${error.message}" }`, {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    }
  },
};
