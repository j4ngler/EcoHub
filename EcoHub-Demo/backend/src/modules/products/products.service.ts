import prisma from '../../config/database';
import { notFound, conflict, badRequest } from '../../middlewares/error.middleware';
import { getPagination } from '../../utils/helpers';
import { CreateProductDto, UpdateProductDto } from './products.dto';

interface GetProductsParams {
  page: number;
  limit: number;
  search?: string;
  shopId?: string;
  categoryId?: string;
  status?: string;
}

export const getProducts = async (params: GetProductsParams) => {
  const { page, limit, skip } = getPagination(params.page, params.limit);

  const where: any = {};

  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { sku: { contains: params.search, mode: 'insensitive' } },
      { barcode: { contains: params.search } },
    ];
  }

  if (params.shopId) {
    where.shopId = params.shopId;
  }

  if (params.categoryId) {
    where.categoryId = params.categoryId;
  }

  if (params.status) {
    where.status = params.status;
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        shop: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, name: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products,
    total,
    page,
    limit,
  };
};

export const getProductById = async (id: string) => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      shop: true,
      category: true,
      creator: { select: { id: true, fullName: true } },
    },
  });

  if (!product) {
    throw notFound('Không tìm thấy sản phẩm');
  }

  return product;
};

export const createProduct = async (data: CreateProductDto, createdBy: string) => {
  // Check SKU uniqueness within shop
  const existingSku = await prisma.product.findFirst({
    where: { shopId: data.shopId, sku: data.sku },
  });

  if (existingSku) {
    throw conflict('SKU đã tồn tại trong shop này');
  }

  const product = await prisma.product.create({
    data: {
      shopId: data.shopId,
      categoryId: data.categoryId,
      sku: data.sku,
      name: data.name,
      description: data.description,
      price: data.price,
      costPrice: data.costPrice,
      weight: data.weight,
      length: data.length,
      width: data.width,
      height: data.height,
      stockQuantity: data.stockQuantity || 0,
      minStockLevel: data.minStockLevel || 0,
      barcode: data.barcode,
      images: data.images,
      createdBy,
    },
  });

  return getProductById(product.id);
};

export const updateProduct = async (id: string, data: UpdateProductDto) => {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    throw notFound('Không tìm thấy sản phẩm');
  }

  // Check SKU uniqueness if changed
  if (data.sku && data.sku !== product.sku) {
    const existingSku = await prisma.product.findFirst({
      where: { shopId: product.shopId, sku: data.sku, NOT: { id } },
    });
    if (existingSku) {
      throw conflict('SKU đã tồn tại trong shop này');
    }
  }

  await prisma.product.update({
    where: { id },
    data: {
      categoryId: data.categoryId,
      sku: data.sku,
      name: data.name,
      description: data.description,
      price: data.price,
      costPrice: data.costPrice,
      weight: data.weight,
      length: data.length,
      width: data.width,
      height: data.height,
      minStockLevel: data.minStockLevel,
      barcode: data.barcode,
      images: data.images,
      status: data.status,
    },
  });

  return getProductById(id);
};

export const deleteProduct = async (id: string) => {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    throw notFound('Không tìm thấy sản phẩm');
  }

  await prisma.product.delete({ where: { id } });
};

export const updateStock = async (
  id: string,
  quantity: number,
  type: 'set' | 'add' | 'subtract'
) => {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    throw notFound('Không tìm thấy sản phẩm');
  }

  let newQuantity: number;
  switch (type) {
    case 'set':
      newQuantity = quantity;
      break;
    case 'add':
      newQuantity = product.stockQuantity + quantity;
      break;
    case 'subtract':
      newQuantity = product.stockQuantity - quantity;
      if (newQuantity < 0) {
        throw badRequest('Số lượng tồn kho không đủ');
      }
      break;
    default:
      throw badRequest('Loại cập nhật không hợp lệ');
  }

  // Update status based on stock
  let status = product.status;
  if (newQuantity === 0 && product.status === 'active') {
    status = 'out_of_stock';
  } else if (newQuantity > 0 && product.status === 'out_of_stock') {
    status = 'active';
  }

  await prisma.product.update({
    where: { id },
    data: { stockQuantity: newQuantity, status },
  });

  return getProductById(id);
};

export const getCategories = async (shopId?: string) => {
  const where: any = {};
  if (shopId) {
    where.shopId = shopId;
  }

  const categories = await prisma.productCategory.findMany({
    where,
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
    include: {
      parent: { select: { id: true, name: true } },
      _count: { select: { products: true } },
    },
  });

  return categories;
};

export const createCategory = async (data: { shopId: string; name: string; parentId?: string }) => {
  let level = 1;
  if (data.parentId) {
    const parent = await prisma.productCategory.findUnique({
      where: { id: data.parentId },
    });
    if (parent) {
      level = parent.level + 1;
    }
  }

  const category = await prisma.productCategory.create({
    data: {
      shopId: data.shopId,
      name: data.name,
      parentId: data.parentId,
      level,
    },
  });

  return category;
};
