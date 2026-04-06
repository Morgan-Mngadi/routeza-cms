import { useState } from 'react';
import { useAPIErrorHandler, useFetchClient, useNotification } from '@strapi/strapi/admin';

type PurgeResponse = {
  ok?: boolean;
  purgedAt?: string;
  caches?: Record<string, unknown>;
};

export default function WebsiteToolsPage() {
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const { formatAPIError } = useAPIErrorHandler();
  const [isPurging, setIsPurging] = useState(false);
  const [result, setResult] = useState<PurgeResponse | null>(null);

  const runPurge = async () => {
    setIsPurging(true);
    try {
      const response = await post('/website-tools/purge-cache');
      setResult(response.data);
      toggleNotification({
        type: 'success',
        message: 'Website cache purged successfully.',
      });
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: formatAPIError(error),
      });
    } finally {
      setIsPurging(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    border: '1px solid #d9d8ff',
    borderRadius: 16,
    padding: 20,
    background: '#ffffff',
    boxShadow: '0 18px 40px rgba(18, 18, 38, 0.05)',
  };

  return (
    <main style={{ padding: 32, background: '#f6f6ff', minHeight: '100vh' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 20 }}>
        <section style={{ display: 'grid', gap: 8 }}>
          <h1 style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 700, color: '#221b3d', margin: 0 }}>
            Website Tools
          </h1>
          <p style={{ fontSize: 15, color: '#5f5a76', margin: 0, maxWidth: 760 }}>
            Use this page to purge cached website data after CMS changes that should show up immediately.
          </p>
        </section>

        <section style={cardStyle}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ fontSize: 14, color: '#3d365b', lineHeight: 1.6 }}>
              This clears the website&apos;s in-memory SEO, places, and route-related caches. It is useful after
              publishing content, updating redirects, or changing SEO settings.
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={runPurge}
                disabled={isPurging}
                style={{
                  border: 0,
                  borderRadius: 12,
                  background: '#4945ff',
                  color: '#ffffff',
                  padding: '12px 18px',
                  fontWeight: 700,
                  cursor: isPurging ? 'not-allowed' : 'pointer',
                  opacity: isPurging ? 0.65 : 1,
                }}
              >
                {isPurging ? 'Purging cache...' : 'Purge website cache'}
              </button>
            </div>
          </div>
        </section>

        {result ? (
          <section style={cardStyle}>
            <div style={{ display: 'grid', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: '#221b3d' }}>Latest result</h2>
              <div style={{ fontSize: 14, color: '#5f5a76' }}>
                Purged at: <strong>{result.purgedAt ?? 'Unknown'}</strong>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: 16,
                  borderRadius: 12,
                  background: '#f6f6ff',
                  border: '1px solid #ecebff',
                  fontSize: 12,
                  overflowX: 'auto',
                }}
              >
                {JSON.stringify(result.caches ?? result, null, 2)}
              </pre>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
