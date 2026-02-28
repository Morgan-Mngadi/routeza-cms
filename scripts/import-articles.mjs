#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const STRAPI_URL = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/+$/, "");
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;
const ARTICLE_TYPE = String(process.argv[2] || "").trim().toLowerCase(); // blog | news
const INPUT_PATH = process.argv[3];
const UPSERT_MODE = (process.env.ARTICLE_UPSERT_MODE || "update").toLowerCase(); // update | skip
const DRY_RUN = process.env.DRY_RUN === "true";
const FORCE_PUBLISH = process.env.FORCE_PUBLISH === "true";
const DEFAULT_COVER_IMAGE_ID = process.env.DEFAULT_COVER_IMAGE_ID;

const TYPE_CONFIG = {
  blog: {
    label: "blog posts",
    endpoint: "/api/blog-posts",
    bodyField: "content",
    summaryField: "excerpt",
  },
  news: {
    label: "news articles",
    endpoint: "/api/news-articles",
    bodyField: "content",
    summaryField: "summary",
  },
};

function assertConfig() {
  if (!ARTICLE_TYPE || !TYPE_CONFIG[ARTICLE_TYPE]) {
    throw new Error(
      "Missing/invalid article type. Usage: npm run import:blog -- ./scripts/blog.seed.json OR npm run import:news -- ./scripts/news.seed.json"
    );
  }
  if (!INPUT_PATH) {
    throw new Error(
      "Missing input file path. Usage: npm run import:blog -- ./scripts/blog.seed.json"
    );
  }
  if (!STRAPI_TOKEN) {
    throw new Error(
      "Missing STRAPI_TOKEN environment variable. Use a token with article and tag create/update permissions."
    );
  }
  if (!["update", "skip"].includes(UPSERT_MODE)) {
    throw new Error("ARTICLE_UPSERT_MODE must be either 'update' or 'skip'.");
  }
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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

  if (cell.length > 0 || row.length > 0) pushRow();
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

function normalizeDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function parseTags(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseEntityId(value) {
  if (value === undefined || value === null) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

function buildMetaDescription(value, fallback) {
  var minLength = 120;
  var maxLength = 155;

  var text = String(value ?? "").replace(/\s+/g, " ").trim();
  var fallbackText = String(fallback ?? "").replace(/\s+/g, " ").trim();

  if (text.length < minLength && fallbackText) {
    text = text ? (text + " " + fallbackText) : fallbackText;
    text = text.replace(/\s+/g, " ").trim();
  }

  if (text.length < minLength) {
    var padding = "Read the full article on Commute ZA for practical commuter insights and route-planning guidance across South Africa.";
    text = text ? (text + " " + padding) : padding;
    text = text.replace(/\s+/g, " ").trim();
  }

  if (text.length > maxLength) {
    text = text.slice(0, maxLength - 1).trimEnd() + "…";
  }

  return text;
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

function asAttributes(entry) {
  return entry?.attributes ?? entry ?? {};
}

function getEntryId(entry) {
  return entry?.documentId ?? entry?.id ?? null;
}

async function findExistingBySlug(endpoint, slug) {
  const params = new URLSearchParams();
  params.set("filters[slug][$eq]", slug);
  params.set("pagination[pageSize]", "1");
  const result = await strapiRequest(`${endpoint}?${params.toString()}`);
  return result?.data?.[0] || null;
}

async function findExistingTagBySlug(tagSlug) {
  const params = new URLSearchParams();
  params.set("filters[slug][$eq]", tagSlug);
  params.set("pagination[pageSize]", "1");
  const result = await strapiRequest(`/api/content-tags?${params.toString()}`);
  return result?.data?.[0] || null;
}

async function ensureTagIds(tagNames) {
  const ids = [];

  for (const nameRaw of tagNames) {
    const name = String(nameRaw ?? "").trim();
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;

    let existing = await findExistingTagBySlug(slug);
    if (!existing && !DRY_RUN) {
      const payload = {
        name,
        slug,
        ...(FORCE_PUBLISH ? { publishedAt: new Date().toISOString() } : {}),
      };
      const created = await strapiRequest("/api/content-tags", {
        method: "POST",
        body: JSON.stringify({ data: payload }),
      });
      existing = created?.data ?? null;
    }

    const id = existing?.id;
    if (id) ids.push(id);
  }

  return ids;
}

function mapRowToPayload(row, type, tagIds) {
  const config = TYPE_CONFIG[type];
  const title = String(row.title ?? "").trim();
  const slug = String(row.slug ?? "").trim() || slugify(title);
  const content = String(row.content ?? row.body ?? "");
  const summaryValue = String(
    row[config.summaryField] ?? row.excerpt ?? row.summary ?? row.description ?? ""
  ).trim();

  const metaTitle = String(row.metaTitle ?? title).trim();
  const metaDescriptionRaw = String(row.metaDescription ?? summaryValue).trim();
  const metaDescription = buildMetaDescription(
    metaDescriptionRaw,
    summaryValue || content || title
  );
  const canonicalUrl = String(row.canonicalUrl ?? "").trim();
  const noindex = parseBoolean(row.noindex, false);
  const schemaJson = safeJson(row.schemaJson, row.__line);

  const seoEntry = {
    ...(metaTitle ? { metaTitle } : {}),
    ...(metaDescription ? { metaDescription } : {}),
    ...(canonicalUrl ? { canonicalUrl } : {}),
    noindex,
    ...(schemaJson ? { schemaJson } : {}),
  };

  const payload = {
    title,
    slug,
    [config.bodyField]: content,
    ...(summaryValue ? { [config.summaryField]: summaryValue } : {}),
    seo: [seoEntry],
    ...(tagIds.length > 0 ? { tags: tagIds } : {}),
    ...(FORCE_PUBLISH ? { publishedAt: new Date().toISOString() } : {}),
  };

  const parsedDate = normalizeDate(row.publishDate ?? row.date);
  if (parsedDate) payload.publishDate = parsedDate;
  if (type === "news" && !payload.publishDate) {
    payload.publishDate = new Date().toISOString().slice(0, 10);
  }

  const coverImageId = parseEntityId(row.coverImageId ?? DEFAULT_COVER_IMAGE_ID);
  if (coverImageId !== undefined) {
    payload.coverImage = coverImageId;
  }

  return payload;
}

async function createEntry(endpoint, data) {
  return strapiRequest(endpoint, {
    method: "POST",
    body: JSON.stringify({ data }),
  });
}

async function updateEntry(endpoint, id, data) {
  return strapiRequest(`${endpoint}/${id}`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
}

async function run() {
  assertConfig();
  const config = TYPE_CONFIG[ARTICLE_TYPE];
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
    `Importing ${rows.length} ${config.label} from ${absolutePath} (mode=${UPSERT_MODE}, dryRun=${DRY_RUN}, forcePublish=${FORCE_PUBLISH})`,
  );

  const seenSlugs = new Set();

  for (const row of rows) {
    try {
      const title = String(row.title ?? "").trim();
      const slug = String(row.slug ?? "").trim() || slugify(title);
      if (!title || !slug) {
        failed += 1;
        console.error(`[line ${row.__line}] Missing required fields. title='${title}', slug='${slug}'`);
        continue;
      }

      if (seenSlugs.has(slug)) {
        failed += 1;
        console.error(`[line ${row.__line}] Duplicate slug in input: '${slug}'.`);
        continue;
      }
      seenSlugs.add(slug);

      const tagNames = parseTags(row.tags);
      const tagIds = await ensureTagIds(tagNames);
      const payload = mapRowToPayload(row, ARTICLE_TYPE, tagIds);

      const existing = await findExistingBySlug(config.endpoint, slug);
      if (existing) {
        if (UPSERT_MODE === "skip") {
          skipped += 1;
          console.log(`[skip] ${slug} already exists`);
          continue;
        }
        const entryId = getEntryId(existing);
        if (!entryId) {
          failed += 1;
          console.error(`[line ${row.__line}] Cannot update '${slug}': missing id/documentId.`);
          continue;
        }
        if (!DRY_RUN) {
          await updateEntry(config.endpoint, entryId, payload);
        }
        updated += 1;
        console.log(`[update] ${slug}`);
        continue;
      }

      if (!DRY_RUN) {
        await createEntry(config.endpoint, payload);
      }
      created += 1;
      console.log(`[create] ${slug}`);
    } catch (error) {
      failed += 1;
      console.error(`[line ${row.__line}] Failed '${row.title ?? ""}': ${error.message}`);
    }
  }

  console.log("\nDone.");
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  if (!DEFAULT_COVER_IMAGE_ID) {
    console.log("Note: If your content-type requires coverImage, set DEFAULT_COVER_IMAGE_ID or coverImageId per row.");
  }
}

run().catch((error) => {
  console.error(`Import failed: ${error.message}`);
  process.exit(1);
});
