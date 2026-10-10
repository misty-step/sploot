import Entrypoint from "./build/index.js";

const DIMENSIONS = 32;

function cosine(left, right) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function asNumbers(values) {
  if (Array.isArray(values)) return values.every((value) => typeof value === "number") ? values : null;
  if (ArrayBuffer.isView(values)) return Array.from(values);
  return null;
}

function localVectorize() {
  const rows = new Map();
  const metaBytes = (metadata) => new TextEncoder().encode(JSON.stringify(metadata ?? {})).length;
  return {
    async upsert(vectors) {
      if (!Array.isArray(vectors)) {
        const kind = vectors == null ? String(vectors) : vectors.constructor?.name || typeof vectors;
        throw new Error(`SERIALIZATION: upsert expects an array, got ${kind}`);
      }
      for (const vector of vectors) {
        if (!vector || typeof vector.id !== "string" || vector.id.length === 0 || vector.id.length > 64) {
          throw new Error("SERIALIZATION: vector id");
        }
        const values = asNumbers(vector.values);
        if (!values) {
          const kind = vector.values == null ? String(vector.values) : vector.values.constructor?.name || typeof vector.values;
          throw new Error(`SERIALIZATION: vector values (${kind})`);
        }
        if (values.length !== DIMENSIONS) {
          throw new Error(`VECTOR_DIMENSION_MISMATCH: expected ${DIMENSIONS}, got ${values.length}`);
        }
        if (vector.metadata != null && (typeof vector.metadata !== "object" || Array.isArray(vector.metadata))) {
          throw new Error("SERIALIZATION: metadata");
        }
        if (metaBytes(vector.metadata) > 10240) throw new Error("METADATA_TOO_LARGE");
        rows.set(vector.id, { id: vector.id, values, metadata: vector.metadata ?? {} });
      }
      return { mutationId: crypto.randomUUID() };
    },
    async query(vector, options = {}) {
      const values = asNumbers(vector);
      if (!values) throw new Error("SERIALIZATION: query vector");
      if (values.length !== DIMENSIONS) {
        throw new Error(`VECTOR_DIMENSION_MISMATCH: expected ${DIMENSIONS}, got ${values.length}`);
      }
      if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("SERIALIZATION: query options");
      if (options.returnMetadata !== "all") throw new Error("SERIALIZATION: returnMetadata");
      if (typeof options.topK !== "number") throw new Error("SERIALIZATION: topK");
      const filter = options.filter ?? {};
      if (typeof filter !== "object" || Array.isArray(filter)) throw new Error("SERIALIZATION: filter");
      const scored = [];
      for (const row of rows.values()) {
        if (filter.owner !== undefined && row.metadata.owner !== filter.owner) continue;
        scored.push({ id: row.id, score: cosine(values, row.values), metadata: row.metadata });
      }
      scored.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
      const matches = scored.slice(0, options.topK);
      return { matches, count: matches.length };
    },
    async getByIds(ids) {
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) throw new Error("SERIALIZATION: getByIds");
      return ids.filter((id) => rows.has(id)).map((id) => rows.get(id));
    },
  };
}

class Ai {
  async run(model) {
    throw new Error(`workers_ai_unavailable: local-stand-in refused ${model}`);
  }
}

const vectorize = localVectorize();

function wrap(env) {
  const ai = new Ai();
  return new Proxy(env, {
    get(target, prop) {
      if (prop === "VECTORIZE") return vectorize;
      if (prop === "AI") return ai;
      if (prop === "SPLOOT_LOCAL_BACKEND") return "local-stand-in";
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function loopback(request) {
  const host = (request.headers.get("host") || "").toLowerCase();
  return host.startsWith("127.0.0.1") || host.startsWith("localhost") || host.startsWith("[::1]") || host.startsWith("::1");
}

export default new Proxy(Entrypoint, {
  construct(target, args, newTarget) {
    const instance = Reflect.construct(target, args, newTarget);
    instance.fetch = async function fetch(request) {
      if (loopback(request)) {
        Object.defineProperty(this, "env", { configurable: true, value: wrap(this.env) });
      }
      return Entrypoint.prototype.fetch.call(this, request);
    };
    return instance;
  },
});
