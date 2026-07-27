export type AmountTotals = {
  raw: number;
  tiered: number;
};

type CatalogLike = {
  price?: number | string | null;
  has_time_coeff?: boolean | null;
  is_tiered?: boolean | null;
};

export type ServiceItemLike = {
  price?: number | string | null;
  coeff?: number | string | null;
  qty?: number | string | null;
  months?: number | string | null;
  time_coeff?: number | string | null;
  subtotal?: number | string | null;
  catalog?: CatalogLike | null;
};

type ItemGroupLike = {
  items?: ServiceItemLike[] | null;
};

const toNumber = (value: unknown, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

export const roundDecimal = (amount: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round((amount + Number.EPSILON) * factor) / factor;
};

export const formatMoney = (amount: unknown) => `¥${toNumber(amount).toFixed(2)}`;

export const calcTimeCoeff = (months: unknown, hasTimeCoeff?: boolean | null) => {
  if (!hasTimeCoeff) return 1;
  const boundedMonths = Math.min(Math.max(toNumber(months, 12), 0), 12);
  return roundDecimal(boundedMonths / 12, 4);
};

export const resolveTimeCoeff = (item: ServiceItemLike) => {
  if (item.catalog?.has_time_coeff === false) return 1;
  if (item.catalog?.has_time_coeff === true && item.months !== null && item.months !== undefined && item.months !== '') {
    return calcTimeCoeff(item.months, true);
  }
  return roundDecimal(toNumber(item.time_coeff, 1), 4);
};

export const formatTimeCoeff = (item: ServiceItemLike) => resolveTimeCoeff(item).toFixed(4);

export const calcRawAmount = (item: ServiceItemLike, useTimeCoeff = false) => {
  const price = toNumber(item.catalog?.price ?? item.price);
  const coeff = toNumber(item.coeff);
  const qty = toNumber(item.qty);
  const timeCoeff = useTimeCoeff ? resolveTimeCoeff(item) : 1;
  return roundMoney(price * coeff * qty * timeCoeff);
};

const formulaValue = (value: unknown, fallback = 0) => toNumber(value, fallback).toString();

export const buildRawFormula = (item: ServiceItemLike, useTimeCoeff = false) => {
  const parts = [
    formulaValue(item.catalog?.price ?? item.price),
    formulaValue(item.coeff),
    formulaValue(item.qty),
  ];
  if (useTimeCoeff) parts.push(formatTimeCoeff(item));
  return parts.join('×');
};

export const buildTieredFormula = (item: ServiceItemLike, useTimeCoeff = false) => {
  const baseFormula = buildRawFormula(item, false);
  let pricedFormula = baseFormula;
  if (item.catalog?.is_tiered) {
    const price = formulaValue(item.catalog?.price ?? item.price);
    const coeff = formulaValue(item.coeff);
    let remaining = Math.max(toNumber(item.qty), 0);
    const terms: string[] = [];

    const firstTierQty = Math.min(remaining, 1000);
    terms.push(`${price}×${coeff}×${formulaValue(firstTierQty)}`);
    remaining -= firstTierQty;

    if (remaining > 0) {
      const secondTierQty = Math.min(remaining, 9000);
      terms.push(`${price}×${coeff}×${formulaValue(secondTierQty)}×0.8`);
      remaining -= secondTierQty;
    }

    if (remaining > 0) {
      terms.push(`${price}×${coeff}×${formulaValue(remaining)}×0.6`);
    }

    pricedFormula = `(${terms.join(' + ')})`;
  }
  return useTimeCoeff ? `${pricedFormula}×${formatTimeCoeff(item)}` : pricedFormula;
};

export const calcTieredAmount = (
  item: ServiceItemLike,
  options: { useTimeCoeff?: boolean; useStoredSubtotal?: boolean } = {},
) => {
  if (options.useStoredSubtotal && item.subtotal !== undefined && item.subtotal !== null) {
    return toNumber(item.subtotal);
  }

  const price = toNumber(item.catalog?.price ?? item.price);
  const coeff = toNumber(item.coeff);
  let remaining = toNumber(item.qty);
  let amount = 0;

  if (!item.catalog?.is_tiered) {
    amount = price * coeff * remaining;
  } else {
    const firstTierQty = Math.min(remaining, 1000);
    amount += price * coeff * firstTierQty;
    remaining -= firstTierQty;

    if (remaining > 0) {
      const secondTierQty = Math.min(remaining, 9000);
      amount += price * coeff * secondTierQty * 0.8;
      remaining -= secondTierQty;
    }

    if (remaining > 0) {
      amount += price * coeff * remaining * 0.6;
    }
  }

  const timeCoeff = options.useTimeCoeff ? resolveTimeCoeff(item) : 1;
  return roundMoney(amount * timeCoeff);
};

export const sumItems = (
  items: ServiceItemLike[] = [],
  options: { useTimeCoeff?: boolean; useStoredSubtotal?: boolean } = {},
): AmountTotals => items.reduce<AmountTotals>((totals, item) => ({
  raw: roundMoney(totals.raw + calcRawAmount(item, options.useTimeCoeff)),
  tiered: roundMoney(totals.tiered + calcTieredAmount(item, options)),
}), { raw: 0, tiered: 0 });

export const sumGroups = (
  groups: ItemGroupLike[] = [],
  options: { useTimeCoeff?: boolean; useStoredSubtotal?: boolean } = {},
): AmountTotals => groups.reduce<AmountTotals>((totals, group) => {
  const groupTotals = sumItems(group.items || [], options);
  return {
    raw: roundMoney(totals.raw + groupTotals.raw),
    tiered: roundMoney(totals.tiered + groupTotals.tiered),
  };
}, { raw: 0, tiered: 0 });

export const sumServiceItems = (items: ServiceItemLike[] = []) => sumItems(items);
export const sumServiceGroups = (groups: ItemGroupLike[] = []) => sumGroups(groups);
export const sumDeclareItems = (items: ServiceItemLike[] = []) => sumItems(items, { useTimeCoeff: true });
export const sumDeclareGroups = (groups: ItemGroupLike[] = []) => sumGroups(groups, { useTimeCoeff: true });
export const sumAcceptItems = (items: ServiceItemLike[] = []) => sumItems(items, { useTimeCoeff: true });
export const sumAcceptGroups = (groups: ItemGroupLike[] = []) => sumGroups(groups, { useTimeCoeff: true });
