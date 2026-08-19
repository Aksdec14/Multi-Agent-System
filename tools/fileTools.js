import fs from "fs";
import path from "path";

export function readSourceFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  return fs.readFileSync(resolved, "utf-8");
}

export function listFiles(dir) {
  const resolved = path.resolve(dir);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory not found: ${resolved}`);
  }
  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(resolved, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}
