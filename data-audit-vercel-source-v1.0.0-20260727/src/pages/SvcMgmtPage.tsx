import { useDeferredValue, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { message, Modal, Input, Pagination } from 'antd';
import { AccountBookOutlined, FolderOutlined, ProfileOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { db } from '../api/db';
import { loadProjectRelations } from '../api/projectData';
import ExportModal from '../components/ExportModal';
import { appendTotalsRow, exportXLS, rs } from '../utils/export';
import { buildRawFormula, buildTieredFormula, calcRawAmount, calcTieredAmount, formatMoney, sumServiceGroups, sumServiceItems } from '../utils/calc';
import { PageError, PageLoading } from '../components/PageState';
import { ManagementToolbar, PageEmpty, PageHeader, RowActions, SummaryMetric } from '../components/PageLayout';
import { ensureSuccess, getErrorMessage } from '../utils/errors';
import { useAuth } from '../auth/AuthContext';

const UNCLASSIFIED_PLATE = '未分类';

const cleanPlateName = (value: unknown) => (
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
);

const getPlateName = (value: unknown) => cleanPlateName(value) || UNCLASSIFIED_PLATE;

type SvcMgmtPageProps = {
  onRefreshSubItems?: (projectId?: number) => void | Promise<void>;
};

export default function SvcMgmtPage({ onRefreshSubItems }: SvcMgmtPageProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);
  const navigate = useNavigate();
  const { canEditRecord } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [tableKey, setTableKey] = useState(0);
  const [svcOpen, setSvcOpen] = useState(false);
  const [editingService, setEditingService] = useState<any | null>(null);
  const [svcName, setSvcName] = useState('');
  const [svcNameError, setSvcNameError] = useState('');
  const [svcPlate, setSvcPlate] = useState('');
  const [svcCenterLead, setSvcCenterLead] = useState('');
  const [svcOperatorLead, setSvcOperatorLead] = useState('');
  const [svcDateStart, setSvcDateStart] = useState('');
  const [svcDateEnd, setSvcDateEnd] = useState('');
  const [savingService, setSavingService] = useState(false);
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
      const relations = await loadProjectRelations([pid], { services: true, declares: false, accepts: false });
      setServices(relations[pid].services);
    } catch (e) {
      console.error('Service management load error:', e);
      setLoadError('服务单列表加载失败，请稍后重试');
      message.error('服务单列表加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [pid]);

  const del = async (id: number) => {
    if (deletingId !== null) return;
    setDeletingId(id);
    try {
      ensureSuccess(await db.deleteService(id));
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
  const doExport = (fields: string[]) => {
    const rows: any[] = [];
    const plateRowCounts = new Map<string, number>();
    sorted.forEach(s => {
      const plate = getPlateName(s.plate);
      plateRowCounts.set(plate, (plateRowCounts.get(plate) || 0) + Math.max((s.items || []).length, 1));
    });
    let activePlate = '';

    sorted.forEach(s => {
      const items = s.items || [];
      const { raw: sRaw, tiered: sTiered } = sumServiceItems(items);
      const n = Math.max(items.length, 1);
      const plate = getPlateName(s.plate);
      const isFirstPlate = plate !== activePlate;
      activePlate = plate;
      let first = true;
      if (items.length === 0) {
        const r: any = {}; if (fields.includes('服务板块')) r['服务板块'] = isFirstPlate ? rs(plate, plateRowCounts.get(plate) || 1) : '';
        if (fields.includes('服务单名称')) r['服务单名称'] = s.name;
        if (fields.includes('阶梯前服务单预估金额')) r['阶梯前服务单预估金额'] = sRaw.toFixed(2);
        if (fields.includes('阶梯后服务单预估金额')) r['阶梯后服务单预估金额'] = sTiered.toFixed(2);
        rows.push(r);
      } else {
        items.forEach((it: any) => {
          const raw = calcRawAmount(it);
          const tiered = calcTieredAmount(it);
          const r: any = {};
          if (fields.includes('服务板块')) r['服务板块'] = first && isFirstPlate ? rs(plate, plateRowCounts.get(plate) || 1) : '';
          if (fields.includes('服务单名称')) r['服务单名称'] = first ? rs(s.name, n) : '';
          if (fields.includes('服务项名称')) r['服务项名称'] = it.catalog?.cat2 || '--';
          if (fields.includes('单位')) r['单位'] = it.catalog?.unit || '';
          if (fields.includes('单价')) r['单价'] = it.catalog?.price || '';
          if (fields.includes('难度系数')) r['难度系数'] = it.coeff;
          if (fields.includes('年度预估完成量')) r['年度预估完成量'] = it.qty;
          if (fields.includes('阶梯前计算公式')) r['阶梯前计算公式'] = buildRawFormula(it);
          if (fields.includes('阶梯前服务项金额')) r['阶梯前服务项金额'] = raw.toFixed(2);
          if (fields.includes('阶梯后计算公式')) r['阶梯后计算公式'] = buildTieredFormula(it);
          if (fields.includes('阶梯后服务项金额')) r['阶梯后服务项金额'] = tiered.toFixed(2);
          if (fields.includes('阶梯前服务单预估金额')) r['阶梯前服务单预估金额'] = first ? rs(sRaw.toFixed(2), n) : '';
          if (fields.includes('阶梯后服务单预估金额')) r['阶梯后服务单预估金额'] = first ? rs(sTiered.toFixed(2), n) : '';
          rows.push(r); first = false;
        });
      }
    });
    const totals = sumServiceGroups(sorted);
    appendTotalsRow(fields, rows, {
      阶梯前服务项金额: totals.raw.toFixed(2),
      阶梯后服务项金额: totals.tiered.toFixed(2),
      阶梯前服务单预估金额: totals.raw.toFixed(2),
      阶梯后服务单预估金额: totals.tiered.toFixed(2),
    });
    exportXLS(fields, rows, '服务单明细.xls');
  };

  const resetServiceEditor = () => {
    setEditingService(null);
    setSvcName('');
    setSvcNameError('');
    setSvcPlate('');
    setSvcCenterLead('');
    setSvcOperatorLead('');
    setSvcDateStart('');
    setSvcDateEnd('');
  };

  const openCreateService = () => {
    resetServiceEditor();
    setSvcOpen(true);
  };

  const openEditService = (service: any) => {
    setEditingService(service);
    setSvcName(service.name || '');
    setSvcNameError('');
    setSvcPlate(service.plate || '');
    setSvcCenterLead(service.center_lead || '');
    setSvcOperatorLead(service.operator_lead || '');
    setSvcDateStart(service.date_start || '');
    setSvcDateEnd(service.date_end || '');
    setSvcOpen(true);
  };

  const closeServiceEditor = () => {
    if (savingService) return;
    setSvcOpen(false);
    resetServiceEditor();
  };

  const saveService = async () => {
    const isEditing = Boolean(editingService);
    const name = svcName.trim();
    if (!name) { setSvcNameError('请输入服务单名称'); return; }
    setSvcNameError('');
    if (svcDateStart && svcDateEnd && svcDateStart > svcDateEnd) {
      message.error('结束日期不能早于开始日期');
      return;
    }

    const payload = {
      name,
      plate: cleanPlateName(svcPlate) || null,
      center_lead: svcCenterLead.trim() || null,
      operator_lead: svcOperatorLead.trim() || null,
      date_start: svcDateStart || null,
      date_end: svcDateEnd || null,
    };

    setSavingService(true);
    try {
      const r = editingService
        ? await db.updateService(editingService.id, payload)
        : await db.createService({ project_id: pid, ...payload });
      if (r.error) {
        message.error(editingService ? '更新失败' : '创建失败');
        return;
      }
      setSvcOpen(false);
      resetServiceEditor();
      await load();
      await onRefreshSubItems?.(pid);
      setTableKey(k => k + 1);
      message.success(isEditing ? '更新成功' : '创建成功');
    } catch (error) {
      console.error('Service save error:', error);
      message.error(isEditing ? '更新失败' : '创建失败');
    } finally {
      setSavingService(false);
    }
  };

  const deferredFilter = useDeferredValue(filter);
  const filtered = services.filter(s => !deferredFilter || s.name.toLowerCase().includes(deferredFilter.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    const plateResult = getPlateName(a.plate).localeCompare(getPlateName(b.plate), 'zh-CN');
    if (plateResult !== 0) return plateResult;
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
  });
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const pagedServices = sorted.slice((page - 1) * pageSize, page * pageSize);

  // Build grouped rows
  type Row = { type: string; plate?: string; svc?: any; item?: any; raw?: number; tiered?: number; svcRaw?: number; svcTiered?: number; svcRows?: number; isFirst?: boolean };
  const rows: Row[] = [];
  let lastPlate = '';
  pagedServices.forEach(s => {
    const items = s.items || [];
    const { raw: sRaw, tiered: sTiered } = sumServiceItems(items);
    const n = Math.max(items.length, 1);
    const plate = getPlateName(s.plate);
    if (plate !== lastPlate) {
      rows.push({ type: 'plate', plate });
      lastPlate = plate;
    }
    if (items.length === 0) {
      rows.push({ type: 'row', svc: s, svcRaw: sRaw, svcTiered: sTiered, svcRows: 1, isFirst: true });
    } else {
      items.forEach((it: any, i: number) => rows.push({
        type: 'row', svc: s, item: it,
        raw: calcRawAmount(it), tiered: calcTieredAmount(it),
        svcRaw: sRaw, svcTiered: sTiered, svcRows: items.length, isFirst: i === 0,
      }));
    }
  });

  const { raw: totalRaw, tiered: totalTiered } = sumServiceGroups(sorted);

  return (
    <div>
      <PageHeader title="服务单管理" icon={<ProfileOutlined />} backLabel="项目详情" onBack={() => navigate(`/project/${pid}`)} />
      <ManagementToolbar
        filter={filter}
        filterPlaceholder="筛选服务单名称"
        onFilterChange={(value) => { setFilter(value); setPage(1); }}
        onExport={() => setExportOpen(true)}
        onCreate={openCreateService}
        createLabel="新建服务单"
      />
      <div className="summary-cards">
        <SummaryMetric label="服务单总数" value={sorted.length} icon={<UnorderedListOutlined />} />
        <SummaryMetric label="阶梯前服务单汇总金额" value={formatMoney(totalRaw)} icon={<AccountBookOutlined />} />
        <SummaryMetric label="阶梯后服务单汇总金额" value={formatMoney(totalTiered)} icon={<AccountBookOutlined />} tone="success" />
      </div>
      {sorted.length > 20 && (
        <div className="management-pagination">
          <Pagination
            current={page}
            pageSize={pageSize}
            total={sorted.length}
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
        {loadError && sorted.length === 0 ? <PageError message={loadError} onRetry={load} retrying={loading} /> :
        loading && sorted.length === 0 ? <PageLoading text="正在加载服务单..." /> :
        sorted.length === 0 ? <PageEmpty description="暂无服务单" /> :
          <table key={tableKey} className="management-table service-management-table">
            <colgroup>
              <col className="table-col-index" />
              <col className="table-col-document-name" />
              <col className="table-col-item-name" />
              <col className="table-col-amount" />
              <col className="table-col-amount" />
              <col className="table-col-amount" />
              <col className="table-col-amount" />
              <col className="table-col-actions" />
            </colgroup>
            <tbody>
              {(() => { let n = 0; let svcRem = 0;
                return rows.map((row, ri) => {
                  if (row.type === 'plate') {
                    n = 0;
                    svcRem = 0;
                    return [
                      <tr key={`p-${ri}`} className="plate-header"><td colSpan={8}><FolderOutlined /> {row.plate}</td></tr>,
                      <tr key={`h-${ri}`} className="management-table-head">
                        <th className="col-index">序号</th><th className="col-name">服务单名称</th><th className="col-service">服务项名称</th>
                        <th className="col-amount">阶梯前服务项金额</th><th className="col-amount">阶梯后服务项金额</th>
                        <th className="col-amount">阶梯前服务单预估金额</th><th className="col-amount">阶梯后服务单预估金额</th><th className="col-actions">操作</th>
                      </tr>,
                    ];
                  }
                  n++; const sf = (svcRem === 0); if (sf) svcRem = row.svcRows || 1;
                  const cells: any[] = [<td key="c0" className="col-index">{n}</td>];
                  if (sf) cells.push(<td key="c1" rowSpan={row.svcRows} className="col-name grouped-name-cell">{row.svc?.name}</td>);
                  cells.push(
                    <td key="c2" className="col-service">{row.item ? (row.item.catalog?.cat2 || '--') : '--'}</td>,
                    <td key="c3" className="col-amount amount-cell">{row.item ? formatMoney(row.raw) : '--'}</td>,
                    <td key="c4" className="col-amount amount-cell amount-cell-strong">{row.item ? formatMoney(row.tiered) : '--'}</td>,
                  );
                  if (sf) cells.push(
                    <td key="c5" rowSpan={row.svcRows} className="col-amount amount-cell aggregate-cell">{formatMoney(row.svcRaw)}</td>,
                    <td key="c6" rowSpan={row.svcRows} className="col-amount amount-cell amount-cell-strong aggregate-cell">{formatMoney(row.svcTiered)}</td>,
                    <td key="c7" rowSpan={row.svcRows} className="col-actions"><RowActions onView={() => navigate(`/service/${row.svc?.id}`)} onEdit={() => openEditService(row.svc)} onDelete={() => del(row.svc?.id)} deleting={deletingId === row.svc?.id} canEdit={canEditRecord(row.svc)} canDelete={canEditRecord(row.svc)} /></td>
                  );
                  svcRem--; return <tr key={`r-${ri}`}>{cells}</tr>;
                });
              })()}
            </tbody>
          </table>
        }
      </div>
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} onExport={doExport} title="导出服务单明细 - 选择字段"
        options={[
          { label: '服务板块', value: '服务板块' }, { label: '服务单名称', value: '服务单名称', defaultChecked: true },
          { label: '服务项名称', value: '服务项名称', defaultChecked: true }, { label: '单位', value: '单位' },
          { label: '单价', value: '单价' }, { label: '难度系数', value: '难度系数' },
          { label: '年度预估完成量', value: '年度预估完成量' }, { label: '阶梯前计算公式', value: '阶梯前计算公式' },
          { label: '阶梯前服务项金额', value: '阶梯前服务项金额', defaultChecked: true },
          { label: '阶梯后计算公式', value: '阶梯后计算公式' },
          { label: '阶梯后服务项金额', value: '阶梯后服务项金额', defaultChecked: true },
          { label: '阶梯前服务单预估金额', value: '阶梯前服务单预估金额', defaultChecked: true },
          { label: '阶梯后服务单预估金额', value: '阶梯后服务单预估金额', defaultChecked: true },
        ]} />
      <Modal
        title={editingService ? '编辑服务单' : '新建服务单'}
        open={svcOpen}
        onOk={saveService}
        onCancel={closeServiceEditor}
        okText={editingService ? '保存' : '创建'}
        confirmLoading={savingService}
        cancelButtonProps={{ disabled: savingService }}
        destroyOnClose
      >
        <div className="field-stack">
          <div className="field-group"><label className="field-label-required">服务单名称</label><Input status={svcNameError ? 'error' : undefined} value={svcName} onChange={e => { setSvcNameError(''); setSvcName(e.target.value); }} placeholder="请输入服务单名称" />{svcNameError && <div className="field-error" role="alert">{svcNameError}</div>}</div>
          <div className="field-group"><label>服务板块</label><Input value={svcPlate} onChange={e => setSvcPlate(e.target.value)} placeholder="如：系统运维板块" /></div>
          <div className="field-grid-2">
            <div className="field-group"><label>中心负责人</label><Input value={svcCenterLead} onChange={e => setSvcCenterLead(e.target.value)} placeholder="请输入中心负责人" /></div>
            <div className="field-group"><label>运营商负责人</label><Input value={svcOperatorLead} onChange={e => setSvcOperatorLead(e.target.value)} placeholder="请输入运营商负责人" /></div>
          </div>
          <div className="field-grid-2">
            <div className="field-group"><label>开始日期</label><Input type="date" value={svcDateStart} onChange={e => setSvcDateStart(e.target.value)} /></div>
            <div className="field-group"><label>结束日期</label><Input type="date" value={svcDateEnd} onChange={e => setSvcDateEnd(e.target.value)} /></div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
