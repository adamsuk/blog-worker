const { createAppAuth: App } = require("@octokit/auth-app");

export default {
  async fetch(request, env) {

    // wrangler secrets
    const appId = env.APP_ID;
    const privateKey = env.PRIVATE_KEY;
    const installationId = env.INSTALL_ID;

    // instantiate app
    // https://github.com/octokit/request.js/#authentication
    const app = new App({
      appId,
      privateKey,
      installationId
    });

    if (request.method === "GET") {
      const { data } = await app.octokit.request("GET /app");

      return new Response(
        `<h1>Cloudflare Worker Example GitHub app</h1>

<p>Installation count: ${data.installations_count}</p>
    
<p><a href="https://github.com/apps/cloudflare-worker-example">Install</a> | <a href="https://github.com/gr2m/cloudflare-worker-github-app-example/#readme">source code</a></p>`,
        {
          headers: { "content-type": "text/html" },
        }
      );
    }

    const id = request.headers.get("x-github-delivery");
    const name = request.headers.get("x-github-event");
    const payloadString = await request.text();
    const payload = JSON.parse(payloadString);

    // Now handle the request
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
