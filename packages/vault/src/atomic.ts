// Atomic file writes: write to a temp file in the same directory, then rename.
// rename() is atomic within a filesystem, so a reader never sees a half-written note.
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

let counter = 0;

/** Write `data` (text or binary) to `filePath` atomically, creating parent dirs as needed. */
export async function atomicWrite(filePath: string, data: string | Uint8Array): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  // Unique temp name in the same dir (same filesystem -> rename is atomic).
  // Avoid Date.now()/Math.random() for determinism; pid + counter is enough.
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${counter++}.tmp`);
  await writeFile(tmp, data, "utf8");
  await rename(tmp, filePath);
}
