import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Modal, Select, Form, InputNumber, Input, message, Popconfirm, Space } from 'antd';
import { AuditOutlined, PlusOutlined, ProfileOutlined } from '@ant-design/icons';
import { db } from '../api/db';
import { loadAcceptDetailData } from '../api/documentData';
import { calcRawAmount, calcTieredAmount, calcTimeCoeff, formatMoney, formatTimeCoeff, sumAcceptGroups, sumAcceptItems } from '../utils/calc';
import AttachmentManager from '../components/AttachmentManager';
import { PageError, PageLoading } from '../components/PageState';
import { PageEmpty, PageHeader } from '../components/PageLayout';
import useActionState from '../hooks/useActionState';
import { ensureSuccess, getErrorMessage } from '../utils/errors';
import { useAuth } from '../auth/AuthContext';

const td: React.CSSProperties = { padding: '8px 10px', border: '1px solid #E4E7EC', textAlign: 'center' };

export default function AcceptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const aid = Number(id);
  const [acc, setAcc] = useState<any>(null);
  const [aServices, setAServices] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [asOpen, setAsOpen] = useState(false);
  const [selectedSvcId, setSelectedSvcId] = useState<number | null>(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [editItemId, setEditItemId] = useState<number | null>(null);
  const [curAsId, setCurAsId] = useState<number | null>(null);
  const [itemForm] = Form.useForm();
  const [attachments, setAttachments] = useState<Record<number, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const actions = useActionState();
  const { canEditRecord } = useAuth();

  const loadAServices = async () => {
    try {
      const data = await loadAcceptDetailData(aid);
      setAServices(data.services);
      setCatalog(data.catalog);
      setAttachments(data.attachments);
    } catch (e) {
      console.error('Accept detail data load error:', e);
      message.error('验收服务单加载失败');
    }
  };

  const loadPage = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [acceptResult, data] = await Promise.all([db.getAccept(aid), loadAcceptDetailData(aid)]);
      ensureSuccess(acceptResult);
      if (!acceptResult.data) throw new Error('验收单不存在或已删除');
      setAcc(acceptResult.data);
      setAServices(data.services);
      setCatalog(data.catalog);
      setAttachments(data.attachments);
    } catch (error) {
      console.error('Accept detail load error:', error);
      setLoadError(getErrorMessage(error, '验收单详情加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPage(); }, [id]);
  useEffect(() => { if (acc?.project_id) db.listServices(acc.project_id).then(r => { if (!r.error) setServices(r.data || []); }); }, [acc?.project_id]);

  const loadAttachments = async (asId: number) => {
    const r = ensureSuccess(await db.listAccAttachments(asId));
    setAttachments(previous => ({ ...previous, [asId]: r.data || [] }));
  };

  const saveAccService = async () => {
    if (!selectedSvcId) { message.error('请选择服务单'); return; }
    await actions.run('save-service', async () => {
      try {
        ensureSuccess(await db.createAccService({ accept_id: aid, service_order_id: selectedSvcId }));
        setAsOpen(false); setSelectedSvcId(null); await loadAServices(); message.success('创建成功');
      } catch (error) {
        message.error(`创建失败：${getErrorMessage(error)}`);
      }
    });
  };
  const saveItem = async () => {
    let vals: any;
    try { vals = await itemForm.validateFields(); } catch { return; }
    const cat = catalog.find((c: any) => c.id === vals.catalog_id);
    if (!cat) return;
    await actions.run('save-item', async () => {
      try {
        const coeff = vals.coeff || 1; const qty = vals.qty || 0; const months = vals.months || 1;
        const tc = calcTimeCoeff(months, cat.has_time_coeff);
        const subtotal = calcTieredAmount({ catalog: cat, coeff, qty, months, time_coeff: tc }, { useTimeCoeff: true });
        const payload = { accept_service_id: curAsId, catalog_id: vals.catalog_id, coeff, qty, months, time_coeff: tc, subtotal, note: vals.note || '' };
        if (editItemId) ensureSuccess(await db.updateAccItem(editItemId, payload));
        else ensureSuccess(await db.createAccItem(payload));
        setItemOpen(false); itemForm.resetFields(); await loadAServices(); message.success('保存成功');
      } catch (error) {
        message.error(`保存失败：${getErrorMessage(error)}`);
      }
    });
  };

  const deleteService = async (serviceId: number) => {
    await actions.run(`delete-service-${serviceId}`, async () => {
      try {
        ensureSuccess(await db.deleteAccService(serviceId));
        await loadAServices();
        message.success('删除成功');
      } catch (error) {
        message.error(`删除失败：${getErrorMessage(error)}`);
      }
    });
  };

  const deleteItem = async (itemId: number) => {
    await actions.run(`delete-item-${itemId}`, async () => {
      try {
        ensureSuccess(await db.deleteAccItem(itemId));
        await loadAServices();
        message.success('删除成功');
      } catch (error) {
        message.error(`删除失败：${getErrorMessage(error)}`);
      }
    });
  };

  if (loading) return <PageLoading text="正在加载验收单详情..." />;
  if (loadError) return <PageError message={loadError} onRetry={loadPage} retrying={loading} />;
  if (!acc) return <PageError message="验收单不存在或已删除" onRetry={loadPage} />;
  const acceptTotals = sumAcceptGroups(aServices);

  return (
    <div>
      <PageHeader
        title={acc.name}
        icon={<AuditOutlined />}
        backLabel="项目详情"
        onBack={() => navigate(`/project/${acc.project_id}`)}
        actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setSelectedSvcId(null); setAsOpen(true); }}>新建验收服务单</Button>}
      />
      {aServices.length === 0 ? <PageEmpty description="暂无验收服务单" /> :
        aServices.map((as, i) => {
          const asTotals = sumAcceptItems(as.items || []);
          return (
            <div key={as.id} className="detail-panel">
              <div className="detail-panel-header">
                <span className="detail-panel-title"><ProfileOutlined /><span>验收服务单 #{i + 1}：{as.service_order?.name || '--'}</span></span>
                <Space size="small">
                  <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { setCurAsId(as.id); setEditItemId(null); itemForm.resetFields(); setItemOpen(true); }}>新增验收服务项</Button>
                  {canEditRecord(as) && <Popconfirm title="确定删除？" onConfirm={() => deleteService(as.id)}><Button size="small" danger type="text" disabled={actions.isPending()}>删除</Button></Popconfirm>}
                </Space>
              </div>
              <div className="detail-panel-body">
                <div className="table-wrap detail-table-wrap"><table className="detail-data-table">
                  <thead><tr style={{ background: '#E4E7EC' }}><th style={td}>#</th><th style={td}>二级服务目录</th><th style={td}>单位</th><th style={td}>单价</th><th style={td}>难度系数</th><th style={td}>月份数</th><th style={td}>完成量</th><th style={td}>时间系数</th><th style={td}>阶梯前金额</th><th style={td}>阶梯后金额</th><th style={td}>备注</th><th style={td}>操作</th></tr></thead>
                  <tbody>{(as.items || []).length === 0 ? <tr><td colSpan={12} style={{ padding: 24, color: '#999', textAlign: 'center' }}>暂无验收服务项</td></tr> :
                    (as.items || []).map((it: any, j: number) => {
                      const raw = calcRawAmount(it, true);
                      const tiered = calcTieredAmount(it, { useTimeCoeff: true });
                      return <tr key={it.id}><td style={td}>{j + 1}</td><td style={td}>{it.catalog?.cat2 || '--'}</td><td style={td}>{it.catalog?.unit || '--'}</td><td style={td}>{it.catalog?.price || '--'}</td><td style={td}>{it.coeff}</td><td style={td}>{it.months || '--'} 月</td><td style={td}>{it.qty}</td><td style={td}>{formatTimeCoeff(it)}</td><td style={{ ...td, textAlign: 'right' }}>{formatMoney(raw)}</td><td style={{ ...td, textAlign: 'right', fontWeight: 'bold' }}>{formatMoney(tiered)}</td><td style={{ ...td, color: '#666' }}>{it.note || '--'}</td>
                        <td style={td}>{canEditRecord(it) ? <Space size="small"><a onClick={() => { setCurAsId(as.id); setEditItemId(it.id); itemForm.setFieldsValue({ catalog_id: it.catalog_id, coeff: it.coeff, qty: it.qty, months: it.months, note: it.note }); setItemOpen(true); }}>编辑</a><Popconfirm title="确定删除？" onConfirm={() => deleteItem(it.id)}><a style={{ color: '#D9534F', pointerEvents: actions.isPending() ? 'none' : undefined }}>删除</a></Popconfirm></Space> : <span style={{ color: '#98A2B3' }}>只读</span>}</td></tr>;
                    })}</tbody>
                </table></div>
                <AttachmentManager
                  compact
                  scope="accept"
                  ownerId={as.id}
                  attachments={attachments[as.id] || []}
                  onCreate={metadata => db.createAccAttachment({ accept_service_id: as.id, ...metadata })}
                  onDelete={attachmentId => db.deleteAccAttachment(attachmentId)}
                  onReload={() => loadAttachments(as.id)}
                  canDelete={canEditRecord}
                />
                <div className="detail-total"><span>服务单合计</span><span>阶梯前验收金额：{formatMoney(asTotals.raw)}</span><span>阶梯后验收金额：{formatMoney(asTotals.tiered)}</span></div>
              </div>
            </div>
          );
        })}
      {aServices.length > 0 && <div className="document-total"><span>阶梯前验收单总金额：{formatMoney(acceptTotals.raw)}</span><span>阶梯后验收单总金额：{formatMoney(acceptTotals.tiered)}</span></div>}

      <Modal title="新建验收服务单" open={asOpen} onOk={saveAccService} onCancel={() => { if (!actions.isPending('save-service')) setAsOpen(false); }} confirmLoading={actions.isPending('save-service')} cancelButtonProps={{ disabled: actions.isPending('save-service') }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontWeight: 'bold' }}>关联服务单 *</label>
          <Select value={selectedSvcId} onChange={setSelectedSvcId} placeholder="请选择当前项目内的服务单" options={services.map((s: any) => ({ label: s.name, value: s.id }))} style={{ width: '100%' }} />
          <span style={{ color: '#999', fontSize: 12 }}>选中后自动带入该服务单的服务目录基础信息</span>
        </div>
      </Modal>
      <Modal title={editItemId ? '编辑验收服务项' : '新增验收服务项'} open={itemOpen} onOk={saveItem} onCancel={() => { if (!actions.isPending('save-item')) setItemOpen(false); }} width={560} confirmLoading={actions.isPending('save-item')} cancelButtonProps={{ disabled: actions.isPending('save-item') }}>
        <Form form={itemForm} layout="vertical">
          <Form.Item name="catalog_id" label="二级服务目录" rules={[{ required: true }]}><Select showSearch placeholder="搜索..." optionFilterProp="label" options={catalog.map((c: any) => ({ label: `${c.cat2} (${c.cat1})`, value: c.id }))} /></Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="coeff" label="难度系数" rules={[{ required: true }]} style={{ flex: 1 }}><InputNumber min={0.01} step={0.01} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="qty" label="本次验收量" rules={[{ required: true }]} style={{ flex: 1 }}><InputNumber min={0} step={0.0001} style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="months" label="验收月份数" rules={[{ required: true }]}><InputNumber min={1} max={12} step={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="note" label="备注（核减原因）"><Input.TextArea placeholder="选填" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
