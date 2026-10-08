import { sha256Bytes } from "./digest.mjs";
import { authorityFail } from "./authority-error.mjs";

export const PAYGOD_CANONICAL_PROFILE_V1 = "paygod-c14n-v1";
const SAFE_INTEGER_MAX = 9_007_199_254_740_991n;

function ensurePairedSurrogates(value) {
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (i + 1 >= value.length) {
        authorityFail("C14N_UNPAIRED_SURROGATE", "unpaired Unicode surrogate");
      }
      const next = value.charCodeAt(i + 1);
      if (next < 0xdc00 || next > 0xdfff) {
        authorityFail("C14N_UNPAIRED_SURROGATE", "unpaired Unicode surrogate");
      }
      i += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      authorityFail("C14N_UNPAIRED_SURROGATE", "unpaired Unicode surrogate");
    }
  }
}

function profileString(value) {
  ensurePairedSurrogates(value);
  let out = '"';
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      out += "\\u" + unit.toString(16).padStart(4, "0");
      i += 1;
      out += "\\u" + value.charCodeAt(i).toString(16).padStart(4, "0");
      continue;
    }
    if (unit === 0x22) out += '\\"';
    else if (unit === 0x5c) out += "\\\\";
    else if (unit === 0x08) out += "\\b";
    else if (unit === 0x0c) out += "\\f";
    else if (unit === 0x0a) out += "\\n";
    else if (unit === 0x0d) out += "\\r";
    else if (unit === 0x09) out += "\\t";
    else if (unit < 0x20 || unit > 0x7e) {
      out += "\\u" + unit.toString(16).padStart(4, "0");
    } else {
      out += String.fromCharCode(unit);
    }
  }
  return out + '"';
}

function validateNumberLexemes(text) {
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      const match = text
        .slice(i)
        .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (!match) continue;

      const token = match[0];
      if (/[.eE]/.test(token)) {
        authorityFail(
          "C14N_NUMBER_PROFILE_INVALID",
          "floating-point and exponent numbers are not allowed by paygod-c14n-v1"
        );
      }

      const value = BigInt(token);
      if (value < -SAFE_INTEGER_MAX || value > SAFE_INTEGER_MAX) {
        authorityFail(
          "C14N_INTEGER_OUT_OF_RANGE",
          "integer outside paygod-c14n-v1 safe range"
        );
      }
      i += token.length - 1;
    }
  }
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";

  if (typeof value === "string") return profileString(value);

  if (Array.isArray(value)) {
    return "[" + value.map((item) => canonicalJson(item)).join(",") + "]";
  }

  if (typeof value === "number") {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
      authorityFail(
        "C14N_NUMBER_PROFILE_INVALID",
        "paygod-c14n-v1 accepts safe integers only"
      );
    }
    return Object.is(value, -0) ? "0" : String(value);
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);
    for (const key of keys) {
      ensurePairedSurrogates(key);
      if (key.normalize("NFC") !== key) {
        authorityFail(
          "C14N_KEY_NOT_NFC",
          "JSON object key is not NFC-normalized"
        );
      }
    }
    keys.sort();
    return (
      "{" +
      keys
        .map((key) => profileString(key) + ":" + canonicalJson(value[key]))
        .join(",") +
      "}"
    );
  }

  authorityFail(
    "C14N_UNSUPPORTED_VALUE",
    "unsupported JSON value for paygod-c14n-v1"
  );
}

export function canonicalizePayGodJsonBytesV1(bytes) {
  const input = Buffer.isBuffer(bytes)
    ? Buffer.from(bytes)
    : bytes instanceof Uint8Array
      ? Buffer.from(bytes)
      : typeof bytes === "string"
        ? Buffer.from(bytes, "utf8")
        : null;

  if (!input) {
    authorityFail("C14N_BYTES_REQUIRED", "canonicalization input must be bytes or UTF-8 text");
  }

  const text = input.toString("utf8");
  validateNumberLexemes(text);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    authorityFail("C14N_JSON_INVALID", "canonicalization input is not valid JSON");
  }

  const canonical = canonicalJson(parsed);
  const canonicalBytes = Buffer.from(canonical, "utf8");
  return {
    profile: PAYGOD_CANONICAL_PROFILE_V1,
    canonical,
    canonicalBytes,
    hash: sha256Bytes(canonicalBytes),
  };
}
