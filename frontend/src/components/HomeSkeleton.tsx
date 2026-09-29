/**
 * HomeSkeleton — shimmer placeholder for the home page while it loads.
 * Every box has the size and position of the part of pages/Home.tsx it stands
 * for, so nothing moves when the real page replaces it. There is no place held
 * for the Continue card: most visits have no lesson in progress.
 */
export default function HomeSkeleton() {
  return (
    <div
      className="max-w-lg mx-auto px-5"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 6rem)',
      }}
    >
      {/* Header row: date + greeting, avatar */}
      <div className="h-[49px] flex items-center justify-between mb-7">
        <div>
          <div className="h-[10px] w-24 rounded-full mb-[10px] skeleton-shimmer" />
          <div className="h-[22px] w-36 rounded-full skeleton-shimmer" style={{ animationDelay: '0.1s' }} />
        </div>
        <div className="w-10 h-10 rounded-[14px] skeleton-shimmer" style={{ animationDelay: '0.2s' }} />
      </div>

      {/* "Practice" heading */}
      <div className="h-[27px] flex items-center mb-[14px]">
        <div className="h-[14px] w-[76px] rounded-full skeleton-shimmer" style={{ animationDelay: '0.25s' }} />
      </div>

      {/* Mode grid 2×2 */}
      <div className="grid grid-cols-2 gap-3">
        {[0.3, 0.4, 0.5, 0.6].map((delay, i) => (
          <div
            key={i}
            data-testid="skeleton-mode-card"
            className="rounded-[20px] skeleton-shimmer"
            style={{ height: '131px', animationDelay: `${delay}s` }}
          />
        ))}
      </div>
    </div>
  );
}
