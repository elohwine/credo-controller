/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/**
 * Interface for Statutory Deduction Plugins
 */
export interface StatutoryCalculator {
  name: string
  calculate(grossAmount: number): number
}

/**
 * NSSA (National Social Security Authority) Calculator
 * 2024 Estimates: 4.5% of basic salary up to a ceiling.
 */
export class NSSACalculator implements StatutoryCalculator {
  readonly name = 'NSSA'
  private readonly RATE = 0.045
  private readonly CEILING = 700 // USD max insurable earnings

  public calculate(grossAmount: number): number {
    const insurable = Math.min(grossAmount, this.CEILING)
    // Return rounded to 2 decimals
    return Math.round(insurable * this.RATE * 100) / 100
  }
}

/**
 * PAYE (Pay As You Earn) Calculator
 * Simplified Tax Bands for MVP
 */
export class PAYECalculator implements StatutoryCalculator {
  readonly name = 'PAYE'
  private readonly AIDS_LEVY_RATE = 0.03

  public calculate(taxableIncome: number): number {
    let paye = 0

    if (taxableIncome > 1000) {
      paye += (taxableIncome - 1000) * 0.3 + 700 * 0.25 + 200 * 0.2
    } else if (taxableIncome > 300) {
      paye += (taxableIncome - 300) * 0.25 + 200 * 0.2
    } else if (taxableIncome > 100) {
      paye += (taxableIncome - 100) * 0.2
    }

    return Math.round(paye * 100) / 100
  }

  public calculateAidsLevy(paye: number): number {
    return Math.round(paye * this.AIDS_LEVY_RATE * 100) / 100
  }
}
