import { google } from '@ai-sdk/google';
import { groq } from '@ai-sdk/groq';
import {
  streamText,
  toUIMessageStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type ModelMessage,
} from 'ai';
import { z } from 'zod';
import { searchFaqs } from '@/lib/rag';
import { buildSystemPrompt, reportNoAnswer, FALLBACK_TEXT } from '@/lib/chat-prompt';
import {
  getOrCreateConversation,
  saveMessage,
  countTrailingFailures,
  markHandedOff,
} from '@/lib/chat-db';

export const maxDuration = 30;

const BodySchema = z.object({
  sessionId: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .min(1),
});

const NOMATCH_PREFIX = '[[NOMATCH]]';

// Full-fidelity stream error logging: AI SDK errors carry the provider's
// response body and causal chain on non-enumerable-ish fields, so log both
// the raw object and the extracted fields explicitly.
function logStreamError(e: unknown) {
  console.error('chat: stream error (raw):', e);
  if (e && typeof e === 'object') {
    const err = e as Record<string, unknown>;
    console.error('chat: stream error (extracted):', {
      name: err['name'],
      message: err['message'],
      cause: err['cause'],
      statusCode:
        (err as { statusCode?: unknown }).statusCode ??
        (err as { status?: unknown }).status,
      url: (err as { url?: unknown }).url,
      responseBody: (err as { responseBody?: unknown }).responseBody,
      data: (err as { data?: unknown }).data,
      stack: (err as { stack?: unknown }).stack,
    });
  }
}

function createStream(
  system: string,
  messages: ModelMessage[],
  useGroq: boolean,
  hooks: {
    onFinish: (event: {
      text: string;
      toolCalls: { toolName: string }[];
    }) => void | Promise<void>;
    onError: (event: { error?: unknown }) => void;
  }
) {
  const model = useGroq
    ? groq('openai/gpt-oss-120b')
    : google('gemini-3.1-flash-lite');
  return streamText({
    model,
    system,
    messages,
    tools: { reportNoAnswer },
    toolChoice: 'auto',
    providerOptions: {
      google: {
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
    onFinish: hooks.onFinish,
    onError: hooks.onError,
  });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { sessionId, messages } = parsed.data;

  // Use the LATEST user message as the RAG query.
  const latestUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!latestUser) {
    return Response.json(
      { error: 'No user message in history' },
      { status: 400 }
    );
  }

  let conversationId: string;
  try {
    conversationId = await getOrCreateConversation(sessionId);
  } catch (e) {
    console.error('chat: conversation error:', e);
    return Response.json(
      { error: e instanceof Error ? e.message : 'Conversation failed' },
      { status: 500 }
    );
  }

  // Persist the user turn before the LLM call so it is logged even if streaming fails.
  try {
    await saveMessage(conversationId, 'user', latestUser.content);
  } catch (e) {
    console.error('chat: user message save failed:', e);
    return Response.json(
      { error: e instanceof Error ? e.message : 'Message save failed' },
      { status: 500 }
    );
  }

  let matches: Awaited<ReturnType<typeof searchFaqs>>;
  try {
    matches = await searchFaqs(latestUser.content, { threshold: 0.5, count: 4 });
  } catch (e) {
    console.error('chat: RAG search failed:', e);
    return Response.json(
      { error: e instanceof Error ? e.message : 'FAQ search failed' },
      { status: 500 }
    );
  }
  const system = buildSystemPrompt(matches);

  // Strip the [[NOMATCH]] sentinel from prior assistant messages before
  // sending history to the model — the model must never see it.
  const cleanMessages: ModelMessage[] = messages.map((m) => ({
    role: m.role,
    content:
      m.role === 'assistant'
        ? m.content.replace(/^\[\[NOMATCH\]\]\s?/, '')
        : m.content,
  }));

  // NOMATCH signal is the reportNoAnswer TOOL CALL, not matches.length
  // (threshold 0.5 lets junk through: junk scores 0.57-0.59, real 0.68-0.77).
  // The tool call is only known when the stream finishes, so handoff state
  // is resolved in onFinish and communicated via a deferred that the
  // response stream awaits before closing.
  let fallbackInfo: { handoffReady: boolean } | null = null;
  let resolveTurnEnd: () => void = () => {};
  const turnEnd = new Promise<void>((resolve) => {
    resolveTurnEnd = resolve;
  });

  const hooks = {
    onFinish: async ({
      text,
      toolCalls,
    }: {
      text: string;
      toolCalls: { toolName: string }[];
    }) => {
      try {
        // Inside try so every entry path reaches finally/resolveTurnEnd —
        // a runtime-undefined toolCalls must never hang the response.
        const noAnswer = toolCalls.some(
          (tc) => tc.toolName === 'reportNoAnswer'
        );
        // On tool turns the model streams no usable text (single-step stops
        // at the tool call), so persist the server-authoritative fallback.
        // The stream NEVER contains [[NOMATCH]]; the prefix is a DB-level
        // marker only, kept so conversation-log queries stay clean.
        await saveMessage(
          conversationId,
          'assistant',
          noAnswer ? `${NOMATCH_PREFIX} ${FALLBACK_TEXT}` : text
        );
        if (noAnswer) {
          // Current turn is already persisted above, so this total includes it.
          const total = await countTrailingFailures(conversationId);
          const handoffReady = total >= 2;
          fallbackInfo = { handoffReady };
          if (handoffReady) {
            await markHandedOff(conversationId);
          }
        }
      } catch (e) {
        console.error('chat: assistant persist failed:', e);
      } finally {
        resolveTurnEnd();
      }
    },
    onError: (event: { error?: unknown }) => {
      logStreamError(event.error);
      // Resolve so the response stream below never hangs on a dead turn.
      resolveTurnEnd();
    },
  };

  let result: ReturnType<typeof createStream>;
  try {
    result = createStream(system, cleanMessages, true, hooks);
  } catch (e) {
    console.error('chat: primary model failed, retrying with Gemini:', e);
    try {
      result = createStream(system, cleanMessages, false, hooks);
    } catch (e2) {
      console.error('chat: fallback model failed:', e2);
      return Response.json(
        { error: 'Both chat models failed to start' },
        { status: 500 }
      );
    }
  }

  // streamText's onFinish fires when the text stream is fully consumed,
  // which happens inside the merged UI stream below. This is the documented
  // AI SDK v7 pattern.
  const uiStream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.merge(
        toUIMessageStream({
          stream: result.stream,
          tools: { reportNoAnswer },
          onError: (e) => {
            logStreamError(e);
            return 'An error occurred.';
          },
        })
      );
      // Wait for onFinish (persistence + handoff decision) so the
      // data-fallback part, when fired, is the last chunk before close.
      await turnEnd;
      if (fallbackInfo) {
        writer.write({
          type: 'data-fallback',
          data: {
            text: FALLBACK_TEXT,
            handoffReady: fallbackInfo.handoffReady,
          },
        });
      }
    },
    onError: (e) => {
      logStreamError(e);
      return 'An error occurred.';
    },
  });

  // X-Conversation-Id is the only pre-stream header left: no-match and
  // handoff are tool-call outcomes, unknowable until the stream completes.
  // Handoff now travels as a data-fallback stream part (see above).
  const headers: Record<string, string> = {
    'X-Conversation-Id': conversationId,
  };

  return createUIMessageStreamResponse({ stream: uiStream, headers });
}
