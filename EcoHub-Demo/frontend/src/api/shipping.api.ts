import api from './axios';

export interface ShippingCarrier {
  id: string;
  code: string;
  name: string;
  logoUrl?: string | null;
  baseShippingFee: number;
  apiBaseUrl?: string | null;
  status: string;
  isBulkySupported?: boolean;
}

export interface ShopCarrierSetting {
  id: string;
  shopId: string;
  carrierId: string;
  apiKey?: string | null;
  apiSecret?: string | null;
  shopCarrierId?: string | null;
  isDefault: boolean;
  status: string;
  carrier?: ShippingCarrier;
}

export interface SaveShopCarrierSettingDto {
  shopId: string;
  carrierId: string;
  apiKey?: string;
  apiSecret?: string;
  shopCarrierId?: string;
  isDefault?: boolean;
}

export const shippingApi = {
  getCarriers: async (): Promise<ShippingCarrier[]> => {
    const res = await api.get('/shipping/carriers');
    return res.data.data;
  },
  getSettings: async (shopId: string): Promise<ShopCarrierSetting[]> => {
    const res = await api.get(`/shipping/settings/${shopId}`);
    return res.data.data;
  },
  saveSetting: async (payload: SaveShopCarrierSettingDto): Promise<ShopCarrierSetting> => {
    const res = await api.post('/shipping/settings', payload);
    return res.data.data;
  },
};
