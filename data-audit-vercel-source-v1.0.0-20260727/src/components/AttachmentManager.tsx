import { useRef, useState } from 'react';
import { Button, Empty, message, Popconfirm, Space, Typography } from 'antd';
import { DeleteOutlined, DownloadOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons';
import {
  AttachmentMetadata,
  AttachmentRecord,
  AttachmentScope,
  downloadAttachment,
  formatAttachmentSize,
  formatAttachmentTime,
  removeAttachment,
  uploadAttachment,
} from '../api/attachments';
import { useAuth } from '../auth/AuthContext';

type AttachmentManagerProps = {
  scope: AttachmentScope;
  ownerId: number;
  attachments: AttachmentRecord[];
  onCreate: (metadata: AttachmentMetadata) => Promise<any>;
  onDelete: (id: number) => Promise<any>;
  onReload: () => void | Promise<void>;
  compact?: boolean;
  canUpload?: boolean;
  canDelete?: (attachment: AttachmentRecord) => boolean;
};

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error || '未知错误');

export default function AttachmentManager({
  scope,
  ownerId,
  attachments,
  onCreate,
  onDelete,
  onReload,
  compact = false,
  canUpload = true,
  canDelete = () => true,
}: AttachmentManagerProps) {
  const { profile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    let successCount = 0;
    try {
      for (const file of Array.from(files)) {
        try {
          await uploadAttachment(scope, ownerId, file, onCreate, profile?.team_id);
          successCount++;
        } catch (error) {
          message.error(`${file.name}：${messageOf(error)}，请重试`);
        }
      }
      if (successCount > 0) {
        try {
          await onReload();
          message.success(`已上传 ${successCount} 个附件`);
        } catch (error) {
          message.warning(`附件已上传，但列表刷新失败：${messageOf(error)}`);
        }
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDownload = async (attachment: AttachmentRecord) => {
    setBusyId(attachment.id);
    try {
      await downloadAttachment(attachment);
    } catch (error) {
      message.error(`${messageOf(error)}，请重试`);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (attachment: AttachmentRecord) => {
    setBusyId(attachment.id);
    try {
      await removeAttachment(attachment, onDelete);
      try {
        await onReload();
        message.success('附件已删除');
      } catch (error) {
        message.warning(`附件已删除，但列表刷新失败：${messageOf(error)}`);
      }
    } catch (error) {
      message.error(`${messageOf(error)}，请重试`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ marginTop: compact ? 12 : 0, borderTop: compact ? '1px solid #E4E7EC' : undefined, paddingTop: compact ? 12 : 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ fontWeight: 600 }}><PaperClipOutlined /> 附件管理</div>
        {canUpload && (
          <Button size="small" icon={<UploadOutlined />} loading={uploading} onClick={() => inputRef.current?.click()}>
            上传附件
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip,.rar,.7z,.jpg,.jpeg,.png"
          style={{ display: 'none' }}
          onChange={event => handleFiles(event.target.files)}
        />
      </div>
      <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>
        支持 PDF、Word、Excel、PPT、文本、压缩包和常见图片，单个文件不超过 50 MB。
      </Typography.Text>
      {attachments.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无附件" style={{ margin: compact ? '8px 0' : '16px 0' }} />
      ) : attachments.map(attachment => (
        <div key={attachment.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #F0F0F0' }}>
          <div style={{ minWidth: 0 }}>
            <Typography.Text ellipsis={{ tooltip: attachment.name }} style={{ display: 'block', maxWidth: compact ? 360 : 520 }}>
              {attachment.name || '未命名附件'}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {formatAttachmentSize(attachment.size)} · {formatAttachmentTime(attachment)}
            </Typography.Text>
          </div>
          <Space size="small" style={{ whiteSpace: 'nowrap' }}>
            <Button type="text" size="small" icon={<DownloadOutlined />} loading={busyId === attachment.id} onClick={() => handleDownload(attachment)}>
              下载
            </Button>
            {canDelete(attachment) && (
              <Popconfirm title="确定删除该附件？" onConfirm={() => handleDelete(attachment)}>
                <Button type="text" danger size="small" icon={<DeleteOutlined />} disabled={busyId === attachment.id}>
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>
      ))}
    </div>
  );
}
