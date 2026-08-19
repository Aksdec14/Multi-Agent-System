import "dotenv/config";
import { writeMemory } from "./memory/sharedMemory.js";
import { runPipeline } from "./orchestrator.js";

const targetType = process.env.TARGET_TYPE || "file";
const targetPath = process.env.TARGET_PATH || "./test-targets/sample.js";

if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === "your_groq_api_key_here") {
  console.error("ERROR: Set your GROQ_API_KEY in .env before running.");
  process.exit(1);
}

writeMemory("target", { type: targetType, path: targetPath });

console.log(`Target: [${targetType}] ${targetPath}\n`);

await runPipeline();
