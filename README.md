# 🚀 Getting started with Strapi

Strapi comes with a full featured [Command Line Interface](https://docs.strapi.io/dev-docs/cli) (CLI) which lets you scaffold and manage your project in seconds.

### `develop`

Start your Strapi application with autoReload enabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-develop)

```
npm run develop
# or
yarn develop
```

### `start`

Start your Strapi application with autoReload disabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-start)

```
npm run start
# or
yarn start
```

### `build`

Build your admin panel. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-build)

```
npm run build
# or
yarn build
```

### `import:redirects`

Bulk import redirects from CSV into the `redirects` collection type.

1. Create a CSV file:

```csv
fromPath,toUrl,statusCode,isActive,notes
/old-page,/new-page,301,true,legacy route
/old-news,/news/new-article,302,true,temp redirect
```

2. Run import:

```bash
STRAPI_URL=http://localhost:1337 \
STRAPI_TOKEN=your_strapi_token \
npm run import:redirects -- ./redirects.csv
```

Options:
- `REDIRECT_UPSERT_MODE=update|skip` (default: `update`)
- `DRY_RUN=true` to validate only, without writing
- `FORCE_PUBLISH=true` to set `publishedAt` during import

### `import:blog`

Bulk import blog posts from JSON or CSV into the `blog-posts` collection type.

```bash
STRAPI_URL=http://localhost:1337 \
STRAPI_TOKEN=your_strapi_token \
DEFAULT_COVER_IMAGE_ID=1 \
npm run import:blog -- ./scripts/blog.seed.json
```

### `import:news`

Bulk import news articles from JSON or CSV into the `news-articles` collection type.

```bash
STRAPI_URL=http://localhost:1337 \
STRAPI_TOKEN=your_strapi_token \
DEFAULT_COVER_IMAGE_ID=1 \
npm run import:news -- ./scripts/news.seed.json
```

Shared options for blog/news imports:
- `ARTICLE_UPSERT_MODE=update|skip` (default: `update`)
- `DRY_RUN=true` to validate only
- `FORCE_PUBLISH=true` to publish on import
- `DEFAULT_COVER_IMAGE_ID=...` if cover image is required

### `sync:page-content`

Update only the `content` field for existing `pages` entries by matching `routePath`.

```bash
STRAPI_URL=http://localhost:1337 \
STRAPI_TOKEN=your_strapi_token \
DRY_RUN=true \
npm run sync:page-content -- ./scripts/pages.seed.json
```

Options:
- `PAGE_CONTENT_UPSERT_MODE=skip|create` (default: `skip`)
- `FORCE_PUBLISH=true` to republish while updating content

### `import:pages`

Bulk import page entries from JSON or CSV into the `pages` collection type.

Recommended first run (creates drafts unless already published):

```bash
STRAPI_URL=http://localhost:1337 \
STRAPI_TOKEN=your_strapi_token \
npm run import:pages -- ./scripts/pages.seed.json
```

CSV header format:

```csv
routePath,pageName,content,isActive,metaTitle,metaDescription,canonicalUrl,noindex,schemaJson
/,Home,,true,Journey Planner for South Africa | Commute ZA,Plan train bus taxi...,https://route-finder-sa.onrender.com/,false,"{""@context"":""https://schema.org""}"
```

Options:
- `PAGE_UPSERT_MODE=update|skip` (default: `update`)
- `DRY_RUN=true` to validate only
- `FORCE_PUBLISH=true` to publish on import

## ⚙️ Deployment

Strapi gives you many possible deployment options for your project including [Strapi Cloud](https://cloud.strapi.io). Browse the [deployment section of the documentation](https://docs.strapi.io/dev-docs/deployment) to find the best solution for your use case.

```
yarn strapi deploy
```

## 📚 Learn more

- [Resource center](https://strapi.io/resource-center) - Strapi resource center.
- [Strapi documentation](https://docs.strapi.io) - Official Strapi documentation.
- [Strapi tutorials](https://strapi.io/tutorials) - List of tutorials made by the core team and the community.
- [Strapi blog](https://strapi.io/blog) - Official Strapi blog containing articles made by the Strapi team and the community.
- [Changelog](https://strapi.io/changelog) - Find out about the Strapi product updates, new features and general improvements.

Feel free to check out the [Strapi GitHub repository](https://github.com/strapi/strapi). Your feedback and contributions are welcome!

## ✨ Community

- [Discord](https://discord.strapi.io) - Come chat with the Strapi community including the core team.
- [Forum](https://forum.strapi.io/) - Place to discuss, ask questions and find answers, show your Strapi project and get feedback or just talk with other Community members.
- [Awesome Strapi](https://github.com/strapi/awesome-strapi) - A curated list of awesome things related to Strapi.

---

<sub>🤫 Psst! [Strapi is hiring](https://strapi.io/careers).</sub>

### `pages` content blocks (new)

The `pages` content type now supports a dynamic zone called `contentBlocks` so content can be managed in CMS while layout/styling stays in frontend code.

Available block components:
- `page.section-heading` (`text`, `level`)
- `page.rich-text` (`body`)
- `page.list` (`title`, `listStyle`, `itemsText`)
- `page.callout` (`title`, `body`, `tone`)
- `page.cta` (`title`, `body`, `buttonLabel`, `buttonHref`)
- `shared.pull-quote` (`text`, `author`, `role`)

After adding/changing Strapi schema files, restart Strapi:

```bash
npm run develop
# or restart your deployed service
```

### `sync:page-blocks`

Convert existing `pages` text `content` into dynamic-zone `contentBlocks` and update existing entries by `routePath`.

```bash
STRAPI_URL=http://localhost:1337 \
STRAPI_TOKEN=your_strapi_token \
DRY_RUN=true \
npm run sync:page-blocks -- ./scripts/pages.seed.json
```

Options:
- `PAGE_BLOCKS_UPSERT_MODE=skip|create` (default: `skip`)
- `FORCE_PUBLISH=true` to republish while updating blocks
- `CLEAR_LEGACY_CONTENT=true` to clear old `content` text after migrating to blocks

### `migrate:page-blocks`

Convert existing `pages.content` in Strapi into `contentBlocks` in-place (no seed file required).

Safe default behavior:
- scans existing pages from Strapi
- skips pages that already have `contentBlocks`
- skips pages with empty legacy `content`

```bash
STRAPI_URL=http://localhost:1337 \
STRAPI_TOKEN=your_strapi_token \
DRY_RUN=true \
npm run migrate:page-blocks
```

Target a single route:

```bash
STRAPI_URL=http://localhost:1337 \
STRAPI_TOKEN=your_strapi_token \
DRY_RUN=true \
ROUTE_PATH=/ai-planner \
npm run migrate:page-blocks
```

Options:
- `ONLY_WHEN_EMPTY_BLOCKS=false` to overwrite existing `contentBlocks`
- `FORCE_PUBLISH=true` to republish while migrating
- `CLEAR_LEGACY_CONTENT=true` to clear old `content` text after migration
- `PAGE_SIZE=1..100` to tune pagination size (default `100`)

### `migrate:blog-blocks` and `migrate:news-blocks`

Convert existing article `content` in Strapi into `contentBlocks` in-place.

Dry run examples:

```bash
STRAPI_URL=http://localhost:1337 \
STRAPI_TOKEN=your_strapi_token \
DRY_RUN=true \
npm run migrate:blog-blocks

STRAPI_URL=http://localhost:1337 \
STRAPI_TOKEN=your_strapi_token \
DRY_RUN=true \
npm run migrate:news-blocks
```

Target a single article by slug:

```bash
STRAPI_URL=http://localhost:1337 \
STRAPI_TOKEN=your_strapi_token \
DRY_RUN=true \
SLUG=top-5-hidden-gems-accessible-by-train \
npm run migrate:blog-blocks
```

Options:
- `ONLY_WHEN_EMPTY_BLOCKS=false` to overwrite existing blocks
- `FORCE_PUBLISH=true` to republish while migrating
- `CLEAR_LEGACY_CONTENT=true` to clear old `content` field
- `PAGE_SIZE=1..100` to tune pagination size (default `100`)
