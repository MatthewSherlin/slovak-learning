/**
 * BrandedLoader — full-screen lesson-generation loading state.
 * Design spec: <!-- Branded loader --> in docs/design/Redesign.dc.html
 *
 * Use this for waits > ~1 second (e.g. session creation via LLM).
 * Use a small spinner for sub-second fetches.
 */

interface BrandedLoaderProps {
  heading?: string;
  subCopy?: string;
  /** Timing hint under the ring; null hides it (e.g. when only fetching a stored lesson). */
  hint?: string | null;
}

export default function BrandedLoader({
  heading = 'Pripravujeme lekciu…',
  subCopy = 'Building vocabulary exercises for your level',
  hint = 'usually 5–10 seconds — up to a minute if the tutor is waking up',
}: BrandedLoaderProps) {
  return (
    <div
      style={{
        // Fixed overlay: this loader must cover the page it was launched
        // from — rendered in normal flow it can end up below the fold and
        // the tap looks like it did nothing.
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0e1017',
        padding: '24px',
      }}
    >
      {/* Spinner + logo container */}
      <div style={{ position: 'relative', width: 96, height: 96, marginBottom: 28 }}>
        {/* Spinning ring — the loader's one progress indicator */}
        <svg
          className="branded-loader-ring"
          role="progressbar"
          aria-label="Loading"
          viewBox="0 0 96 96"
          style={{
            position: 'absolute',
            inset: 0,
            width: 96,
            height: 96,
            animation: 'branded-loader-spin 1.6s linear infinite',
          }}
        >
          <circle
            cx="48"
            cy="48"
            r="43"
            fill="none"
            stroke="rgba(94,164,247,0.15)"
            strokeWidth="3"
          />
          <circle
            cx="48"
            cy="48"
            r="43"
            fill="none"
            stroke="#5ea4f7"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="70 200"
          />
        </svg>

        {/* Pulsing icon badge */}
        <div
          className="branded-loader-badge"
          style={{
            position: 'absolute',
            inset: 18,
            borderRadius: 20,
            background: 'linear-gradient(135deg, #5ea4f7, #38bdf8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 12px 28px rgba(94,164,247,0.35)',
            animation: 'branded-loader-pulse 1.6s ease-in-out infinite',
          }}
        >
          {/* Slovak letter icon */}
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
            <rect x="14.25" y="2" width="3.5" height="28" rx="1" fill="white" />
            <rect x="10" y="7" width="12" height="3.2" rx="1" fill="white" />
            <rect x="8" y="14" width="16" height="3.2" rx="1" fill="white" />
          </svg>
        </div>
      </div>

      {/* Heading */}
      <h2
        style={{
          fontSize: 18,
          fontWeight: 800,
          margin: '0 0 6px 0',
          textAlign: 'center',
          color: '#eef1f8',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {heading}
      </h2>

      {/* Sub-copy */}
      <p
        style={{
          fontSize: 12.5,
          color: '#6b7289',
          margin: '0 0 24px 0',
          textAlign: 'center',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {subCopy}
      </p>

      {/* Timing hint */}
      {hint && (
        <p
          style={{
            fontSize: 10,
            color: '#4a5068',
            margin: '16px 0 0 0',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          {hint}
        </p>
      )}

      {/* Keyframe styles — injected as a style tag */}
      <style>{`
        @keyframes branded-loader-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes branded-loader-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.85; transform: scale(0.96); }
        }
        @media (prefers-reduced-motion: reduce) {
          .branded-loader-ring, .branded-loader-badge { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
