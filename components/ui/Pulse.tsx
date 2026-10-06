import { cn } from '@/lib/utils';

type PulseProps = {
  variant?: 'divider' | 'inline' | 'loading';
  className?: string;
};

// SupportAI visual signature: ━━●━━━━●━━
// CSS keyframes only. Idle at 40% opacity. Static under reduced motion.
export function Pulse({ variant = 'divider', className }: PulseProps) {
  if (variant === 'loading') {
    return (
      <span
        role="status"
        aria-label="Loading"
        className={cn('pulse-loading inline-flex items-center gap-1.5', className)}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="pulse-loading-dot h-1.5 w-1.5 rounded-full bg-accent-idle"
            style={{ animationDelay: `${i * 0.5}s` }}
          />
        ))}
      </span>
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        'pulse-line relative h-px',
        variant === 'divider' ? 'w-full' : 'w-[80px]',
        className
      )}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="pulse-dot absolute top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-accent-active"
          style={{ left: `${20 + i * 30}%`, animationDelay: `${i}s` }}
        />
      ))}
    </div>
  );
}
