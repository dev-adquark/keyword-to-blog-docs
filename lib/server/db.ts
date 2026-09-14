import "server-only";
import { Pool, type QueryResultRow } from "pg";
import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __ktbPgPool: Pool | undefined;
}

function getPool(): Pool {
  if (!global.__ktbPgPool) {
    const connectionString = env.DATABASE_URL;
    global.__ktbPgPool = new Pool({
      connectionString,
      ssl: connectionString.includes("sslmode=disable")
        ? false
        : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 10_000,
    });
  }
  return global.__ktbPgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Runs `fn` inside a single client so callers can issue multiple statements
 * that must be atomic (e.g. read-then-write) without pool contention. */
export async function withClient<T>(
  fn: (client: import("pg").PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
