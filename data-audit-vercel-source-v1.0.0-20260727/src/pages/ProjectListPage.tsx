import { useState, useEffect } from 'react';
import { Table, Button, Modal, Input, message, Select } from 'antd';
import { FolderOpenOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { db } from '../api/db';
import { loadProjectRelations } from '../api/projectData';
import { formatMoney, sumAcceptGroups, sumDeclareGroups, sumServiceGroups } from '../utils/calc';
import { PageError, PageLoading } from '../components/PageState';
import { PageEmpty, PageHeader, RowActions } from '../components/PageLayout';
import useActionState from '../hooks/useActionState';
import { ensureSuccess, getErrorMessage } from '../utils/errors';
import { useAuth } from '../auth/AuthContext';

export default function ProjectListPage({ onRefresh }: { onRefresh: () => void }) {
  const [data, setData] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formVals, setFormVals] = useState({ name: '', lead_unit: '', operator: '', supervisor: '', team_id: null as number | null });
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [nameError, setNameError] = useState('');
  const actions = useActionState();
  const navigate = useNavigate();
  const { canEditRecord, isSuperAdmin, profile } = useAuth();

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const r = await db.listProjects();
      if (r.error) throw r.error;
      const projects = r.data || [];
      const relationsByProject = await loadProjectRelations(projects.map((project: any) => Number(project.id)));
      const enriched = projects.map((p: any) => {
        const { services, declares, accepts } = relationsByProject[p.id] || { services: [], declares: [], accepts: [] };
        const serviceTotals = sumServiceGroups(services);
        const declareTotals = sumDeclareGroups(declares.flatMap((d: any) => d.dServices || []));
        const acceptTotals = sumAcceptGroups(accepts.flatMap((a: any) => a.aServices || []));
        return {
          ...p,
          _svcRaw: serviceTotals.raw,
          _svcTiered: serviceTotals.tiered,
          _decRaw: declareTotals.raw,
          _decTiered: declareTotals.tiered,
          _accRaw: acceptTotals.raw,
          _accTiered: acceptTotals.tiered,
          _svcCount: services.length,
        };
      });
      setData(enriched);
    } catch (e) {
      console.error('Project list load error:', e);
      setLoadError('项目列表加载失败，请稍后重试');
      message.error('项目列表加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (isSuperAdmin) db.listTeams().then(result => { if (!result.error) setTeams(result.data || []); });
  }, [isSuperAdmin]);

  const onSave = async () => {
    if (!formVals.name.trim()) { setNameError('请输入项目名称'); return; }
    if (isSuperAdmin && !editId && !formVals.team_id) { message.error('请选择项目所属团队'); return; }
    setNameError('');
    await actions.run('save', async () => {
      try {
        const { team_id, ...projectFields } = formVals;
        if (editId) ensureSuccess(await db.updateProject(editId, projectFields));
        else ensureSuccess(await db.createProject(isSuperAdmin ? { ...projectFields, team_id } : projectFields));
        setOpen(false);
        setFormVals({ name: '', lead_unit: '', operator: '', supervisor: '', team_id: profile?.team_id || null });
        await load();
        await onRefresh?.();
        message.success('保存成功');
      } catch (error) {
        console.error('Project save error:', error);
        message.error(`保存失败：${getErrorMessage(error)}`);
      }
    });
  };

  const deleteProject = async (id: number) => {
    await actions.run(`delete-${id}`, async () => {
      try {
        ensureSuccess(await db.deleteProject(id));
        await load();
        await onRefresh?.();
        message.success('删除成功');
      } catch (error) {
        console.error('Project delete error:', error);
        message.error(`删除失败：${getErrorMessage(error)}`);
      }
    });
  };

  const columns = [
    { title: '#', width: 40, render: (_: any, __: any, i: number) => i + 1 },
    {
      title: '项目名称', dataIndex: 'name',
      render: (v: string, r: any) => <a onClick={() => navigate(`/project/${r.id}`)} style={{ fontWeight: 'bold', cursor: 'pointer' }}>{v}</a>,
    },
    {
      title: '阶梯前预估', width: 105, render: (_: any, r: any) => formatMoney(r._svcRaw),
    },
    {
      title: '阶梯后预估', width: 105, render: (_: any, r: any) => formatMoney(r._svcTiered),
    },
    {
      title: '阶梯前申报', width: 105, render: (_: any, r: any) => formatMoney(r._decRaw),
    },
    {
      title: '阶梯后申报', width: 105, render: (_: any, r: any) => formatMoney(r._decTiered),
    },
    {
      title: '阶梯前验收', width: 105, render: (_: any, r: any) => formatMoney(r._accRaw),
    },
    {
      title: '阶梯后验收', width: 105, render: (_: any, r: any) => formatMoney(r._accTiered),
    },
    {
      title: '操作', width: 184,
      render: (_: any, r: any) => <RowActions
        onView={() => navigate(`/project/${r.id}`)}
        onEdit={() => { setEditId(r.id); setNameError(''); setFormVals({ name: r.name, lead_unit: r.lead_unit || '', operator: r.operator || '', supervisor: r.supervisor || '', team_id: r.team_id || null }); setOpen(true); }}
        onDelete={() => deleteProject(r.id)}
        deleting={actions.isPending(`delete-${r.id}`)}
        canEdit={canEditRecord(r)}
        canDelete={canEditRecord(r)}
      />,
    },
  ];

  return (
    <div>
      <PageHeader title="数据运营项目列表" icon={<FolderOpenOutlined />} />
      <div className="list-toolbar">
        <Button type="primary" icon={<PlusOutlined />}
          onClick={() => { setEditId(null); setNameError(''); setFormVals({ name: '', lead_unit: '', operator: '', supervisor: '', team_id: profile?.team_id || null }); setOpen(true); }}>
          新建项目
        </Button>
        <span className="list-count">共 {data.length} 个项目</span>
      </div>
      {loadError && data.length === 0 ? (
        <PageError message={loadError} onRetry={load} retrying={loading} />
      ) : loading && data.length === 0 ? (
        <PageLoading text="正在加载项目列表..." />
      ) : data.length === 0 ? (
        <PageEmpty description="暂无项目，请点击“新建项目”开始创建" />
      ) : (
        <Table columns={columns} dataSource={data} rowKey="id" size="small" pagination={false} scroll={{ x: 900 }} loading={loading} />
      )}
      <Modal title={editId ? '编辑项目' : '新建项目'} open={open} onOk={onSave} onCancel={() => { if (!actions.isPending('save')) setOpen(false); }} width={500} confirmLoading={actions.isPending('save')} cancelButtonProps={{ disabled: actions.isPending('save') }}>
        <div className="field-stack">
          <div className="field-group"><label className="field-label-required">项目名称</label>
            <Input status={nameError ? 'error' : undefined} value={formVals.name} onChange={e => { setNameError(''); setFormVals({ ...formVals, name: e.target.value }); }} placeholder="请输入项目名称" />
            {nameError && <div className="field-error" role="alert">{nameError}</div>}
          </div>
          {isSuperAdmin && !editId && <div className="field-group"><label className="field-label-required">所属团队</label>
            <Select value={formVals.team_id} onChange={team_id => setFormVals({ ...formVals, team_id })} placeholder="请选择项目所属团队" options={teams.map(team => ({ label: team.name, value: team.id }))} />
          </div>}
          <div className="field-grid-2">
            <div className="field-group"><label>牵头单位</label>
              <Input value={formVals.lead_unit} onChange={e => setFormVals({ ...formVals, lead_unit: e.target.value })} placeholder="牵头单位名称" />
            </div>
            <div className="field-group"><label>运营商</label>
              <Input value={formVals.operator} onChange={e => setFormVals({ ...formVals, operator: e.target.value })} placeholder="运营商名称" />
            </div>
          </div>
          <div className="field-group"><label>监理单位</label>
            <Input value={formVals.supervisor} onChange={e => setFormVals({ ...formVals, supervisor: e.target.value })} placeholder="监理单位名称" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
