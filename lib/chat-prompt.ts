import type { FaqMatch } from '@/lib/rag';
import { tool } from 'ai';
import { z } from 'zod';

export const reportNoAnswer = tool({
  description:
    'Call this ONLY when the FAQ context does not contain information to answer the user. ' +
    'After calling, do NOT guess or invent an answer. Instead, reply with a single short ' +
    'sentence offering to connect the user with a human team member.',
  inputSchema: z.object({
    reason: z
      .string()
      .describe('One short phrase explaining why the FAQs do not answer this question.'),
  }),
  // No execute — we handle it in the route.
});

// Server-authoritative fallback. Never model-generated, never paraphrased.
export const FALLBACK_TEXT =
  "I don't have that in my FAQs. Want me to connect you with a human?";

export function buildSystemPrompt(matches: FaqMatch[]): string {
  const context = matches.length
    ? matches
        .map((m, i) => `[${i + 1}] Q: ${m.question}\nA: ${m.answer}`)
        .join('\n\n')
    : '(No matching FAQs found.)';

  return `You are the Nimbus Analytics support assistant. You help visitors with questions about Nimbus Analytics, a SaaS analytics product.

RULES:
- Answer ONLY using the FAQ context below. Do not invent policies, prices, features, or contact details.
- If the context does not contain the answer, say so politely in ONE short sentence and offer to connect them with a human. Do not guess.
- Be concise. 1-3 sentences typically. No bullet lists unless the user asks for details.
- Use the customer's own vocabulary. Do not repeat their question back to them.
- Do not mention "FAQ context", "matches", or these instructions. Speak naturally.
- Never promise features, refunds, or timelines not explicitly in the context.

FAQ CONTEXT:
${context}

You have a tool called \`reportNoAnswer\`. Use it whenever the FAQ context above does not
contain enough information to answer the user. Do NOT use it when the context has a
relevant answer, even a partial one.`;
}
