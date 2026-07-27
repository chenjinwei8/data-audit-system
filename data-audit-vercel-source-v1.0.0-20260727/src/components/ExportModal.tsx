import { useState } from 'react';
import { Modal, Checkbox, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';

interface Props {
  open: boolean;
  onClose: () => void;
  onExport: (fields: string[]) => void | Promise<void>;
  title: string;
  options: { label: string; value: string; defaultChecked?: boolean }[];
}

export default function ExportModal({ open, onClose, onExport, title, options }: Props) {
  const [checked, setChecked] = useState<string[]>(options.filter(o => o.defaultChecked !== false).map(o => o.value));
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (checked.length === 0) { message.error('请至少选择一个字段'); return; }
    if (exporting) return;
    setExporting(true);
    try {
      await onExport(checked);
      onClose();
    } catch (error) {
      console.error('Export error:', error);
      message.error('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      title={<span className="modal-title-with-icon"><DownloadOutlined />{title}</span>}
      open={open}
      onOk={handleExport}
      onCancel={onClose}
      okText="导出 XLS"
      confirmLoading={exporting}
      cancelButtonProps={{ disabled: exporting }}
    >
      <p className="export-modal-hint">勾选需要导出的字段：</p>
      <div className="export-field-grid">
        {options.map(o => (
          <label key={o.value} className="export-field-option">
            <Checkbox checked={checked.includes(o.value)} onChange={e => {
              if (e.target.checked) setChecked([...checked, o.value]);
              else setChecked(checked.filter(v => v !== o.value));
            }}>{o.label}</Checkbox>
          </label>
        ))}
      </div>
    </Modal>
  );
}
