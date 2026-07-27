import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryLog = vi.hoisted(() => ({
  batches: [] as number[][],
  orders: [] as string[][],
  ranges: [] as [number, number][],
}));

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: vi.fn(() => {
      let ids: number[] = [];
      const orders: string[] = [];
      const builder: any = {
        in: vi.fn((_column: string, values: number[]) => {
          ids = values;
          queryLog.batches.push(values);
          return builder;
        }),
        order: vi.fn((column: string) => {
          orders.push(column);
          return builder;
        }),
        range: vi.fn((from: number, to: number) => {
          queryLog.orders.push([...orders]);
          queryLog.ranges.push([from, to]);
          const size = ids.length === 100 && from === 0 ? 1000 : 1;
          return Promise.resolve({
            data: Array.from({ length: size }, (_, index) => ({
              id: from + index + (ids[0] || 0) * 10000,
              project_id: ids[0],
              plate: '板块',
              name: `服务${index}`,
            })),
            error: null,
          });
        }),
      };
      return builder;
    }),
  })),
}));

vi.mock('../lib/supabase', () => ({ supabase: supabaseMock }));

import { db } from './db';

describe('database pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryLog.batches.length = 0;
    queryLog.orders.length = 0;
    queryLog.ranges.length = 0;
  });

  it('splits long id filters and reads every 1000-row page', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => index + 1);
    const result = await db.listServicesByProjectIds(ids);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1002);
    expect(queryLog.batches.map(batch => batch.length)).toEqual([100, 1, 100]);
    expect(queryLog.ranges).toEqual([[0, 999], [0, 999], [1000, 1999]]);
  });

  it('adds id as a deterministic pagination tie breaker', async () => {
    await db.listServicesByProjectIds([1]);
    expect(queryLog.orders[0]).toEqual(['plate', 'name', 'id']);
  });
});
