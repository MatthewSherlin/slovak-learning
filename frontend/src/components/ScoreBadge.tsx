interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'lg';
}

export default function ScoreBadge({ score, size = 'sm' }: ScoreBadgeProps) {
  const color =
    score >= 8 ? 'text-success' :
    score >= 6 ? 'text-accent' :
    score >= 4 ? 'text-warning' :
    'text-danger';

  const bgColor =
    score >= 8 ? 'bg-success-muted border-success/20' :
    score >= 6 ? 'bg-accent-muted border-accent/20' :
    score >= 4 ? 'bg-warning-muted border-warning/20' :
    'bg-danger-muted border-danger/20';

  const sizeClasses = {
    sm: 'w-9 h-9 text-sm rounded-lg',
    lg: 'w-20 h-20 text-3xl rounded-2xl',
  };

  return (
    <div
      className={`${sizeClasses[size]} ${bgColor} ${color} border flex items-center justify-center font-bold tabular-nums mx-auto`}
    >
      {score}
    </div>
  );
}
