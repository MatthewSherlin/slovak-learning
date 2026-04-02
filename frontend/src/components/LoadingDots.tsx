export default function LoadingDots({ text = 'Thinking' }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 text-text-secondary">
      <span className="text-sm">{text}</span>
      <div className="flex gap-1">
        <div className="w-1.5 h-1.5 rounded-full bg-accent loading-dot" />
        <div className="w-1.5 h-1.5 rounded-full bg-accent loading-dot" />
        <div className="w-1.5 h-1.5 rounded-full bg-accent loading-dot" />
      </div>
    </div>
  );
}
