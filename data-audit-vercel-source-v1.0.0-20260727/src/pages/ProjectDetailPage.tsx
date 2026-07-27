import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Table, Button, Tabs, Input, message, Popconfirm, Space, Tag, Modal } from 'antd';
import { AccountBookOutlined, AuditOutlined, EditOutlined, FileDoneOutlined, PlusOutlined, ProfileOutlined, ProjectOutlined } from '@ant-design/icons';
import { db } from '../api/db';
import { loadProjectRelations } from '../api/projectData';
import {
  formatMoney,
  sumAcceptGroups,
  sumDeclareGroups,
  sumServiceGroups,
  sumServiceItems,
} from '../utils/calc';
import { PageError, PageLoading } from '../components/PageState';
import { PageHeader, SummaryMetric } from '../components/PageLayout';
import useActionState from '../hooks/useActionState';
import { ensureSuccess, getErrorMessage } from '../utils/errors';
import { useAuth } from '../auth/AuthContext';

type ProjectDetailPageProps = {
  onRefreshSubItems?: (projectId?: number) => void | Promise<void>;
};

export default function ProjectDetailPage({ onRefreshSubItems }: ProjectDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const pid = Number(id);
  const [project, setProject] = useState<any>(undefined);
  const [services, setServices] = useState<any[]>([]);
  const [declares, setDeclares] = useState<any[]>([]);
  const [accepts, setAccepts] = useState<any[]>([]);
  const [svcOpen, setSvcOpen] = useState(false);
  const [svcName, setSvcName] = useState('');
  const [svcPlate, setSvcPlate] = useState('');
  const [svcCenter, setSvcCenter] = useState('');
  const [svcOpLead, setSvcOpLead] = useState('');
  const [svcStart, setSvcStart] = useState('');
  const [svcEnd, setSvcEnd] = useState('');
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoVals, setInfoVals] = useState({ lead_unit: '', operator: '', supervisor: '' });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [svcNameError, setSvcNameError] = useState('');
  const actions = useActionState();
  const { canEditRecord } = useAuth();

  const loadPage = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [pr, relationsByProject] = await Promise.all([
        db.getProject(pid),
        loadProjectRelations([pid]),
      ]);
      ensureSuccess(pr);
      const p = pr.data;
      if (!p) throw new Error('项目不存在或已删除');
      const loadedRelations = relationsByProject[pid] || { services: [], declares: [], accepts: [] };
      setProject(p);
      setInfoVals({ lead_unit: p.lead_unit || '', operator: p.operator || '', supervisor: p.supervisor || '' });
      setServices(loadedRelations.services);
      setDeclares(loadedRelations.declares);
      setAccepts(loadedRelations.accepts);
    } catch (error) {
      console.error('Project detail load error:', error);
      setLoadError(getErrorMessage(error, '项目详情加载失败'));
      setProject(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPage(); }, [pid]);

  const reloadServices = async () => {
    try {
      const relations = await loadProjectRelations([pid], { services: true, declares: false, accepts: false });
      setServices(relations[pid].services);
    } catch (e) {
      console.error('Service reload error:', e);
      message.error('服务单列表加载失败');
    }
  };
  const reloadDeclares = async () => {
    try {
      const relations = await loadProjectRelations([pid], { services: false, declares: true, accepts: false });
      setDeclares(relations[pid].declares);
    } catch (e) {
      console.error('Declare reload error:', e);
      message.error('申报单列表加载失败');
    }
  };
  const reloadAccepts = async () => {
    try {
      const relations = await loadProjectRelations([pid], { services: false, declares: false, accepts: true });
      setAccepts(relations[pid].accepts);
    } catch (e) {
      console.error('Accept reload error:', e);
      message.error('验收单列表加载失败');
    }
  };

  const saveInfo = async () => {
    await actions.run('save-info', async () => {
      try {
        ensureSuccess(await db.updateProject(pid, infoVals));
        const r = ensureSuccess(await db.getProject(pid));
        setProject(r.data || null);
        setEditingInfo(false);
        message.success('已更新');
      } catch (error) {
        message.error(`更新失败：${getErrorMessage(error)}`);
      }
    });
  };
  const saveSvc = async () => {
    if (!svcName.trim()) { setSvcNameError('请输入服务单名称'); return; }
    if (svcStart && svcEnd && svcStart > svcEnd) { message.error('结束日期不能早于开始日期'); return; }
    setSvcNameError('');
    await actions.run('save-service', async () => {
      try {
        ensureSuccess(await db.createService({ project_id: pid, name: svcName.trim(), plate: svcPlate, center_lead: svcCenter, operator_lead: svcOpLead, date_start: svcStart || null, date_end: svcEnd || null }));
        setSvcOpen(false); setSvcName(''); setSvcPlate(''); setSvcCenter(''); setSvcOpLead(''); setSvcStart(''); setSvcEnd('');
        await reloadServices();
        await onRefreshSubItems?.(pid);
        message.success('创建成功');
      } catch (error) {
        message.error(`创建失败：${getErrorMessage(error)}`);
      }
    });
  };

  const deleteServiceOrder = async (serviceId: number) => {
    await actions.run(`delete-service-${serviceId}`, async () => {
      try {
        ensureSuccess(await db.deleteService(serviceId));
        await reloadServices();
        await onRefreshSubItems?.(pid);
        message.success('删除成功');
      } catch (error) { message.error(`删除失败：${getErrorMessage(error)}`); }
    });
  };

  const deleteDeclareOrder = async (declareId: number) => {
    await actions.run(`delete-declare-${declareId}`, async () => {
      try {
        ensureSuccess(await db.deleteDeclare(declareId));
        await reloadDeclares();
        await onRefreshSubItems?.(pid);
        message.success('删除成功');
      } catch (error) { message.error(`删除失败：${getErrorMessage(error)}`); }
    });
  };

  const deleteAcceptOrder = async (acceptId: number) => {
    await actions.run(`delete-accept-${acceptId}`, async () => {
      try {
        ensureSuccess(await db.deleteAccept(acceptId));
        await reloadAccepts();
        await onRefreshSubItems?.(pid);
        message.success('删除成功');
      } catch (error) { message.error(`删除失败：${getErrorMessage(error)}`); }
    });
  };

  if (loading) return <PageLoading text="正在加载项目详情..." />;
  if (loadError) return <PageError message={loadError} onRetry={loadPage} retrying={loading} />;
  if (project === null) return <PageError message="项目不存在或已删除" onRetry={loadPage} />;
  if (!project) return <PageLoading text="正在加载项目数据..." />;

  const serviceTotals = sumServiceGroups(services);
  const declareTotals = sumDeclareGroups(declares.flatMap((d: any) => d.dServices || []));
  const acceptTotals = sumAcceptGroups(accepts.flatMap((a: any) => a.aServices || []));

  return (
    <div>
      <PageHeader title={project.name} icon={<ProjectOutlined />} backLabel="项目列表" onBack={() => navigate('/')} />
      <button type="button" className="info-strip" disabled={!canEditRecord(project)} onClick={() => { if (canEditRecord(project)) setEditingInfo(!editingInfo); }} aria-expanded={editingInfo}>
        <span>牵头单位：<b>{project.lead_unit || '--'}</b></span>
        <span>运营商：<b>{project.operator || '--'}</b></span>
        <span>监理单位：<b>{project.supervisor || '--'}</b></span>
        <span className="info-strip-edit">{canEditRecord(project) ? <><EditOutlined />编辑</> : '只读'}</span>
      </button>
      {editingInfo && (
        <div className="info-editor"><div className="info-editor-grid">
          <div><label style={{ fontSize: 11 }}>牵头单位</label><Input size="small" style={{ width: 140 }} value={infoVals.lead_unit} onChange={e => setInfoVals({ ...infoVals, lead_unit: e.target.value })} /></div>
          <div><label style={{ fontSize: 11 }}>运营商</label><Input size="small" style={{ width: 140 }} value={infoVals.operator} onChange={e => setInfoVals({ ...infoVals, operator: e.target.value })} /></div>
          <div><label style={{ fontSize: 11 }}>监理单位</label><Input size="small" style={{ width: 140 }} value={infoVals.supervisor} onChange={e => setInfoVals({ ...infoVals, supervisor: e.target.value })} /></div>
          <Button size="small" type="primary" loading={actions.isPending('save-info')} onClick={saveInfo}>保存</Button>
          <Button size="small" disabled={actions.isPending('save-info')} onClick={() => setEditingInfo(false)}>取消</Button>
        </div></div>
      )}
      <div className="summary-cards project-summary-grid">
        <SummaryMetric label="阶梯前预估总金额" value={formatMoney(serviceTotals.raw)} icon={<AccountBookOutlined />} />
        <SummaryMetric label="阶梯后预估总金额" value={formatMoney(serviceTotals.tiered)} icon={<AccountBookOutlined />} />
        <SummaryMetric label="阶梯前申报总金额" value={formatMoney(declareTotals.raw)} icon={<FileDoneOutlined />} tone="warning" />
        <SummaryMetric label="阶梯后申报总金额" value={formatMoney(declareTotals.tiered)} icon={<FileDoneOutlined />} tone="warning" />
        <SummaryMetric label="阶梯前验收总金额" value={formatMoney(acceptTotals.raw)} icon={<AuditOutlined />} tone="success" />
        <SummaryMetric label="阶梯后验收总金额" value={formatMoney(acceptTotals.tiered)} icon={<AuditOutlined />} tone="success" />
      </div>
      <Tabs defaultActiveKey="service" items={[
        { key: 'service', label: <span className="section-title"><ProfileOutlined />服务单管理</span>, children: (
          <div>
            <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 8 }} onClick={() => { setSvcNameError(''); setSvcName(''); setSvcPlate(''); setSvcCenter(''); setSvcOpLead(''); setSvcStart(''); setSvcEnd(''); setSvcOpen(true); }}>新建服务单</Button>
            <Table dataSource={services} rowKey="id" size="small" pagination={false} scroll={{ x: 940 }} locale={{ emptyText: '暂无服务单' }}
              columns={[
                { title: '#', width: 36, render: (_: any, __: any, i: number) => i + 1 },
                { title: '服务板块', dataIndex: 'plate', width: 120, render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '--' },
                { title: '服务单名称', dataIndex: 'name', render: (v: string, r: any) => <a onClick={() => navigate(`/service/${r.id}`)}>{v}</a> },
                { title: '阶梯前预估', width: 120, render: (_: any, r: any) => formatMoney(sumServiceItems(r.items || []).raw) },
                { title: '阶梯后预估', width: 120, render: (_: any, r: any) => formatMoney(sumServiceItems(r.items || []).tiered) },
                { title: '项数', width: 60, render: (_: any, r: any) => (r.items || []).length },
                { title: '操作', width: 180, render: (_: any, r: any) => (<Space size="small"><a onClick={() => navigate(`/service/${r.id}`)}>查看</a>{canEditRecord(r) ? <Popconfirm title="确定删除？" onConfirm={() => deleteServiceOrder(r.id)}><a style={{ color: '#D9534F' }}>删除</a></Popconfirm> : <span style={{ color: '#98A2B3' }}>只读</span>}</Space>) },
              ]} />
          </div>
        )},
        { key: 'declare', label: <span className="section-title"><FileDoneOutlined />申报单管理</span>, children: (
          <div>
            <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 8 }} onClick={() => navigate(`/project/${pid}/dec-mgmt`)}>新建申报单</Button>
            <Table dataSource={declares} rowKey="id" size="small" pagination={false} scroll={{ x: 820 }} locale={{ emptyText: '暂无申报单' }}
              columns={[
                { title: '#', width: 36, render: (_: any, __: any, i: number) => i + 1 },
                { title: '申报单名称', dataIndex: 'name', render: (v: string, r: any) => <a onClick={() => navigate(`/declare/${r.id}`)}>{v}</a> },
                { title: '阶梯前申报', width: 105, render: (_: any, r: any) => formatMoney(sumDeclareGroups(r.dServices || []).raw) },
                { title: '阶梯后申报', width: 105, render: (_: any, r: any) => formatMoney(sumDeclareGroups(r.dServices || []).tiered) },
                { title: '单数', width: 70, render: (_: any, r: any) => (r.dServices || []).length },
                { title: '操作', width: 120, render: (_: any, r: any) => (<Space size="small"><a onClick={() => navigate(`/declare/${r.id}`)}>查看</a>{canEditRecord(r) ? <Popconfirm title="确定删除？" onConfirm={() => deleteDeclareOrder(r.id)}><a style={{ color: '#D9534F' }}>删除</a></Popconfirm> : <span style={{ color: '#98A2B3' }}>只读</span>}</Space>) },
              ]} />
          </div>
        )},
        { key: 'accept', label: <span className="section-title"><AuditOutlined />验收单管理</span>, children: (
          <div>
            <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 8 }} onClick={() => navigate(`/project/${pid}/acc-mgmt`)}>新建验收单</Button>
            <Table dataSource={accepts} rowKey="id" size="small" pagination={false} scroll={{ x: 820 }} locale={{ emptyText: '暂无验收单' }}
              columns={[
                { title: '#', width: 36, render: (_: any, __: any, i: number) => i + 1 },
                { title: '验收单名称', dataIndex: 'name', render: (v: string, r: any) => <a onClick={() => navigate(`/accept/${r.id}`)}>{v}</a> },
                { title: '阶梯前验收', width: 105, render: (_: any, r: any) => formatMoney(sumAcceptGroups(r.aServices || []).raw) },
                { title: '阶梯后验收', width: 105, render: (_: any, r: any) => formatMoney(sumAcceptGroups(r.aServices || []).tiered) },
                { title: '单数', width: 70, render: (_: any, r: any) => (r.aServices || []).length },
                { title: '操作', width: 120, render: (_: any, r: any) => (<Space size="small"><a onClick={() => navigate(`/accept/${r.id}`)}>查看</a>{canEditRecord(r) ? <Popconfirm title="确定删除？" onConfirm={() => deleteAcceptOrder(r.id)}><a style={{ color: '#D9534F' }}>删除</a></Popconfirm> : <span style={{ color: '#98A2B3' }}>只读</span>}</Space>) },
              ]} />
          </div>
        )},
      ]} />
      <Modal title="新建服务单" open={svcOpen} onOk={saveSvc} onCancel={() => { if (!actions.isPending('save-service')) setSvcOpen(false); }} width={500} confirmLoading={actions.isPending('save-service')} cancelButtonProps={{ disabled: actions.isPending('save-service') }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={{ fontWeight: 'bold' }}>服务单名称 *</label><Input status={svcNameError ? 'error' : undefined} value={svcName} onChange={e => { setSvcNameError(''); setSvcName(e.target.value); }} />{svcNameError && <div style={{ color: '#D92D20', fontSize: 12, marginTop: 4 }}>{svcNameError}</div>}</div>
          <div><label>服务板块</label><Input value={svcPlate} onChange={e => setSvcPlate(e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 12 }}><div style={{ flex: 1 }}><label>中心负责人</label><Input value={svcCenter} onChange={e => setSvcCenter(e.target.value)} /></div><div style={{ flex: 1 }}><label>运营商负责人</label><Input value={svcOpLead} onChange={e => setSvcOpLead(e.target.value)} /></div></div>
          <div style={{ display: 'flex', gap: 12 }}><div style={{ flex: 1 }}><label>开始日期</label><Input type="date" value={svcStart} onChange={e => setSvcStart(e.target.value)} /></div><div style={{ flex: 1 }}><label>结束日期</label><Input type="date" value={svcEnd} onChange={e => setSvcEnd(e.target.value)} /></div></div>
        </div>
      </Modal>
    </div>
  );
}
