// Validate records against the contract JSON Schemas (contracts/schemas/*.json).
// Fail-open: if ajv or a schema can't be loaded, validation is SKIPPED (never blocks capture).
// We still surface errors to callers (tests assert on them; the hook only logs them).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const schemasDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "contracts", "schemas");

let _ajv = null;
async function getAjv() {
  if (_ajv) return _ajv;
  const { default: Ajv } = await import("ajv");
  const { default: addFormats } = await import("ajv-formats");
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  _ajv = ajv;
  return ajv;
}

const SCHEMA_FILES = {
  session: "session-record.schema.json",
  commit: "commit-record.schema.json",
  config: "config.schema.json",
};

const _validators = new Map(); // kind -> compiled validate fn

async function getValidator(kind) {
  if (_validators.has(kind)) return _validators.get(kind);
  const ajv = await getAjv();
  const schema = JSON.parse(readFileSync(path.join(schemasDir, SCHEMA_FILES[kind]), "utf8"));
  // Reuse an already-registered schema ($id collisions happen when called repeatedly).
  const existing = schema.$id ? ajv.getSchema(schema.$id) : null;
  const validate = existing ?? ajv.compile(schema);
  _validators.set(kind, validate);
  return validate;
}

/**
 * @returns {Promise<{ valid: boolean, errors: object[]|null, skipped?: boolean }>}
 */
export async function validateRecord(kind, value) {
  if (!SCHEMA_FILES[kind]) return { valid: false, errors: [{ message: `unknown schema kind: ${kind}` }] };
  let validate;
  try {
    validate = await getValidator(kind);
  } catch {
    return { valid: true, errors: null, skipped: true }; // fail open (ajv/schema unavailable)
  }
  const valid = validate(value);
  return { valid, errors: valid ? null : validate.errors };
}
