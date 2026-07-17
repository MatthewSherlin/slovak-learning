/**
 * HomeSkeleton — shimmer placeholder matching the 2a Home Focus layout.
 * Design reference: <!-- Home skeleton --> in Redesign.dc.html
 */
export default function HomeSkeleton() {
  return (
    <div className="max-w-lg mx-auto px-5 pt-6 pb-6">
      {/* Header row: date/greeting + avatar */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <div className="h-[9px] w-20 rounded-full mb-2 skeleton-shimmer" />
          <div className="h-[17px] w-32 rounded-full skeleton-shimmer" style={{ animationDelay: '0.1s' }} />
        </div>
        <div className="w-[34px] h-[34px] rounded-[12px] skeleton-shimmer" style={{ animationDelay: '0.2s' }} />
      </div>

      {/* Continue card placeholder */}
      <div className="h-[84px] rounded-[18px] mb-7 skeleton-shimmer" style={{ animationDelay: '0.15s' }} />

      {/* "Practice" label */}
      <div className="h-3 w-[70px] rounded-full mb-3 skeleton-shimmer" style={{ animationDelay: '0.25s' }} />

      {/* Mode grid 2×2 */}
      <div className="grid grid-cols-2 gap-3">
        {[0.3, 0.4, 0.5, 0.6].map((delay, i) => (
          <div
            key={i}
            className="h-[96px] rounded-[16px] skeleton-shimmer"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </div>
    </div>
  );
}
