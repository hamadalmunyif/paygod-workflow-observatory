import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-json.mjs";

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256CanonicalJson(value) {
  return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}
