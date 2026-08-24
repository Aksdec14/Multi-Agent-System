const memory = {
  target: { type: "file", path: "" },
  reconFindings: [],
  riskPredictions: [],
  reportPath: "",
  apiEndpoints: [],
  apiTestResults: [],
  architectureDiagrams: null,
};

export function writeMemory(key, value) {
  if (!(key in memory)) {
    throw new Error(`Unknown memory key: ${key}`);
  }
  memory[key] = value;
}

export function readMemory() {
  return { ...memory };
}
