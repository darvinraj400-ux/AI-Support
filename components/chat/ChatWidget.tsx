"use client";

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatPanel } from './ChatPanel';

export function ChatWidget() {
  const [open, setOpen] = useState(false);

  // Landing page "Ask the AI" buttons open the widget via this event.
  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener('supportai:open', handleOpen);
    return () => window.removeEventListener('supportai:open', handleOpen);
  }, []);

  return (
    <>
      {!open && (
        <Button
          onClick={() => setOpen(true)}
          aria-label="Open chat"
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-indigo-500 text-white shadow-2xl hover:bg-indigo-600"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}
      {/* Panel stays mounted so useChat history survives close/reopen;
          visibility only toggles via CSS. */}
      <div className={open ? undefined : 'hidden'} aria-hidden={!open}>
        <ChatPanel open={open} onClose={() => setOpen(false)} />
      </div>
    </>
  );
}
