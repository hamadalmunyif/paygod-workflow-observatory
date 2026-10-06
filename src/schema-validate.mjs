function typeOk(type, value) {
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return true;
}

export function validateJsonSchemaSubset(schema, value, path = "$") {
  const errors = [];
  if (!schema || typeof schema !== "object") {
    return { ok: false, errors: [{ path, code: "SCHEMA_UNAVAILABLE" }] };
  }

  if (schema.type && !typeOk(schema.type, value)) {
    errors.push({ path, code: "TYPE_MISMATCH", expected: schema.type });
    return { ok: false, errors };
  }

  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push({ path: `${path}.${key}`, code: "REQUIRED_MISSING" });
      }
    }
    const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    for (const [key, child] of Object.entries(value)) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        errors.push(...validateJsonSchemaSubset(properties[key], child, `${path}.${key}`).errors);
      } else if (schema.additionalProperties === false) {
        errors.push({ path: `${path}.${key}`, code: "ADDITIONAL_PROPERTY" });
      }
    }
  }

  if ((schema.type === "number" || schema.type === "integer") && typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push({ path, code: "MINIMUM", limit: schema.minimum });
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push({ path, code: "MAXIMUM", limit: schema.maximum });
    }
  }

  if (schema.type === "string" && typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push({ path, code: "MIN_LENGTH", limit: schema.minLength });
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push({ path, code: "MAX_LENGTH", limit: schema.maxLength });
    }
  }

  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      errors.push(...validateJsonSchemaSubset(schema.items, item, `${path}[${index}]`).errors);
    });
  }

  return { ok: errors.length === 0, errors };
}
