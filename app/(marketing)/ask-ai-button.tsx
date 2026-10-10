'use client';

import { Button } from '@/components/ui/button';
import { dispatchOpenChat } from './open-chat';

export function AskAiButton() {
  return (
    <Button
      size="lg"
      variant="outline"
      onClick={() => {
        // Hero CTA (Section 3): give visitors a visual preview of the Core
        // responding the moment they ask, in addition to opening the widget.
        // No-op if the Core is already mid-cycle (recent autofire).
        window.dispatchEvent(
          new CustomEvent('supportai:core:think', { detail: { source: 'preview' } })
        );
        dispatchOpenChat();
      }}
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
      className="text-accent-idle underline-offset-4 hover:underline"
    >
      Ask the AI
    </a>
  );
}
