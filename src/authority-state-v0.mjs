import { authorityFail } from "./authority-error.mjs";

const SHA256_HEX = /^[0-9a-f]{64}$/;
const NONCE_HEX = /^[0-9a-f]{64}$/;
const ISSUER_KEY_ID = /^ed25519-spki-sha256:[0-9a-f]{64}$/;

const STATES = new Set([
  "ISSUED",
  "PAYLOAD_STAGED",
  "TX_RESERVED",
  "TX_EXECUTED",
  "PAYLOAD_RELEASED",
  "CONFORMANT",
  "REJECTED",
  "EXPIRED",
  "PARTIAL_TX_ONLY",
  "NONCONFORMANT",
]);

function requireString(value, code, label) {
  if (typeof value !== "string" || value.length === 0) {
    authorityFail(code, label + " must be a non-empty string");
  }
  return value;
}

function requireSha256(value, code, label) {
  if (typeof value !== "string" || !SHA256_HEX.test(value)) {
    authorityFail(code, label + " must be 64 lowercase hexadecimal characters");
  }
  return value;
}

function requireIssuerKeyId(value) {
  if (typeof value !== "string" || !ISSUER_KEY_ID.test(value)) {
    authorityFail("S0_ISSUER_KEY_ID_INVALID", "issuer_key_id is invalid");
  }
  return value;
}

function requireNonce(value) {
  if (typeof value !== "string" || !NONCE_HEX.test(value)) {
    authorityFail("S0_NONCE_INVALID", "nonce must be 64 lowercase hexadecimal characters");
  }
  return value;
}

function requireTime(value, code, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    authorityFail(code, label + " must be a non-negative safe integer");
  }
  return value;
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    issuerKeyId: row.issuer_key_id,
    nonce: row.nonce,
    transitionCommitment: row.transition_commitment,
    enforcementDomain: row.enforcement_domain,
    notBefore: row.not_before,
    expiresAt: row.expires_at,
    warrantBodySha256: row.warrant_body_sha256,
    state: row.state,
    stagedPayloadSha256: row.staged_payload_sha256 ?? null,
    txEvidenceSha256: row.tx_evidence_sha256 ?? null,
    consumedAt: row.consumed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AuthorityStateStoreV0 {
  constructor(db, { now = () => Date.now() } = {}) {
    this.db = db;
    this.now = now;

    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA synchronous=FULL");
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS authority_state (" +
        "issuer_key_id TEXT NOT NULL," +
        "nonce TEXT NOT NULL," +
        "transition_commitment TEXT NOT NULL," +
        "enforcement_domain TEXT NOT NULL," +
        "not_before INTEGER NOT NULL," +
        "expires_at INTEGER NOT NULL," +
        "warrant_body_sha256 TEXT NOT NULL," +
        "state TEXT NOT NULL," +
        "staged_payload_sha256 TEXT," +
        "tx_evidence_sha256 TEXT," +
        "consumed_at INTEGER," +
        "created_at INTEGER NOT NULL," +
        "updated_at INTEGER NOT NULL," +
        "PRIMARY KEY (issuer_key_id, nonce)" +
      ") STRICT"
    );
  }

  close() {
    this.db.close();
  }

  currentTimeMs() {
    return requireTime(this.now(), "S0_NOW_INVALID", "harness time");
  }

  _transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
      }
      throw err;
    }
  }

  _select(issuerKeyId, nonce) {
    return this.db
      .prepare(
        "SELECT issuer_key_id, nonce, transition_commitment, enforcement_domain, " +
        "not_before, expires_at, warrant_body_sha256, state, " +
        "staged_payload_sha256, tx_evidence_sha256, consumed_at, " +
        "created_at, updated_at " +
        "FROM authority_state WHERE issuer_key_id = ? AND nonce = ?"
      )
      .get(issuerKeyId, nonce);
  }

  get({ issuerKeyId, nonce }) {
    requireIssuerKeyId(issuerKeyId);
    requireNonce(nonce);
    return normalizeRow(this._select(issuerKeyId, nonce));
  }

  registerIssued({
    issuerKeyId,
    nonce,
    transitionCommitment,
    enforcementDomain,
    notBefore,
    expiresAt,
    warrantBodySha256,
  }) {
    requireIssuerKeyId(issuerKeyId);
    requireNonce(nonce);
    requireSha256(
      transitionCommitment,
      "S0_TRANSITION_COMMITMENT_INVALID",
      "transition_commitment"
    );
    requireString(enforcementDomain, "S0_DOMAIN_REQUIRED", "enforcement_domain");
    requireTime(notBefore, "S0_NOT_BEFORE_INVALID", "not_before");
    requireTime(expiresAt, "S0_EXPIRES_AT_INVALID", "expires_at");
    if (expiresAt <= notBefore) {
      authorityFail("S0_TIME_WINDOW_INVALID", "expires_at must be greater than not_before");
    }
    requireSha256(
      warrantBodySha256,
      "S0_WARRANT_BODY_DIGEST_INVALID",
      "warrant_body_sha256"
    );

    const now = requireTime(this.now(), "S0_NOW_INVALID", "harness time");
    if (now >= expiresAt) {
      authorityFail("S0_ISSUANCE_ALREADY_EXPIRED", "cannot register an already expired warrant");
    }

    return this._transaction(() => {
      if (this._select(issuerKeyId, nonce)) {
        authorityFail(
          "S0_NONCE_ALREADY_REGISTERED",
          "issuer_key_id + nonce is already registered"
        );
      }

      this.db
        .prepare(
          "INSERT INTO authority_state (" +
          "issuer_key_id, nonce, transition_commitment, enforcement_domain, " +
          "not_before, expires_at, warrant_body_sha256, state, created_at, updated_at" +
          ") VALUES (?, ?, ?, ?, ?, ?, ?, 'ISSUED', ?, ?)"
        )
        .run(
          issuerKeyId,
          nonce,
          transitionCommitment,
          enforcementDomain,
          notBefore,
          expiresAt,
          warrantBodySha256,
          now,
          now
        );

      return normalizeRow(this._select(issuerKeyId, nonce));
    });
  }

  _assertBinding(row, { transitionCommitment, enforcementDomain, warrantBodySha256 = null }) {
    if (!row) {
      authorityFail("S0_RECORD_NOT_FOUND", "authority state record was not found");
    }
    if (row.transition_commitment !== transitionCommitment) {
      authorityFail(
        "S0_TRANSITION_COMMITMENT_MISMATCH",
        "transition commitment differs from the registered warrant"
      );
    }
    if (row.enforcement_domain !== enforcementDomain) {
      authorityFail(
        "S0_DOMAIN_MISMATCH",
        "enforcement domain differs from the registered warrant"
      );
    }
    if (
      warrantBodySha256 !== null &&
      row.warrant_body_sha256 !== warrantBodySha256
    ) {
      authorityFail(
        "S0_WARRANT_BODY_DIGEST_MISMATCH",
        "warrant body digest differs from the registered warrant"
      );
    }
  }

  _assertValidTime(row, now) {
    if (now < row.not_before) {
      authorityFail("S0_WARRANT_NOT_YET_VALID", "warrant is not yet valid");
    }
    if (now >= row.expires_at) {
      authorityFail("S0_WARRANT_EXPIRED", "warrant has expired");
    }
  }

  stagePayload({
    issuerKeyId,
    nonce,
    transitionCommitment,
    enforcementDomain,
    warrantBodySha256,
    payloadSha256,
  }) {
    requireIssuerKeyId(issuerKeyId);
    requireNonce(nonce);
    requireSha256(
      warrantBodySha256,
      "S0_WARRANT_BODY_DIGEST_INVALID",
      "warrant_body_sha256"
    );
    requireSha256(payloadSha256, "S0_PAYLOAD_DIGEST_INVALID", "payload_sha256");
    const now = requireTime(this.now(), "S0_NOW_INVALID", "harness time");

    return this._transaction(() => {
      const row = this._select(issuerKeyId, nonce);
      this._assertBinding(row, {
        transitionCommitment,
        enforcementDomain,
        warrantBodySha256,
      });
      this._assertValidTime(row, now);
      if (row.state !== "ISSUED") {
        authorityFail(
          "S0_STATE_INVALID",
          "payload staging requires ISSUED, observed " + row.state
        );
      }

      this.db
        .prepare(
          "UPDATE authority_state SET state = 'PAYLOAD_STAGED', " +
          "staged_payload_sha256 = ?, updated_at = ? " +
          "WHERE issuer_key_id = ? AND nonce = ? AND state = 'ISSUED'"
        )
        .run(payloadSha256, now, issuerKeyId, nonce);

      return normalizeRow(this._select(issuerKeyId, nonce));
    });
  }

  reserveTransaction({
    issuerKeyId,
    nonce,
    transitionCommitment,
    enforcementDomain,
    warrantBodySha256,
  }) {
    requireIssuerKeyId(issuerKeyId);
    requireNonce(nonce);
    requireSha256(
      warrantBodySha256,
      "S0_WARRANT_BODY_DIGEST_INVALID",
      "warrant_body_sha256"
    );
    const now = requireTime(this.now(), "S0_NOW_INVALID", "harness time");

    return this._transaction(() => {
      const row = this._select(issuerKeyId, nonce);
      this._assertBinding(row, {
        transitionCommitment,
        enforcementDomain,
        warrantBodySha256,
      });
      this._assertValidTime(row, now);
      if (row.state !== "PAYLOAD_STAGED") {
        authorityFail(
          "S0_STATE_INVALID",
          "transaction reservation requires PAYLOAD_STAGED, observed " + row.state
        );
      }

      this.db
        .prepare(
          "UPDATE authority_state SET state = 'TX_RESERVED', consumed_at = ?, updated_at = ? " +
          "WHERE issuer_key_id = ? AND nonce = ? AND state = 'PAYLOAD_STAGED'"
        )
        .run(now, now, issuerKeyId, nonce);

      return normalizeRow(this._select(issuerKeyId, nonce));
    });
  }

  markTxExecuted({
    issuerKeyId,
    nonce,
    transitionCommitment,
    enforcementDomain,
    txEvidenceSha256,
  }) {
    requireSha256(
      txEvidenceSha256,
      "S0_TX_EVIDENCE_DIGEST_INVALID",
      "tx_evidence_sha256"
    );
    const now = requireTime(this.now(), "S0_NOW_INVALID", "harness time");

    return this._transaction(() => {
      const row = this._select(issuerKeyId, nonce);
      this._assertBinding(row, { transitionCommitment, enforcementDomain });
      if (row.state !== "TX_RESERVED") {
        authorityFail(
          "S0_STATE_INVALID",
          "markTxExecuted requires TX_RESERVED, observed " + row.state
        );
      }

      this.db
        .prepare(
          "UPDATE authority_state SET state = 'TX_EXECUTED', " +
          "tx_evidence_sha256 = ?, updated_at = ? " +
          "WHERE issuer_key_id = ? AND nonce = ? AND state = 'TX_RESERVED'"
        )
        .run(txEvidenceSha256, now, issuerKeyId, nonce);

      return normalizeRow(this._select(issuerKeyId, nonce));
    });
  }

  releasePayload({
    issuerKeyId,
    nonce,
    transitionCommitment,
    enforcementDomain,
    payloadSha256,
  }) {
    requireSha256(payloadSha256, "S0_PAYLOAD_DIGEST_INVALID", "payload_sha256");
    const now = requireTime(this.now(), "S0_NOW_INVALID", "harness time");

    return this._transaction(() => {
      const row = this._select(issuerKeyId, nonce);
      this._assertBinding(row, { transitionCommitment, enforcementDomain });
      if (row.state !== "TX_EXECUTED") {
        authorityFail(
          "S0_STATE_INVALID",
          "payload release requires TX_EXECUTED, observed " + row.state
        );
      }
      if (row.staged_payload_sha256 !== payloadSha256) {
        authorityFail(
          "S0_STAGED_PAYLOAD_MISMATCH",
          "payload release digest differs from the staged payload"
        );
      }

      this.db
        .prepare(
          "UPDATE authority_state SET state = 'PAYLOAD_RELEASED', updated_at = ? " +
          "WHERE issuer_key_id = ? AND nonce = ? AND state = 'TX_EXECUTED'"
        )
        .run(now, issuerKeyId, nonce);

      return normalizeRow(this._select(issuerKeyId, nonce));
    });
  }

  markConformant({
    issuerKeyId,
    nonce,
    transitionCommitment,
    enforcementDomain,
  }) {
    const now = requireTime(this.now(), "S0_NOW_INVALID", "harness time");

    return this._transaction(() => {
      const row = this._select(issuerKeyId, nonce);
      this._assertBinding(row, { transitionCommitment, enforcementDomain });
      if (row.state !== "PAYLOAD_RELEASED") {
        authorityFail(
          "S0_STATE_INVALID",
          "conformance requires PAYLOAD_RELEASED, observed " + row.state
        );
      }

      this.db
        .prepare(
          "UPDATE authority_state SET state = 'CONFORMANT', updated_at = ? " +
          "WHERE issuer_key_id = ? AND nonce = ? AND state = 'PAYLOAD_RELEASED'"
        )
        .run(now, issuerKeyId, nonce);

      return normalizeRow(this._select(issuerKeyId, nonce));
    });
  }
}

export async function openAuthorityStateStoreV0(path, options = {}) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch (err) {
    authorityFail(
      "S0_SQLITE_UNAVAILABLE",
      "node:sqlite is required for the reference S0 implementation",
      { cause: err instanceof Error ? err.message : String(err) }
    );
  }

  const db = new DatabaseSync(path);
  return new AuthorityStateStoreV0(db, options);
}

export function isAuthorityStateNameV0(value) {
  return STATES.has(value);
}
