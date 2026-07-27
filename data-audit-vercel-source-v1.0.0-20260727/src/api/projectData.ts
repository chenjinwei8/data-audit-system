import { db } from './db';

export type ProjectRelations = {
  services: any[];
  declares: any[];
  accepts: any[];
};

type RelationOptions = {
  services?: boolean;
  declares?: boolean;
  accepts?: boolean;
};

const emptyResult = () => ({ data: [] as any[], error: null });

const rowsOrThrow = (result: { data?: any[] | null; error?: any }) => {
  if (result.error) throw result.error;
  return result.data || [];
};

const groupBy = (rows: any[], foreignKey: string) => rows.reduce<Map<string, any[]>>((groups, row) => {
  const key = String(row[foreignKey]);
  const group = groups.get(key);
  if (group) group.push(row);
  else groups.set(key, [row]);
  return groups;
}, new Map());

const idsOf = (rows: any[]) => rows.map(row => Number(row.id)).filter(Number.isFinite);

export const loadProjectRelations = async (
  projectIds: number[],
  options: RelationOptions = { services: true, declares: true, accepts: true },
) => {
  const ids = Array.from(new Set(projectIds.filter(Number.isFinite)));
  const includeServices = options.services !== false;
  const includeDeclares = options.declares !== false;
  const includeAccepts = options.accepts !== false;
  const output = ids.reduce<Record<number, ProjectRelations>>((result, id) => {
    result[id] = { services: [], declares: [], accepts: [] };
    return result;
  }, {});

  if (ids.length === 0 || (!includeServices && !includeDeclares && !includeAccepts)) return output;

  const [catalogResult, servicesResult, declaresResult, acceptsResult] = await Promise.all([
    db.listCatalog(),
    db.listServicesByProjectIds(ids),
    includeDeclares ? db.listDeclaresByProjectIds(ids) : Promise.resolve(emptyResult()),
    includeAccepts ? db.listAcceptsByProjectIds(ids) : Promise.resolve(emptyResult()),
  ]);

  const catalogs = rowsOrThrow(catalogResult);
  const services = rowsOrThrow(servicesResult);
  const declares = rowsOrThrow(declaresResult);
  const accepts = rowsOrThrow(acceptsResult);
  const catalogById = new Map(catalogs.map(catalog => [String(catalog.id), catalog]));

  const [serviceItemsResult, decServicesResult, accServicesResult] = await Promise.all([
    includeServices ? db.listServiceItemsByOrderIds(idsOf(services)) : Promise.resolve(emptyResult()),
    includeDeclares ? db.listDecServicesByDeclareIds(idsOf(declares)) : Promise.resolve(emptyResult()),
    includeAccepts ? db.listAccServicesByAcceptIds(idsOf(accepts)) : Promise.resolve(emptyResult()),
  ]);

  const serviceItems = rowsOrThrow(serviceItemsResult);
  const decServices = rowsOrThrow(decServicesResult);
  const accServices = rowsOrThrow(accServicesResult);

  const [decItemsResult, accItemsResult] = await Promise.all([
    includeDeclares ? db.listDecItemsByServiceIds(idsOf(decServices)) : Promise.resolve(emptyResult()),
    includeAccepts ? db.listAccItemsByServiceIds(idsOf(accServices)) : Promise.resolve(emptyResult()),
  ]);

  const attachCatalog = (items: any[]) => items.map(item => ({
    ...item,
    catalog: catalogById.get(String(item.catalog_id)) || null,
  }));

  const serviceItemsByOrder = groupBy(attachCatalog(serviceItems), 'service_order_id');
  const decItemsByService = groupBy(attachCatalog(rowsOrThrow(decItemsResult)), 'declare_service_id');
  const accItemsByService = groupBy(attachCatalog(rowsOrThrow(accItemsResult)), 'accept_service_id');
  const servicesById = new Map(services.map(service => [String(service.id), service]));

  const nestedServices = includeServices ? services.map(service => ({
    ...service,
    items: serviceItemsByOrder.get(String(service.id)) || [],
  })) : [];
  const nestedDecServices = decServices.map(decService => ({
    ...decService,
    service_order: servicesById.get(String(decService.service_order_id)) || null,
    items: decItemsByService.get(String(decService.id)) || [],
  }));
  const nestedAccServices = accServices.map(accService => ({
    ...accService,
    service_order: servicesById.get(String(accService.service_order_id)) || null,
    items: accItemsByService.get(String(accService.id)) || [],
  }));

  const decServicesByOrder = groupBy(nestedDecServices, 'declare_id');
  const accServicesByOrder = groupBy(nestedAccServices, 'accept_id');

  nestedServices.forEach(service => output[service.project_id]?.services.push(service));
  declares.forEach(declareOrder => output[declareOrder.project_id]?.declares.push({
    ...declareOrder,
    dServices: decServicesByOrder.get(String(declareOrder.id)) || [],
  }));
  accepts.forEach(acceptOrder => output[acceptOrder.project_id]?.accepts.push({
    ...acceptOrder,
    aServices: accServicesByOrder.get(String(acceptOrder.id)) || [],
  }));

  return output;
};
