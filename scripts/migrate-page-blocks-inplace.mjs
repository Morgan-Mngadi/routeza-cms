#!/usr/bin/env node

const STRAPI_URL = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/+$/, "");
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;
const DRY_RUN = process.env.DRY_RUN === "true";
const FORCE_PUBLISH = process.env.FORCE_PUBLISH === "true";
const CLEAR_LEGACY_CONTENT = process.env.CLEAR_LEGACY_CONTENT === "true";
const ONLY_WHEN_EMPTY_BLOCKS = String(process.env.ONLY_WHEN_EMPTY_BLOCKS ?? "true").toLowerCase() !== "false";
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 100);
const ROUTE_FILTER = String(process.env.ROUTE_PATH || process.argv[2] || "").trim();

function assertConfig() {
  if (!STRAPI_TOKEN) {
    throw new Error("Missing STRAPI_TOKEN environment variable.");
  }
  if (!Number.isFinite(PAGE_SIZE) || PAGE_SIZE < 1 || PAGE_SIZE > 100) {
    throw new Error("PAGE_SIZE must be a number between 1 and 100.");
  }
}

function normalizePath(pathname) {
  const trimmed = String(pathname ?? "").trim();
  if (!trimmed || trimmed === "/") return "/";
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.replace(/\/+$/, "");
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

function getAttributes(entry) {
  return entry?.attributes ?? entry ?? {};
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

async function fetchPagesPage(page) {
  const params = new URLSearchParams();
  params.set("pagination[page]", String(page));
  params.set("pagination[pageSize]", String(PAGE_SIZE));
  params.set("populate[0]", "contentBlocks");
  if (ROUTE_FILTER) {
    params.set("filters[routePath][$eq]", normalizePath(ROUTE_FILTER));
  }
  return strapiRequest(`/api/pages?${params.toString()}`);
}

async function fetchAllPages() {
  const rows = [];
  let page = 1;
  let pageCount = 1;

  while (page <= pageCount) {
    const payload = await fetchPagesPage(page);
    const data = Array.isArray(payload?.data) ? payload.data : [];
    const pagination = payload?.meta?.pagination ?? {};
    pageCount = Number(pagination?.pageCount ?? 1);
    rows.push(...data);
    page += 1;
  }

  return rows;
}

async function updatePage(id, data) {
  return strapiRequest(`/api/pages/${id}`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
}

async function run() {
  assertConfig();

  console.log(
    `Migrating existing Strapi pages content -> contentBlocks (dryRun=${DRY_RUN}, onlyWhenEmptyBlocks=${ONLY_WHEN_EMPTY_BLOCKS}, forcePublish=${FORCE_PUBLISH}, clearLegacyContent=${CLEAR_LEGACY_CONTENT}${ROUTE_FILTER ? `, routeFilter=${normalizePath(ROUTE_FILTER)}` : ""})`,
  );

  const pages = await fetchAllPages();
  if (!pages.length) {
    console.log("No matching pages found.");
    return;
  }

  let updated = 0;
  let skippedNoContent = 0;
  let skippedHasBlocks = 0;
  let skippedNoBlocksProduced = 0;
  let failed = 0;

  for (const entry of pages) {
    const attrs = getAttributes(entry);
    const id = getEntryId(entry);
    const routePath = normalizePath(attrs?.routePath ?? "/");
    const content = String(attrs?.content ?? "");
    const existingBlocks = Array.isArray(attrs?.contentBlocks) ? attrs.contentBlocks : [];

    if (!id) {
      failed += 1;
      console.error(`[fail] ${routePath}: missing id/documentId`);
      continue;
    }

    if (!content.trim()) {
      skippedNoContent += 1;
      console.log(`[skip] ${routePath}: no legacy content`);
      continue;
    }

    if (ONLY_WHEN_EMPTY_BLOCKS && existingBlocks.length > 0) {
      skippedHasBlocks += 1;
      console.log(`[skip] ${routePath}: contentBlocks already exist (${existingBlocks.length})`);
      continue;
    }

    const migratedBlocks = convertContentToBlocks(content);
    if (!migratedBlocks.length) {
      skippedNoBlocksProduced += 1;
      console.log(`[skip] ${routePath}: conversion produced no blocks`);
      continue;
    }

    const payload = {
      contentBlocks: migratedBlocks,
      ...(CLEAR_LEGACY_CONTENT ? { content: "" } : {}),
      ...(FORCE_PUBLISH ? { publishedAt: new Date().toISOString() } : {}),
    };

    try {
      if (!DRY_RUN) {
        await updatePage(id, payload);
      }
      updated += 1;
      console.log(`[update] ${routePath} (${migratedBlocks.length} blocks)`);
    } catch (error) {
      failed += 1;
      console.error(`[fail] ${routePath}: ${error.message}`);
    }
  }

  console.log("\nDone.");
  console.log(`Pages scanned: ${pages.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (no legacy content): ${skippedNoContent}`);
  console.log(`Skipped (already has blocks): ${skippedHasBlocks}`);
  console.log(`Skipped (no blocks produced): ${skippedNoBlocksProduced}`);
  console.log(`Failed: ${failed}`);
}

run().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
});
