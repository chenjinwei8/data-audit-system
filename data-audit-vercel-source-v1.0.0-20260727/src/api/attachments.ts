import { supabase } from '../lib/supabase';

export const ATTACHMENT_BUCKET = 'data-audit-attachments';
export const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;

export type AttachmentScope = 'service' | 'declare' | 'accept';

export type AttachmentMetadata = {
  name: string;
  size: number;
  type: string;
  time: string;
  uploaded_at: string;
  storage_path: string;
};

export type AttachmentRecord = Partial<AttachmentMetadata> & {
  id: number;
  data?: string | null;
  team_id?: number | null;
  created_by?: string | null;
};

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt',
  'ppt', 'pptx', 'zip', 'rar', '7z', 'jpg', 'jpeg', 'png',
]);

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() || '';

const errorText = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return String(error || '未知错误');
};

export const validateAttachmentFile = (file: Pick<File, 'name' | 'size'>) => {
  if (!ALLOWED_EXTENSIONS.has(extensionOf(file.name))) {
    return '仅支持 PDF、Word、Excel、PPT、文本、压缩包及常见图片格式';
  }
  if (file.size <= 0) return '文件内容为空';
  if (file.size > MAX_ATTACHMENT_SIZE) return '单个文件不能超过 50 MB';
  return null;
};

export const buildAttachmentStoragePath = (
  scope: AttachmentScope,
  ownerId: number,
  fileName: string,
  token = `${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`,
  teamId?: number | null,
) => {
  const extension = extensionOf(fileName).replace(/[^a-z0-9]/g, '').slice(0, 10);
  const path = `${scope}/${ownerId}/${token}${extension ? `.${extension}` : ''}`;
  return teamId ? `${teamId}/${path}` : path;
};

export const formatAttachmentSize = (size?: number | null) => {
  const bytes = Number(size || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const formatAttachmentTime = (attachment: AttachmentRecord) => {
  if (attachment.uploaded_at) {
    const date = new Date(attachment.uploaded_at);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString('zh-CN');
  }
  return attachment.time || '--';
};

export const uploadAttachment = async (
  scope: AttachmentScope,
  ownerId: number,
  file: File,
  saveMetadata: (metadata: AttachmentMetadata) => Promise<any>,
  teamId?: number | null,
) => {
  const validationError = validateAttachmentFile(file);
  if (validationError) throw new Error(validationError);

  const storagePath = buildAttachmentStoragePath(scope, ownerId, file.name, undefined, teamId);
  const bucket = supabase.storage.from(ATTACHMENT_BUCKET);
  const uploadResult = await bucket.upload(storagePath, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (uploadResult.error) throw new Error(`上传到文件存储失败：${errorText(uploadResult.error)}`);

  const now = new Date();
  const metadata: AttachmentMetadata = {
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    time: now.toLocaleString('zh-CN'),
    uploaded_at: now.toISOString(),
    storage_path: storagePath,
  };

  try {
    const saved = await saveMetadata(metadata);
    if (saved?.error) throw saved.error;
    return saved?.data;
  } catch (error) {
    await bucket.remove([storagePath]);
    throw new Error(`附件元数据保存失败：${errorText(error)}`);
  }
};

const triggerDownload = (href: string, filename: string) => {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
};

export const downloadAttachment = async (attachment: AttachmentRecord) => {
  if (attachment.storage_path) {
    const result = await supabase.storage.from(ATTACHMENT_BUCKET).download(attachment.storage_path);
    if (result.error || !result.data) throw new Error(`下载失败：${errorText(result.error)}`);
    const url = URL.createObjectURL(result.data);
    triggerDownload(url, attachment.name || '附件');
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return;
  }

  if (attachment.data) {
    triggerDownload(attachment.data, attachment.name || '附件');
    return;
  }
  throw new Error('附件没有可用的存储路径');
};

export const removeAttachment = async (
  attachment: AttachmentRecord,
  deleteMetadata: (id: number) => Promise<any>,
) => {
  if (attachment.storage_path) {
    const storageResult = await supabase.storage.from(ATTACHMENT_BUCKET).remove([attachment.storage_path]);
    if (storageResult.error) throw new Error(`删除文件失败：${errorText(storageResult.error)}`);
  }

  const deleteResult = await deleteMetadata(attachment.id);
  if (deleteResult?.error) throw new Error(`删除附件记录失败：${errorText(deleteResult.error)}`);
};
