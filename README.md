# blog-worker

This repository includes the scripts, setup and deployment CI for a CloudFlare Worker used to pull information stored in several Markdown files in a single repository. Originally this was utilising a CMS (Grav) however due to traffic loads this infrastructure seemed like overkill so it was moved to a free worker instance.

### Local Dev

It is possible to run this worker locally using [wrangler](https://www.npmjs.com/package/wrangler) - a tool written and maintained by CloudFlare to enable local development of workers... perfect!

Runtime environments are stored in [.tool-versions](./.tool-versions) which is compatible with [asdf](https://asdf-vm.com/) so if you have that up and running give `asdf install` a whirl in this repos root directory.

Just install the dependencies using npm and run `npm run dev` to host this blog worker on localhost:8787

### Deployment

This utilises Github Actions to release the code to CloudFlare pages using repo secrets and also produces a semantic release on Github, happy days.
