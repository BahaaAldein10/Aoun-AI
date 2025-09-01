// src/lib/upstash-vector.ts

const UPSTASH_REST_URL = process.env.UPSTASH_VECTOR_REST_URL;
const UPSTASH_REST_TOKEN = process.env.UPSTASH_VECTOR_REST_TOKEN;

if (!UPSTASH_REST_URL || !UPSTASH_REST_TOKEN) {
  throw new Error("Missing Upstash Vector environment variables");
}

/* ===== Types ===== */

export interface Vector {
  id: string;
  vector: number[];
  metadata?: Record<string, unknown>;
}

export interface QueryOptions {
  topK?: number;
  includeVectors?: boolean;
  includeMetadata?: boolean;
  filter?: string;
}

export interface QueryResult {
  id: string;
  score: number;
  vector?: number[];
  metadata?: Record<string, unknown>;
}

export interface UpsertResponse {
  upserted?: number;
  // other provider-specific fields may exist
}

export interface DeleteResponse {
  deleted?: number;
}

export interface InfoResponse {
  vectorCount?: number;
  pendingVectorCount?: number;
  indexSize?: number;
  dimension?: number;
  similarityFunction?: string;
}

export interface RangeResponse {
  vectors?: Vector[];
  nextCursor?: string;
}

/* ===== Error type ===== */

export class UpstashVectorError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown,
  ) {
    super(message);
    this.name = "UpstashVectorError";
  }
}

/* ===== Client ===== */

export class UpstashVectorClient {
  private baseUrl: string;
  private token: string;

  constructor(
    url: string = UPSTASH_REST_URL!,
    token: string = UPSTASH_REST_TOKEN!,
  ) {
    this.baseUrl = url.endsWith("/") ? url.slice(0, -1) : url;
    this.token = token;
  }

  // Generic request helper returning typed data
  private async makeRequest<T = unknown>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });

    const text = await res.text().catch(() => "");
    let json: unknown = undefined;

    // Try parse JSON if possible
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      // leave json undefined if not JSON
      json = undefined;
    }

    if (!res.ok) {
      // prefer structured error if available
      const errMsg =
        json &&
        typeof json === "object" &&
        "error" in (json as Record<string, unknown>)
          ? String((json as Record<string, unknown>)["error"])
          : `${res.status} ${res.statusText} - ${text}`;

      throw new UpstashVectorError(
        `Upstash Vector API error: ${errMsg}`,
        res.status,
        json,
      );
    }

    // If the response embeds `result`, return that; else return parsed JSON or empty object
    if (
      json &&
      typeof json === "object" &&
      "result" in (json as Record<string, unknown>)
    ) {
      return (json as Record<string, unknown>)["result"] as unknown as T;
    }

    // If no JSON body, return an empty object cast to T
    return ((json as unknown) ?? ({} as unknown)) as T;
  }

  /* ===== Upsert =====
     Accepts either a single Vector or an array of Vectors.
     Upstash REST commonly expects an object like { vectors: [...] } — we send that.
  */
  async upsert(vectors: Vector | Vector[]): Promise<UpsertResponse> {
    const vectorArray = Array.isArray(vectors) ? vectors : [vectors];
    // request body is { vectors: [...] } — keeps the endpoint predictable
    return this.makeRequest<UpsertResponse>("/upsert", {
      method: "POST",
      body: JSON.stringify({ vectors: vectorArray }),
    });
  }

  /* ===== Query similar vectors =====
     POST /query with { vector, topK, includeVectors, includeMetadata, filter? }
  */
  async query(
    vector: number[],
    options: QueryOptions = {},
  ): Promise<QueryResult[]> {
    const {
      topK = 10,
      includeVectors = false,
      includeMetadata = true,
      filter,
    } = options;

    const body: Record<string, unknown> = {
      vector,
      topK,
      includeVectors,
      includeMetadata,
    };

    if (filter) body.filter = filter;

    return this.makeRequest<QueryResult[]>("/query", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /* ===== Query by id (search by a vector id) ===== */
  async queryById(
    id: string,
    options: QueryOptions = {},
  ): Promise<QueryResult[]> {
    const {
      topK = 10,
      includeVectors = false,
      includeMetadata = true,
      filter,
    } = options;

    const body: Record<string, unknown> = {
      id,
      topK,
      includeVectors,
      includeMetadata,
    };

    if (filter) body.filter = filter;

    return this.makeRequest<QueryResult[]>("/query", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /* ===== Fetch by IDs ===== */
  async fetch(
    ids: string | string[],
    includeVectors = true,
  ): Promise<Vector[]> {
    const idArray = Array.isArray(ids) ? ids : [ids];

    const result = await this.makeRequest<{ vectors?: Vector[] }>("/fetch", {
      method: "POST",
      body: JSON.stringify({ ids: idArray, includeVectors }),
    });

    return result.vectors ?? [];
  }

  /* ===== Delete by IDs ===== */
  async delete(ids: string | string[]): Promise<DeleteResponse> {
    const idArray = Array.isArray(ids) ? ids : [ids];

    return this.makeRequest<DeleteResponse>("/delete", {
      method: "POST",
      body: JSON.stringify({ ids: idArray }),
    });
  }

  /* ===== Delete by metadata filter ===== */
  async deleteByMetadata(filter: string): Promise<DeleteResponse> {
    return this.makeRequest<DeleteResponse>("/delete", {
      method: "POST",
      body: JSON.stringify({ filter }),
    });
  }

  /* ===== Index info ===== */
  async info(): Promise<InfoResponse> {
    return this.makeRequest<InfoResponse>("/info", { method: "POST" });
  }

  /* ===== Range / pagination ===== */
  async range(
    cursor?: string,
    limit = 100,
    includeVectors = true,
  ): Promise<RangeResponse> {
    const body: Record<string, unknown> = { limit, includeVectors };
    if (cursor) body.cursor = cursor;

    return this.makeRequest<RangeResponse>("/range", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /* ===== Reset ===== */
  async reset(): Promise<{ success: boolean }> {
    return this.makeRequest<{ success: boolean }>("/reset", { method: "POST" });
  }

  /* ===== Update metadata ===== */
  async updateMetadata(
    id: string,
    metadata: Record<string, unknown>,
  ): Promise<{ updated?: number }> {
    return this.makeRequest<{ updated?: number }>("/update", {
      method: "POST",
      body: JSON.stringify({ id, metadata }),
    });
  }
}

/* ===== Export a default instance ===== */
const upstashVector = new UpstashVectorClient();
export default upstashVector;

/* ===== Utilities ===== */
export const createVector = (
  id: string,
  vector: number[],
  metadata?: Record<string, unknown>,
): Vector => ({ id, vector, ...(metadata ? { metadata } : {}) });

export const normalizeVector = (vector: number[]): number[] => {
  const magnitude = Math.sqrt(vector.reduce((sum, n) => sum + n * n, 0));
  return magnitude === 0 ? vector : vector.map((v) => v / magnitude);
};

export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length)
    throw new Error("Vectors must have the same dimension");
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return dot / (magA * magB);
};
