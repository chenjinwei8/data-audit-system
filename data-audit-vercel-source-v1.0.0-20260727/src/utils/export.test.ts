import { describe, expect, it } from 'vitest';
import { appendTotalsRow, buildExcelHtml, rs } from './export';

describe('Excel HTML export', () => {
  it('preserves zero values, escapes text, and emits rowspans', () => {
    const html = buildExcelHtml(
      ['名称', '完成量'],
      [
        { 名称: rs('<服务单>', 2), 完成量: 0 },
        { 名称: '', 完成量: 10 },
      ],
    );

    expect(html).toContain('rowspan="2"');
    expect(html).toContain('&lt;服务单&gt;');
    expect(html).toContain('<td>0</td>');
  });

  it('places totals under their matching amount columns', () => {
    const rows: Record<string, any>[] = [];
    appendTotalsRow(['名称', '阶梯前金额', '阶梯后金额'], rows, {
      阶梯前金额: '100.00',
      阶梯后金额: '80.00',
    });

    expect(rows).toEqual([{ 名称: '合计', 阶梯前金额: '100.00', 阶梯后金额: '80.00' }]);
  });
});
