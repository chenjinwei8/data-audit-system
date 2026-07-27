import { useDeferredValue, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { message, Modal, Input, Pagination } from 'antd';
import { AccountBookOutlined, AuditOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { db } from '../api/db';
import { loadProjectRelations } from '../api/projectData';
import ExportModal from '../components/ExportModal';
import { appendTotalsRow, exportXLS, rs } from '../utils/export';
import { buildRawFormula, buildTieredFormula, calcRawAmount, calcTieredAmount, formatMoney, formatTimeCoeff, sumAcceptGroups, sumAcceptItems } from '../utils/calc';
import { PageError, PageLoading } from '../components/PageState';
import { ManagementToolbar, PageEmpty, PageHeader, RowActions, SummaryMetric } from '../components/PageLayout';
import { ensureSuccess, getErrorMessage } from '../utils/errors';
import { useAuth } from '../auth/AuthContext';

type AccMgmtPageProps = {
  onRefreshSubItems?: (projectId?: number) => void | Promise<void>;
};

export default function AccMgmtPage({ onRefreshSubItems }: AccMgmtPageProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);
  const navigate = useNavigate();
  const { canEditRecord } = useAuth();
  const [accepts, setAccepts] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [tableKey, setTableKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [accName, setAccName] = useState('');
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const relations = await loadProjectRelations([pid], { services: false, declares: false, accepts: true });
      setAccepts(relations[pid].accepts);
    } catch (e) {
      console.error('Accept management load error:', e);
      setLoadError('验收单列表加载失败，请稍后重试');
      message.error('验收单列表加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [pid]);

  const saveAccept = async () => {
    const isEditing = editId !== null;
    const name = accName.trim();
    if (!name) { setNameError('请输入验收单名称'); return; }
    setNameError('');
    setSaving(true);
    try {
      const r = editId
        ? await db.updateAccept(editId, { name })
        : await db.createAccept({ project_id: pid, name });
      if (r.error) { message.error(editId ? '更新失败' : '创建失败'); return; }
      setOpen(false);
      setAccName('');
      setEditId(null);
      await load();
      await onRefreshSubItems?.(pid);
      setTableKey(k => k + 1);
      message.success(isEditing ? '更新成功' : '创建成功');
    } catch (error) {
      console.error('Accept save error:', error);
      message.error(isEditing ? '更新失败' : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const openCreateAccept = () => {
    setEditId(null);
    setAccName('');
    setNameError('');
    setOpen(true);
  };

  const openEditAccept = (accept: any) => {
    setEditId(accept.id);
    setAccName(accept.name || '');
    setNameError('');
    setOpen(true);
  };

  const closeAcceptEditor = () => {
    if (saving) return;
    setOpen(false);
    setEditId(null);
    setAccName('');
    setNameError('');
  };
  const delAccept = async (id: number) => {
    if (deletingId !== null) return;
    setDeletingId(id);
    try {
      ensureSuccess(await db.deleteAccept(id));
      await load();
      await onRefreshSubItems?.(pid);
      setTableKey(k => k + 1);
      message.success('删除成功');
    } catch (error) {
      message.error(`删除失败：${getErrorMessage(error)}`);
    } finally {
      setDeletingId(null);
    }
  };
  const doExportAcc = (fields: string[]) => {
    const rows: any[] = [];
    filtered.forEach(a => {
      const services = a.aServices || [];
      const acceptRows = Math.max(services.reduce((count: number, as: any) => count + Math.max((as.items || []).length, 1), 0), 1);
      let firstAcceptRow = true;

      if (services.length === 0) {
        const row: any = {};
        if (fields.includes('验收单名称')) row['验收单名称'] = a.name;
        rows.push(row);
        return;
      }

      services.forEach((as: any) => {
        const items = as.items || [];
        const { raw: asRaw, tiered: asTiered } = sumAcceptItems(items);
        const serviceRows = Math.max(items.length, 1);
        let firstServiceRow = true;

        const addSharedFields = (row: any) => {
          if (fields.includes('验收单名称')) row['验收单名称'] = firstAcceptRow ? rs(a.name, acceptRows) : '';
          if (fields.includes('验收服务单')) row['验收服务单'] = firstServiceRow ? rs(as.service_order?.name || '--', serviceRows) : '';
          if (fields.includes('阶梯前服务单验收金额')) row['阶梯前服务单验收金额'] = firstServiceRow ? rs(asRaw.toFixed(2), serviceRows) : '';
          if (fields.includes('阶梯后服务单验收金额')) row['阶梯后服务单验收金额'] = firstServiceRow ? rs(asTiered.toFixed(2), serviceRows) : '';
        };

        if (items.length === 0) {
          const row: any = {};
          addSharedFields(row);
          rows.push(row);
          firstAcceptRow = false;
          return;
        }

        items.forEach((it: any) => {
          const raw = calcRawAmount(it, true);
          const tiered = calcTieredAmount(it, { useTimeCoeff: true });
          const row: any = {};
          addSharedFields(row);
          if (fields.includes('服务项名称')) row['服务项名称'] = it.catalog?.cat2 || '--';
          if (fields.includes('单位')) row['单位'] = it.catalog?.unit || '';
          if (fields.includes('单价')) row['单价'] = it.catalog?.price ?? '';
          if (fields.includes('难度系数')) row['难度系数'] = it.coeff;
          if (fields.includes('完成量')) row['完成量'] = it.qty ?? 0;
          if (fields.includes('月份数')) row['月份数'] = it.months ?? '';
          if (fields.includes('时间系数')) row['时间系数'] = formatTimeCoeff(it);
          if (fields.includes('阶梯前计算公式')) row['阶梯前计算公式'] = buildRawFormula(it, true);
          if (fields.includes('阶梯前服务项金额')) row['阶梯前服务项金额'] = raw.toFixed(2);
          if (fields.includes('阶梯后计算公式')) row['阶梯后计算公式'] = buildTieredFormula(it, true);
          if (fields.includes('阶梯后服务项金额')) row['阶梯后服务项金额'] = tiered.toFixed(2);
          rows.push(row);
          firstAcceptRow = false;
          firstServiceRow = false;
        });
      });
    });
    const totals = sumAcceptGroups(filtered.flatMap(a => a.aServices || []));
    appendTotalsRow(fields, rows, {
      阶梯前服务项金额: totals.raw.toFixed(2),
      阶梯后服务项金额: totals.tiered.toFixed(2),
      阶梯前服务单验收金额: totals.raw.toFixed(2),
      阶梯后服务单验收金额: totals.tiered.toFixed(2),
    });
    exportXLS(fields, rows, '验收单明细.xls');
  };

  const deferredFilter = useDeferredValue(filter);
  const filtered = accepts.filter(a => !deferredFilter || a.name.toLowerCase().includes(deferredFilter.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const pagedAccepts = filtered.slice((page - 1) * pageSize, page * pageSize);

  type Row = { type: string; a?: any; as?: any; item?: any; raw?: number; tiered?: number; asRaw?: number; asTiered?: number; asRows?: number; accRows?: number; isFirstAcc?: boolean; isFirstAs?: boolean };
  const rows: Row[] = [];
  pagedAccepts.forEach(a => {
    const asList = a.aServices || [];
    const accRows = asList.reduce((s: number, as: any) => s + Math.max((as.items || []).length, 1), 0);
    let isFirstAcc = true;
    if (asList.length === 0) { rows.push({ type: 'row', a, as: null, isFirstAcc: true, accRows: 1 }); }
    else asList.forEach((as: any) => {
      const { raw: asRaw, tiered: asTiered } = sumAcceptItems(as.items || []);
      const n = Math.max((as.items || []).length, 1);
      let isFirstAs = true;
      if ((as.items || []).length === 0) { rows.push({ type: 'row', a, as, isFirstAcc, isFirstAs, accRows, asRows: 1, asRaw, asTiered }); }
      else (as.items || []).forEach((it: any) => { rows.push({ type: 'row', a, as, item: it, isFirstAcc, isFirstAs, accRows, asRows: (as.items || []).length, asRaw, asTiered, raw: calcRawAmount(it, true), tiered: calcTieredAmount(it, { useTimeCoeff: true }) }); isFirstAs = false; isFirstAcc = false; });
    });
  });

  const acceptGroups = filtered.flatMap(a => a.aServices || []);
  const { raw: totalRaw, tiered: totalTiered } = sumAcceptGroups(acceptGroups);

  return (
    <div>
      <PageHeader title="验收单管理" icon={<AuditOutlined />} backLabel="项目详情" onBack={() => navigate(`/project/${pid}`)} />
      <ManagementToolbar filter={filter} filterPlaceholder="筛选验收单名称" onFilterChange={(value) => { setFilter(value); setPage(1); }} onExport={() => setExportOpen(true)} onCreate={openCreateAccept} createLabel="新建验收单" />
      <div className="summary-cards">
        <SummaryMetric label="验收单总数" value={filtered.length} icon={<UnorderedListOutlined />} />
        <SummaryMetric label="阶梯前验收汇总金额" value={formatMoney(totalRaw)} icon={<AccountBookOutlined />} />
        <SummaryMetric label="阶梯后验收汇总金额" value={formatMoney(totalTiered)} icon={<AccountBookOutlined />} tone="success" />
      </div>
      {filtered.length > 20 && (
        <div className="management-pagination">
          <Pagination
            current={page}
            pageSize={pageSize}
            total={filtered.length}
            showSizeChanger
            pageSizeOptions={['20', '50', '100']}
            onChange={(nextPage, nextPageSize) => {
              setPage(nextPageSize === pageSize ? nextPage : 1);
              setPageSize(nextPageSize);
            }}
          />
        </div>
      )}
      <div className="management-table-shell">
        {loadError && filtered.length === 0 ? <PageError message={loadError} onRetry={load} retrying={loading} /> :
        loading && filtered.length === 0 ? <PageLoading text="正在加载验收单..." /> :
        filtered.length === 0 ? <PageEmpty description="暂无验收单" /> :
          <table key={tableKey} className="management-table document-management-table">
            <colgroup>
              <col className="table-col-index" />
              <col className="table-col-document-name" />
              <col className="table-col-linked-service" />
              <col className="table-col-item-name" />
              <col className="table-col-amount" />
              <col className="table-col-amount" />
              <col className="table-col-amount" />
              <col className="table-col-amount" />
              <col className="table-col-actions" />
            </colgroup>
            <thead><tr className="management-table-head">
              <th className="col-index">序号</th><th className="col-name">验收单名称</th><th className="col-name">验收服务单</th><th className="col-service">服务项名称</th>
              <th className="col-amount">阶梯前服务项金额</th><th className="col-amount">阶梯后服务项金额</th>
              <th className="col-amount">阶梯前服务单验收金额</th><th className="col-amount">阶梯后服务单验收金额</th><th className="col-actions">操作</th>
            </tr></thead><tbody>
            {(() => { let n = 0, accRem = 0, asRem = 0;
              return rows.map((row, ri) => { n++; const a1 = accRem === 0; if (a1) accRem = row.accRows || 1; const a2 = asRem === 0; if (a2) asRem = row.asRows || 1;
                const c: any[] = [<td key="c0" className="col-index">{n}</td>];
                if (a1) c.push(<td key="c1" rowSpan={row.accRows} className="col-name grouped-name-cell">{row.a?.name}</td>);
                if (a2) c.push(<td key="c2" rowSpan={row.asRows} className="col-name grouped-name-cell">{row.as?.service_order?.name || '--'}</td>);
                c.push(<td key="c3" className="col-service">{row.item ? (row.item.catalog?.cat2 || '--') : '--'}</td>, <td key="c4" className="col-amount amount-cell">{row.item ? formatMoney(row.raw) : '--'}</td>, <td key="c5" className="col-amount amount-cell amount-cell-strong">{row.item ? formatMoney(row.tiered) : '--'}</td>);
                if (a2) c.push(<td key="c6" rowSpan={row.asRows} className="col-amount amount-cell aggregate-cell">{formatMoney(row.asRaw)}</td>, <td key="c7" rowSpan={row.asRows} className="col-amount amount-cell amount-cell-strong aggregate-cell">{formatMoney(row.asTiered)}</td>);
                if (a1) c.push(<td key="c8" rowSpan={row.accRows} className="col-actions"><RowActions onView={() => navigate(`/accept/${row.a?.id}`)} onEdit={() => openEditAccept(row.a)} onDelete={() => delAccept(row.a?.id)} deleting={deletingId === row.a?.id} canEdit={canEditRecord(row.a)} canDelete={canEditRecord(row.a)} /></td>);
                accRem--; asRem--; return <tr key={`r-${ri}`}>{c}</tr>;
              });
            })()}
          </tbody></table>
        }
      </div>
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} onExport={doExportAcc} title="导出验收单明细 - 选择字段"
        options={[
          { label: '验收单名称', value: '验收单名称', defaultChecked: true }, { label: '验收服务单', value: '验收服务单', defaultChecked: true },
          { label: '服务项名称', value: '服务项名称', defaultChecked: true }, { label: '单位', value: '单位' },
          { label: '单价', value: '单价' }, { label: '难度系数', value: '难度系数' },
          { label: '完成量', value: '完成量' }, { label: '月份数', value: '月份数' },
          { label: '时间系数', value: '时间系数' }, { label: '阶梯前计算公式', value: '阶梯前计算公式' },
          { label: '阶梯前服务项金额', value: '阶梯前服务项金额', defaultChecked: true },
          { label: '阶梯后计算公式', value: '阶梯后计算公式' },
          { label: '阶梯后服务项金额', value: '阶梯后服务项金额', defaultChecked: true },
          { label: '阶梯前服务单验收金额', value: '阶梯前服务单验收金额', defaultChecked: true },
          { label: '阶梯后服务单验收金额', value: '阶梯后服务单验收金额', defaultChecked: true },
        ]} />
      <Modal title={editId ? '编辑验收单' : '新建验收单'} open={open} onOk={saveAccept} onCancel={closeAcceptEditor} okText={editId ? '保存' : '创建'} confirmLoading={saving} cancelButtonProps={{ disabled: saving }} destroyOnClose>
        <div className="field-group"><label className="field-label-required">验收单名称</label><Input status={nameError ? 'error' : undefined} value={accName} onChange={e => { setNameError(''); setAccName(e.target.value); }} placeholder="如：70% 阶段性验收" />{nameError && <div className="field-error" role="alert">{nameError}</div>}</div>
      </Modal>
    </div>
  );
}
