import { describe, expect, it } from 'vitest';
import {
  buildRawFormula,
  buildTieredFormula,
  calcRawAmount,
  calcTieredAmount,
  calcTimeCoeff,
  formatTimeCoeff,
  formatMoney,
  sumDeclareItems,
  sumServiceItems,
} from './calc';

describe('amount calculation', () => {
  it('calculates regular items without tier discounts', () => {
    const item = { catalog: { price: 10, is_tiered: false }, coeff: 1.5, qty: 20 };
    expect(calcRawAmount(item)).toBe(300);
    expect(calcTieredAmount(item)).toBe(300);
  });

  it.each([
    [0, 0],
    [1000, 1000],
    [10000, 8200],
    [10001, 8200.6],
    [11000, 8800],
  ])('applies tier pricing at quantity %s', (qty, expected) => {
    const item = { catalog: { price: 1, is_tiered: true }, coeff: 1, qty };
    expect(calcRawAmount(item)).toBe(qty);
    expect(calcTieredAmount(item)).toBe(expected);
  });

  it('applies time coefficient after tier pricing', () => {
    const item = { catalog: { price: 2, is_tiered: true }, coeff: 1, qty: 2000, time_coeff: 0.5 };
    expect(calcRawAmount(item, true)).toBe(2000);
    expect(calcTieredAmount(item, { useTimeCoeff: true })).toBe(1800);
  });

  it('uses one as the missing time coefficient fallback', () => {
    const item = { catalog: { price: 10 }, coeff: 2, qty: 3, time_coeff: null };
    expect(calcRawAmount(item, true)).toBe(60);
    expect(calcTieredAmount(item, { useTimeCoeff: true })).toBe(60);
  });

  it('calculates and rounds month coefficients', () => {
    expect(calcTimeCoeff(1, true)).toBe(0.0833);
    expect(calcTimeCoeff(8, true)).toBe(0.6667);
    expect(calcTimeCoeff(12, true)).toBe(1);
    expect(calcTimeCoeff(null, true)).toBe(1);
    expect(calcTimeCoeff(5, false)).toBe(1);
  });

  it('recalculates historical time coefficients from catalog rules and months', () => {
    const timedItem = {
      catalog: { price: 120000, has_time_coeff: true },
      coeff: 1,
      qty: 6,
      months: 8,
      time_coeff: 0.67,
    };
    const untimedItem = {
      catalog: { price: 47, is_tiered: true, has_time_coeff: false },
      coeff: 1,
      qty: 50000,
      months: 8,
      time_coeff: 0.6667,
    };

    expect(formatTimeCoeff(timedItem)).toBe('0.6667');
    expect(calcRawAmount(timedItem, true)).toBe(480024);
    expect(formatTimeCoeff(untimedItem)).toBe('1.0000');
    expect(calcRawAmount(untimedItem, true)).toBe(2350000);
    expect(calcTieredAmount(untimedItem, { useTimeCoeff: true })).toBe(1513400);
    expect(buildTieredFormula(untimedItem, true)).toBe('(47×1×1000 + 47×1×9000×0.8 + 47×1×40000×0.6)×1.0000');
  });

  it('uses the same rules for item totals and formulas', () => {
    const items = [
      { catalog: { price: 1, is_tiered: true }, coeff: 1, qty: 2000, time_coeff: 0.5 },
      { catalog: { price: 10, is_tiered: false }, coeff: 2, qty: 3, time_coeff: 1 },
    ];
    expect(sumServiceItems(items)).toEqual({ raw: 2060, tiered: 1860 });
    expect(sumDeclareItems(items)).toEqual({ raw: 1060, tiered: 960 });
    expect(buildRawFormula(items[0], true)).toBe('1×1×2000×0.5000');
    expect(buildTieredFormula(items[0], true)).toBe('(1×1×1000 + 1×1×1000×0.8)×0.5000');
    expect(formatMoney(960)).toBe('¥960.00');
  });
});
