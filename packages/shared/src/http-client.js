function parseJsonBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function errorMessageFromBody(data, fallback) {
  const err = data?.error;
  if (typeof err === "string") return err;
  if (err != null) return JSON.stringify(err);
  return fallback;
}

function resolveBaseUrl(baseUrl) {
  const raw = typeof baseUrl === "function" ? baseUrl() : baseUrl;
  return raw.replace(/\/$/, "");
}

/**
 * @param {{
 *   baseUrl: string | (() => string);
 *   getToken?: () => string | null;
 *   onUnauthorized?: (hadAuth: boolean) => void;
 * }} options
 */
export function createApiClient(options) {
  async function request(path, init = {}) {
    const base = resolveBaseUrl(options.baseUrl);
    const headers = {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    };
    const tok = options.getToken?.() ?? null;
    const hadAuth = !!tok;
    if (tok) headers.Authorization = `Bearer ${tok}`;

    const res = await fetch(`${base}${path}`, { ...init, headers });
    const data = parseJsonBody(await res.text());

    if (!res.ok) {
      if (res.status === 401 && hadAuth) {
        options.onUnauthorized?.(true);
        const e = new Error(errorMessageFromBody(data, "Unauthorized"));
        e.status = 401;
        e.sessionHandled = true;
        throw e;
      }
      const e = new Error(errorMessageFromBody(data, res.statusText));
      e.status = res.status;
      throw e;
    }
    return data;
  }

  return {
    request,
    get: (path, init) => request(path, init),
    post: (path, body, init) =>
      request(path, {
        ...init,
        method: "POST",
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
  };
}
