import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  download: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: {
      from: storageMock.from,
    },
  },
}));

import {
  ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_SIZE,
  buildAttachmentStoragePath,
  uploadAttachment,
  validateAttachmentFile,
} from './attachments';

const file = (name: string, size: number, type = 'application/octet-stream') => ({ name, size, type }) as File;

describe('attachment storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.from.mockReturnValue({
      upload: storageMock.upload,
      remove: storageMock.remove,
      download: storageMock.download,
    });
    storageMock.upload.mockResolvedValue({ data: { path: 'stored' }, error: null });
    storageMock.remove.mockResolvedValue({ data: [], error: null });
  });

  it('validates file type and 50 MB size limit', () => {
    expect(validateAttachmentFile(file('合同.pdf', 1024))).toBeNull();
    expect(validateAttachmentFile(file('数据.xlsx', MAX_ATTACHMENT_SIZE))).toBeNull();
    expect(validateAttachmentFile(file('程序.exe', 1024))).toContain('仅支持');
    expect(validateAttachmentFile(file('超大.pdf', MAX_ATTACHMENT_SIZE + 1))).toContain('50 MB');
  });

  it('builds isolated paths without exposing the original filename', () => {
    expect(buildAttachmentStoragePath('declare', 12, '../合同 最终版.PDF', 'fixed-token'))
      .toBe('declare/12/fixed-token.pdf');
    expect(buildAttachmentStoragePath('declare', 12, '合同.pdf', 'fixed-token', 7))
      .toBe('7/declare/12/fixed-token.pdf');
  });

  it('uploads the file before saving metadata and does not store Base64 data', async () => {
    const saveMetadata = vi.fn().mockResolvedValue({ data: { id: 1 }, error: null });
    await uploadAttachment('service', 8, file('报价.xlsx', 2048, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), saveMetadata);

    expect(storageMock.from).toHaveBeenCalledWith(ATTACHMENT_BUCKET);
    expect(storageMock.upload).toHaveBeenCalledOnce();
    expect(saveMetadata).toHaveBeenCalledWith(expect.objectContaining({
      name: '报价.xlsx',
      size: 2048,
      storage_path: expect.stringMatching(/^service\/8\/.+\.xlsx$/),
    }));
    expect(saveMetadata.mock.calls[0][0]).not.toHaveProperty('data');
  });

  it('removes the uploaded object when metadata persistence fails', async () => {
    const saveMetadata = vi.fn().mockResolvedValue({ data: null, error: { message: 'column missing' } });

    await expect(uploadAttachment('accept', 9, file('验收.pdf', 1024), saveMetadata))
      .rejects.toThrow('附件元数据保存失败');
    expect(storageMock.remove).toHaveBeenCalledWith([expect.stringMatching(/^accept\/9\//)]);
  });
});
