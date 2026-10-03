'use client';

import { Button } from '@/components/ui/button';
import { dispatchOpenChat } from './open-chat';

export function AskAiButton({ className }: { className?: string }) {
  return (
    <Button
      size="lg"
      variant="outline"
      onClick={dispatchOpenChat}
      className={className}
    >
      Ask the AI
    </Button>
  );
}

export function AskAiLink() {
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        dispatchOpenChat();
      }}
      className="text-indigo-400 underline-offset-4 hover:underline"
    >
      Ask the AI
    </a>
  );
}
