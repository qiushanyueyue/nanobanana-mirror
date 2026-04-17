import type { ModelId } from '../types';

export const STARTING_BALANCE_USD = 185;

export const PRICING: Record<
  ModelId,
  {
    inputImageUsd: number;
    outputImageUsd: number;
  }
> = {
  'gemini-3.1-flash-image-preview': {
    inputImageUsd: 0.0005,
    outputImageUsd: 0.0672,
  },
  'gemini-3-pro-image-preview': {
    inputImageUsd: 0.002,
    outputImageUsd: 0.134,
  },
};

export const roundUsd = (value: number): number => Number(value.toFixed(4));

export const calculateGenerationCost = (
  model: ModelId,
  inputImageCount: number,
  outputImageCount: number,
): number => {
  const pricing = PRICING[model];
  return roundUsd(
    pricing.inputImageUsd * inputImageCount + pricing.outputImageUsd * outputImageCount,
  );
};

export const computeBalanceSnapshots = (
  entries: Array<{
    model: ModelId;
    inputImageCount: number;
    outputImageCount: number;
  }>,
  startingBalanceUsd = STARTING_BALANCE_USD,
): Array<{
  costUsd: number;
  remainingBalanceUsd: number;
}> => {
  let remaining = startingBalanceUsd;

  return entries.map((entry) => {
    const costUsd = calculateGenerationCost(
      entry.model,
      entry.inputImageCount,
      entry.outputImageCount,
    );
    remaining = roundUsd(remaining - costUsd);
    return {
      costUsd,
      remainingBalanceUsd: remaining,
    };
  });
};
