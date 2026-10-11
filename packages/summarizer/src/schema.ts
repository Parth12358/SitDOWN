// Digest schema validation. The schema is owned by the human (contracts/schemas/digest.schema.json)
// and not exported by @sitdown/contracts, so we locate it on disk by walking up from this module
// to the repo root. Works from both src/ (tsx) and dist/.
import { Ajv, type ValidateFunction } from "ajv";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCHEMA_REL = path.join("contracts", "schemas", "digest.schema.json");

function findSchemaPath(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, SCHEMA_REL);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate ${SCHEMA_REL} walking up from ${import.meta.url}`);
}

let _validate: ValidateFunction | undefined;

function validator(): ValidateFunction {
  if (_validate) return _validate;
  const schema = JSON.parse(readFileSync(findSchemaPath(), "utf8"));
  const ajv = new Ajv({ strict: false, allErrors: true });
  _validate = ajv.compile(schema);
  return _validate;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate a candidate object against the Digest schema. */
export function validateDigest(candidate: unknown): ValidationResult {
  const validate = validator();
  const valid = validate(candidate) as boolean;
  const errors = valid
    ? []
    : (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim());
  return { valid, errors };
}
