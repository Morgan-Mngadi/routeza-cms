type RedirectEntry = {
  fromPath?: string | null;
  toUrl?: string | null;
  statusCode?: string | null;
};

const RESERVED_PREFIXES = ['/admin', '/api', '/uploads', '/content-manager'];

const normalizePath = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return '/';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).pathname || '/';
    } catch {
      return trimmed;
    }
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const withoutQuery = withLeadingSlash.split('?')[0] || '/';

  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.slice(0, -1);
  }

  return withoutQuery || '/';
};

const withQueryString = (targetUrl: string, queryString: string) => {
  if (!queryString) {
    return targetUrl;
  }

  const separator = targetUrl.includes('?') ? '&' : '?';
  return `${targetUrl}${separator}${queryString}`;
};

const toHttpStatus = (statusCode?: string | null) =>
  statusCode === 'Redirecct-302' ? 302 : 301;

export default (_config: unknown, { strapi }: { strapi: any }) => {
  return async (ctx: any, next: () => Promise<void>) => {
    if (!['GET', 'HEAD'].includes(ctx.method)) {
      return next();
    }

    const requestPath = normalizePath(ctx.path);

    if (RESERVED_PREFIXES.some((prefix) => requestPath === prefix || requestPath.startsWith(`${prefix}/`))) {
      return next();
    }

    const candidates = Array.from(
      new Set([
        requestPath,
        requestPath === '/' ? requestPath : `${requestPath}/`,
      ]),
    );

    const matches = (await strapi.documents('api::redirect.redirect').findMany({
      filters: {
        fromPath: {
          $in: candidates,
        },
        isActive: true,
      },
      status: 'published',
      fields: ['fromPath', 'toUrl', 'statusCode'],
      limit: 1,
    })) as RedirectEntry[];

    const match = matches[0];
    const destination = match?.toUrl?.trim();

    if (!destination) {
      return next();
    }

    const destinationPath = /^https?:\/\//i.test(destination)
      ? normalizePath(destination)
      : normalizePath(destination.split('?')[0] || destination);

    if (destinationPath === requestPath) {
      return next();
    }

    ctx.status = toHttpStatus(match.statusCode);
    ctx.redirect(withQueryString(destination, ctx.request.querystring));
  };
};
