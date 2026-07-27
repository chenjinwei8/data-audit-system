import { db } from './db';

const rowsOrThrow = (result: { data?: any[] | null; error?: any }) => {
  if (result.error) throw result.error;
  return result.data || [];
};

const idsOf = (rows: any[], key = 'id') => rows.map(row => Number(row[key])).filter(Number.isFinite);

const groupBy = (rows: any[], foreignKey: string) => rows.reduce<Map<string, any[]>>((groups, row) => {
  const key = String(row[foreignKey]);
  const group = groups.get(key);
  if (group) group.push(row);
  else groups.set(key, [row]);
  return groups;
}, new Map());

const attachCatalog = (items: any[], catalogs: any[]) => {
  const catalogById = new Map(catalogs.map(catalog => [String(catalog.id), catalog]));
  return items.map(item => ({ ...item, catalog: catalogById.get(String(item.catalog_id)) || null }));
};

const attachServiceOrders = (groups: any[], serviceOrders: any[], itemsByGroup: Map<string, any[]>) => {
  const serviceById = new Map(serviceOrders.map(service => [String(service.id), service]));
  return groups.map(group => ({
    ...group,
    service_order: serviceById.get(String(group.service_order_id)) || null,
    items: itemsByGroup.get(String(group.id)) || [],
  }));
};

export const loadDeclareDetailData = async (declareId: number) => {
  const [catalogResult, groupsResult] = await Promise.all([
    db.listCatalog(),
    db.listDecServicesByDeclareIds([declareId]),
  ]);
  const catalogs = rowsOrThrow(catalogResult);
  const groups = rowsOrThrow(groupsResult);
  const groupIds = idsOf(groups);

  const [itemsResult, servicesResult, attachmentsResult] = await Promise.all([
    db.listDecItemsByServiceIds(groupIds),
    db.listServicesByIds(idsOf(groups, 'service_order_id')),
    db.listDecAttachmentsByServiceIds(groupIds),
  ]);

  const items = attachCatalog(rowsOrThrow(itemsResult), catalogs);
  const services = attachServiceOrders(groups, rowsOrThrow(servicesResult), groupBy(items, 'declare_service_id'));
  const attachmentGroups = groupBy(rowsOrThrow(attachmentsResult), 'declare_service_id');
  const attachments = groups.reduce<Record<number, any[]>>((result, group) => {
    result[group.id] = attachmentGroups.get(String(group.id)) || [];
    return result;
  }, {});

  return { catalog: catalogs, services, attachments };
};

export const loadAcceptDetailData = async (acceptId: number) => {
  const [catalogResult, groupsResult] = await Promise.all([
    db.listCatalog(),
    db.listAccServicesByAcceptIds([acceptId]),
  ]);
  const catalogs = rowsOrThrow(catalogResult);
  const groups = rowsOrThrow(groupsResult);

  const groupIds = idsOf(groups);
  const [itemsResult, servicesResult, attachmentsResult] = await Promise.all([
    db.listAccItemsByServiceIds(groupIds),
    db.listServicesByIds(idsOf(groups, 'service_order_id')),
    db.listAccAttachmentsByServiceIds(groupIds),
  ]);

  const items = attachCatalog(rowsOrThrow(itemsResult), catalogs);
  const services = attachServiceOrders(groups, rowsOrThrow(servicesResult), groupBy(items, 'accept_service_id'));
  const attachmentGroups = groupBy(rowsOrThrow(attachmentsResult), 'accept_service_id');
  const attachments = groups.reduce<Record<number, any[]>>((result, group) => {
    result[group.id] = attachmentGroups.get(String(group.id)) || [];
    return result;
  }, {});
  return { catalog: catalogs, services, attachments };
};
