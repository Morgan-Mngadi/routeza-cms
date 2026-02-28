#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const STRAPI_URL = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/+$/, "");
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;
const INPUT_PATH = process.argv[2];
const UPSERT_MODE = (process.env.PAGE_UPSERT_MODE || "update").toLowerCase(); // update | skip
const DRY_RUN = process.env.DRY_RUN === "true";
const FORCE_PUBLISH = process.env.FORCE_PUBLISH === "true";
const FORCE_UNPUBLISH = process.env.FORCE_UNPUBLISH === "true";

function assertConfig() {
  if (!INPUT_PATH) {
    throw new Error(
      "Missing input file path. Usage: npm run import:pages -- ./scripts/pages.seed.json"
    );
  }
  if (!STRAPI_TOKEN) {
    throw new Error(
      "Missing STRAPI_TOKEN environment variable. Use a token with page create/update permissions."
    );
  }
  if (!["update", "skip"].includes(UPSERT_MODE)) {
    throw new Error("PAGE_UPSERT_MODE must be either 'update' or 'skip'.");
  }
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function normalizePath(pathname) {
  const trimmed = String(pathname ?? "").trim();
  if (!trimmed || trimmed === "/") return "/";
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.replace(/\/+$/, "");
}

function parseCsv(text) {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const records = [];
  const recordStartLines = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };

  const pushRow = () => {
    pushCell();
    records.push(row);
    recordStartLines.push(rowStartLine);
    row = [];
    rowStartLine = line;
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      pushCell();
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      pushRow();
      line += 1;
      rowStartLine = line;
      continue;
    }

    cell += char;
  }

  if (inQuotes) {
    throw new Error("Invalid CSV: unmatched quote in input file.");
  }

  // Flush final row unless it's a trailing empty line.
  if (cell.length > 0 || row.length > 0) {
    pushRow();
  }

  if (records.length < 2) return [];

  const headers = records[0].map((h) => String(h ?? "").trim());
  const dataRows = records.slice(1);
  const dataLines = recordStartLines.slice(1);

  const mapped = [];
  for (let i = 0; i < dataRows.length; i += 1) {
    const cells = dataRows[i];
    const hasAnyValue = cells.some((value) => String(value ?? "").trim() !== "");
    if (!hasAnyValue) {
      continue;
    }

    const rowData = {};
    headers.forEach((header, index) => {
      rowData[header] = cells[index] ?? "";
    });
    rowData.__line = dataLines[i] ?? i + 2;
    mapped.push(rowData);
  }

  return mapped;
}

function safeJson(value, lineNumber) {
  if (!value) return undefined;
  if (typeof value === "object") return value;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`[line ${lineNumber}] Invalid schemaJson JSON.`);
  }
}

async function parseInput(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const ext = path.extname(absolutePath).toLowerCase();

  let rows = [];
  if (ext === ".json") {
    const parsed = JSON.parse(raw);
    rows = Array.isArray(parsed) ? parsed : [];
    rows = rows.map((row, index) => ({ ...row, __line: index + 1 }));
  } else if (ext === ".csv") {
    rows = parseCsv(raw);
  } else {
    throw new Error("Unsupported file format. Use .json or .csv");
  }

  return { absolutePath, rows };
}

async function strapiRequest(endpoint, options = {}) {
  const response = await fetch(`${STRAPI_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${STRAPI_TOKEN}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText} :: ${body}`);
  }

  return response.json();
}

function getEntryId(entry) {
  return entry?.documentId ?? entry?.id ?? null;
}

async function findExistingByRoute(routePath) {
  const params = new URLSearchParams();
  params.set("filters[routePath][$eq]", routePath);
  params.set("pagination[pageSize]", "1");
  const result = await strapiRequest(`/api/pages?${params.toString()}`);
  return result?.data?.[0] || null;
}

function mapRowToPayload(row) {
  const routePath = normalizePath(row.routePath);
  const pageName = String(row.pageName ?? "").trim();

  const metaTitle = String(row.metaTitle ?? "").trim();
  const metaDescription = String(row.metaDescription ?? "").trim();
  const canonicalUrl = String(row.canonicalUrl ?? "").trim();
  const noindex = parseBoolean(row.noindex, false);
  const schemaJson = safeJson(row.schemaJson, row.__line);

  const seo =
    metaTitle || metaDescription || canonicalUrl || schemaJson || noindex
      ? {
          ...(metaTitle ? { metaTitle } : {}),
          ...(metaDescription ? { metaDescription } : {}),
          ...(canonicalUrl ? { canonicalUrl } : {}),
          noindex,
          ...(schemaJson ? { schemaJson } : {}),
        }
      : undefined;

  const shouldUnpublish = FORCE_UNPUBLISH || parseBoolean(row.unpublish, false);

  return {
    routePath,
    pageName,
    // Keep page content exactly as provided to avoid changing layout copy formatting.
    content: String(row.content ?? ""),
    isActive: parseBoolean(row.isActive, true),
    ...(seo ? { seo } : {}),
    ...(FORCE_PUBLISH
      ? { publishedAt: new Date().toISOString() }
      : shouldUnpublish
        ? { publishedAt: null }
        : {}),
  };
}

async function createPage(data) {
  return strapiRequest("/api/pages", {
    method: "POST",
    body: JSON.stringify({ data }),
  });
}

async function updatePage(id, data) {
  return strapiRequest(`/api/pages/${id}`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
}

async function run() {
  assertConfig();
  const { absolutePath, rows } = await parseInput(INPUT_PATH);

  if (!rows.length) {
    console.log("No rows found in input file.");
    return;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  console.log(
    `Importing ${rows.length} pages from ${absolutePath} (mode=${UPSERT_MODE}, dryRun=${DRY_RUN}, forcePublish=${FORCE_PUBLISH})`,
  );

  const seenRoutes = new Set();

  for (const row of rows) {
    try {
      const payload = mapRowToPayload(row);
      const routePath = payload.routePath;

      if (!routePath || !payload.pageName) {
        failed += 1;
        console.error(
          `[line ${row.__line}] Missing required fields. routePath='${routePath}', pageName='${payload.pageName}'`,
        );
        continue;
      }

      if (seenRoutes.has(routePath)) {
        failed += 1;
        console.error(`[line ${row.__line}] Duplicate routePath in input: '${routePath}'.`);
        continue;
      }
      seenRoutes.add(routePath);

      const existing = await findExistingByRoute(routePath);
      if (existing) {
        if (UPSERT_MODE === "skip") {
          skipped += 1;
          console.log(`[skip] ${routePath} already exists`);
          continue;
        }
        const entryId = getEntryId(existing);
        if (!entryId) {
          failed += 1;
          console.error(`[line ${row.__line}] Cannot update '${routePath}': missing id/documentId.`);
          continue;
        }
        if (!DRY_RUN) {
          await updatePage(entryId, payload);
        }
        updated += 1;
        console.log(`[update] ${routePath}`);
        continue;
      }

      if (!DRY_RUN) {
        await createPage(payload);
      }
      created += 1;
      console.log(`[create] ${routePath}`);
    } catch (error) {
      failed += 1;
      console.error(`[line ${row.__line}] Failed '${row.routePath ?? ""}': ${error.message}`);
    }
  }

  console.log("\nDone.");
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  if (!FORCE_PUBLISH) {
    console.log("Entries were created/updated as drafts unless previously published in Strapi.");
  }
}

run().catch((error) => {
  console.error(`Import failed: ${error.message}`);
  process.exit(1);
});
