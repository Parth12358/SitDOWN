// Secret filtering — runs on every string before it is sent to an LLM (PRD-B).
// Redacts API-key patterns, bearer tokens, private keys, and .env-style KEY=value lines.
// Conservative by design: better to redact a borderline token than leak one.

const REDACTED = "[REDACTED]";

// Order matters: block-level patterns (PEM) first, then line/inline patterns.
const PATTERNS: Array<[RegExp, string]> = [
  // PEM private key blocks (RSA/EC/OPENSSH/generic), including the body.
  [
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
    REDACTED,
  ],
  // Authorization: Bearer <token>  /  bare "Bearer <token>"
  [/\bBearer\s+[A-Za-z0-9._\-+/=]{8,}/g, `Bearer ${REDACTED}`],
  // Provider-style API keys: sk-..., sk-ant-..., AKIA..., ghp_/gho_/github_pat_, Google AIza..., Slack xox[baprs]-...
  [/\bsk-(?:ant-)?[A-Za-z0-9._\-]{16,}/g, REDACTED],
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, REDACTED],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, REDACTED],
  [/\bAIza[0-9A-Za-z._\-]{20,}\b/g, REDACTED],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, REDACTED],
];

// .env-style assignments for secret-looking names: KEY=value / KEY: value.
// Keeps the key, redacts the value. Matches names containing a secret word.
const ENV_ASSIGNMENT =
  /(\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL|API|AUTH)[A-Z0-9_]*\b)(\s*[:=]\s*)(['"]?)([^\s'"]+)\3/g;

/** Replace secrets in `text` with [REDACTED]. Idempotent and never throws. */
export function redactSecrets(text: string): string {
  if (!text) return text;
  let out = text;
  for (const [re, replacement] of PATTERNS) {
    out = out.replace(re, replacement);
  }
  out = out.replace(ENV_ASSIGNMENT, (_m, key, sep) => `${key}${sep}${REDACTED}`);
  return out;
}
