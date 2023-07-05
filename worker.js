import { createAppAuth } from "@octokit/auth-app";
import { request } from "@octokit/request";

export default {
  async fetch(req, env) {

    // wrangler secrets
    const appId = env.APP_ID;
    const privateKey = env.PRIVATE_KEY;
    const installationId = env.INSTALL_ID;

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

    if (req.method === "GET") {
      const { data } = await app("GET /app");

      return new Response(
        `<h1>Cloudflare Worker Example GitHub app</h1>

<p>Data: ${JSON.stringify(data)}</p>
    
<p><a href="https://github.com/apps/cloudflare-worker-example">Install</a> | <a href="https://github.com/gr2m/cloudflare-worker-github-app-example/#readme">source code</a></p>`,
        {
          headers: { "content-type": "text/html" },
        }
      );
    }

    // Now handle the req
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
  },
};
