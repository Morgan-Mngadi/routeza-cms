import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import './TiptapInput.css';

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

type TiptapInputProps = {
  name: string;
  value?: string;
  attribute?: {
    type?: string;
  };
  disabled?: boolean;
  onChange?: (event: {
    target: {
      name: string;
      type?: string;
      value: string;
    };
  }) => void;
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

function normalizeLinkInput(value: string) {
  const raw = value.trim();

  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(mailto:|tel:)/i.test(raw)) return raw;

  return raw.startsWith('/') ? raw : `/${raw}`;
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

function ToolbarButton({
  active,
  children,
  disabled,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="routeza-tiptap__button"
      aria-pressed={active ? 'true' : 'false'}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export default function TiptapInput({ name, value, attribute, disabled, onChange }: TiptapInputProps) {
  const { get } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [isLinkPickerOpen, setIsLinkPickerOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [entries, setEntries] = useState<InternalLinkItem[]>([]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3, 4],
        },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      Placeholder.configure({
        placeholder: 'Write, format, and add links...',
      }),
    ],
    content: value || '',
    onUpdate: ({ editor: currentEditor }) => {
      onChange?.({
        target: {
          name,
          type: attribute?.type,
          value: currentEditor.getHTML(),
        },
      });
    },
  });

  useEffect(() => {
    if (!editor) return;

    const currentValue = value || '';
    if (currentValue !== editor.getHTML()) {
      editor.commands.setContent(currentValue, false);
    }
  }, [editor, value]);

  useEffect(() => {
    let isMounted = true;

    const loadEntries = async () => {
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
      } catch {
        if (!isMounted) return;

        toggleNotification({
          type: 'warning',
          message: 'Internal link suggestions could not be loaded.',
        });
      }
    };

    void loadEntries();

    return () => {
      isMounted = false;
    };
  }, [get, toggleNotification]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = linkQuery.trim().toLowerCase();

    return entries
      .filter((entry) => (normalizedSearch ? entry.searchText.includes(normalizedSearch) : true))
      .slice(0, 8);
  }, [entries, linkQuery]);

  const applyLink = (href: string, label?: string) => {
    if (!editor) return;

    const normalizedHref = normalizeLinkInput(href);

    if (!normalizedHref) return;

    if (editor.state.selection.empty) {
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${normalizedHref}">${label ?? normalizedHref}</a>`)
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: normalizedHref }).run();
    }

    setLinkQuery('');
    setIsLinkPickerOpen(false);
  };

  const removeLink = () => {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    setIsLinkPickerOpen(false);
  };

  if (!editor) return null;

  return (
    <div className="routeza-tiptap">
      <div className="routeza-tiptap__toolbar">
        <ToolbarButton active={editor.isActive('bold')} disabled={disabled} onClick={() => editor.chain().focus().toggleBold().run()}>
          Bold
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('italic')} disabled={disabled} onClick={() => editor.chain().focus().toggleItalic().run()}>
          Italic
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('heading', { level: 2 })} disabled={disabled} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('heading', { level: 3 })} disabled={disabled} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('bulletList')} disabled={disabled} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          Bullets
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('orderedList')} disabled={disabled} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          Numbers
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('blockquote')} disabled={disabled} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          Quote
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('link')} disabled={disabled} onClick={() => setIsLinkPickerOpen((current) => !current)}>
          Link
        </ToolbarButton>
        <ToolbarButton disabled={disabled || !editor.isActive('link')} onClick={removeLink}>
          Unlink
        </ToolbarButton>
      </div>

      <div className="routeza-tiptap__surface">
        <div className="routeza-tiptap__content">
          <EditorContent editor={editor} />
        </div>

        {isLinkPickerOpen ? (
          <div className="routeza-tiptap__link-picker">
            <div className="routeza-tiptap__link-row">
              <input
                className="routeza-tiptap__input"
                type="text"
                value={linkQuery}
                onChange={(event) => setLinkQuery(event.target.value)}
                placeholder="Search a page or paste a URL/path"
              />
              <button
                type="button"
                className="routeza-tiptap__button"
                onClick={() => applyLink(linkQuery)}
              >
                Apply
              </button>
            </div>

            <div className="routeza-tiptap__hint">
              Search internal destinations or paste an external URL. If no text is selected, the link URL is inserted as text.
            </div>

            <div className="routeza-tiptap__suggestions">
              {filteredEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="routeza-tiptap__suggestion"
                  onClick={() => applyLink(entry.path, entry.label)}
                >
                  <div className="routeza-tiptap__suggestion-label">{entry.label}</div>
                  <div className="routeza-tiptap__suggestion-meta">
                    {entry.source} • {entry.path}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
