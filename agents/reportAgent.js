import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import { readMemory, writeMemory } from "../memory/sharedMemory.js";

const SYSTEM_PROMPT = `You are a reporting agent. Given recon findings and risk predictions from a security scanning pipeline, write a clear, structured security report suitable for a developer to act on.

Your report should include:
1. Executive Summary — 2-4 sentences on overall security posture
2. Findings Table — each finding as a row with: ID, Title, Severity, Confidence, Location, Description, Mitigation
3. Severity Breakdown — count of high/medium/low findings
4. Priority Recommendations — top 3-5 things to fix first
5. Next Steps — what a developer should do after reading this report

Format the report in plain text with clear section headers and consistent formatting.
The tone should be professional but accessible — write for a developer, not a compliance officer.
Do NOT include exploit code or attack payloads in the report.`;

export async function run() {
  console.log("[Report Agent] Starting report generation...");
  const mem = readMemory();

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Generate a security report from the following scanning results.\n\nRECON FINDINGS:\n${JSON.stringify(mem.reconFindings, null, 2)}\n\nRISK PREDICTIONS:\n${JSON.stringify(mem.riskPredictions, null, 2)}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 4096,
  });

  const reportText = completion.choices[0]?.message?.content || "No report generated.";

  const reportPath = path.resolve("report.txt");
  fs.writeFileSync(reportPath, reportText, "utf-8");

  writeMemory("reportPath", reportPath);
  console.log(`[Report Agent] Done. Report written to ${reportPath}`);
}
