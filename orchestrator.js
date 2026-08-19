import * as reconAgent from "./agents/reconAgent.js";
import * as analysisAgent from "./agents/analysisAgent.js";
import * as reportAgent from "./agents/reportAgent.js";

export async function runPipeline() {
  console.log("=== SECURITY AGENT PIPELINE START ===\n");

  try {
    await reconAgent.run();
    await analysisAgent.run();
    await reportAgent.run();

    console.log("\n=== PIPELINE COMPLETE ===");
    console.log("Report saved to report.txt");
  } catch (err) {
    console.error("\nPipeline error:", err.message);
    process.exit(1);
  }
}
