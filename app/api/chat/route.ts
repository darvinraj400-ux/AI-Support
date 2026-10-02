import { google } from '@ai-sdk/google';
import { groq } from '@ai-sdk/groq';
import {
  streamText,
  toUIMessageStream,
  createUIMessageStreamResponse,
  type ModelMessage,
} from 'ai';
import { z } from 'zod';
import { searchFaqs } from '@/lib/rag';
import { buildSystemPrompt } from '@/lib/chat-prompt';
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
  onFinish: (event: { text: string }) => void | Promise<void>
) {
  const model = useGroq
    ? groq('openai/gpt-oss-120b')
    : google('gemini-3.1-flash-lite');
  return streamText({
    model,
    system,
    messages,
    providerOptions: {
      google: {
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
    onFinish,
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

  const isNomatch = matches.length === 0;
  const system = buildSystemPrompt(matches);

  // Strip the [[NOMATCH]] sentinel from prior assistant messages before
  // sending history to the model — the model must never see it.
  const cleanMessages: ModelMessage[] = messages.map((m) => ({
    role: m.role,
    content:
      m.role === 'assistant' && m.content.startsWith(NOMATCH_PREFIX)
        ? m.content.slice(NOMATCH_PREFIX.length)
        : m.content,
  }));

  // Handoff decision must be made BEFORE streaming: headers are fixed once
  // the response starts, while persistence happens in onFinish after the
  // stream completes. If this turn is a no-match and one consecutive
  // no-match is already stored, this turn is the 2nd consecutive failure.
  let willHandOff = false;
  if (isNomatch) {
    try {
      const prevFailures = await countTrailingFailures(conversationId);
      willHandOff = prevFailures + 1 >= 2;
    } catch (e) {
      console.error('chat: failure count failed:', e);
    }
  }

  // Sentinel choice: the stream NEVER contains [[NOMATCH]]. We persist the
  // prefix for failure counting, but stream clean text and signal no-match
  // via the X-No-Match response header. No transform stream needed.
  const persistAssistant = async (text: string) => {
    try {
      await saveMessage(
        conversationId,
        'assistant',
        isNomatch ? `${NOMATCH_PREFIX}${text}` : text
      );
      if (isNomatch && willHandOff) {
        await markHandedOff(conversationId);
      }
    } catch (e) {
      console.error('chat: assistant persist failed:', e);
    }
  };

  let result: ReturnType<typeof createStream>;
  try {
    result = createStream(system, cleanMessages, true, async ({ text }) => {
      await persistAssistant(text);
    });
  } catch (e) {
    console.error('chat: primary model failed, retrying with Gemini:', e);
    try {
      result = createStream(system, cleanMessages, false, async ({ text }) => {
        await persistAssistant(text);
      });
    } catch (e2) {
      console.error('chat: fallback model failed:', e2);
      return Response.json(
        { error: 'Both chat models failed to start' },
        { status: 500 }
      );
    }
  }

  // streamText's onFinish fires when the text stream is fully consumed,
  // which happens inside toUIMessageStream below. This is the documented
  // AI SDK v7 pattern.
  const uiStream = toUIMessageStream({
    stream: result.stream,
    onError: (e) => {
      logStreamError(e);
      return 'An error occurred.';
    },
  });

  const headers: Record<string, string> = {
    'X-Conversation-Id': conversationId,
  };
  if (isNomatch) headers['X-No-Match'] = '1';
  if (willHandOff) headers['X-Handed-Off'] = '1';

  return createUIMessageStreamResponse({ stream: uiStream, headers });
}
