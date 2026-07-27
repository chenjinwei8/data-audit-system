import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({
  listCatalog: vi.fn(),
  listDecServicesByDeclareIds: vi.fn(),
  listDecItemsByServiceIds: vi.fn(),
  listServicesByIds: vi.fn(),
  listDecAttachmentsByServiceIds: vi.fn(),
  listAccServicesByAcceptIds: vi.fn(),
  listAccItemsByServiceIds: vi.fn(),
  listAccAttachmentsByServiceIds: vi.fn(),
}));

vi.mock('./db', () => ({ db: dbMock }));

import { loadAcceptDetailData, loadDeclareDetailData } from './documentData';

const ok = (data: any[]) => Promise.resolve({ data, error: null });

describe('document detail loaders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.listCatalog.mockReturnValue(ok([{ id: 1, cat2: '目录一' }]));
    dbMock.listServicesByIds.mockReturnValue(ok([{ id: 10, name: '服务单一' }]));
    dbMock.listDecServicesByDeclareIds.mockReturnValue(ok([
      { id: 20, declare_id: 2, service_order_id: 10 },
    ]));
    dbMock.listDecItemsByServiceIds.mockReturnValue(ok([
      { id: 30, declare_service_id: 20, catalog_id: 1 },
    ]));
    dbMock.listDecAttachmentsByServiceIds.mockReturnValue(ok([
      { id: 40, declare_service_id: 20, name: '附件.txt' },
    ]));
    dbMock.listAccServicesByAcceptIds.mockReturnValue(ok([
      { id: 50, accept_id: 3, service_order_id: 10 },
    ]));
    dbMock.listAccItemsByServiceIds.mockReturnValue(ok([
      { id: 60, accept_service_id: 50, catalog_id: 1 },
    ]));
    dbMock.listAccAttachmentsByServiceIds.mockReturnValue(ok([
      { id: 70, accept_service_id: 50, name: '验收附件.pdf' },
    ]));
  });

  it('groups declaration items and attachments by service', async () => {
    const result = await loadDeclareDetailData(2);

    expect(result.services[0].service_order.name).toBe('服务单一');
    expect(result.services[0].items[0].catalog.cat2).toBe('目录一');
    expect(result.attachments[20][0].name).toBe('附件.txt');
  });

  it('groups acceptance items by service', async () => {
    const result = await loadAcceptDetailData(3);

    expect(result.services[0].service_order.name).toBe('服务单一');
    expect(result.services[0].items[0].catalog.cat2).toBe('目录一');
    expect(result.attachments[50][0].name).toBe('验收附件.pdf');
  });
});
