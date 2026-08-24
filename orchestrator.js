import * as reconAgent from "./agents/reconAgent.js";
import * as apiDiscoveryAgent from "./agents/apiDiscoveryAgent.js";
import * as analysisAgent from "./agents/analysisAgent.js";
import * as apiTestingAgent from "./agents/apiTestingAgent.js";
import * as architectureDiagramAgent from "./agents/architectureDiagramAgent.js";
import * as reportAgent from "./agents/reportAgent.js";

export async function runPipeline() {
  console.log("=== SECURITY AGENT PIPELINE START ===\n");

  try {
    await reconAgent.run();
    await apiDiscoveryAgent.run();
    await analysisAgent.run();
    await apiTestingAgent.run();
    await architectureDiagramAgent.run();
    await reportAgent.run();

    console.log("\n=== PIPELINE COMPLETE ===");
    console.log("Report saved to report.txt");
    console.log("Architecture diagrams saved to architecture.md");
  } catch (err) {
    console.error("\nPipeline error:", err.message);
    process.exit(1);
  }
}
