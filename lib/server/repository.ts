import "server-only";
import { query, queryOne, withClient } from "./db";
import {
  newUserId,
  newCustomerId,
  newApiKeyId,
  newUsageId,
  newJobId,
  newAccessRequestId,
  newOtpId,
  newSessionId,
} from "./ids";
import type { OtpPurpose } from "./otp";
import { DEFAULT_PLAN_ID } from "@/lib/plans";
import type { GenerateRequestV1, SEOPostV1 } from "@/lib/types";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  status: string;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OtpRow {
  id: string;
  user_id: string;
  purpose: OtpPurpose;
  otp_hash: string;
  expires_at: string;
  attempts: number;
  verified_at: string | null;
  created_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  session_token_hash: string;
  expires_at: string;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

export interface CustomerRow {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyRow {
  id: string;
  customer_id: string;
  key_prefix: string;
  key_hash: string;
  name: string;
  environment: string;
  scopes: string[];
  status: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface JobRow {
  id: string;
  customer_id: string;
  api_key_id: string;
  status: string;
  request_id: string;
  input: GenerateRequestV1;
  webhook_url: string | null;
  webhook_events: string[];
  webhook_secret: string | null;
  result: SEOPostV1 | null;
  rendered: { markdown?: string; html?: string } | null;
  error_code: string | null;
  error_message: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Users / Customers ----------

export async function createUserAndCustomer(params: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<{ user: UserRow; customer: CustomerRow }> {
  const userId = newUserId();
  const customerId = newCustomerId();

  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      console.info("signup_db_debug", { step: "user_insert_start" });
      const user = await client.query<UserRow>(
        `INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4) RETURNING *`,
        [userId, params.email.toLowerCase(), params.passwordHash, params.name]
      );
      console.info("signup_db_debug", { step: "user_insert_done", userId: user.rows[0]?.id });

      console.info("signup_db_debug", { step: "customer_insert_start", userId });
      const customer = await client.query<CustomerRow>(
        `INSERT INTO customers (id, user_id, plan) VALUES ($1, $2, $3) RETURNING *`,
        [customerId, userId, DEFAULT_PLAN_ID]
      );
      console.info("signup_db_debug", { step: "customer_insert_done", customerId: customer.rows[0]?.id });

      await client.query("COMMIT");
      console.info("signup_db_debug", { step: "transaction_commit" });

      const createdUser = user.rows[0];
      const createdCustomer = customer.rows[0];
      if (!createdUser || !createdCustomer) {
        throw new Error("Failed to create account");
      }
      return { user: createdUser, customer: createdCustomer };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("signup_db_debug", {
        step: "transaction_rollback",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  });
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>(`SELECT * FROM users WHERE email = $1`, [
    email.toLowerCase(),
  ]);
}

export async function findUserById(id: string): Promise<UserRow | null> {
  return queryOne<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
}

export async function findCustomerByUserId(
  userId: string
): Promise<CustomerRow | null> {
  return queryOne<CustomerRow>(`SELECT * FROM customers WHERE user_id = $1`, [
    userId,
  ]);
}

export async function findCustomerById(
  id: string
): Promise<CustomerRow | null> {
  return queryOne<CustomerRow>(`SELECT * FROM customers WHERE id = $1`, [id]);
}

export async function updateCustomerPlan(
  customerId: string,
  plan: string
): Promise<void> {
  await query(
    `UPDATE customers SET plan = $2, updated_at = now() WHERE id = $1`,
    [customerId, plan]
  );
}

export async function markUserEmailVerified(userId: string): Promise<void> {
  await query(
    `UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1`,
    [userId]
  );
}

export async function updateUserPassword(
  userId: string,
  passwordHash: string
): Promise<void> {
  await query(
    `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`,
    [userId, passwordHash]
  );
}

// ---------- One-time codes (email verification + password reset) ----------

/** Issues a fresh OTP, first invalidating any prior unverified code for the
 * same user + purpose so only the most recently sent code can ever verify. */
export async function createOtp(params: {
  userId: string;
  purpose: OtpPurpose;
  otpHash: string;
  expiresAt: Date;
}): Promise<OtpRow> {
  return withClient(async (client) => {
    await client.query(
      `DELETE FROM otps WHERE user_id = $1 AND purpose = $2 AND verified_at IS NULL`,
      [params.userId, params.purpose]
    );
    const id = newOtpId();
    const row = await client.query<OtpRow>(
      `INSERT INTO otps (id, user_id, purpose, otp_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, params.userId, params.purpose, params.otpHash, params.expiresAt.toISOString()]
    );
    return row.rows[0]!;
  });
}

/** The most recent not-yet-verified code for this user + purpose, if any. */
export async function findLatestPendingOtp(
  userId: string,
  purpose: OtpPurpose
): Promise<OtpRow | null> {
  return queryOne<OtpRow>(
    `SELECT * FROM otps WHERE user_id = $1 AND purpose = $2 AND verified_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [userId, purpose]
  );
}

export async function findOtpById(id: string): Promise<OtpRow | null> {
  return queryOne<OtpRow>(`SELECT * FROM otps WHERE id = $1`, [id]);
}

export async function incrementOtpAttempts(id: string): Promise<number> {
  const row = await queryOne<{ attempts: number }>(
    `UPDATE otps SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
    [id]
  );
  return row?.attempts ?? OTP_MAX_ATTEMPTS_FALLBACK;
}

const OTP_MAX_ATTEMPTS_FALLBACK = 999; // row vanished mid-request — treat as exhausted, never as fresh.

export async function markOtpVerified(id: string): Promise<void> {
  await query(`UPDATE otps SET verified_at = now() WHERE id = $1`, [id]);
}

export async function deleteOtp(id: string): Promise<void> {
  await query(`DELETE FROM otps WHERE id = $1`, [id]);
}

// ---------- Server-side browser sessions ----------

export async function createSession(params: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<SessionRow> {
  const id = newSessionId();
  const row = await queryOne<SessionRow>(
    `INSERT INTO sessions (id, user_id, session_token_hash, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, params.userId, params.tokenHash, params.expiresAt.toISOString()]
  );
  if (!row) throw new Error("Failed to create session");
  return row;
}

/** Only ever returns a session that is neither revoked nor past its absolute expiry. */
export async function findActiveSessionByTokenHash(
  tokenHash: string
): Promise<SessionRow | null> {
  return queryOne<SessionRow>(
    `SELECT * FROM sessions
     WHERE session_token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [tokenHash]
  );
}

export async function touchSession(id: string): Promise<void> {
  await query(`UPDATE sessions SET last_seen_at = now() WHERE id = $1`, [id]);
}

export async function revokeSession(tokenHash: string): Promise<void> {
  await query(
    `UPDATE sessions SET revoked_at = now() WHERE session_token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
}

/** Called on password reset — forces every other logged-in browser to require a fresh login. */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await query(
    `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

// ---------- API Keys ----------

export async function insertApiKey(params: {
  customerId: string;
  keyPrefix: string;
  keyHash: string;
  name: string;
  environment: string;
  scopes: string[];
}): Promise<ApiKeyRow> {
  const id = newApiKeyId();
  const row = await queryOne<ApiKeyRow>(
    `INSERT INTO api_keys (id, customer_id, key_prefix, key_hash, name, environment, scopes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      id,
      params.customerId,
      params.keyPrefix,
      params.keyHash,
      params.name,
      params.environment,
      params.scopes,
    ]
  );
  if (!row) throw new Error("Failed to create API key");
  return row;
}

export async function findApiKeyByHash(
  keyHash: string
): Promise<ApiKeyRow | null> {
  return queryOne<ApiKeyRow>(`SELECT * FROM api_keys WHERE key_hash = $1`, [
    keyHash,
  ]);
}

export async function listApiKeysForCustomer(
  customerId: string
): Promise<ApiKeyRow[]> {
  return query<ApiKeyRow>(
    `SELECT * FROM api_keys WHERE customer_id = $1 ORDER BY created_at DESC`,
    [customerId]
  );
}

export async function touchApiKeyLastUsed(id: string): Promise<void> {
  await query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [id]);
}

export async function revokeApiKey(
  id: string,
  customerId: string
): Promise<boolean> {
  const rows = await query(
    `UPDATE api_keys SET status = 'revoked', revoked_at = now()
     WHERE id = $1 AND customer_id = $2 AND status = 'active' RETURNING id`,
    [id, customerId]
  );
  return rows.length > 0;
}

// ---------- Usage ----------

export async function recordUsageEvent(params: {
  apiKeyId: string;
  customerId: string;
  endpoint: string;
  requestId: string;
  statusCode: number;
  success: boolean;
  words: number;
  durationMs: number;
  countedTowardQuota: boolean;
}): Promise<void> {
  await query(
    `INSERT INTO usage_events
      (id, api_key_id, customer_id, endpoint, request_id, status_code, success, words, duration_ms, counted_toward_quota)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      newUsageId(),
      params.apiKeyId,
      params.customerId,
      params.endpoint,
      params.requestId,
      params.statusCode,
      params.success,
      params.words,
      params.durationMs,
      params.countedTowardQuota,
    ]
  );
}

export async function getUsageSince(
  customerId: string,
  since: Date
): Promise<{ requests: number; words: number }> {
  const row = await queryOne<{ requests: string; words: string }>(
    `SELECT COUNT(*) FILTER (WHERE counted_toward_quota) AS requests,
            COALESCE(SUM(words) FILTER (WHERE counted_toward_quota), 0) AS words
     FROM usage_events WHERE customer_id = $1 AND created_at >= $2`,
    [customerId, since.toISOString()]
  );
  return {
    requests: Number(row?.requests ?? 0),
    words: Number(row?.words ?? 0),
  };
}

// ---------- Jobs ----------

export async function createJobRow(params: {
  customerId: string;
  apiKeyId: string;
  requestId: string;
  input: GenerateRequestV1;
  webhookUrl?: string;
  webhookEvents?: string[];
  webhookSecret?: string;
  idempotencyKey?: string;
}): Promise<JobRow> {
  const id = newJobId();
  const row = await queryOne<JobRow>(
    `INSERT INTO jobs (id, customer_id, api_key_id, request_id, input, webhook_url, webhook_events, webhook_secret, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      id,
      params.customerId,
      params.apiKeyId,
      params.requestId,
      JSON.stringify(params.input),
      params.webhookUrl ?? null,
      params.webhookEvents ?? [],
      params.webhookSecret ?? null,
      params.idempotencyKey ?? null,
    ]
  );
  if (!row) throw new Error("Failed to create job");
  return row;
}

export async function getJobById(id: string): Promise<JobRow | null> {
  return queryOne<JobRow>(`SELECT * FROM jobs WHERE id = $1`, [id]);
}

export async function markJobProcessing(id: string): Promise<void> {
  await query(
    `UPDATE jobs SET status = 'processing', updated_at = now() WHERE id = $1`,
    [id]
  );
}

export async function markJobSucceeded(
  id: string,
  result: SEOPostV1,
  rendered: { markdown?: string; html?: string }
): Promise<void> {
  await query(
    `UPDATE jobs SET status = 'succeeded', result = $2, rendered = $3, updated_at = now() WHERE id = $1`,
    [id, JSON.stringify(result), JSON.stringify(rendered)]
  );
}

export async function markJobFailed(
  id: string,
  errorCode: string,
  errorMessage: string
): Promise<void> {
  await query(
    `UPDATE jobs SET status = 'failed', error_code = $2, error_message = $3, updated_at = now() WHERE id = $1`,
    [id, errorCode, errorMessage]
  );
}

// ---------- Access requests ----------

export async function createAccessRequest(params: {
  customerId: string;
  requestedPlan: string;
  reason?: string;
}): Promise<{ id: string }> {
  const id = newAccessRequestId();
  await query(
    `INSERT INTO access_requests (id, customer_id, requested_plan, reason)
     VALUES ($1, $2, $3, $4)`,
    [id, params.customerId, params.requestedPlan, params.reason ?? null]
  );
  return { id };
}

export async function listAccessRequestsForCustomer(customerId: string) {
  return query(
    `SELECT * FROM access_requests WHERE customer_id = $1 ORDER BY created_at DESC`,
    [customerId]
  );
}

// ---------- Idempotency (for /v1/generate) ----------

export async function findIdempotencyRecord(
  apiKeyId: string,
  idempotencyKey: string
): Promise<{ request_hash: string; response: unknown; status_code: number } | null> {
  return queryOne(
    `SELECT request_hash, response, status_code FROM idempotency_records WHERE api_key_id = $1 AND idempotency_key = $2`,
    [apiKeyId, idempotencyKey]
  );
}

export async function claimIdempotencyRequest(params: {
  apiKeyId: string;
  idempotencyKey: string;
  requestHash: string;
  response: unknown;
  statusCode: number;
}): Promise<{ claimed: boolean; existing: { request_hash: string; response: unknown; status_code: number } | null }> {
  const row = await queryOne<{
    request_hash: string;
    response: unknown;
    status_code: number;
  }>(
    `INSERT INTO idempotency_records (api_key_id, idempotency_key, request_hash, response, status_code)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (api_key_id, idempotency_key) DO NOTHING
     RETURNING request_hash, response, status_code`,
    [
      params.apiKeyId,
      params.idempotencyKey,
      params.requestHash,
      JSON.stringify(params.response),
      params.statusCode,
    ]
  );

  if (row) {
    return { claimed: true, existing: row };
  }

  const existing = await findIdempotencyRecord(params.apiKeyId, params.idempotencyKey);
  return { claimed: false, existing };
}

export async function updateIdempotencyRecord(params: {
  apiKeyId: string;
  idempotencyKey: string;
  requestHash: string;
  response: unknown;
  statusCode: number;
}): Promise<void> {
  await query(
    `UPDATE idempotency_records
     SET request_hash = $3,
         response = $4,
         status_code = $5,
         created_at = created_at
     WHERE api_key_id = $1 AND idempotency_key = $2`,
    [
      params.apiKeyId,
      params.idempotencyKey,
      params.requestHash,
      JSON.stringify(params.response),
      params.statusCode,
    ]
  );
}

export async function saveIdempotencyRecord(params: {
  apiKeyId: string;
  idempotencyKey: string;
  requestHash: string;
  response: unknown;
  statusCode: number;
}): Promise<void> {
  await updateIdempotencyRecord(params);
}
