import Groq from "groq-sdk";
import { readMemory, writeMemory } from "../memory/sharedMemory.js";
import { readSourceFile, listFiles } from "../tools/fileTools.js";
import { fetchAndParseHTML } from "../tools/fetchTools.js";

const SYSTEM_PROMPT = `You are a recon agent for a security scanning pipeline. Given source code or parsed page structure, you summarize the attack surface. Your job is to identify:

1. Entry points — endpoints, routes, form handlers, exported functions that accept input
2. User input locations — query params, body fields, headers, file uploads, URL params
3. External calls — database queries, HTTP requests, API calls, shell exec, file I/O
4. Authentication/authorization logic — login checks, token validation, session handling
5. Risky patterns — eval(), innerHTML, dynamic SQL, unsanitized concatenation, hardcoded credentials, disabled security features

Output a structured JSON array of findings. Each finding should have:
- category: one of "entry_point", "user_input", "external_call", "auth_logic", "risky_pattern", "info"
- location: file path or URL section where the finding was observed
- detail: plain-English description of what you found
- initialSeverity: "low", "medium", or "high" (your initial gut feel)

Do NOT write exploit code. Do NOT produce injection strings or attack payloads.
You are identifying and explaining risks only. Keep descriptions factual and actionable.`;

export async function run() {
  console.log("[Recon Agent] Starting recon...");
  const mem = readMemory();
  let content = "";

  if (mem.target.type === "file") {
    try {
      const files = listFiles(mem.target.path);
      const codeFiles = files.filter((f) =>
        /\.(js|ts|jsx|tsx|py|rb|go|java|php|html|css|json|yaml|yml|env|cfg|conf)$/i.test(f)
      );
      console.log(`[Recon Agent] Found ${codeFiles.length} code files`);

      const chunks = [];
      for (const file of codeFiles.slice(0, 20)) {
        try {
          const src = readSourceFile(file);
          chunks.push(`\n--- FILE: ${file} ---\n${src.slice(0, 8000)}`);
        } catch {
          chunks.push(`\n--- FILE: ${file} --- [unreadable]`);
        }
      }
      content = chunks.join("\n");
    } catch {
      const src = readSourceFile(mem.target.path);
      content = `--- FILE: ${mem.target.path} ---\n${src}`;
    }
  } else if (mem.target.type === "url") {
    console.log(`[Recon Agent] Fetching URL: ${mem.target.path}`);
    const parsed = await fetchAndParseHTML(mem.target.path);
    content = JSON.stringify(parsed, null, 2);
  }

  if (!content) {
    console.log("[Recon Agent] No content to analyze.");
    writeMemory("reconFindings", []);
    return;
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Analyze the following source code / page structure and produce your recon findings as a JSON array:\n\n${content.slice(0, 30000)}` },
    ],
    temperature: 0.2,
    max_tokens: 4096,
  });

  const responseText = completion.choices[0]?.message?.content || "[]";
  console.log("[Recon Agent] Raw LLM response length:", responseText.length);

  let findings;
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    findings = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    findings = [{ category: "info", location: "n/a", detail: responseText, initialSeverity: "low" }];
  }

  writeMemory("reconFindings", findings);
  console.log(`[Recon Agent] Done. ${findings.length} findings stored.`);
}
