const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export function buildExcelHtml(fields: string[], rows: Record<string, any>[]) {
  const headerRow = '<tr>' + fields.map(f => '<th>' + escapeHtml(f) + '</th>').join('') + '</tr>';
  const cover: Record<number, number> = {};
  const bodyRows = rows.map((r) => {
    let tds = '';
    fields.forEach((f, fi) => {
      if (cover[fi] > 0) { cover[fi]--; return; }
      const v = r[f];
      if (v && typeof v === 'object' && v._rs && v._rs > 1) {
        tds += `<td rowspan="${v._rs}" style="vertical-align:middle">${escapeHtml(v._v)}</td>`;
        cover[fi] = v._rs - 1;
      } else if (v && typeof v === 'object' && v._rs) {
        tds += `<td style="vertical-align:middle">${escapeHtml(v._v)}</td>`;
      } else {
        tds += `<td>${escapeHtml(v)}</td>`;
      }
    });
    return '<tr>' + tds + '</tr>';
  }).join('\n');

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table border="1">${headerRow}${bodyRows}</table></body></html>`;
}

export function exportXLS(fields: string[], rows: Record<string, any>[], filename: string) {
  const html = buildExcelHtml(fields, rows);
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Create a rowspan cell: { _v: 'display text', _rs: 3 } */
export function rs(val: string, rowspan: number) {
  return { _v: val, _rs: rowspan };
}

export function appendTotalsRow(
  fields: string[],
  rows: Record<string, any>[],
  totals: Record<string, number | string>,
  label = '合计',
) {
  const totalFields = new Set(Object.keys(totals));
  const row: Record<string, any> = {};
  const labelField = fields.find(field => !totalFields.has(field));
  if (labelField) row[labelField] = label;
  fields.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(totals, field)) row[field] = totals[field];
  });
  rows.push(row);
}
