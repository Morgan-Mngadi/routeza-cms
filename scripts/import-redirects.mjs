#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const STRAPI_URL = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/+$/, "");
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;
const CSV_PATH = process.argv[2];
const UPSERT_MODE = (process.env.REDIRECT_UPSERT_MODE || "update").toLowerCase(); // update | skip
const DRY_RUN = process.env.DRY_RUN === "true";
const FORCE_PUBLISH = process.env.FORCE_PUBLISH === "true";

const STATUS_MAP = {
  "301": "Redirect-301",
  "302": "Redirecct-302",
  "redirect-301": "Redirect-301",
  "redirecct-302": "Redirecct-302",
  "redirect-302": "Redirecct-302",
};

function assertConfig() {
  if (!CSV_PATH) {
    throw new Error(
      "Missing CSV path. Usage: npm run import:redirects -- ./redirects.csv"
    );
  }
  if (!STRAPI_TOKEN) {
    throw new Error(
      "Missing STRAPI_TOKEN environment variable. Set it to a Strapi token with redirect create/update permissions."
    );
  }
  if (!["update", "skip"].includes(UPSERT_MODE)) {
    throw new Error("REDIRECT_UPSERT_MODE must be either 'update' or 'skip'.");
  }
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function toStatusCode(value) {
  if (!value) return "Redirect-301";
  const normalized = String(value).trim().toLowerCase();
  return STATUS_MAP[normalized] || "Redirect-301";
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((header, i) => {
      row[header] = cells[i] ?? "";
    });
    row.__line = index + 2;
    return row;
  });
}

function normalisePath(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
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

async function findExistingByFromPath(fromPath) {
  const params = new URLSearchParams();
  params.set("filters[fromPath][$eq]", fromPath);
  params.set("pagination[pageSize]", "1");
  const result = await strapiRequest(`/api/redirects?${params.toString()}`);
  return result?.data?.[0] || null;
}

async function createRedirect(data) {
  return strapiRequest("/api/redirects", {
    method: "POST",
    body: JSON.stringify({ data }),
  });
}

async function updateRedirect(id, data) {
  return strapiRequest(`/api/redirects/${id}`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
}

async function run() {
  assertConfig();

  const absoluteCsvPath = path.resolve(process.cwd(), CSV_PATH);
  const fileContent = await fs.readFile(absoluteCsvPath, "utf8");
  const rows = parseCsv(fileContent);

  if (rows.length === 0) {
    console.log("No CSV rows found. Ensure the file has a header and at least 1 row.");
    return;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  console.log(
    `Importing ${rows.length} redirects from ${absoluteCsvPath} (mode=${UPSERT_MODE}, dryRun=${DRY_RUN})`
  );

  for (const row of rows) {
    const fromPath = normalisePath(row.fromPath);
    const toUrl = (row.toUrl || "").trim();

    if (!fromPath || !toUrl) {
      failed += 1;
      console.error(
        `[line ${row.__line}] Missing required fields. fromPath='${fromPath}', toUrl='${toUrl}'`
      );
      continue;
    }

    const payload = {
      fromPath,
      toUrl,
      statusCode: toStatusCode(row.statusCode),
      isActive: parseBoolean(row.isActive, true),
      notes: (row.notes || "").trim() || null,
    };

    if (FORCE_PUBLISH) {
      payload.publishedAt = new Date().toISOString();
    }

    try {
      const existing = await findExistingByFromPath(fromPath);

      if (existing) {
        if (UPSERT_MODE === "skip") {
          skipped += 1;
          console.log(`[skip] ${fromPath} already exists`);
          continue;
        }

        const entryId = getEntryId(existing);
        if (!entryId) {
          failed += 1;
          console.error(`[line ${row.__line}] Cannot update '${fromPath}' because id/documentId is missing.`);
          continue;
        }

        if (!DRY_RUN) {
          await updateRedirect(entryId, payload);
        }
        updated += 1;
        console.log(`[update] ${fromPath} -> ${toUrl}`);
        continue;
      }

      if (!DRY_RUN) {
        await createRedirect(payload);
      }
      created += 1;
      console.log(`[create] ${fromPath} -> ${toUrl}`);
    } catch (error) {
      failed += 1;
      console.error(`[line ${row.__line}] Failed '${fromPath}': ${error.message}`);
    }
  }

  console.log("\nDone.");
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

run().catch((error) => {
  console.error(`Import failed: ${error.message}`);
  process.exit(1);
});
