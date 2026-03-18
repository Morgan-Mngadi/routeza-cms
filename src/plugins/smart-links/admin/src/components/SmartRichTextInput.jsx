import React, { useMemo, useRef, useState } from 'react';

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function SmartRichTextInput({
  attribute,
  description,
  disabled,
  error,
  hint,
  label,
  name,
  onChange,
  placeholder,
  required,
  value,
}) {
  const textareaRef = useRef(null);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const textValue = typeof value === 'string' ? value : '';
  const hasError = Boolean(error);

  const selection = useMemo(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return { start: 0, end: 0, text: '' };
    }

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;

    return {
      start,
      end,
      text: textValue.slice(start, end),
    };
  }, [isLinkDialogOpen, textValue]);

  const emitChange = (nextValue) => {
    onChange({
      target: {
        name,
        type: attribute?.type ?? 'richtext',
        value: nextValue,
      },
    });
  };

  const openLinkDialog = () => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? 0;
    const end = textarea?.selectionEnd ?? start;
    const selectedText = textValue.slice(start, end);

    setLinkText(selectedText);
    setLinkUrl('');
    setIsLinkDialogOpen(true);
  };

  const closeLinkDialog = () => {
    setIsLinkDialogOpen(false);
    setLinkUrl('');
  };

  const applyLink = () => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? 0;
    const end = textarea?.selectionEnd ?? start;
    const selectedText = textValue.slice(start, end);
    const nextLinkText = (linkText || selectedText || 'link').trim();
    const nextLinkUrl = linkUrl.trim();

    if (!nextLinkUrl) return;

    const markdownLink = `[${nextLinkText}](${nextLinkUrl})`;
    const nextValue = `${textValue.slice(0, start)}${markdownLink}${textValue.slice(end)}`;

    emitChange(nextValue);
    setIsLinkDialogOpen(false);

    window.requestAnimationFrame(() => {
      textarea?.focus();
      const cursor = start + markdownLink.length;
      textarea?.setSelectionRange(cursor, cursor);
    });
  };

  const helperAnchor = `#${slugify(linkText || selection.text)}`;

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div>
        <label
          htmlFor={name}
          style={{
            display: 'block',
            marginBottom: '0.35rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#f6f6f9',
          }}
        >
          {label}
          {required ? ' *' : ''}
        </label>

        {(description || hint) && (
          <div style={{ marginBottom: '0.5rem', fontSize: '0.8125rem', color: '#a5a5ba' }}>
            {description || hint}
          </div>
        )}

        <div
          style={{
            border: `1px solid ${hasError ? '#ee5e52' : '#4a4a6a'}`,
            borderRadius: '0.5rem',
            overflow: 'hidden',
            background: '#1f1f38',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              padding: '0.75rem',
              borderBottom: '1px solid #343454',
              background: '#171727',
            }}
          >
            <button
              type="button"
              onClick={openLinkDialog}
              disabled={disabled}
              style={{
                border: '1px solid #4a4a6a',
                borderRadius: '0.4rem',
                background: 'transparent',
                color: '#f6f6f9',
                padding: '0.45rem 0.8rem',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              Insert link
            </button>
            <button
              type="button"
              onClick={() => {
                if (helperAnchor === '#') return;
                setLinkText(linkText || selection.text);
                setLinkUrl(helperAnchor);
                setIsLinkDialogOpen(true);
              }}
              disabled={disabled || helperAnchor === '#'}
              style={{
                border: '1px solid #4a4a6a',
                borderRadius: '0.4rem',
                background: 'transparent',
                color: '#f6f6f9',
                padding: '0.45rem 0.8rem',
                cursor: disabled || helperAnchor === '#' ? 'not-allowed' : 'pointer',
              }}
            >
              Link to heading
            </button>
          </div>

          <textarea
            id={name}
            ref={textareaRef}
            name={name}
            disabled={disabled}
            placeholder={placeholder}
            value={textValue}
            onChange={(event) => emitChange(event.target.value)}
            style={{
              width: '100%',
              minHeight: '22rem',
              padding: '1rem',
              resize: 'vertical',
              border: 0,
              outline: 'none',
              background: 'transparent',
              color: '#f6f6f9',
              fontSize: '1rem',
              lineHeight: 1.7,
            }}
          />
        </div>

        {hasError && <div style={{ marginTop: '0.5rem', color: '#ee5e52', fontSize: '0.8125rem' }}>{error}</div>}
      </div>

      {isLinkDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(7, 7, 18, 0.72)',
            display: 'grid',
            placeItems: 'center',
            padding: '1rem',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: 'min(36rem, 100%)',
              borderRadius: '1rem',
              border: '1px solid #4a4a6a',
              background: '#1f1f38',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '1rem 1rem 0.75rem', borderBottom: '1px solid #343454' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f6f6f9' }}>Insert link</div>
              <div style={{ marginTop: '0.35rem', fontSize: '0.8125rem', color: '#a5a5ba' }}>
                Paste a URL or create a heading anchor from the selected text.
              </div>
            </div>

            <div style={{ display: 'grid', gap: '0.85rem', padding: '1rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem', color: '#f6f6f9', fontSize: '0.875rem' }}>
                Link text
                <input
                  value={linkText}
                  onChange={(event) => setLinkText(event.target.value)}
                  placeholder="Selected text"
                  style={{
                    borderRadius: '0.5rem',
                    border: '1px solid #4a4a6a',
                    background: '#171727',
                    color: '#f6f6f9',
                    padding: '0.75rem 0.9rem',
                  }}
                />
              </label>

              <label style={{ display: 'grid', gap: '0.35rem', color: '#f6f6f9', fontSize: '0.875rem' }}>
                URL or anchor
                <input
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  placeholder="Search or paste a link"
                  style={{
                    borderRadius: '0.5rem',
                    border: '1px solid #4a4a6a',
                    background: '#171727',
                    color: '#f6f6f9',
                    padding: '0.75rem 0.9rem',
                  }}
                />
              </label>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setLinkUrl(helperAnchor === '#' ? '' : helperAnchor)}
                  disabled={helperAnchor === '#'}
                  style={{
                    border: '1px solid #4a4a6a',
                    borderRadius: '999px',
                    background: 'transparent',
                    color: '#f6f6f9',
                    padding: '0.4rem 0.75rem',
                    cursor: helperAnchor === '#' ? 'not-allowed' : 'pointer',
                  }}
                >
                  Use heading anchor
                </button>
                {helperAnchor !== '#' && (
                  <div style={{ alignSelf: 'center', color: '#a5a5ba', fontSize: '0.8125rem' }}>
                    Suggested: {helperAnchor}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                padding: '0.9rem 1rem 1rem',
                borderTop: '1px solid #343454',
              }}
            >
              <button
                type="button"
                onClick={closeLinkDialog}
                style={{
                  border: '1px solid #4a4a6a',
                  borderRadius: '0.5rem',
                  background: 'transparent',
                  color: '#f6f6f9',
                  padding: '0.6rem 0.9rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyLink}
                disabled={!linkUrl.trim()}
                style={{
                  border: '1px solid #4f7cff',
                  borderRadius: '0.5rem',
                  background: '#4f7cff',
                  color: '#ffffff',
                  padding: '0.6rem 1rem',
                  cursor: linkUrl.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SmartRichTextInput;
