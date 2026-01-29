import prisma from '../../config/database';
import { notFound } from '../../middlewares/error.middleware';

export const getCarriers = async () => {
  const carriers = await prisma.shippingCarrier.findMany({
    where: { status: 'active' },
    orderBy: { name: 'asc' },
  });

  return carriers;
};

export const getCarrierById = async (id: string) => {
  const carrier = await prisma.shippingCarrier.findUnique({
    where: { id },
  });

  if (!carrier) {
    throw notFound('Không tìm thấy hãng vận chuyển');
  }

  return carrier;
};

interface CalculateFeeParams {
  carrierId?: string;
  fromProvince: string;
  fromDistrict: string;
  toProvince: string;
  toDistrict: string;
  weight: number; // kg
  length?: number; // cm
  width?: number;
  height?: number;
  codAmount?: number;
}

export const calculateFee = async (params: CalculateFeeParams) => {
  // Get all active carriers or specific carrier
  const where: any = { status: 'active' };
  if (params.carrierId) {
    where.id = params.carrierId;
  }

  const carriers = await prisma.shippingCarrier.findMany({ where });

  // Calculate fees for each carrier
  // This is a simplified calculation - in production, you would call each carrier's API
  const fees = carriers.map(carrier => {
    // Base fee calculation (simplified)
    let baseFee = Number(carrier.baseShippingFee) || 20000;
    
    // Weight-based fee (simplified: 5000 VND per kg)
    const weightFee = Math.ceil(params.weight) * 5000;
    
    // Volume weight calculation
    let volumeWeight = 0;
    if (params.length && params.width && params.height) {
      volumeWeight = (params.length * params.width * params.height) / 6000;
    }
    
    // Use higher of actual weight or volume weight
    const chargeableWeight = Math.max(params.weight, volumeWeight);
    const totalWeightFee = Math.ceil(chargeableWeight) * 5000;

    // COD fee (simplified: 1% of COD amount, min 10000)
    let codFee = 0;
    if (params.codAmount) {
      codFee = Math.max(params.codAmount * 0.01, 10000);
    }

    const totalFee = baseFee + totalWeightFee + codFee;

    return {
      carrierId: carrier.id,
      carrierCode: carrier.code,
      carrierName: carrier.name,
      baseFee,
      weightFee: totalWeightFee,
      codFee,
      totalFee: Math.round(totalFee),
      estimatedDelivery: '2-3 ngày', // Simplified
    };
  });

  return fees.sort((a, b) => a.totalFee - b.totalFee);
};

export const trackShipment = async (trackingCode: string) => {
  // First check our database
  const order = await prisma.order.findFirst({
    where: { trackingCode },
    include: {
      carrier: true,
      statusHistory: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!order) {
    throw notFound('Không tìm thấy đơn hàng với mã vận đơn này');
  }

  // In production, you would also call the carrier's API to get real-time tracking
  // For now, return our internal status history
  return {
    trackingCode,
    carrier: order.carrier ? {
      code: order.carrier.code,
      name: order.carrier.name,
    } : null,
    currentStatus: order.status,
    history: order.statusHistory.map(h => ({
      status: h.status,
      note: h.note,
      timestamp: h.createdAt,
    })),
  };
};

export const getShopCarrierSettings = async (shopId: string) => {
  const settings = await prisma.shopCarrierSetting.findMany({
    where: { shopId },
    include: {
      carrier: true,
    },
  });

  return settings;
};

interface SaveCarrierSettingParams {
  shopId: string;
  carrierId: string;
  apiKey?: string;
  apiSecret?: string;
  shopCarrierId?: string;
  isDefault?: boolean;
}

export const saveShopCarrierSetting = async (params: SaveCarrierSettingParams) => {
  // If setting as default, unset other defaults
  if (params.isDefault) {
    await prisma.shopCarrierSetting.updateMany({
      where: { shopId: params.shopId },
      data: { isDefault: false },
    });
  }

  const setting = await prisma.shopCarrierSetting.upsert({
    where: {
      shopId_carrierId: {
        shopId: params.shopId,
        carrierId: params.carrierId,
      },
    },
    update: {
      apiKey: params.apiKey,
      apiSecret: params.apiSecret,
      shopCarrierId: params.shopCarrierId,
      isDefault: params.isDefault,
    },
    create: {
      shopId: params.shopId,
      carrierId: params.carrierId,
      apiKey: params.apiKey,
      apiSecret: params.apiSecret,
      shopCarrierId: params.shopCarrierId,
      isDefault: params.isDefault || false,
    },
    include: {
      carrier: true,
    },
  });

  return setting;
};
