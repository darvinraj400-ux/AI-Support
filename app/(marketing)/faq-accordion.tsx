'use client';

import { useState } from 'react';
import {
  Accordion as AccordionPrimitive,
  type AccordionValue,
} from '@base-ui/react/accordion';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export type FaqEntry = {
  question: string;
  answer: string;
};

function FaqRow({
  id,
  faq,
  open,
}: {
  id: string;
  faq: FaqEntry;
  open: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? 0 : 0.26;
  const chevronDuration = reduceMotion ? 0 : 0.2;

  return (
    <AccordionPrimitive.Item value={id} className="border-border">
      <AccordionPrimitive.Header className="flex">
        <AccordionPrimitive.Trigger className="flex flex-1 items-center justify-between gap-4 py-2.5 text-left text-sm font-medium text-foreground outline-none transition-colors hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
          <span>{faq.question}</span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: chevronDuration }}
            className="shrink-0 text-foreground-muted"
          >
            <ChevronDown className="size-4" />
          </motion.span>
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Panel keepMounted>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <p className="pt-0 pb-2.5 text-base leading-relaxed text-foreground-muted">
                {faq.answer}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </AccordionPrimitive.Panel>
    </AccordionPrimitive.Item>
  );
}

export function FaqAccordion({ faqs }: { faqs: FaqEntry[] }) {
  // Single-open: keep the last opened id only.
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <AccordionPrimitive.Root
      value={openId ? [openId] : []}
      onValueChange={(value: AccordionValue) =>
        setOpenId((value[value.length - 1] as string | undefined) ?? null)
      }
      className="mx-auto mt-10 flex w-full max-w-3xl flex-col"
    >
      {faqs.map((faq, i) => {
        const id = `item-${i}`;
        return <FaqRow key={id} id={id} faq={faq} open={openId === id} />;
      })}
    </AccordionPrimitive.Root>
  );
}
