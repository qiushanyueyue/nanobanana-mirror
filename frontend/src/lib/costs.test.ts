import { describe, expect, it } from 'vitest';
import {
  STARTING_BALANCE_USD,
  calculateGenerationCost,
  computeBalanceSnapshots,
  PRICING,
} from './costs';

describe('costs', () => {
  it('calculates flash image cost from uploaded references and single output', () => {
    expect(calculateGenerationCost('gemini-3.1-flash-image-preview', 2, 1)).toBeCloseTo(
      PRICING['gemini-3.1-flash-image-preview'].inputImageUsd * 2 +
        PRICING['gemini-3.1-flash-image-preview'].outputImageUsd,
      6,
    );
  });

  it('calculates pro image cost from uploaded references and single output', () => {
    expect(calculateGenerationCost('gemini-3-pro-image-preview', 1, 1)).toBeCloseTo(0.136, 6);
  });

  it('computes remaining balance snapshots in sequence', () => {
    expect(
      computeBalanceSnapshots(
        [
          { model: 'gemini-3.1-flash-image-preview', inputImageCount: 1, outputImageCount: 1 },
          { model: 'gemini-3-pro-image-preview', inputImageCount: 2, outputImageCount: 1 },
        ],
        STARTING_BALANCE_USD,
      ),
    ).toEqual([
      {
        costUsd: 0.0677,
        remainingBalanceUsd: 184.9323,
      },
      {
        costUsd: 0.138,
        remainingBalanceUsd: 184.7943,
      },
    ]);
  });
});
