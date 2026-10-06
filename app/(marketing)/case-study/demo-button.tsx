'use client';

import { buttonVariants } from '@/components/ui/button';
import { dispatchOpenChat } from '../open-chat';

export function DemoButton() {
  return (
    <button
      type="button"
      onClick={dispatchOpenChat}
      className={buttonVariants({
        size: 'lg',
      })}
    >
      Try the live demo
    </button>
  );
}
