import { supabase } from '../lib/supabase';

const PAGE_SIZE = 1000;
const ID_BATCH_SIZE = 100;

type OrderSpec = { column: string; ascending?: boolean };

const normalizeOrders = (orderBy: string | string[] | OrderSpec[]) => {
  const orders = typeof orderBy === 'string'
    ? [{ column: orderBy, ascending: true }]
    : orderBy.map(order => typeof order === 'string' ? { column: order, ascending: true } : order);
  if (!orders.some(order => order.column === 'id')) orders.push({ column: 'id', ascending: true });
  return orders;
};

const sortRows = (rows: any[], orders: OrderSpec[]) => rows.sort((left, right) => {
  for (const order of orders) {
    const a = left[order.column];
    const b = right[order.column];
    if (a === b) continue;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    const comparison = typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), 'zh-CN', { numeric: true });
    if (comparison !== 0) return order.ascending === false ? -comparison : comparison;
  }
  return 0;
});

const readAllPages = async (buildQuery: () => any, orders: OrderSpec[]) => {
  const data: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = buildQuery();
    for (const order of orders) query = query.order(order.column, { ascending: order.ascending !== false });
    const page = await query.range(from, from + PAGE_SIZE - 1);
    if (page.error) return { data: null, error: page.error };
    const rows = page.data || [];
    data.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return { data, error: null };
};

const listAll = async (table: string, orderBy: string | string[] | OrderSpec[] = 'id') => {
  const orders = normalizeOrders(orderBy);
  return readAllPages(() => supabase.from(table).select('*'), orders);
};

const listByIds = async (table: string, foreignKey: string, ids: number[], orderBy: string | string[] | OrderSpec[] = 'id') => {
  const uniqueIds = Array.from(new Set(ids.filter(Number.isFinite)));
  if (uniqueIds.length === 0) return { data: [], error: null };
  const orders = normalizeOrders(orderBy);
  const batches = Array.from({ length: Math.ceil(uniqueIds.length / ID_BATCH_SIZE) }, (_, index) => (
    uniqueIds.slice(index * ID_BATCH_SIZE, (index + 1) * ID_BATCH_SIZE)
  ));
  const results = await Promise.all(batches.map(batch => (
    readAllPages(() => supabase.from(table).select('*').in(foreignKey, batch), orders)
  )));
  const failed = results.find(result => result.error);
  if (failed) return failed;
  return { data: sortRows(results.flatMap(result => result.data || []), orders), error: null };
};

const enrichItemsWithCatalog = async (table: string, foreignKey: string, id: number) => {
  const items = await listByIds(table, foreignKey, [id]);
  if (items.error || !items.data?.length) return items;

  const catalogIds = Array.from(new Set<number>(
    items.data.map((item: any) => Number(item.catalog_id)).filter((catalogId: number) => Number.isFinite(catalogId)),
  ));
  if (catalogIds.length === 0) return { ...items, data: items.data.map((item: any) => ({ ...item, catalog: null })) };

  const catalogs = await listByIds('service_catalog', 'id', catalogIds);
  if (catalogs.error) return catalogs;

  const catalogMap = new Map((catalogs.data || []).map((catalog: any) => [String(catalog.id), catalog]));
  return {
    ...items,
    data: items.data.map((item: any) => ({ ...item, catalog: catalogMap.get(String(item.catalog_id)) || null })),
  };
};

export const db = {
  // ========== Access Control ==========
  getUserProfile: (id: string) => supabase.from('user_profile').select('*, team:team(id, name, active)').eq('id', id).maybeSingle(),
  listUserProfiles: () => supabase.from('user_profile').select('*, team:team(id, name, active)').order('created_at'),
  updateUserProfile: (id: string, data: any) => supabase.from('user_profile').update(data).eq('id', id).select('*, team:team(id, name, active)').single(),
  listTeams: () => supabase.from('team').select('*').order('name'),
  createTeam: (data: any) => supabase.from('team').insert(data).select().single(),
  updateTeam: (id: number, data: any) => supabase.from('team').update(data).eq('id', id).select().single(),

  // ========== Catalog ==========
  listCatalog: () => listAll('service_catalog'),
  getCatalog: (id: number) => supabase.from('service_catalog').select('*').eq('id', id).single(),
  createCatalog: (data: any) => supabase.from('service_catalog').insert(data).select().single(),
  updateCatalog: (id: number, data: any) => supabase.from('service_catalog').update(data).eq('id', id).select().single(),
  deleteCatalog: (id: number) => supabase.from('service_catalog').delete().eq('id', id),
  searchCatalog: (kw: string) => supabase.from('service_catalog').select('*').ilike('cat2', `%${kw}%`).order('id'),

  // ========== Project ==========
  listProjects: () => listAll('project', [{ column: 'created_at', ascending: false }]),
  getProject: (id: number) => supabase.from('project').select('*').eq('id', id).maybeSingle(),
  createProject: (data: any) => supabase.from('project').insert(data).select().single(),
  updateProject: (id: number, data: any) => supabase.from('project').update(data).eq('id', id).select().single(),
  deleteProject: (id: number) => supabase.from('project').delete().eq('id', id),

  // ========== Service Order ==========
  listServices: (projectId: number) => listByIds('service_order', 'project_id', [projectId], ['plate', 'name']),
  listServicesByProjectIds: (projectIds: number[]) => listByIds('service_order', 'project_id', projectIds, ['plate', 'name']),
  listServicesByIds: (serviceIds: number[]) => listByIds('service_order', 'id', serviceIds, ['plate', 'name']),
  getService: (id: number) => supabase.from('service_order').select('*').eq('id', id).single(),
  createService: (data: any) => supabase.from('service_order').insert(data).select().single(),
  updateService: (id: number, data: any) => supabase.from('service_order').update(data).eq('id', id).select().single(),
  deleteService: (id: number) => supabase.from('service_order').delete().eq('id', id),

  // ========== Service Item ==========
  listItems: (serviceId: number) => enrichItemsWithCatalog('service_item', 'service_order_id', serviceId),
  listServiceItemsByOrderIds: (serviceIds: number[]) => listByIds('service_item', 'service_order_id', serviceIds),
  createItem: (data: any) => supabase.from('service_item').insert(data).select().single(),
  updateItem: (id: number, data: any) => supabase.from('service_item').update(data).eq('id', id).select().single(),
  deleteItem: (id: number) => supabase.from('service_item').delete().eq('id', id),

  // ========== Attachment ==========
  listAttachments: (serviceId: number) => listByIds('service_attachment', 'service_order_id', [serviceId]),
  createAttachment: (data: any) => supabase.from('service_attachment').insert(data).select().single(),
  deleteAttachment: (id: number) => supabase.from('service_attachment').delete().eq('id', id),

  // ========== Declare Order ==========
  listDeclares: (projectId: number) => listByIds('declare_order', 'project_id', [projectId], 'name'),
  listDeclaresByProjectIds: (projectIds: number[]) => listByIds('declare_order', 'project_id', projectIds, 'name'),
  getDeclare: (id: number) => supabase.from('declare_order').select('*').eq('id', id).single(),
  createDeclare: (data: any) => supabase.from('declare_order').insert(data).select().single(),
  updateDeclare: (id: number, data: any) => supabase.from('declare_order').update(data).eq('id', id),
  deleteDeclare: (id: number) => supabase.from('declare_order').delete().eq('id', id),

  // ========== Declare Service ==========
  listDecServices: (declareId: number) => supabase.from('declare_service').select('*, service_order:service_order(*)').eq('declare_id', declareId),
  listDecServicesByDeclareIds: (declareIds: number[]) => listByIds('declare_service', 'declare_id', declareIds),
  createDecService: (data: any) => supabase.from('declare_service').insert(data).select().single(),
  deleteDecService: (id: number) => supabase.from('declare_service').delete().eq('id', id),

  // ========== Declare Item ==========
  listDecItems: (dsId: number) => enrichItemsWithCatalog('declare_item', 'declare_service_id', dsId),
  listDecItemsByServiceIds: (dsIds: number[]) => listByIds('declare_item', 'declare_service_id', dsIds),
  createDecItem: (data: any) => supabase.from('declare_item').insert(data).select().single(),
  updateDecItem: (id: number, data: any) => supabase.from('declare_item').update(data).eq('id', id),
  deleteDecItem: (id: number) => supabase.from('declare_item').delete().eq('id', id),

  // ========== Accept Order ==========
  listAccepts: (projectId: number) => listByIds('accept_order', 'project_id', [projectId], 'name'),
  listAcceptsByProjectIds: (projectIds: number[]) => listByIds('accept_order', 'project_id', projectIds, 'name'),
  getAccept: (id: number) => supabase.from('accept_order').select('*').eq('id', id).single(),
  createAccept: (data: any) => supabase.from('accept_order').insert(data).select().single(),
  updateAccept: (id: number, data: any) => supabase.from('accept_order').update(data).eq('id', id),
  deleteAccept: (id: number) => supabase.from('accept_order').delete().eq('id', id),

  // ========== Accept Service ==========
  listAccServices: (acceptId: number) => supabase.from('accept_service').select('*, service_order:service_order(*)').eq('accept_id', acceptId),
  listAccServicesByAcceptIds: (acceptIds: number[]) => listByIds('accept_service', 'accept_id', acceptIds),
  createAccService: (data: any) => supabase.from('accept_service').insert(data).select().single(),
  deleteAccService: (id: number) => supabase.from('accept_service').delete().eq('id', id),

  // ========== Declare Attachment ==========
  listDecAttachments: (dsId: number) => listByIds('declare_attachment', 'declare_service_id', [dsId]),
  listDecAttachmentsByServiceIds: (dsIds: number[]) => listByIds('declare_attachment', 'declare_service_id', dsIds),
  createDecAttachment: (data: any) => supabase.from('declare_attachment').insert(data).select().single(),
  deleteDecAttachment: (id: number) => supabase.from('declare_attachment').delete().eq('id', id),

  // ========== Accept Attachment ==========
  listAccAttachments: (asId: number) => listByIds('accept_attachment', 'accept_service_id', [asId]),
  listAccAttachmentsByServiceIds: (asIds: number[]) => listByIds('accept_attachment', 'accept_service_id', asIds),
  createAccAttachment: (data: any) => supabase.from('accept_attachment').insert(data).select().single(),
  deleteAccAttachment: (id: number) => supabase.from('accept_attachment').delete().eq('id', id),

  // ========== Accept Item ==========
  listAccItems: (asId: number) => enrichItemsWithCatalog('accept_item', 'accept_service_id', asId),
  listAccItemsByServiceIds: (asIds: number[]) => listByIds('accept_item', 'accept_service_id', asIds),
  createAccItem: (data: any) => supabase.from('accept_item').insert(data).select().single(),
  updateAccItem: (id: number, data: any) => supabase.from('accept_item').update(data).eq('id', id),
  deleteAccItem: (id: number) => supabase.from('accept_item').delete().eq('id', id),
};
