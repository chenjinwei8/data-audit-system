import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Table, Button, Modal, Form, Input, InputNumber, DatePicker, message, Popconfirm, Space, Select } from 'antd';
import { EditOutlined, PlusOutlined, ProfileOutlined, TableOutlined } from '@ant-design/icons';
import { db } from '../api/db';
import dayjs from 'dayjs';
import { calcRawAmount, calcTieredAmount, formatMoney, sumServiceItems } from '../utils/calc';
import AttachmentManager from '../components/AttachmentManager';
import { PageError, PageLoading } from '../components/PageState';
import { PageEmpty, PageHeader } from '../components/PageLayout';
import useActionState from '../hooks/useActionState';
import { ensureSuccess, getErrorMessage } from '../utils/errors';
import { useAuth } from '../auth/AuthContext';

export default function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sid = Number(id);
  const [svc, setSvc] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [tableKey, setTableKey] = useState(0);

  // Info bar
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoVals, setInfoVals] = useState({ center_lead: '', operator_lead: '', date_start: '', date_end: '' });

  // Attachments
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const actions = useActionState();
  const { canEditRecord } = useAuth();

  const load = async () => { const r = ensureSuccess(await db.getService(sid)); if (r.data) { const s = r.data; setSvc(s); setInfoVals({ center_lead: s.center_lead || '', operator_lead: s.operator_lead || '', date_start: s.date_start || '', date_end: s.date_end || '' }); } };
  const loadItems = async () => { const r = ensureSuccess(await db.listItems(sid)); setItems(r.data || []); };
  const loadAttach = async () => { const r = ensureSuccess(await db.listAttachments(sid)); setAttachments(r.data || []); };

  const loadPage = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [serviceResult, itemsResult, attachmentResult, catalogResult] = await Promise.all([
        db.getService(sid), db.listItems(sid), db.listAttachments(sid), db.listCatalog(),
      ]);
      ensureSuccess(serviceResult);
      ensureSuccess(itemsResult);
      ensureSuccess(attachmentResult);
      ensureSuccess(catalogResult);
      const service = serviceResult.data;
      if (!service) throw new Error('服务单不存在或已删除');
      setSvc(service);
      setInfoVals({ center_lead: service.center_lead || '', operator_lead: service.operator_lead || '', date_start: service.date_start || '', date_end: service.date_end || '' });
      setItems(itemsResult.data || []);
      setAttachments(attachmentResult.data || []);
      setCatalog(catalogResult.data || []);
    } catch (error) {
      console.error('Service detail load error:', error);
      setLoadError(getErrorMessage(error, '服务单详情加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPage(); }, [id]);

  const saveInfo = async () => {
    await actions.run('save-info', async () => {
      try {
        ensureSuccess(await db.updateService(sid, infoVals));
        await load();
        setEditingInfo(false);
        message.success('已更新');
      } catch (error) {
        message.error(`更新失败：${getErrorMessage(error)}`);
      }
    });
  };
  const onSaveItem = async () => {
    let vals: any;
    try { vals = await form.validateFields(); } catch { return; }
    const cat = catalog.find((c: any) => c.id === vals.catalog_id);
    if (!cat) { message.error('请选择服务目录'); return; }
    await actions.run('save-item', async () => {
      try {
        const subtotal = calcTieredAmount({ catalog: cat, coeff: vals.coeff, qty: vals.qty });
        const payload = { service_order_id: sid, catalog_id: vals.catalog_id, coeff: vals.coeff, qty: vals.qty, start_date: vals.period?.[0]?.format('YYYY-MM-DD'), end_date: vals.period?.[1]?.format('YYYY-MM-DD'), subtotal };
        const savedItem = editId
          ? ensureSuccess(await db.updateItem(editId, payload))
          : ensureSuccess(await db.createItem(payload));
        if (savedItem.data) {
          if (editId) setItems(prev => prev.map(it => it.id === editId ? { ...it, ...payload, catalog: cat } : it));
          else setItems(prev => [...prev, { ...savedItem.data, catalog: cat }]);
        } else await loadItems();
        setOpen(false); form.resetFields(); setTableKey(k => k + 1);
        message.success('保存成功');
      } catch (error) {
        message.error(`保存失败：${getErrorMessage(error)}`);
      }
    });
  };

  const deleteItem = async (itemId: number) => {
    await actions.run(`delete-item-${itemId}`, async () => {
      try {
        ensureSuccess(await db.deleteItem(itemId));
        await loadItems();
        setTableKey(k => k + 1);
        message.success('删除成功');
      } catch (error) {
        message.error(`删除失败：${getErrorMessage(error)}`);
      }
    });
  };

  const itemCols = [
    { title: '#', width: 36, render: (_: any, __: any, i: number) => i + 1 },
    { title: '二级服务目录', dataIndex: ['catalog', 'cat2'], width: 250, ellipsis: true, render: (v: string, r: any) => r.catalog?.cat2 || '--' },
    { title: '单位', dataIndex: ['catalog', 'unit'], width: 80, render: (_: any, r: any) => r.catalog?.unit || '--' },
    { title: '单价', dataIndex: ['catalog', 'price'], width: 80, render: (_: any, r: any) => r.catalog?.price || '--' },
    { title: '难度系数', dataIndex: 'coeff', width: 80 },
    { title: '服务周期', width: 170, render: (_: any, r: any) => `${r.start_date || '--'} ~ ${r.end_date || '--'}` },
    { title: '年度预估完成量', dataIndex: 'qty', width: 100 },
    { title: '阶梯前金额', width: 110, render: (_: any, r: any) => formatMoney(calcRawAmount(r)) },
    { title: '阶梯后金额', dataIndex: 'subtotal', width: 110, render: (_: any, r: any) => formatMoney(calcTieredAmount(r)) },
    { title: '操作', width: 100, render: (_: any, r: any) => (
      canEditRecord(r) ? <Space size="small">
        <a onClick={() => { setEditId(r.id); form.setFieldsValue({ catalog_id: r.catalog_id, coeff: r.coeff, qty: r.qty, period: r.start_date ? [dayjs(r.start_date), dayjs(r.end_date)] : undefined }); setOpen(true); }}>编辑</a>
        <Popconfirm title="确定删除？" onConfirm={() => deleteItem(r.id)}>
          <a style={{ color: '#D9534F' }}>删除</a>
        </Popconfirm>
      </Space> : <span style={{ color: '#98A2B3' }}>只读</span>
    )},
  ];

  const itemTotals = sumServiceItems(items);

  if (loading) return <PageLoading text="正在加载服务单详情..." />;
  if (loadError) return <PageError message={loadError} onRetry={loadPage} retrying={loading} />;
  if (!svc) return <PageError message="服务单不存在或已删除" onRetry={loadPage} />;

  return (
    <div>
      <PageHeader
        title={svc.name}
        icon={<ProfileOutlined />}
        backLabel="项目详情"
        onBack={() => navigate(`/project/${svc.project_id}`)}
        actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditId(null); form.resetFields(); setOpen(true); }}>新增服务项</Button>}
      />

      {/* Info Bar */}
      <button type="button" className="info-strip" disabled={!canEditRecord(svc)} onClick={() => { if (!editingInfo && canEditRecord(svc)) setEditingInfo(true); }} aria-expanded={editingInfo}>
        <span>中心负责人：<strong>{svc.center_lead || '--'}</strong></span>
        <span>运营商负责人：<strong>{svc.operator_lead || '--'}</strong></span>
        <span>时间范围：<strong>{svc.date_start || '--'} ~ {svc.date_end || '--'}</strong></span>
        {!editingInfo && <span className="info-strip-edit">{canEditRecord(svc) ? <><EditOutlined />编辑</> : '只读'}</span>}
      </button>
      {editingInfo && (
        <div className="info-editor">
          <div className="info-editor-grid">
            <div><label style={{ fontSize: 11 }}>中心负责人</label><Input size="small" style={{ width: 120 }} value={infoVals.center_lead} onChange={e => setInfoVals({ ...infoVals, center_lead: e.target.value })} /></div>
            <div><label style={{ fontSize: 11 }}>运营商负责人</label><Input size="small" style={{ width: 120 }} value={infoVals.operator_lead} onChange={e => setInfoVals({ ...infoVals, operator_lead: e.target.value })} /></div>
            <div><label style={{ fontSize: 11 }}>开始日期</label><Input type="date" size="small" style={{ width: 130 }} value={infoVals.date_start} onChange={e => setInfoVals({ ...infoVals, date_start: e.target.value })} /></div>
            <div><label style={{ fontSize: 11 }}>结束日期</label><Input type="date" size="small" style={{ width: 130 }} value={infoVals.date_end} onChange={e => setInfoVals({ ...infoVals, date_end: e.target.value })} /></div>
            <Button size="small" type="primary" loading={actions.isPending('save-info')} onClick={saveInfo}>保存</Button>
            <Button size="small" disabled={actions.isPending('save-info')} onClick={() => setEditingInfo(false)}>取消</Button>
          </div>
        </div>
      )}

      {/* Items Table */}
      <div className="detail-panel">
        <div className="detail-panel-header"><span className="detail-panel-title"><TableOutlined /><span>服务项明细</span></span></div>
        <div className="detail-panel-body">
        {items.length === 0 ? <PageEmpty description="暂无服务项" /> :
        <Table className="detail-ant-table" key={tableKey} columns={itemCols} dataSource={items} rowKey="id" size="small" pagination={false} scroll={{ x: 1180 }} />}
        {items.length > 0 && <div className="detail-total"><span>合计</span><span>阶梯前：{formatMoney(itemTotals.raw)}</span><span>阶梯后：{formatMoney(itemTotals.tiered)}</span></div>}
        </div>
      </div>

      {/* Attachments */}
      <div className="detail-panel"><div className="detail-panel-body">
        <AttachmentManager
          scope="service"
          ownerId={sid}
          attachments={attachments}
          onCreate={metadata => db.createAttachment({ service_order_id: sid, ...metadata })}
          onDelete={attachmentId => db.deleteAttachment(attachmentId)}
          onReload={loadAttach}
          canDelete={canEditRecord}
        />
      </div></div>

      {/* Add/Edit Item Modal */}
      <Modal title={editId ? '编辑服务项' : '新增服务项'} open={open} onOk={onSaveItem} onCancel={() => { if (!actions.isPending('save-item')) setOpen(false); }} width={560} confirmLoading={actions.isPending('save-item')} cancelButtonProps={{ disabled: actions.isPending('save-item') }}>
        <Form form={form} layout="vertical">
          <Form.Item name="catalog_id" label="二级服务目录" rules={[{ required: true }]}>
            <Select showSearch placeholder="搜索选择..." optionFilterProp="label" options={catalog.map((c: any) => ({ label: `${c.cat2} (${c.cat1})`, value: c.id }))} />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="coeff" label="难度系数" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="qty" label="年度预估完成量" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={0} step={0.0001} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="period" label="服务周期" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
