import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({
  listCatalog: vi.fn(),
  listServicesByProjectIds: vi.fn(),
  listDeclaresByProjectIds: vi.fn(),
  listAcceptsByProjectIds: vi.fn(),
  listServiceItemsByOrderIds: vi.fn(),
  listDecServicesByDeclareIds: vi.fn(),
  listAccServicesByAcceptIds: vi.fn(),
  listDecItemsByServiceIds: vi.fn(),
  listAccItemsByServiceIds: vi.fn(),
}));

vi.mock('./db', () => ({ db: dbMock }));

import { loadProjectRelations } from './projectData';

const ok = (data: any[]) => Promise.resolve({ data, error: null });

describe('loadProjectRelations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.listCatalog.mockReturnValue(ok([{ id: 1, cat2: '目录一', price: 10 }]));
    dbMock.listServicesByProjectIds.mockReturnValue(ok([
      { id: 11, project_id: 1, name: '服务一' },
      { id: 21, project_id: 2, name: '服务二' },
    ]));
    dbMock.listDeclaresByProjectIds.mockReturnValue(ok([{ id: 31, project_id: 1, name: '申报一' }]));
    dbMock.listAcceptsByProjectIds.mockReturnValue(ok([{ id: 41, project_id: 2, name: '验收二' }]));
    dbMock.listServiceItemsByOrderIds.mockReturnValue(ok([
      { id: 101, service_order_id: 11, catalog_id: 1, coeff: 1, qty: 2 },
    ]));
    dbMock.listDecServicesByDeclareIds.mockReturnValue(ok([
      { id: 51, declare_id: 31, service_order_id: 11 },
    ]));
    dbMock.listAccServicesByAcceptIds.mockReturnValue(ok([
      { id: 61, accept_id: 41, service_order_id: 21 },
    ]));
    dbMock.listDecItemsByServiceIds.mockReturnValue(ok([
      { id: 201, declare_service_id: 51, catalog_id: 1, coeff: 1, qty: 1 },
    ]));
    dbMock.listAccItemsByServiceIds.mockReturnValue(ok([
      { id: 301, accept_service_id: 61, catalog_id: 1, coeff: 1, qty: 1 },
    ]));
  });

  it('assembles multiple projects without mixing their relations', async () => {
    const result = await loadProjectRelations([1, 2]);

    expect(result[1].services[0].items[0].catalog.cat2).toBe('目录一');
    expect(result[1].declares[0].dServices[0].service_order.name).toBe('服务一');
    expect(result[2].accepts[0].aServices[0].service_order.name).toBe('服务二');
    expect(result[1].accepts).toEqual([]);
    expect(result[2].declares).toEqual([]);
  });

  it('skips disabled sections', async () => {
    const result = await loadProjectRelations([1], { services: true, declares: false, accepts: false });

    expect(result[1].services).toHaveLength(1);
    expect(result[1].declares).toEqual([]);
    expect(dbMock.listDeclaresByProjectIds).not.toHaveBeenCalled();
    expect(dbMock.listAcceptsByProjectIds).not.toHaveBeenCalled();
  });

  it('propagates database errors', async () => {
    dbMock.listCatalog.mockReturnValue(Promise.resolve({ data: null, error: new Error('catalog failed') }));
    await expect(loadProjectRelations([1])).rejects.toThrow('catalog failed');
  });
});
