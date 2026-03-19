'use strict';

const STATUS_MAP = {
  '301': 'Redirect-301',
  '302': 'Redirecct-302',
  'redirect-301': 'Redirect-301',
  'redirecct-302': 'Redirecct-302',
  'redirect-302': 'Redirecct-302',
};

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

function toStatusCode(value) {
  if (!value) return 'Redirect-301';
  const normalized = String(value).trim().toLowerCase();
  return STATUS_MAP[normalized] || 'Redirect-301';
}

function normalizePath(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());

  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((header, cellIndex) => {
      row[header] = cells[cellIndex] ?? '';
    });
    row.__line = index + 2;
    return row;
  });
}

module.exports = {
  async importCsv(ctx) {
    const { csvText, upsertMode = 'update', forcePublish = false } = ctx.request.body ?? {};

    if (!csvText || !String(csvText).trim()) {
      return ctx.badRequest('csvText is required.');
    }

    if (!['update', 'skip'].includes(String(upsertMode))) {
      return ctx.badRequest("upsertMode must be either 'update' or 'skip'.");
    }

    const rows = parseCsv(csvText);
    if (rows.length === 0) {
      return ctx.badRequest('No CSV rows found. Include a header row and at least one redirect row.');
    }

    const results = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      const fromPath = normalizePath(row.fromPath);
      const toUrl = String(row.toUrl ?? '').trim();
      const payload = {
        fromPath,
        toUrl,
        statusCode: toStatusCode(row.statusCode),
        isActive: parseBoolean(row.isActive, true),
        notes: String(row.notes ?? '').trim() || null,
      };

      const resultRow = {
        line: row.__line,
        fromPath,
        toUrl,
        statusCode: payload.statusCode,
        isActive: payload.isActive,
        notes: payload.notes,
        action: 'none',
        error: null,
      };

      if (!fromPath || !toUrl) {
        failed += 1;
        resultRow.action = 'failed';
        resultRow.error = 'Missing required fromPath or toUrl.';
        results.push(resultRow);
        continue;
      }

      try {
        const existing = await strapi.documents('api::redirect.redirect').findMany({
          filters: { fromPath },
          limit: 1,
          status: 'draft',
        });

        if (existing.length > 0) {
          if (upsertMode === 'skip') {
            skipped += 1;
            resultRow.action = 'skipped';
            results.push(resultRow);
            continue;
          }

          await strapi.documents('api::redirect.redirect').update({
            documentId: existing[0].documentId,
            data: payload,
            ...(forcePublish ? { status: 'published' } : {}),
          });
          updated += 1;
          resultRow.action = 'updated';
          results.push(resultRow);
          continue;
        }

        await strapi.documents('api::redirect.redirect').create({
          data: payload,
          ...(forcePublish ? { status: 'published' } : {}),
        });
        created += 1;
        resultRow.action = 'created';
        results.push(resultRow);
      } catch (error) {
        failed += 1;
        resultRow.action = 'failed';
        resultRow.error = error instanceof Error ? error.message : 'Unknown error';
        results.push(resultRow);
      }
    }

    ctx.body = {
      summary: {
        total: rows.length,
        created,
        updated,
        skipped,
        failed,
      },
      results,
    };
  },
};
