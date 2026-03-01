#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const STRAPI_URL = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/+$/, "");
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;
const INPUT_PATH = process.argv[2] || "./scripts/pages.seed.json";
const DRY_RUN = process.env.DRY_RUN === "true";
const UPSERT_MODE = (process.env.PAGE_BLOCKS_UPSERT_MODE || "skip").toLowerCase(); // skip | create
const FORCE_PUBLISH = process.env.FORCE_PUBLISH === "true";
const CLEAR_LEGACY_CONTENT = process.env.CLEAR_LEGACY_CONTENT === "true";

function assertConfig() {
  if (!STRAPI_TOKEN) {
    throw new Error("Missing STRAPI_TOKEN environment variable.");
  }
  if (!["skip", "create"].includes(UPSERT_MODE)) {
    throw new Error("PAGE_BLOCKS_UPSERT_MODE must be 'skip' or 'create'.");
  }
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
      if (char === "\r" && next === "\n") i += 1;
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
    if (!hasAnyValue) continue;

    const rowData = {};
    headers.forEach((header, index) => {
      rowData[header] = cells[index] ?? "";
    });
    rowData.__line = dataLines[i] ?? i + 2;
    mapped.push(rowData);
  }

  return mapped;
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

function splitTextBlocks(content) {
  return String(content ?? "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function normalizeListLines(lines) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter(Boolean);
}

function convertContentToBlocks(content) {
  const blocks = splitTextBlocks(content);
  const dz = [];

  for (const block of blocks) {
    const heading = block.match(/^(#{1,4})\s+([\s\S]+)$/);
    if (heading) {
      const depth = heading[1].length;
      const level = depth === 1 ? "h1" : depth === 2 ? "h2" : depth === 3 ? "h3" : "h4";
      dz.push({
        __component: "page.section-heading",
        text: heading[2].trim(),
        level,
      });
      continue;
    }

    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const isUnorderedList = lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line));
    const isOrderedList = lines.length > 0 && lines.every((line) => /^\d+\.\s+/.test(line));

    if (isUnorderedList || isOrderedList) {
      const items = normalizeListLines(lines);
      if (items.length > 0) {
        dz.push({
          __component: "page.list",
          listStyle: isOrderedList ? "ordered" : "unordered",
          itemsText: items.map((item) => `- ${item}`).join("\n"),
        });
      }
      continue;
    }

    dz.push({
      __component: "page.rich-text",
      body: block,
    });
  }

  return dz;
}

async function run() {
  assertConfig();
  const { absolutePath, rows } = await parseInput(INPUT_PATH);

  if (!rows.length) {
    console.log("No rows found.");
    return;
  }

  let updated = 0;
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let emptyContent = 0;

  console.log(
    `Syncing page contentBlocks from ${absolutePath} (dryRun=${DRY_RUN}, upsert=${UPSERT_MODE}, forcePublish=${FORCE_PUBLISH}, clearLegacyContent=${CLEAR_LEGACY_CONTENT})`,
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

    if (!content.trim()) {
      emptyContent += 1;
      skipped += 1;
      console.log(`[skip] ${routePath} has no content to migrate`);
      continue;
    }

    const contentBlocks = convertContentToBlocks(content);

    try {
      const existing = await findPageByRoute(routePath);
      const payload = {
        contentBlocks,
        ...(CLEAR_LEGACY_CONTENT ? { content: "" } : {}),
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
        console.log(`[update] ${routePath} (${contentBlocks.length} blocks)`);
        continue;
      }

      if (UPSERT_MODE === "create") {
        const createPayload = {
          routePath,
          pageName,
          content,
          contentBlocks,
          isActive: true,
          ...(FORCE_PUBLISH ? { publishedAt: new Date().toISOString() } : {}),
        };
        if (!DRY_RUN) {
          await createPage(createPayload);
        }
        created += 1;
        console.log(`[create] ${routePath} (${contentBlocks.length} blocks)`);
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
  console.log(`No content rows: ${emptyContent}`);
}

run().catch((error) => {
  console.error(`Sync failed: ${error.message}`);
  process.exit(1);
});
