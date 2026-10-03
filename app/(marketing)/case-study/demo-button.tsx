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
        className: 'bg-indigo-500 text-white hover:bg-indigo-400',
      })}
    >
      Try the live demo
    </button>
  );
}
