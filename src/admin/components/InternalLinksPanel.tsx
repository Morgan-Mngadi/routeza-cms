import { useEffect, useMemo, useState } from 'react';
import type { PanelComponent } from '@strapi/content-manager/strapi-admin';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';

type SourceType = 'Page' | 'SEO Page' | 'Blog Post' | 'News Article';

type InternalLinkItem = {
  id: string;
  label: string;
  path: string;
  source: SourceType;
  searchText: string;
};

type ContentManagerListResponse = {
  results?: Array<Record<string, unknown>>;
  pagination?: {
    page?: number;
    pageCount?: number;
  };
};

const INTERNAL_LINK_SOURCES = [
  {
    uid: 'api::page.page',
    source: 'Page' as const,
    getLabel: (entry: Record<string, unknown>) => String(entry.pageName ?? entry.routePath ?? '').trim(),
    getPath: (entry: Record<string, unknown>) => normalizePath(entry.routePath),
  },
  {
    uid: 'api::seo-page.seo-page',
    source: 'SEO Page' as const,
    getLabel: (entry: Record<string, unknown>) => String(entry.pageName ?? entry.routePath ?? '').trim(),
    getPath: (entry: Record<string, unknown>) => normalizePath(entry.routePath),
  },
  {
    uid: 'api::blog-post.blog-post',
    source: 'Blog Post' as const,
    getLabel: (entry: Record<string, unknown>) => String(entry.title ?? entry.slug ?? '').trim(),
    getPath: (entry: Record<string, unknown>) => buildArticlePath('/blog', entry.slug),
  },
  {
    uid: 'api::news-article.news-article',
    source: 'News Article' as const,
    getLabel: (entry: Record<string, unknown>) => String(entry.title ?? entry.slug ?? '').trim(),
    getPath: (entry: Record<string, unknown>) => buildArticlePath('/news', entry.slug),
  },
];

function normalizePath(value: unknown) {
  const path = String(value ?? '').trim();

  if (!path) return '';
  if (path === '/') return '/';

  return path.startsWith('/') ? path : `/${path}`;
}

function buildArticlePath(prefix: string, slug: unknown) {
  const normalizedSlug = String(slug ?? '').trim().replace(/^\/+/, '');

  if (!normalizedSlug) return '';

  return `${prefix}/${normalizedSlug}`;
}

function escapeMarkdownLabel(value: string) {
  return value.replace(/[[\]]/g, '\\$&');
}

async function copyToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

async function fetchAllEntries(
  get: ReturnType<typeof useFetchClient>['get'],
  model: string,
): Promise<Array<Record<string, unknown>>> {
  const results: Array<Record<string, unknown>> = [];
  let page = 1;
  let pageCount = 1;

  while (page <= pageCount) {
    const response = await get<ContentManagerListResponse>(`/content-manager/collection-types/${model}`, {
      params: {
        page,
        pageSize: 100,
      },
    });

    results.push(...(response.data.results ?? []));
    pageCount = Number(response.data.pagination?.pageCount ?? 1);
    page += 1;
  }

  return results;
}

function InternalLinksPanelContent() {
  const { get } = useFetchClient();
  const { toggleNotification } = useNotification();

  const [entries, setEntries] = useState<InternalLinkItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | SourceType>('all');
  const [linkText, setLinkText] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadEntries = async () => {
      setIsLoading(true);

      try {
        const results = await Promise.all(
          INTERNAL_LINK_SOURCES.map(async (sourceConfig) => {
            const sourceEntries = await fetchAllEntries(get, sourceConfig.uid);

            return sourceEntries
              .map((entry) => {
                const label = sourceConfig.getLabel(entry);
                const path = sourceConfig.getPath(entry);
                const entryId = String(entry.documentId ?? entry.id ?? `${sourceConfig.uid}:${path}`);

                if (!label || !path) return null;

                return {
                  id: `${sourceConfig.uid}:${entryId}`,
                  label,
                  path,
                  source: sourceConfig.source,
                  searchText: `${label} ${path} ${sourceConfig.source}`.toLowerCase(),
                } satisfies InternalLinkItem;
              })
              .filter((entry): entry is InternalLinkItem => entry !== null);
          }),
        );

        if (!isMounted) return;

        setEntries(
          results
            .flat()
            .sort((left, right) => left.label.localeCompare(right.label) || left.path.localeCompare(right.path)),
        );
      } catch (error) {
        if (!isMounted) return;

        toggleNotification({
          type: 'danger',
          message: 'Could not load internal links for the editor helper.',
        });
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadEntries();

    return () => {
      isMounted = false;
    };
  }, [get, toggleNotification]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return entries
      .filter((entry) => (sourceFilter === 'all' ? true : entry.source === sourceFilter))
      .filter((entry) => (normalizedSearch ? entry.searchText.includes(normalizedSearch) : true))
      .slice(0, 30);
  }, [entries, search, sourceFilter]);

  const copyPath = async (path: string) => {
    await copyToClipboard(path);
    toggleNotification({
      type: 'success',
      message: `Copied ${path}`,
    });
  };

  const copyMarkdownLink = async (entry: InternalLinkItem) => {
    const text = escapeMarkdownLabel(linkText.trim() || entry.label);
    const snippet = `[${text}](${entry.path})`;

    await copyToClipboard(snippet);
    toggleNotification({
      type: 'success',
      message: 'Copied markdown link snippet.',
    });
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#5d5d6f' }}>
        Search internal destinations and copy either the page path or a markdown link you can paste
        into the editor.
      </p>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#32324d' }}>Search</span>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a page, blog post, news article, or path"
          style={{
            width: '100%',
            border: '1px solid #dcdce4',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
          }}
        />
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#32324d' }}>Link text override</span>
        <input
          type="text"
          value={linkText}
          onChange={(event) => setLinkText(event.target.value)}
          placeholder="Optional. Leave blank to use the entry title"
          style={{
            width: '100%',
            border: '1px solid #dcdce4',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
          }}
        />
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#32324d' }}>Filter</span>
        <select
          value={sourceFilter}
          onChange={(event) => setSourceFilter(event.target.value as 'all' | SourceType)}
          style={{
            width: '100%',
            border: '1px solid #dcdce4',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
            background: '#fff',
          }}
        >
          <option value="all">All content</option>
          <option value="Page">Pages</option>
          <option value="SEO Page">SEO pages</option>
          <option value="Blog Post">Blog posts</option>
          <option value="News Article">News articles</option>
        </select>
      </label>

      <div
        style={{
          display: 'grid',
          gap: 8,
          maxHeight: 420,
          overflowY: 'auto',
          paddingRight: 4,
        }}
      >
        {isLoading ? (
          <div style={{ fontSize: 13, color: '#666687' }}>Loading internal links...</div>
        ) : null}

        {!isLoading && filteredEntries.length === 0 ? (
          <div
            style={{
              border: '1px dashed #dcdce4',
              borderRadius: 10,
              padding: 14,
              fontSize: 13,
              color: '#666687',
            }}
          >
            No matching internal links found.
          </div>
        ) : null}

        {!isLoading
          ? filteredEntries.map((entry) => (
              <article
                key={entry.id}
                style={{
                  border: '1px solid #ececf3',
                  borderRadius: 10,
                  padding: 12,
                  background: '#ffffff',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ display: 'grid', gap: 4 }}>
                  <strong style={{ fontSize: 13, color: '#32324d' }}>{entry.label}</strong>
                  <span style={{ fontSize: 12, color: '#666687' }}>
                    {entry.source} • <code>{entry.path}</code>
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      void copyPath(entry.path);
                    }}
                    style={{
                      border: '1px solid #dcdce4',
                      borderRadius: 8,
                      padding: '8px 10px',
                      background: '#fff',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Copy path
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void copyMarkdownLink(entry);
                    }}
                    style={{
                      border: '1px solid #4945ff',
                      borderRadius: 8,
                      padding: '8px 10px',
                      background: '#4945ff',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Copy markdown link
                  </button>
                </div>
              </article>
            ))
          : null}
      </div>
    </div>
  );
}

const InternalLinksPanel: PanelComponent = () => {
  return {
    title: 'Internal links',
    content: <InternalLinksPanelContent />,
  };
};

export default InternalLinksPanel;
