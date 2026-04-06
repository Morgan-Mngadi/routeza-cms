'use strict';

const WEBSITE_PURGE_URL = String(process.env.WEBSITE_PURGE_URL || '').trim();
const WEBSITE_PURGE_TOKEN = String(process.env.WEBSITE_PURGE_TOKEN || '').trim();

module.exports = {
  async purgeCache(ctx) {
    if (!WEBSITE_PURGE_URL) {
      return ctx.badRequest('WEBSITE_PURGE_URL is not configured.');
    }

    if (!WEBSITE_PURGE_TOKEN) {
      return ctx.badRequest('WEBSITE_PURGE_TOKEN is not configured.');
    }

    try {
      const response = await fetch(WEBSITE_PURGE_URL, {
        method: 'POST',
        headers: {
          'x-cache-purge-token': WEBSITE_PURGE_TOKEN,
        },
      });

      const payloadText = await response.text();
      let payload = null;
      try {
        payload = payloadText ? JSON.parse(payloadText) : null;
      } catch {
        payload = { raw: payloadText };
      }

      if (!response.ok) {
        ctx.status = response.status;
        ctx.body = {
          message: payload?.message || 'Website cache purge failed.',
          details: payload,
        };
        return;
      }

      ctx.body = {
        ok: true,
        ...payload,
      };
    } catch (error) {
      ctx.status = 502;
      ctx.body = {
        message: error instanceof Error ? error.message : 'Unable to reach website purge endpoint.',
      };
    }
  },
};
