import { google } from '@ai-sdk/google';
import { embed, embedMany } from 'ai';

const EMBEDDING_MODEL_ID = 'gemini-embedding-001';
export const EMBEDDING_DIM = 768;

const embeddingModel = google.textEmbeddingModel(EMBEDDING_MODEL_ID);

function assertDim(vec: number[], label: string) {
  if (vec.length !== EMBEDDING_DIM) {
    throw new Error(
      `${label}: expected ${EMBEDDING_DIM}-dim embedding, got ${vec.length}. ` +
        `Check providerOptions.google.outputDimensionality is being honored.`
    );
  }
}

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
    providerOptions: {
      google: {
        outputDimensionality: EMBEDDING_DIM,
        taskType: 'RETRIEVAL_QUERY',
      },
    },
  });
  assertDim(embedding, 'embedText');
  return embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: texts,
    providerOptions: {
      google: {
        outputDimensionality: EMBEDDING_DIM,
        taskType: 'RETRIEVAL_DOCUMENT',
      },
    },
  });
  embeddings.forEach((e, i) => assertDim(e, `embedTexts[${i}]`));
  return embeddings;
}
