import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Modal, Select, Form, InputNumber, message, Popconfirm, Space } from 'antd';
import { FileDoneOutlined, PlusOutlined, ProfileOutlined } from '@ant-design/icons';
import { db } from '../api/db';
import { loadDeclareDetailData } from '../api/documentData';
import { calcRawAmount, calcTieredAmount, calcTimeCoeff, formatMoney, formatTimeCoeff, sumDeclareGroups, sumDeclareItems } from '../utils/calc';
import AttachmentManager from '../components/AttachmentManager';
import { PageError, PageLoading } from '../components/PageState';
import { PageEmpty, PageHeader } from '../components/PageLayout';
import useActionState from '../hooks/useActionState';
import { ensureSuccess, getErrorMessage } from '../utils/errors';
import { useAuth } from '../auth/AuthContext';

export default function DeclareDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const did = Number(id);
  const [dec, setDec] = useState<any>(null);
  const [dServices, setDServices] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);

  // New declare service modal
  const [dsOpen, setDsOpen] = useState(false);
  const [selectedSvcId, setSelectedSvcId] = useState<number | null>(null);

  // Edit item modal
  const [itemOpen, setItemOpen] = useState(false);
  const [editItemId, setEditItemId] = useState<number | null>(null);
  const [curDsId, setCurDsId] = useState<number | null>(null);
  const [itemForm] = Form.useForm();
  const [attachments, setAttachments] = useState<Record<number, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const actions = useActionState();
  const { canEditRecord } = useAuth();

  const load = async () => {
    const r = ensureSuccess(await db.getDeclare(did));
    setDec(r.data);
  };
  const loadDServices = async () => {
    try {
      const data = await loadDeclareDetailData(did);
      setDServices(data.services);
      setCatalog(data.catalog);
      setAttachments(data.attachments);
    } catch (e) {
      console.error('Declare detail data load error:', e);
      message.error('申报服务单加载失败');
    }
  };

  const loadPage = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [declareResult, data] = await Promise.all([db.getDeclare(did), loadDeclareDetailData(did)]);
      ensureSuccess(declareResult);
      if (!declareResult.data) throw new Error('申报单不存在或已删除');
      setDec(declareResult.data);
      setDServices(data.services);
      setCatalog(data.catalog);
      setAttachments(data.attachments);
    } catch (error) {
      console.error('Declare detail load error:', error);
      setLoadError(getErrorMessage(error, '申报单详情加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPage(); }, [id]);

  // Load services for the project
  useEffect(() => {
    if (dec?.project_id) db.listServices(dec.project_id).then(r => { if (!r.error) setServices(r.data || []); });
  }, [dec?.project_id]);

  const loadAttachments = async (dsId: number) => {
    const r = ensureSuccess(await db.listDecAttachments(dsId));
    setAttachments(prev => ({ ...prev, [dsId]: r.data || [] }));
  };
  const saveDecService = async () => {
    if (!selectedSvcId) { message.error('请选择服务单'); return; }
    await actions.run('save-service', async () => {
      try {
        ensureSuccess(await db.createDecService({ declare_id: did, service_order_id: selectedSvcId }));
        setDsOpen(false); setSelectedSvcId(null); await loadDServices();
        message.success('创建成功');
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
        const qty = vals.qty || 0; const months = vals.months || 1; const coeff = vals.coeff || 1;
        const timeCoeffNum = calcTimeCoeff(months, cat.has_time_coeff);
        const subtotal = calcTieredAmount({ catalog: cat, coeff, qty, months, time_coeff: timeCoeffNum }, { useTimeCoeff: true });
        const payload = { declare_service_id: curDsId, catalog_id: vals.catalog_id, coeff, qty, months, time_coeff: timeCoeffNum, subtotal };
        if (editItemId) ensureSuccess(await db.updateDecItem(editItemId, payload));
        else ensureSuccess(await db.createDecItem(payload));
        setItemOpen(false); itemForm.resetFields(); await loadDServices();
        message.success('保存成功');
      } catch (error) {
        message.error(`保存失败：${getErrorMessage(error)}`);
      }
    });
  };

  const deleteService = async (serviceId: number) => {
    await actions.run(`delete-service-${serviceId}`, async () => {
      try {
        ensureSuccess(await db.deleteDecService(serviceId));
        await loadDServices();
        message.success('删除成功');
      } catch (error) {
        message.error(`删除失败：${getErrorMessage(error)}`);
      }
    });
  };

  const deleteItem = async (itemId: number) => {
    await actions.run(`delete-item-${itemId}`, async () => {
      try {
        ensureSuccess(await db.deleteDecItem(itemId));
        await loadDServices();
        message.success('删除成功');
      } catch (error) {
        message.error(`删除失败：${getErrorMessage(error)}`);
      }
    });
  };

  if (loading) return <PageLoading text="正在加载申报单详情..." />;
  if (loadError) return <PageError message={loadError} onRetry={loadPage} retrying={loading} />;
  if (!dec) return <PageError message="申报单不存在或已删除" onRetry={loadPage} />;

  const declareTotals = sumDeclareGroups(dServices);

  return (
    <div>
      <PageHeader
        title={dec.name}
        icon={<FileDoneOutlined />}
        backLabel="项目详情"
        onBack={() => navigate(`/project/${dec.project_id}`)}
        actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setSelectedSvcId(null); setDsOpen(true); }}>新建申报服务单</Button>}
      />
      {dServices.length === 0 ? <PageEmpty description="暂无申报服务单" /> :
        dServices.map((ds, i) => {
          const dsTotals = sumDeclareItems(ds.items || []);
          return (
            <div key={ds.id} className="detail-panel">
              <div className="detail-panel-header">
                <span className="detail-panel-title"><ProfileOutlined /><span>申报服务单 #{i + 1}：{ds.service_order?.name || '--'}</span></span>
                <Space size="small">
                  <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { setCurDsId(ds.id); setEditItemId(null); itemForm.resetFields(); setItemOpen(true); }}>新增申报服务项</Button>
                  {canEditRecord(ds) && <Popconfirm title="确定删除？" onConfirm={() => deleteService(ds.id)}><Button size="small" danger type="text" disabled={actions.isPending()}>删除</Button></Popconfirm>}
                </Space>
              </div>
              <div className="detail-panel-body">
                <div className="table-wrap detail-table-wrap"><table className="detail-data-table">
                  <thead><tr style={{ background: '#E4E7EC' }}>
                    <th style={td}>#</th><th style={td}>二级服务目录</th><th style={td}>单位</th><th style={td}>单价</th><th style={td}>难度系数</th><th style={td}>月份数</th><th style={td}>完成量</th><th style={td}>时间系数</th><th style={td}>阶梯前金额</th><th style={td}>阶梯后金额</th><th style={td}>操作</th>
                  </tr></thead>
                  <tbody>
                    {(ds.items || []).length === 0 ? <tr><td colSpan={11} style={{ padding: 24, color: '#999', textAlign: 'center' }}>暂无申报服务项</td></tr> :
                      (ds.items || []).map((it: any, j: number) => {
                        const raw = calcRawAmount(it, true);
                        const tiered = calcTieredAmount(it, { useTimeCoeff: true });
                        return <tr key={it.id}>
                          <td style={td}>{j + 1}</td><td style={td}>{it.catalog?.cat2 || '--'}</td><td style={td}>{it.catalog?.unit || '--'}</td><td style={td}>{it.catalog?.price || '--'}</td><td style={td}>{it.coeff}</td><td style={td}>{it.months || '--'} 月</td><td style={td}>{it.qty}</td><td style={td}>{formatTimeCoeff(it)}</td><td style={{ ...td, textAlign: 'right' }}>{formatMoney(raw)}</td><td style={{ ...td, textAlign: 'right', fontWeight: 'bold' }}>{formatMoney(tiered)}</td>
                          <td style={td}>
                            {canEditRecord(it) ? <Space size="small">
                              <a onClick={() => { setCurDsId(ds.id); setEditItemId(it.id); itemForm.setFieldsValue({ catalog_id: it.catalog_id, coeff: it.coeff, qty: it.qty, months: it.months }); setItemOpen(true); }}>编辑</a>
                              <Popconfirm title="确定删除？" onConfirm={() => deleteItem(it.id)}><a style={{ color: '#D9534F', pointerEvents: actions.isPending() ? 'none' : undefined }}>删除</a></Popconfirm>
                            </Space> : <span style={{ color: '#98A2B3' }}>只读</span>}
                          </td>
                        </tr>;
                      })
                    }
                  </tbody>
                </table></div>
                <AttachmentManager
                  compact
                  scope="declare"
                  ownerId={ds.id}
                  attachments={attachments[ds.id] || []}
                  onCreate={metadata => db.createDecAttachment({ declare_service_id: ds.id, ...metadata })}
                  onDelete={attachmentId => db.deleteDecAttachment(attachmentId)}
                  onReload={() => loadAttachments(ds.id)}
                  canDelete={canEditRecord}
                />
                <div className="detail-total"><span>服务单合计</span><span>阶梯前申报金额：{formatMoney(dsTotals.raw)}</span><span>阶梯后申报金额：{formatMoney(dsTotals.tiered)}</span></div>
              </div>
            </div>
          );
        })
      }
      {dServices.length > 0 && <div className="document-total"><span>阶梯前申报单总金额：{formatMoney(declareTotals.raw)}</span><span>阶梯后申报单总金额：{formatMoney(declareTotals.tiered)}</span></div>}

      {/* New DecService Modal */}
      <Modal title="新建申报服务单" open={dsOpen} onOk={saveDecService} onCancel={() => { if (!actions.isPending('save-service')) setDsOpen(false); }} confirmLoading={actions.isPending('save-service')} cancelButtonProps={{ disabled: actions.isPending('save-service') }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontWeight: 'bold' }}>关联服务单 *</label>
          <Select value={selectedSvcId} onChange={setSelectedSvcId} placeholder="请选择当前项目内的服务单" options={services.map((s: any) => ({ label: s.name, value: s.id }))} style={{ width: '100%' }} />
          <span style={{ color: '#999', fontSize: 12 }}>选中后自动带入该服务单的服务目录基础信息</span>
        </div>
      </Modal>

      {/* Item Modal */}
      <Modal title={editItemId ? '编辑申报服务项' : '新增申报服务项'} open={itemOpen} onOk={saveItem} onCancel={() => { if (!actions.isPending('save-item')) setItemOpen(false); }} width={560} confirmLoading={actions.isPending('save-item')} cancelButtonProps={{ disabled: actions.isPending('save-item') }}>
        <Form form={itemForm} layout="vertical">
          <Form.Item name="catalog_id" label="二级服务目录" rules={[{ required: true }]}>
            <Select showSearch placeholder="搜索选择..." optionFilterProp="label" options={catalog.map((c: any) => ({ label: `${c.cat2} (${c.cat1})`, value: c.id }))} />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="coeff" label="难度系数" rules={[{ required: true }]} style={{ flex: 1 }}><InputNumber min={0.01} step={0.01} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="qty" label="本次申报量" rules={[{ required: true }]} style={{ flex: 1 }}><InputNumber min={0} step={0.0001} style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="months" label="申报月份数" rules={[{ required: true }]}><InputNumber min={1} max={12} step={1} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

const td: React.CSSProperties = { padding: '8px 10px', border: '1px solid #E4E7EC', textAlign: 'center' };
