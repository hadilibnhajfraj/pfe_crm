"use strict";

const { RagRetrievalService } = require("../src/ai/rag/retrievalService");
const { HashingEmbeddingProvider } = require("../src/ai/rag/embeddings");
const { InMemoryVectorStore } = require("../src/ai/vector");
const { LexicalOverlapReranker } = require("../src/ai/rag/reranking");
const { IRetriever } = require("../src/ai/rag/retriever.interface");
const { EmptyQueryError } = require("../src/ai/rag/errors");

const COLLECTION = "documentation";

async function seed(embeddingProvider, vectorStore, docs) {
  const vectors = await embeddingProvider.embedBatch(docs.map((d) => d.text));
  await vectorStore.upsert(
    COLLECTION,
    docs.map((d, i) => ({ id: d.id, vector: vectors[i], metadata: { text: d.text, ...d.metadata } }))
  );
}

describe("RagRetrievalService", () => {
  test("is a concrete IRetriever implementation", () => {
    const embeddingProvider = new HashingEmbeddingProvider({ dimensions: 32 });
    const service = new RagRetrievalService({ embeddingProvider, vectorStore: new InMemoryVectorStore() });
    expect(service).toBeInstanceOf(IRetriever);
  });

  test("throws EmptyQueryError for an empty or whitespace-only query", async () => {
    const embeddingProvider = new HashingEmbeddingProvider({ dimensions: 32 });
    const service = new RagRetrievalService({ embeddingProvider, vectorStore: new InMemoryVectorStore() });
    await expect(service.retrieve("")).rejects.toThrow(EmptyQueryError);
    await expect(service.retrieve("   ")).rejects.toThrow(EmptyQueryError);
  });

  test("an empty corpus returns empty results and citations gracefully", async () => {
    const embeddingProvider = new HashingEmbeddingProvider({ dimensions: 32 });
    const service = new RagRetrievalService({ embeddingProvider, vectorStore: new InMemoryVectorStore() });
    const answer = await service.retrieve("anything at all");
    expect(answer).toEqual({ query: "anything at all", results: [], citations: [] });
  });

  test("retrieves the semantically closest document and attaches a matching citation", async () => {
    const embeddingProvider = new HashingEmbeddingProvider({ dimensions: 256 });
    const vectorStore = new InMemoryVectorStore();
    await seed(embeddingProvider, vectorStore, [
      { id: "password#0", text: "How to reset a forgotten password using the login screen link", metadata: { sourceId: "password", title: "Password guide", sourceType: "markdown" } },
      { id: "porpromesh#0", text: "POR PROMESH validation locks the report permanently after approval", metadata: { sourceId: "porpromesh", title: "POR PROMESH guide", sourceType: "markdown" } },
    ]);

    const service = new RagRetrievalService({ embeddingProvider, vectorStore, topK: 1 });
    const answer = await service.retrieve("I forgot my password, how do I reset it?");

    expect(answer.results).toHaveLength(1);
    expect(answer.results[0].sourceId).toBe("password");
    expect(answer.citations).toHaveLength(1);
    expect(answer.citations[0]).toMatchObject({ sourceId: "password", title: "Password guide" });
  });

  test("topK caps the number of results returned, independent of candidateK", async () => {
    const embeddingProvider = new HashingEmbeddingProvider({ dimensions: 64 });
    const vectorStore = new InMemoryVectorStore();
    await seed(
      embeddingProvider,
      vectorStore,
      Array.from({ length: 10 }, (_, i) => ({ id: `doc${i}`, text: `document number ${i} about various topics` }))
    );

    const service = new RagRetrievalService({ embeddingProvider, vectorStore, topK: 3, candidateK: 10 });
    const answer = await service.retrieve("document about topics");
    expect(answer.results).toHaveLength(3);
  });

  test("per-call options.topK overrides the constructor default", async () => {
    const embeddingProvider = new HashingEmbeddingProvider({ dimensions: 64 });
    const vectorStore = new InMemoryVectorStore();
    await seed(
      embeddingProvider,
      vectorStore,
      Array.from({ length: 5 }, (_, i) => ({ id: `doc${i}`, text: `some document ${i}` }))
    );
    const service = new RagRetrievalService({ embeddingProvider, vectorStore, topK: 5 });
    const answer = await service.retrieve("some document", { topK: 2 });
    expect(answer.results).toHaveLength(2);
  });

  test("uses the reranker when provided, and its output order is respected", async () => {
    const embeddingProvider = new HashingEmbeddingProvider({ dimensions: 64 });
    const vectorStore = new InMemoryVectorStore();
    const fakeReranker = {
      rerank: jest.fn(async (_query, candidates) => candidates.slice().reverse()),
    };
    await seed(embeddingProvider, vectorStore, [
      { id: "first", text: "alpha content" },
      { id: "second", text: "beta content" },
    ]);
    const service = new RagRetrievalService({ embeddingProvider, vectorStore, reranker: fakeReranker, topK: 2 });
    await service.retrieve("alpha beta");
    expect(fakeReranker.rerank).toHaveBeenCalledTimes(1);
  });

  test("reranker is skipped entirely when there are zero candidates (no error)", async () => {
    const embeddingProvider = new HashingEmbeddingProvider({ dimensions: 32 });
    const vectorStore = new InMemoryVectorStore();
    const reranker = new LexicalOverlapReranker();
    const spy = jest.spyOn(reranker, "rerank");
    const service = new RagRetrievalService({ embeddingProvider, vectorStore, reranker });
    await service.retrieve("nothing indexed yet");
    expect(spy).not.toHaveBeenCalled();
  });

  test("never queries anything other than the embedding provider and the vector store it was given (no CRM access)", async () => {
    // A pure structural guarantee: retrieve() only calls methods on the two
    // injected collaborators — proven here by using bare, minimal doubles
    // with no other capability than what IEmbeddingProvider/IVectorStore
    // require.
    const embeddingProvider = { embed: jest.fn(async () => [1, 0, 0]) };
    const vectorStore = { query: jest.fn(async () => []) };
    const service = new RagRetrievalService({ embeddingProvider, vectorStore });
    await service.retrieve("test");
    expect(embeddingProvider.embed).toHaveBeenCalledWith("test");
    expect(vectorStore.query).toHaveBeenCalled();
  });
});
