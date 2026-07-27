import { useDeferredValue, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { message, Modal, Input, Pagination } from 'antd';
import { AccountBookOutlined, FileDoneOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { db } from '../api/db';
import { loadProjectRelations } from '../api/projectData';
import ExportModal from '../components/ExportModal';
import { appendTotalsRow, exportXLS, rs } from '../utils/export';
import { buildRawFormula, buildTieredFormula, calcRawAmount, calcTieredAmount, formatMoney, formatTimeCoeff, sumDeclareGroups, sumDeclareItems } from '../utils/calc';
import { PageError, PageLoading } from '../components/PageState';
import { ManagementToolbar, PageEmpty, PageHeader, RowActions, SummaryMetric } from '../components/PageLayout';
import { ensureSuccess, getErrorMessage } from '../utils/errors';
import { useAuth } from '../auth/AuthContext';

type DecMgmtPageProps = {
  onRefreshSubItems?: (projectId?: number) => void | Promise<void>;
};

export default function DecMgmtPage({ onRefreshSubItems }: DecMgmtPageProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);
  const navigate = useNavigate();
  const { canEditRecord } = useAuth();
  const [declares, setDeclares] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [tableKey, setTableKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [decName, setDecName] = useState('');
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
      const relations = await loadProjectRelations([pid], { services: false, declares: true, accepts: false });
      setDeclares(relations[pid].declares);
    } catch (e) {
      console.error('Declare management load error:', e);
      setLoadError('申报单列表加载失败，请稍后重试');
      message.error('申报单列表加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [pid]);

  const saveDeclare = async () => {
    const isEditing = editId !== null;
    const name = decName.trim();
    if (!name) { setNameError('请输入申报单名称'); return; }
    setNameError('');
    setSaving(true);
    try {
      const r = editId
        ? await db.updateDeclare(editId, { name })
        : await db.createDeclare({ project_id: pid, name });
      if (r.error) { message.error(editId ? '更新失败' : '创建失败'); return; }
      setOpen(false);
      setDecName('');
      setEditId(null);
      await load();
      await onRefreshSubItems?.(pid);
      setTableKey(k => k + 1);
      message.success(isEditing ? '更新成功' : '创建成功');
    } catch (error) {
      console.error('Declare save error:', error);
      message.error(isEditing ? '更新失败' : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const openCreateDeclare = () => {
    setEditId(null);
    setDecName('');
    setNameError('');
    setOpen(true);
  };

  const openEditDeclare = (declare: any) => {
    setEditId(declare.id);
    setDecName(declare.name || '');
    setNameError('');
    setOpen(true);
  };

  const closeDeclareEditor = () => {
    if (saving) return;
    setOpen(false);
    setEditId(null);
    setDecName('');
    setNameError('');
  };
  const delDeclare = async (id: number) => {
    if (deletingId !== null) return;
    setDeletingId(id);
    try {
      ensureSuccess(await db.deleteDeclare(id));
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
  const doExportDec = (fields: string[]) => {
    const rows: any[] = [];
    filtered.forEach(d => {
      const services = d.dServices || [];
      const declareRows = Math.max(services.reduce((count: number, ds: any) => count + Math.max((ds.items || []).length, 1), 0), 1);
      let firstDeclareRow = true;

      if (services.length === 0) {
        const row: any = {};
        if (fields.includes('申报单名称')) row['申报单名称'] = d.name;
        rows.push(row);
        return;
      }

      services.forEach((ds: any) => {
        const items = ds.items || [];
        const { raw: dsRaw, tiered: dsTiered } = sumDeclareItems(items);
        const serviceRows = Math.max(items.length, 1);
        let firstServiceRow = true;

        const addSharedFields = (row: any) => {
          if (fields.includes('申报单名称')) row['申报单名称'] = firstDeclareRow ? rs(d.name, declareRows) : '';
          if (fields.includes('申报服务单')) row['申报服务单'] = firstServiceRow ? rs(ds.service_order?.name || '--', serviceRows) : '';
          if (fields.includes('阶梯前服务单申报金额')) row['阶梯前服务单申报金额'] = firstServiceRow ? rs(dsRaw.toFixed(2), serviceRows) : '';
          if (fields.includes('阶梯后服务单申报金额')) row['阶梯后服务单申报金额'] = firstServiceRow ? rs(dsTiered.toFixed(2), serviceRows) : '';
        };

        if (items.length === 0) {
          const row: any = {};
          addSharedFields(row);
          rows.push(row);
          firstDeclareRow = false;
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
          firstDeclareRow = false;
          firstServiceRow = false;
        });
      });
    });
    const totals = sumDeclareGroups(filtered.flatMap(d => d.dServices || []));
    appendTotalsRow(fields, rows, {
      阶梯前服务项金额: totals.raw.toFixed(2),
      阶梯后服务项金额: totals.tiered.toFixed(2),
      阶梯前服务单申报金额: totals.raw.toFixed(2),
      阶梯后服务单申报金额: totals.tiered.toFixed(2),
    });
    exportXLS(fields, rows, '申报单明细.xls');
  };

  const deferredFilter = useDeferredValue(filter);
  const filtered = declares.filter(d => !deferredFilter || d.name.toLowerCase().includes(deferredFilter.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const pagedDeclares = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Build rows with rowspan info
  type Row = { type: string; d?: any; ds?: any; item?: any; raw?: number; tiered?: number; dsRaw?: number; dsTiered?: number; dsRows?: number; decRows?: number; isFirstDec?: boolean; isFirstDs?: boolean };
  const rows: Row[] = [];
  pagedDeclares.forEach(d => {
    const dsList = d.dServices || [];
    const decRows = dsList.reduce((a: number, ds: any) => a + Math.max((ds.items || []).length, 1), 0);
    let isFirstDec = true;
    if (dsList.length === 0) {
      rows.push({ type: 'row', d, ds: null, isFirstDec: true, decRows: 1 });
    } else {
      dsList.forEach((ds: any) => {
        const { raw: dsRaw, tiered: dsTiered } = sumDeclareItems(ds.items || []);
        const n = Math.max((ds.items || []).length, 1);
        let isFirstDs = true;
        if ((ds.items || []).length === 0) {
          rows.push({ type: 'row', d, ds, isFirstDec, isFirstDs, decRows, dsRows: 1, dsRaw, dsTiered });
        } else {
          (ds.items || []).forEach((it: any) => {
            rows.push({
              type: 'row', d, ds, item: it, isFirstDec, isFirstDs, decRows, dsRows: (ds.items || []).length, dsRaw, dsTiered,
              raw: calcRawAmount(it, true),
              tiered: calcTieredAmount(it, { useTimeCoeff: true }),
            });
            isFirstDs = false; isFirstDec = false;
          });
        }
      });
    }
  });

  const declareGroups = filtered.flatMap(d => d.dServices || []);
  const { raw: totalRaw, tiered: totalTiered } = sumDeclareGroups(declareGroups);

  return (
    <div>
      <PageHeader title="申报单管理" icon={<FileDoneOutlined />} backLabel="项目详情" onBack={() => navigate(`/project/${pid}`)} />
      <ManagementToolbar filter={filter} filterPlaceholder="筛选申报单名称" onFilterChange={(value) => { setFilter(value); setPage(1); }} onExport={() => setExportOpen(true)} onCreate={openCreateDeclare} createLabel="新建申报单" />
      <div className="summary-cards">
        <SummaryMetric label="申报单总数" value={filtered.length} icon={<UnorderedListOutlined />} />
        <SummaryMetric label="阶梯前申报汇总金额" value={formatMoney(totalRaw)} icon={<AccountBookOutlined />} />
        <SummaryMetric label="阶梯后申报汇总金额" value={formatMoney(totalTiered)} icon={<AccountBookOutlined />} tone="success" />
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
        loading && filtered.length === 0 ? <PageLoading text="正在加载申报单..." /> :
        filtered.length === 0 ? <PageEmpty description="暂无申报单" /> :
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
              <th className="col-index">序号</th><th className="col-name">申报单名称</th><th className="col-name">申报服务单</th><th className="col-service">服务项名称</th>
              <th className="col-amount">阶梯前服务项金额</th><th className="col-amount">阶梯后服务项金额</th>
              <th className="col-amount">阶梯前服务单申报金额</th><th className="col-amount">阶梯后服务单申报金额</th><th className="col-actions">操作</th>
            </tr></thead>
            <tbody>
              {(() => { let n = 0; let decRem = 0; let dsRem = 0;
                return rows.map((row, ri) => {
                  n++;
                  const dFirst = decRem === 0; if (dFirst) decRem = row.decRows || 1;
                  const dsFirst = dsRem === 0; if (dsFirst) dsRem = row.dsRows || 1;
                  const cells: any[] = [<td key="c0" className="col-index">{n}</td>];
                  if (dFirst) cells.push(<td key="c1" rowSpan={row.decRows} className="col-name grouped-name-cell">{row.d?.name}</td>);
                  if (dsFirst) cells.push(<td key="c2" rowSpan={row.dsRows} className="col-name grouped-name-cell">{row.ds?.service_order?.name || '--'}</td>);
                  cells.push(
                    <td key="c3" className="col-service">{row.item ? (row.item.catalog?.cat2 || '--') : '--'}</td>,
                    <td key="c4" className="col-amount amount-cell">{row.item ? formatMoney(row.raw) : '--'}</td>,
                    <td key="c5" className="col-amount amount-cell amount-cell-strong">{row.item ? formatMoney(row.tiered) : '--'}</td>,
                  );
                  if (dsFirst) cells.push(
                    <td key="c6" rowSpan={row.dsRows} className="col-amount amount-cell aggregate-cell">{formatMoney(row.dsRaw)}</td>,
                    <td key="c7" rowSpan={row.dsRows} className="col-amount amount-cell amount-cell-strong aggregate-cell">{formatMoney(row.dsTiered)}</td>,
                  );
                  if (dFirst) cells.push(<td key="c8" rowSpan={row.decRows} className="col-actions"><RowActions onView={() => navigate(`/declare/${row.d?.id}`)} onEdit={() => openEditDeclare(row.d)} onDelete={() => delDeclare(row.d?.id)} deleting={deletingId === row.d?.id} canEdit={canEditRecord(row.d)} canDelete={canEditRecord(row.d)} /></td>);
                  decRem--; dsRem--;
                  return <tr key={`r-${ri}`}>{cells}</tr>;
                });
              })()}
            </tbody>
          </table>
        }
      </div>
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} onExport={doExportDec} title="导出申报单明细 - 选择字段"
        options={[
          { label: '申报单名称', value: '申报单名称', defaultChecked: true }, { label: '申报服务单', value: '申报服务单', defaultChecked: true },
          { label: '服务项名称', value: '服务项名称', defaultChecked: true }, { label: '单位', value: '单位' },
          { label: '单价', value: '单价' }, { label: '难度系数', value: '难度系数' },
          { label: '完成量', value: '完成量' }, { label: '月份数', value: '月份数' },
          { label: '时间系数', value: '时间系数' }, { label: '阶梯前计算公式', value: '阶梯前计算公式' },
          { label: '阶梯前服务项金额', value: '阶梯前服务项金额', defaultChecked: true },
          { label: '阶梯后计算公式', value: '阶梯后计算公式' },
          { label: '阶梯后服务项金额', value: '阶梯后服务项金额', defaultChecked: true },
          { label: '阶梯前服务单申报金额', value: '阶梯前服务单申报金额', defaultChecked: true },
          { label: '阶梯后服务单申报金额', value: '阶梯后服务单申报金额', defaultChecked: true },
        ]} />
      <Modal title={editId ? '编辑申报单' : '新建申报单'} open={open} onOk={saveDeclare} onCancel={closeDeclareEditor} okText={editId ? '保存' : '创建'} confirmLoading={saving} cancelButtonProps={{ disabled: saving }} destroyOnClose>
        <div className="field-group"><label className="field-label-required">申报单名称</label><Input status={nameError ? 'error' : undefined} value={decName} onChange={e => { setNameError(''); setDecName(e.target.value); }} placeholder="如：70% 进度工作量申报" />{nameError && <div className="field-error" role="alert">{nameError}</div>}</div>
      </Modal>
    </div>
  );
}
