import fsSync from 'fs';
import path from 'path';
import prisma from '../../config/database';
import { badRequest, notFound } from '../../middlewares/error.middleware';

const LEGACY_JSON_PATH = path.resolve(process.cwd(), 'src/config/barcode_sku_map.json');

let cache: Record<string, string> = {};
let cacheReady = false;

const readLegacyJsonMap = (): Record<string, string> => {
  try {
    if (fsSync.existsSync(LEGACY_JSON_PATH)) {
      return JSON.parse(fsSync.readFileSync(LEGACY_JSON_PATH, 'utf-8'));
    }
  } catch (error) {
    console.error('Failed to read legacy barcode_sku_map.json:', error);
  }
  return {};
};

const seedFromLegacyJsonIfEmpty = async () => {
  const count = await prisma.barcodeMapping.count();
  if (count > 0) return;

  const legacyMap = readLegacyJsonMap();
  const entries = Object.entries(legacyMap);
  if (!entries.length) return;

  await prisma.barcodeMapping.createMany({
    data: entries.map(([barcode, sku]) => ({ barcode, sku })),
    skipDuplicates: true,
  });
  console.log(`Migrated ${entries.length} barcode mapping(s) from legacy barcode_sku_map.json into DB`);
};

export const refreshBarcodeMapCache = async () => {
  const rows = await prisma.barcodeMapping.findMany();
  cache = rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.barcode] = row.sku;
    return acc;
  }, {});
  cacheReady = true;
};

export const initBarcodeMapCache = async () => {
  try {
    await seedFromLegacyJsonIfEmpty();
    await refreshBarcodeMapCache();
  } catch (error) {
    console.error('Failed to initialize barcode mapping cache:', error);
  }
};

export const getBarcodeMapCache = (): Record<string, string> => {
  if (!cacheReady) {
    // Cache chưa kịp nạp từ DB (mới khởi động) — dùng tạm dữ liệu JSON cũ để không mất mapping đang hoạt động.
    return readLegacyJsonMap();
  }
  return cache;
};

export const listBarcodeMappings = () =>
  prisma.barcodeMapping.findMany({ orderBy: { updatedAt: 'desc' } });

const normalizeInput = (barcode: string, sku: string) => {
  const normalizedBarcode = String(barcode || '').trim();
  const normalizedSku = String(sku || '').trim();
  if (!normalizedBarcode) throw badRequest('Vui lòng nhập mã vạch');
  if (!normalizedSku) throw badRequest('Vui lòng nhập SKU nội bộ tương ứng');
  return { normalizedBarcode, normalizedSku };
};

export const createBarcodeMapping = async (payload: { barcode: string; sku: string; note?: string }) => {
  const { normalizedBarcode, normalizedSku } = normalizeInput(payload.barcode, payload.sku);

  const existing = await prisma.barcodeMapping.findUnique({ where: { barcode: normalizedBarcode } });
  if (existing) throw badRequest('Mã vạch này đã được ánh xạ tới một SKU khác');

  const mapping = await prisma.barcodeMapping.create({
    data: { barcode: normalizedBarcode, sku: normalizedSku, note: payload.note?.trim() || null },
  });
  await refreshBarcodeMapCache();
  return mapping;
};

export const updateBarcodeMapping = async (
  id: string,
  payload: { barcode: string; sku: string; note?: string }
) => {
  const { normalizedBarcode, normalizedSku } = normalizeInput(payload.barcode, payload.sku);

  const existing = await prisma.barcodeMapping.findUnique({ where: { id } });
  if (!existing) throw notFound('Không tìm thấy ánh xạ mã vạch này');

  const conflict = await prisma.barcodeMapping.findUnique({ where: { barcode: normalizedBarcode } });
  if (conflict && conflict.id !== id) throw badRequest('Mã vạch này đã được ánh xạ tới một SKU khác');

  const mapping = await prisma.barcodeMapping.update({
    where: { id },
    data: { barcode: normalizedBarcode, sku: normalizedSku, note: payload.note?.trim() || null },
  });
  await refreshBarcodeMapCache();
  return mapping;
};

export const deleteBarcodeMapping = async (id: string) => {
  const existing = await prisma.barcodeMapping.findUnique({ where: { id } });
  if (!existing) throw notFound('Không tìm thấy ánh xạ mã vạch này');

  await prisma.barcodeMapping.delete({ where: { id } });
  await refreshBarcodeMapCache();
};
