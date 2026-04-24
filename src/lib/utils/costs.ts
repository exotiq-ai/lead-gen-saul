const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = MODEL_COSTS[model]
  if (!rates) {
    return 0
  }
  const inputCostDollars = (inputTokens / 1000) * rates.input
  const outputCostDollars = (outputTokens / 1000) * rates.output
  const totalDollars = inputCostDollars + outputCostDollars
  return Math.round(totalDollars * 100)
}

export function getModelCosts(model: string): { input: number; output: number } | null {
  return MODEL_COSTS[model] ?? null
}

export function getSupportedModels(): string[] {
  return Object.keys(MODEL_COSTS)
}
