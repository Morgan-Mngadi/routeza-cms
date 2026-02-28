#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const STRAPI_URL = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/+$/, "");
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;
const INPUT_PATH = process.argv[2] || "./scripts/pages.seed.json";
const DRY_RUN = process.env.DRY_RUN === "true";
const UPSERT_MODE = (process.env.PAGE_CONTENT_UPSERT_MODE || "skip").toLowerCase(); // skip | create
const FORCE_PUBLISH = process.env.FORCE_PUBLISH === "true";

function assertConfig() {
  if (!STRAPI_TOKEN) {
    throw new Error("Missing STRAPI_TOKEN environment variable.");
  }
  if (!["skip", "create"].includes(UPSERT_MODE)) {
    throw new Error("PAGE_CONTENT_UPSERT_MODE must be 'skip' or 'create'.");
  }
}

function normalizePath(pathname) {
  const trimmed = String(pathname ?? "").trim();
  if (!trimmed || trimmed === "/") return "/";
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.replace(/\/+$/, "");
}

async function readRows(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed) ? parsed : [];
  return {
    absolutePath,
    rows: rows.map((row, index) => ({ ...row, __line: index + 1 })),
  };
}

async function strapiRequest(endpoint, options = {}) {
  const res = await fetch(`${STRAPI_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${STRAPI_TOKEN}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText} :: ${body}`);
  }

  return res.json();
}

function getEntryId(entry) {
  return entry?.documentId ?? entry?.id ?? null;
}

async function findPageByRoute(routePath) {
  const params = new URLSearchParams();
  params.set("filters[routePath][$eq]", routePath);
  params.set("pagination[pageSize]", "1");
  const result = await strapiRequest(`/api/pages?${params.toString()}`);
  return result?.data?.[0] || null;
}

async function updatePage(id, data) {
  return strapiRequest(`/api/pages/${id}`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
}

async function createPage(data) {
  return strapiRequest("/api/pages", {
    method: "POST",
    body: JSON.stringify({ data }),
  });
}

async function run() {
  assertConfig();
  const { absolutePath, rows } = await readRows(INPUT_PATH);

  if (!rows.length) {
    console.log("No rows found.");
    return;
  }

  let updated = 0;
  let created = 0;
  let skipped = 0;
  let failed = 0;

  console.log(
    `Syncing page content from ${absolutePath} (dryRun=${DRY_RUN}, upsert=${UPSERT_MODE}, forcePublish=${FORCE_PUBLISH})`,
  );

  for (const row of rows) {
    const routePath = normalizePath(row.routePath);
    const pageName = String(row.pageName ?? "").trim() || routePath;
    const content = String(row.content ?? "");

    if (!routePath) {
      failed += 1;
      console.error(`[line ${row.__line}] Missing routePath.`);
      continue;
    }

    try {
      const existing = await findPageByRoute(routePath);
      const payload = {
        content,
        ...(FORCE_PUBLISH ? { publishedAt: new Date().toISOString() } : {}),
      };

      if (existing) {
        const id = getEntryId(existing);
        if (!id) {
          failed += 1;
          console.error(`[line ${row.__line}] Missing id/documentId for '${routePath}'.`);
          continue;
        }
        if (!DRY_RUN) {
          await updatePage(id, payload);
        }
        updated += 1;
        console.log(`[update] ${routePath}`);
        continue;
      }

      if (UPSERT_MODE === "create") {
        const createPayload = {
          routePath,
          pageName,
          content,
          isActive: true,
          ...(FORCE_PUBLISH ? { publishedAt: new Date().toISOString() } : {}),
        };
        if (!DRY_RUN) {
          await createPage(createPayload);
        }
        created += 1;
        console.log(`[create] ${routePath}`);
      } else {
        skipped += 1;
        console.log(`[skip] ${routePath} does not exist`);
      }
    } catch (error) {
      failed += 1;
      console.error(`[line ${row.__line}] Failed '${routePath}': ${error.message}`);
    }
  }

  console.log("\nDone.");
  console.log(`Updated: ${updated}`);
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

run().catch((error) => {
  console.error(`Sync failed: ${error.message}`);
  process.exit(1);
});
