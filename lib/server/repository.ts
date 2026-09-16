import "server-only";
import { query, queryOne, withClient } from "./db";
import {
  newApiKeyId,
  newUsageId,
  newJobId,
  newAccessRequestId,
  newOtpId,
  newSessionId,
  newWebhookDeliveryId,
  newAuditEventId,
  newQualityReportId,
} from "./ids";
import type { OtpPurpose } from "./otp";
import type { ContentQualityReport, ContentQualitySummary, GenerateRequestV1, SEOPostV1 } from "@/lib/types";

export type TeamRole = "OWNER" | "DEVELOPER" | "DIGITAL_MARKETING" | "ACCOUNT_MANAGEMENT";

export const TEAM_ROLES: readonly TeamRole[] = [
  "OWNER",
  "DEVELOPER",
  "DIGITAL_MARKETING",
  "ACCOUNT_MANAGEMENT",
];

export function isValidTeamRole(value: string): value is TeamRole {
  return (TEAM_ROLES as readonly string[]).includes(value);
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  status: string;
  role: TeamRole;
  last_login_at: string | null;
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
  quality: ContentQualitySummary | null;
  error_code: string | null;
  error_message: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Users / Customers ----------

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

export async function updateUserPassword(
  userId: string,
  passwordHash: string
): Promise<void> {
  await query(
    `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`,
    [userId, passwordHash]
  );
}

export async function touchUserLastLogin(userId: string): Promise<void> {
  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);
}

/** OWNER-only: enable/disable a team member's account. Historical usage data is untouched. */
export async function updateUserStatus(
  userId: string,
  status: "active" | "disabled"
): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `UPDATE users SET status = $2, updated_at = now() WHERE id = $1 RETURNING *`,
    [userId, status]
  );
}

/** All team members with their linked customer — the base row set for the OWNER team dashboard. */
export async function listUsersWithCustomers(): Promise<
  Array<UserRow & { customer_id: string | null }>
> {
  return query<UserRow & { customer_id: string | null }>(
    `SELECT u.*, c.id AS customer_id
     FROM users u
     LEFT JOIN customers c ON c.user_id = u.id
     ORDER BY u.created_at ASC`
  );
}

export async function findUserWithCustomerById(
  userId: string
): Promise<(UserRow & { customer_id: string | null }) | null> {
  return queryOne<UserRow & { customer_id: string | null }>(
    `SELECT u.*, c.id AS customer_id
     FROM users u
     LEFT JOIN customers c ON c.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
}

/** Every API key across the team, with its owning user — for the OWNER dashboard only. */
export async function listApiKeysWithOwners(): Promise<
  Array<ApiKeyRow & { user_id: string; user_email: string; user_name: string }>
> {
  return query<ApiKeyRow & { user_id: string; user_email: string; user_name: string }>(
    `SELECT ak.*, u.id AS user_id, u.email AS user_email, u.name AS user_name
     FROM api_keys ak
     JOIN customers c ON c.id = ak.customer_id
     JOIN users u ON u.id = c.user_id
     ORDER BY ak.created_at DESC`
  );
}

export async function findApiKeyWithOwnerById(
  id: string
): Promise<
  (ApiKeyRow & { user_id: string; user_email: string; user_name: string }) | null
> {
  return queryOne<ApiKeyRow & { user_id: string; user_email: string; user_name: string }>(
    `SELECT ak.*, u.id AS user_id, u.email AS user_email, u.name AS user_name
     FROM api_keys ak
     JOIN customers c ON c.id = ak.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE ak.id = $1`,
    [id]
  );
}

/** OWNER-only revoke — unlike revokeApiKey(id, customerId), this isn't restricted to one customer. */
export async function revokeApiKeyAsOwner(id: string): Promise<boolean> {
  const rows = await query(
    `UPDATE api_keys SET status = 'revoked', revoked_at = now()
     WHERE id = $1 AND status = 'active' RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

export async function getUsageSinceForApiKey(
  apiKeyId: string,
  since: Date
): Promise<{ requests: number; words: number; posts: number; failed: number; rateLimited: number }> {
  const row = await queryOne<{
    requests: string;
    words: string;
    posts: string;
    failed: string;
    rate_limited: string;
  }>(
    `SELECT COUNT(*) FILTER (WHERE counted_toward_quota) AS requests,
            COALESCE(SUM(words) FILTER (WHERE counted_toward_quota), 0) AS words,
            COALESCE(SUM(posts) FILTER (WHERE counted_toward_quota), 0) AS posts,
            COUNT(*) FILTER (WHERE NOT success) AS failed,
            COUNT(*) FILTER (WHERE status_code = 429) AS rate_limited
     FROM usage_events WHERE api_key_id = $1 AND created_at >= $2`,
    [apiKeyId, since.toISOString()]
  );
  return {
    requests: Number(row?.requests ?? 0),
    words: Number(row?.words ?? 0),
    posts: Number(row?.posts ?? 0),
    failed: Number(row?.failed ?? 0),
    rateLimited: Number(row?.rate_limited ?? 0),
  };
}

export interface UsageEventRow {
  id: string;
  api_key_id: string;
  customer_id: string;
  endpoint: string;
  request_id: string;
  status_code: number;
  success: boolean;
  words: number;
  posts: number;
  duration_ms: number;
  counted_toward_quota: boolean;
  created_at: string;
}

export async function listRecentUsageEventsForApiKey(
  apiKeyId: string,
  limit: number
): Promise<UsageEventRow[]> {
  return query<UsageEventRow>(
    `SELECT * FROM usage_events WHERE api_key_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [apiKeyId, limit]
  );
}

/** Team-wide recent request activity, across every user's keys — OWNER dashboard only. */
export async function listRecentUsageEventsForTeam(
  limit: number
): Promise<Array<UsageEventRow & { user_id: string; user_email: string; key_prefix: string }>> {
  return query<UsageEventRow & { user_id: string; user_email: string; key_prefix: string }>(
    `SELECT ue.*, u.id AS user_id, u.email AS user_email, ak.key_prefix
     FROM usage_events ue
     JOIN api_keys ak ON ak.id = ue.api_key_id
     JOIN customers c ON c.id = ue.customer_id
     JOIN users u ON u.id = c.user_id
     ORDER BY ue.created_at DESC
     LIMIT $1`,
    [limit]
  );
}

export async function getJobCountsByStatus(
  customerId: string
): Promise<{ queued: number; processing: number; succeeded: number; failed: number }> {
  const rows = await query<{ status: string; n: string }>(
    `SELECT status, COUNT(*) AS n FROM jobs WHERE customer_id = $1 GROUP BY status`,
    [customerId]
  );
  const counts = { queued: 0, processing: 0, succeeded: 0, failed: 0 };
  for (const row of rows) {
    if (row.status in counts) counts[row.status as keyof typeof counts] = Number(row.n);
  }
  return counts;
}

// ---------- Audit log (auth/admin security events — distinct from usage_events) ----------

export interface AuditEventRow {
  id: string;
  event_type: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  target_api_key_id: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

export async function recordAuditEvent(params: {
  eventType: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  targetApiKeyId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO audit_events (id, event_type, actor_user_id, target_user_id, target_api_key_id, metadata, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      newAuditEventId(),
      params.eventType,
      params.actorUserId ?? null,
      params.targetUserId ?? null,
      params.targetApiKeyId ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null,
      params.ip ?? null,
    ]
  );
}

export async function listRecentAuditEvents(
  limit: number
): Promise<
  Array<
    AuditEventRow & {
      actor_email: string | null;
      target_user_email: string | null;
      target_api_key_prefix: string | null;
    }
  >
> {
  return query(
    `SELECT ae.*,
            actor.email AS actor_email,
            target.email AS target_user_email,
            ak.key_prefix AS target_api_key_prefix
     FROM audit_events ae
     LEFT JOIN users actor ON actor.id = ae.actor_user_id
     LEFT JOIN users target ON target.id = ae.target_user_id
     LEFT JOIN api_keys ak ON ak.id = ae.target_api_key_id
     ORDER BY ae.created_at DESC
     LIMIT $1`,
    [limit]
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
  /** 1 for a successfully generated post, 0 otherwise — a distinct billable
   * unit from `words`, tracked separately per the metering contract. */
  posts?: number;
  durationMs: number;
  countedTowardQuota: boolean;
}): Promise<void> {
  await query(
    `INSERT INTO usage_events
      (id, api_key_id, customer_id, endpoint, request_id, status_code, success, words, posts, duration_ms, counted_toward_quota)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      newUsageId(),
      params.apiKeyId,
      params.customerId,
      params.endpoint,
      params.requestId,
      params.statusCode,
      params.success,
      params.words,
      params.posts ?? (params.success ? 1 : 0),
      params.durationMs,
      params.countedTowardQuota,
    ]
  );
}

export async function getUsageSince(
  customerId: string,
  since: Date
): Promise<{ requests: number; words: number; posts: number }> {
  const row = await queryOne<{ requests: string; words: string; posts: string }>(
    `SELECT COUNT(*) FILTER (WHERE counted_toward_quota) AS requests,
            COALESCE(SUM(words) FILTER (WHERE counted_toward_quota), 0) AS words,
            COALESCE(SUM(posts) FILTER (WHERE counted_toward_quota), 0) AS posts
     FROM usage_events WHERE customer_id = $1 AND created_at >= $2`,
    [customerId, since.toISOString()]
  );
  return {
    requests: Number(row?.requests ?? 0),
    words: Number(row?.words ?? 0),
    posts: Number(row?.posts ?? 0),
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

/**
 * Atomically claims a queued job for processing — `WHERE status = 'queued'`
 * makes this a single conditional UPDATE, so two concurrent invocations
 * (e.g. a QStash redelivery racing the original attempt) can never both
 * "win" the claim and double-process/double-bill the same job. Returns the
 * claimed row, or null if it was already claimed (or isn't queued).
 */
export async function claimJobForProcessing(id: string): Promise<JobRow | null> {
  return queryOne<JobRow>(
    `UPDATE jobs SET status = 'processing', updated_at = now()
     WHERE id = $1 AND status = 'queued' RETURNING *`,
    [id]
  );
}

export async function markJobSucceeded(
  id: string,
  result: SEOPostV1,
  rendered: { markdown?: string; html?: string },
  quality: ContentQualitySummary
): Promise<void> {
  await query(
    `UPDATE jobs SET status = 'succeeded', result = $2, rendered = $3, quality = $4, updated_at = now() WHERE id = $1`,
    [id, JSON.stringify(result), JSON.stringify(rendered), JSON.stringify(quality)]
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

// ---------- Webhook delivery audit trail ----------

export interface WebhookDeliveryRow {
  id: string;
  job_id: string;
  event: string;
  url: string;
  status: "pending" | "delivered" | "failed" | "blocked";
  attempts: number;
  last_status_code: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export async function createWebhookDeliveryRecord(params: {
  jobId: string;
  event: "job.succeeded" | "job.failed";
  url: string;
}): Promise<WebhookDeliveryRow> {
  const id = newWebhookDeliveryId();
  const row = await queryOne<WebhookDeliveryRow>(
    `INSERT INTO webhook_deliveries (id, job_id, event, url) VALUES ($1,$2,$3,$4) RETURNING *`,
    [id, params.jobId, params.event, params.url]
  );
  if (!row) throw new Error("Failed to create webhook delivery record");
  return row;
}

export async function updateWebhookDeliveryRecord(
  id: string,
  params: {
    status: "delivered" | "failed" | "blocked";
    attempts: number;
    lastStatusCode?: number;
    lastError?: string;
  }
): Promise<void> {
  await query(
    `UPDATE webhook_deliveries
     SET status = $2, attempts = $3, last_status_code = $4, last_error = $5, updated_at = now()
     WHERE id = $1`,
    [id, params.status, params.attempts, params.lastStatusCode ?? null, params.lastError ?? null]
  );
}

export async function listWebhookDeliveriesForJob(jobId: string): Promise<WebhookDeliveryRow[]> {
  return query<WebhookDeliveryRow>(
    `SELECT * FROM webhook_deliveries WHERE job_id = $1 ORDER BY created_at ASC`,
    [jobId]
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

// ---------- Content quality reports ----------

/** Persists quality-pipeline metadata/scores only — never the generated
 * content itself (already stored on the job/usage event). Best-effort: a
 * failure here must never fail the request it's reporting on. */
export async function recordContentQualityReport(params: {
  requestId: string;
  jobId?: string | null;
  customerId: string;
  apiKeyId?: string | null;
  overallStatus: "PASS" | "FAIL";
  report: ContentQualityReport;
}): Promise<void> {
  await query(
    `INSERT INTO content_quality_reports
      (id, request_id, job_id, customer_id, api_key_id, quality_version, overall_status,
       overall_score, writing_score, originality_score, depth_score, seo_score,
       readability_score, keyword_score, structure_score, factuality_status,
       freshness_status, revision_count, failed_checks, warnings)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [
      newQualityReportId(),
      params.requestId,
      params.jobId ?? null,
      params.customerId,
      params.apiKeyId ?? null,
      params.report.qualityVersion,
      params.overallStatus,
      params.report.overallScore,
      params.report.writingScore,
      params.report.originalityScore,
      params.report.depthScore,
      params.report.seoScore,
      params.report.readabilityScore,
      params.report.keywordScore,
      params.report.structureScore,
      params.report.factualityStatus,
      params.report.freshnessStatus,
      params.report.revisionCount,
      JSON.stringify(params.report.failedChecks),
      JSON.stringify(params.report.warnings),
    ]
  );
}
