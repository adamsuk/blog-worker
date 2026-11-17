// Returns the value for Access-Control-Allow-Origin: the request's Origin when it is
// allowed, otherwise the UI URL (which the browser will then reject for other origins).
//
// Allowed: the UI URL and its www./apex counterpart, Cloudflare Pages preview builds
// and GitHub Codespaces.
export const wwwVariant = (uiUrl) => {
  try {
    const url = new URL(uiUrl);
    url.hostname = url.hostname.startsWith("www.")
      ? url.hostname.slice(4)
      : `www.${url.hostname}`;
    return url.origin;
  } catch {
    return null;
  }
};

export const resolveAllowedOrigin = (origin, uiUrl) => {
  if (!origin) return uiUrl;
  const allowed =
    origin === uiUrl ||
    origin === wwwVariant(uiUrl) ||
    /^https:\/\/([^.]+\.)?sradams-co-uk-content\.pages\.dev$/.test(origin) ||
    /^https:\/\/[a-z0-9][a-z0-9-]*-\d+\.app\.github\.dev$/i.test(origin);
  return allowed ? origin : uiUrl;
};
