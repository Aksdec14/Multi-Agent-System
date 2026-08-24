import Groq from "groq-sdk";
import { readMemory, writeMemory } from "../memory/sharedMemory.js";
import { RetryHandler } from "../tools/retryHandler.js";
import { TextChunker, mergeResults } from "../tools/textChunker.js";

const SYSTEM_PROMPT = `You are a security analysis agent. Given recon findings from a prior scanning stage, you identify likely vulnerability classes and predict where future issues could emerge as the codebase grows.

For each finding, produce:
- title: short descriptive name
- vulnerabilityClass: e.g. XSS, SQLi, CSRF, insecure deserialization, hardcoded secret, missing auth, path traversal, SSRF, command injection, insecure dependency, missing input validation, info disclosure, etc.
- severity: "low", "medium", or "high"
- confidence: "low", "medium", or "high" (how confident you are this is a real issue vs a false positive)
- location: where the issue lives (file, line range, or component)
- description: 1-3 sentences explaining the risk
- mitigation: recommended fix or next step
- futureRisk: how this could get worse as the codebase evolves

Output a JSON array of these analysis objects.

Do NOT write exploit code. Do NOT produce injection strings or attack payloads.
You are classifying risk and recommending mitigations only. Be practical and developer-friendly.`;

export async function run() {
  console.log("[Analysis Agent] Starting analysis...");
  const mem = readMemory();
  const retryHandler = new RetryHandler({
    maxRetries: 3,
    baseDelay: 1000,
    retryableStatusCodes: [429, 500, 502, 503],
  });
  const textChunker = new TextChunker({
    maxTokens: 3500,
    tokensPerChar: 0.25,
    overlap: 100,
  });

  if (!mem.reconFindings || mem.reconFindings.length === 0) {
    console.log("[Analysis Agent] No recon findings to analyze.");
    writeMemory("riskPredictions", []);
    return;
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const findingsJson = JSON.stringify(mem.reconFindings, null, 2);
  
  const processChunk = async (chunk, index, totalChunks) => {
    console.log(`[Analysis Agent] Processing chunk ${index + 1}/${totalChunks}`);
    
    const completion = await retryHandler.execute(
      () =>
        groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Here are the recon findings from the previous scanning stage. Analyze them and produce your risk predictions as a JSON array:\n\n${chunk}`,
            },
          ],
          temperature: 0.2,
          max_tokens: 4096,
        }),
      { context: `Analysis LLM call chunk ${index + 1}/${totalChunks}` }
    );

    const responseText = completion.choices[0]?.message?.content || "[]";
    
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      return [{ title: "Parse error", description: responseText, severity: "low", mitigation: "Review manually" }];
    }
  };

  const chunkResults = await textChunker.processChunks(findingsJson, processChunk);
  const predictions = mergeResults(chunkResults);

  writeMemory("riskPredictions", predictions);
  console.log(`[Analysis Agent] Done. ${predictions.length} predictions stored.`);
}
