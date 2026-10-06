'use client';

import { useEffect, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Docs', href: '#' },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b backdrop-blur-md transition-colors duration-200',
        scrolled
          ? 'border-border bg-[rgba(10,10,15,0.7)]'
          : 'border-transparent bg-transparent'
      )}
    >
      <nav className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
        <a href="#" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-foreground">
            Nimbus
          </span>
          <span className="text-xs text-foreground-muted">Analytics</span>
        </a>
        <div className="hidden items-center gap-8 text-sm text-foreground-muted md:flex">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} className="hover:text-foreground">
              {l.label}
            </a>
          ))}
        </div>
        <a href="#pricing" className={buttonVariants()}>
          Start free
        </a>
      </nav>
    </header>
  );
}
