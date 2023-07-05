import { createAppAuth } from "@octokit/auth-app";
import { request } from "@octokit/request";
import Router from './router';

export default {
  async fetch(req, env) {

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

    router.get("/api/:path", async () => {
      const { data } = await app(`GET /repos/adamsuk/blog/contents/${params.path}`);

      return new Response(
        `<h1>Cloudflare Worker Example GitHub app</h1>

<p>Data: ${JSON.stringify(data)}</p>`,
        {
          headers: { "content-type": "text/html" },
        }
      );
    })

//     router.get("/api/:path/:file", async () => {
//       const { data } = await app(`GET /repos/adamsuk/blog/contents/${params.path}`);

//       return new Response(
//         `<h1>Cloudflare Worker Example GitHub app</h1>

// <p>Data: ${JSON.stringify(data)}</p>`,
//         {
//           headers: { "content-type": "text/html" },
//         }
//       );
//     })

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
