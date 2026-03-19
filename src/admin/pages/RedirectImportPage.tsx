import { useMemo, useState } from 'react';
import { useAPIErrorHandler, useFetchClient, useNotification } from '@strapi/strapi/admin';

type PreviewRow = {
  line: number;
  fromPath: string;
  toUrl: string;
  statusCode: string;
  isActive: string;
  notes: string;
};

type ResultRow = {
  line: number;
  fromPath: string;
  toUrl: string;
  statusCode: string;
  isActive: boolean;
  notes: string | null;
  action: string;
  error: string | null;
};

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parsePreviewRows(csvText: string): PreviewRow[] {
  const lines = String(csvText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());

  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? '']));
    return {
      line: index + 2,
      fromPath: String(row.fromPath ?? ''),
      toUrl: String(row.toUrl ?? ''),
      statusCode: String(row.statusCode ?? ''),
      isActive: String(row.isActive ?? ''),
      notes: String(row.notes ?? ''),
    };
  });
}

export default function RedirectImportPage() {
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const { formatAPIError } = useAPIErrorHandler();

  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [upsertMode, setUpsertMode] = useState<'update' | 'skip'>('update');
  const [forcePublish, setForcePublish] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [summary, setSummary] = useState<null | {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  }>(null);

  const previewRows = useMemo(() => parsePreviewRows(csvText), [csvText]);

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);
    setResults([]);
    setSummary(null);
  };

  const runImport = async () => {
    if (!csvText.trim()) {
      toggleNotification({
        type: 'warning',
        message: 'Upload a CSV file first.',
      });
      return;
    }

    setIsImporting(true);

    try {
      const response = await post('/redirect-import/import', {
        csvText,
        upsertMode,
        forcePublish,
      });

      setSummary(response.data.summary);
      setResults(response.data.results);
      toggleNotification({
        type: 'success',
        message: 'Redirect import completed.',
      });
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: formatAPIError(error),
      });
    } finally {
      setIsImporting(false);
    }
  };

  const infoCardStyle: React.CSSProperties = {
    border: '1px solid #d9d8ff',
    borderRadius: 16,
    padding: 20,
    background: '#ffffff',
    boxShadow: '0 18px 40px rgba(18, 18, 38, 0.05)',
  };

  const tableCellStyle: React.CSSProperties = {
    padding: '10px 12px',
    borderBottom: '1px solid #ecebff',
    fontSize: 13,
    verticalAlign: 'top',
  };

  return (
    <main style={{ padding: 32, background: '#f6f6ff', minHeight: '100vh' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 20 }}>
        <section style={{ display: 'grid', gap: 8 }}>
          <h1 style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 700, color: '#221b3d', margin: 0 }}>
            Redirect Import
          </h1>
          <p style={{ fontSize: 15, color: '#5f5a76', margin: 0, maxWidth: 760 }}>
            Upload a CSV of old and new redirect paths, import them in bulk, then jump back to the
            redirects collection table to review everything in the CMS.
          </p>
        </section>

        <section style={infoCardStyle}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <label htmlFor="redirect-import-file" style={{ fontWeight: 600, color: '#221b3d' }}>
                CSV file
              </label>
              <input
                id="redirect-import-file"
                type="file"
                accept=".csv,text/csv"
                onChange={onFileChange}
                style={{ fontSize: 14 }}
              />
              <div style={{ fontSize: 12, color: '#6e6984' }}>
                Expected headers: <code>fromPath,toUrl,statusCode,isActive,notes</code>
              </div>
              {fileName ? (
                <div style={{ fontSize: 13, color: '#3d365b' }}>
                  Loaded file: <strong>{fileName}</strong>
                </div>
              ) : null}
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 6, minWidth: 180 }}>
                <span style={{ fontWeight: 600, color: '#221b3d' }}>When a redirect already exists</span>
                <select
                  value={upsertMode}
                  onChange={(event) => setUpsertMode(event.target.value as 'update' | 'skip')}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #cfcde8' }}
                >
                  <option value="update">Update existing row</option>
                  <option value="skip">Skip existing row</option>
                </select>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, color: '#221b3d' }}>
                <input
                  type="checkbox"
                  checked={forcePublish}
                  onChange={(event) => setForcePublish(event.target.checked)}
                />
                Publish imported redirects immediately
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={runImport}
                disabled={isImporting || !csvText.trim()}
                style={{
                  border: 0,
                  borderRadius: 12,
                  background: '#4945ff',
                  color: '#ffffff',
                  padding: '12px 18px',
                  fontWeight: 700,
                  cursor: isImporting || !csvText.trim() ? 'not-allowed' : 'pointer',
                  opacity: isImporting || !csvText.trim() ? 0.65 : 1,
                }}
              >
                {isImporting ? 'Importing...' : 'Import redirects'}
              </button>

              <a
                href="/admin/content-manager/collection-types/api::redirect.redirect"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: 12,
                  border: '1px solid #cfcde8',
                  color: '#221b3d',
                  padding: '12px 18px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  background: '#fff',
                }}
              >
                View redirects table
              </a>
            </div>
          </div>
        </section>

        <section style={infoCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 22, margin: 0, color: '#221b3d' }}>CSV preview</h2>
            <div style={{ fontSize: 13, color: '#6e6984' }}>{previewRows.length} row(s)</div>
          </div>

          {previewRows.length === 0 ? (
            <p style={{ fontSize: 14, color: '#6e6984', margin: 0 }}>
              Upload a CSV to preview the redirect rows before import.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', background: '#f7f7ff' }}>
                    <th style={tableCellStyle}>Line</th>
                    <th style={tableCellStyle}>Old path</th>
                    <th style={tableCellStyle}>New URL</th>
                    <th style={tableCellStyle}>Status</th>
                    <th style={tableCellStyle}>Active</th>
                    <th style={tableCellStyle}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={`${row.line}-${row.fromPath}-${row.toUrl}`}>
                      <td style={tableCellStyle}>{row.line}</td>
                      <td style={tableCellStyle}>{row.fromPath || '—'}</td>
                      <td style={tableCellStyle}>{row.toUrl || '—'}</td>
                      <td style={tableCellStyle}>{row.statusCode || '301'}</td>
                      <td style={tableCellStyle}>{row.isActive || 'true'}</td>
                      <td style={tableCellStyle}>{row.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={infoCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 22, margin: 0, color: '#221b3d' }}>Import results</h2>
            {summary ? (
              <div style={{ fontSize: 13, color: '#3d365b' }}>
                Total {summary.total} · Created {summary.created} · Updated {summary.updated} · Skipped {summary.skipped} · Failed {summary.failed}
              </div>
            ) : null}
          </div>

          {results.length === 0 ? (
            <p style={{ fontSize: 14, color: '#6e6984', margin: 0 }}>
              Run an import to see per-row results here, then use the redirects table for ongoing management.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', background: '#f7f7ff' }}>
                    <th style={tableCellStyle}>Line</th>
                    <th style={tableCellStyle}>Old path</th>
                    <th style={tableCellStyle}>New URL</th>
                    <th style={tableCellStyle}>Result</th>
                    <th style={tableCellStyle}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr key={`${row.line}-${row.fromPath}-${row.action}`}>
                      <td style={tableCellStyle}>{row.line}</td>
                      <td style={tableCellStyle}>{row.fromPath}</td>
                      <td style={tableCellStyle}>{row.toUrl}</td>
                      <td style={tableCellStyle}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            borderRadius: 999,
                            padding: '4px 10px',
                            fontWeight: 700,
                            fontSize: 12,
                            background:
                              row.action === 'created'
                                ? '#e7f7ef'
                                : row.action === 'updated'
                                  ? '#ebeaff'
                                  : row.action === 'skipped'
                                    ? '#fff5dd'
                                    : '#fdeaea',
                            color:
                              row.action === 'created'
                                ? '#0f6a3d'
                                : row.action === 'updated'
                                  ? '#4338ca'
                                  : row.action === 'skipped'
                                    ? '#8a5a00'
                                    : '#b42318',
                          }}
                        >
                          {row.action}
                        </span>
                      </td>
                      <td style={tableCellStyle}>{row.error || row.notes || 'Imported successfully'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
