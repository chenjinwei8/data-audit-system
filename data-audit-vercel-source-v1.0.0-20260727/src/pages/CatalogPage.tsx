import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Switch, Upload, message, Popconfirm, Space, Card, Spin, Tag } from 'antd';
import { AppstoreOutlined, CheckCircleOutlined, DatabaseOutlined, InboxOutlined, PaperClipOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { db } from '../api/db';
import { PageError, PageLoading } from '../components/PageState';
import { PageEmpty, PageHeader } from '../components/PageLayout';
import useActionState from '../hooks/useActionState';
import { ensureSuccess, getErrorMessage } from '../utils/errors';
import { useAuth } from '../auth/AuthContext';

export default function CatalogPage() {
  const [data, setData] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [pageLoading, setPageLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [importing, setImporting] = useState(false);
  const [tableKey, setTableKey] = useState(0);
  const actions = useActionState();
  const { isSuperAdmin } = useAuth();

  const load = async () => {
    setPageLoading(true);
    setLoadError('');
    try {
      const r = ensureSuccess(await db.listCatalog());
      setData(r.data || []);
    } catch (e) {
      console.error('Catalog load error:', e);
      setLoadError('服务目录加载失败，请检查网络或数据库配置');
    } finally {
      setPageLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const onSave = async () => {
    let vals: any;
    try {
      vals = await form.validateFields();
    } catch {
      return;
    }
    await actions.run('save', async () => {
      try {
      const payload = { cat1: vals.cat1, cat2: vals.cat2, unit: vals.unit, price: vals.price, has_time_coeff: vals.hasTimeCoeff, is_tiered: vals.isTiered };
      if (editId) ensureSuccess(await db.updateCatalog(editId, payload));
      else ensureSuccess(await db.createCatalog(payload));
      setOpen(false); form.resetFields();
      await load();
      setTableKey(k => k + 1);
      message.success('保存成功');
    } catch (e: any) {
      console.error('保存失败', e);
        message.error(`保存失败：${getErrorMessage(e, '未知错误')}`);
    }
    });
  };

  const onUpload = async (file: File) => {
    if (importing) return false;
    setImporting(true);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const existing = ensureSuccess(await db.listCatalog()).data || [];
      let added = 0;
      const changedItems: any[] = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || !r[2]) continue;
        const cat2 = String(r[2]).trim(); const cat1 = String(r[1] || '').trim() || '未分类';
        const unit = String(r[3] || '').trim() || '次'; const price = parseFloat(r[4]) || 0;
        if (!cat2 || price <= 0) continue;
        const dup = existing.find((c: any) => c.cat2 === cat2);
        if (dup) {
          if (dup.cat1 !== cat1 || dup.unit !== unit || Math.abs((dup.price || 0) - price) > 0.001) {
            changedItems.push({ id: dup.id, cat2, oldPrice: dup.price, newPrice: price, oldUnit: dup.unit, newUnit: unit });
          }
          continue;
        }
        ensureSuccess(await db.createCatalog({ cat1, cat2, unit, price, has_time_coeff: false, is_tiered: false }));
        added++;
        existing.push({ cat2, cat1, unit, price } as any);
      }
      // Update changed items
      if (changedItems.length > 0) {
        for (const ch of changedItems) ensureSuccess(await db.updateCatalog(ch.id, { price: ch.newPrice, unit: ch.newUnit }));
        message.success(`识别完成！新增 ${added} 条，更新 ${changedItems.length} 条（${changedItems.map((c: any) => c.cat2).join('、')}）`);
      } else {
        message.success(`识别完成！已导入 ${added} 条新目录项`);
      }
      await load();
    } catch (error) {
      console.error('Catalog import error:', error);
      message.error(`导入失败：${getErrorMessage(error, '请确认文件格式和数据库连接')}`);
    } finally {
      setImporting(false);
    }
    return false;
  };

  const columns = [
    { title: '#', width: 40, render: (_: any, __: any, i: number) => i + 1 },
    { title: '一级服务目录名称', dataIndex: 'cat1', width: 130 },
    { title: '二级服务目录名称', dataIndex: 'cat2', width: 320, ellipsis: true },
    { title: '单位', dataIndex: 'unit', width: 90 },
    { title: '单价 (元)', dataIndex: 'price', width: 100, render: (v: number) => v?.toFixed(2), align: 'right' as const },
    {
      title: '时间系数', dataIndex: 'has_time_coeff', width: 85,
      render: (v: boolean) => v === true
        ? <Tag color="success" icon={<CheckCircleOutlined />}>启用</Tag>
        : <Tag icon={<StopOutlined />}>停用</Tag>,
    },
    {
      title: '阶梯计价', dataIndex: 'is_tiered', width: 85,
      render: (v: boolean) => v === true
        ? <Tag color="success" icon={<CheckCircleOutlined />}>阶梯</Tag>
        : <Tag icon={<StopOutlined />}>关闭</Tag>,
    },
    {
      title: '操作', width: 130,
      render: (_: any, r: any) => (
        isSuperAdmin ? <Space size="small">
          <a onClick={() => { setEditId(r.id); form.setFieldsValue({ ...r, hasTimeCoeff: r.has_time_coeff, isTiered: r.is_tiered }); setOpen(true); }}>编辑</a>
          <Popconfirm title="确定删除该条数据？" onConfirm={() => actions.run(`delete-${r.id}`, async () => {
            try {
              ensureSuccess(await db.deleteCatalog(r.id));
              await load();
              message.success('删除成功');
            } catch (error) {
              message.error(`删除失败：${getErrorMessage(error)}`);
            }
          })}>
            <a style={{ color: '#D9534F' }}>删除</a>
          </Popconfirm>
        </Space> : <span style={{ color: '#98A2B3' }}>只读</span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="服务目录识别管理" icon={<AppstoreOutlined />} />

      {/* Upload Card */}
      {isSuperAdmin && <Card
        title={<span className="section-title"><PaperClipOutlined />上传附件识别</span>}
        size="small"
        className="section-card"
      >
        <Upload.Dragger
          accept=".xlsx,.xls"
          showUploadList={false}
          beforeUpload={onUpload}
          disabled={importing}
        >
          {importing ? (
            <div style={{ padding: 20 }}>
              <Spin />
              <p style={{ marginTop: 8, color: '#999' }}>AI 正在识别附件内容，请稍候...</p>
            </div>
          ) : (
            <div style={{ padding: 20 }}>
              <InboxOutlined className="upload-dragger-icon" />
              <p><strong>点击上传</strong> 或拖拽 Excel 文件到此处</p>
              <p style={{ color: '#999', fontSize: 12 }}>支持 .xlsx / .xls 格式，系统将自动识别服务目录字段</p>
            </div>
          )}
        </Upload.Dragger>
      </Card>}

      {/* Catalog Table */}
      <Card
        title={<span className="section-title"><DatabaseOutlined />全局服务目录库（共 <b>{data.length}</b> 条）</span>}
        extra={isSuperAdmin ? <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditId(null); form.resetFields(); setOpen(true); }}>新增服务目录项</Button> : null}
        size="small"
        className="section-card"
      >
        {loadError && data.length === 0 ? (
          <PageError message={loadError} onRetry={load} retrying={pageLoading} />
        ) : pageLoading && data.length === 0 ? (
          <PageLoading text="正在加载服务目录..." />
        ) : data.length === 0 ? (
          <PageEmpty description="暂无服务目录，请上传附件识别或手动新增" />
        ) : (
          <Table
            key={tableKey}
            columns={columns}
            dataSource={data}
            rowKey="id"
            size="small"
            pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] }}
            scroll={{ x: 900 }}
            loading={pageLoading}
          />
        )}
      </Card>

      {/* Add/Edit Modal */}
      <Modal
        title={editId ? '编辑服务目录项' : '新增服务目录项'}
        open={open} onOk={onSave} onCancel={() => { if (!actions.isPending('save')) setOpen(false); }}
        confirmLoading={actions.isPending('save')}
        cancelButtonProps={{ disabled: actions.isPending('save') }}
        width={520}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="cat1" label="一级服务目录名称" rules={[{ required: true, message: '请输入' }]}>
            <Input placeholder="如：数据治理服务" />
          </Form.Item>
          <Form.Item name="cat2" label="二级服务目录名称" rules={[{ required: true, message: '请输入' }]}
            extra="全局不可重复">
            <Input placeholder="如：数据采集接入服务" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="unit" label="单位" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder="如：次、个、人天" />
            </Form.Item>
            <Form.Item name="price" label="单价 (元)" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={0.01} step={0.01} placeholder="0.00" style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="hasTimeCoeff" label="申报/验收时启用时间系数自动计算" valuePropName="checked" initialValue={false}>
            <Switch />
          </Form.Item>
          <Form.Item name="isTiered" label="启用阶梯计价" valuePropName="checked" initialValue={false}
            extra="0-1000(含)：原价；1000-10000(含)：原价×80%；10000以上：原价×60%">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
