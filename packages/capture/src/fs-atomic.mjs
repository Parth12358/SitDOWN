// Write-then-rename: a reader sees either the old file or the new one, never a half-written one.
// Adapted from @alikeai/setup atomic-write.mjs (MIT). Node builtins only.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export function atomicWriteFile(filePath, content, mode = 0o644) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = join(dirname(filePath), `.${basename(filePath)}.sitdown-tmp-${process.pid}-${Date.now()}`);
  let fd;
  try {
    fd = openSync(tmp, "wx", mode);
    writeSync(fd, content);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(tmp, filePath);
  } catch (err) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* already closed */
      }
    }
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* best-effort cleanup */
    }
    throw err;
  }
  return filePath;
}

export function atomicWriteJson(filePath, value) {
  return atomicWriteFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
