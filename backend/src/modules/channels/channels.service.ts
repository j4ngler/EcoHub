import prisma from '../../config/database';
import { notFound, badRequest } from '../../middlewares/error.middleware';

export const getChannels = async () => {
  const channels = await prisma.salesChannel.findMany({
    where: { status: 'active' },
    orderBy: { name: 'asc' },
  });

  return channels;
};

export const getChannelById = async (id: string) => {
  const channel = await prisma.salesChannel.findUnique({
    where: { id },
  });

  if (!channel) {
    throw notFound('Không tìm thấy kênh bán hàng');
  }

  return channel;
};

export const getShopConnections = async (shopId: string) => {
  const connections = await prisma.shopChannelConnection.findMany({
    where: { shopId },
    include: {
      channel: true,
    },
  });

  return connections;
};

interface ConnectChannelParams {
  channelId: string;
  shopId: string;
  accessToken?: string;
  refreshToken?: string;
  channelShopId?: string;
}

export const connectChannel = async (params: ConnectChannelParams) => {
  const channel = await prisma.salesChannel.findUnique({
    where: { id: params.channelId },
  });

  if (!channel) {
    throw notFound('Không tìm thấy kênh bán hàng');
  }

  const connection = await prisma.shopChannelConnection.upsert({
    where: {
      shopId_channelId: {
        shopId: params.shopId,
        channelId: params.channelId,
      },
    },
    update: {
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      channelShopId: params.channelShopId,
      status: 'connected',
      lastSyncAt: new Date(),
    },
    create: {
      shopId: params.shopId,
      channelId: params.channelId,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      channelShopId: params.channelShopId,
      status: 'connected',
    },
    include: {
      channel: true,
    },
  });

  return connection;
};

export const disconnectChannel = async (channelId: string, shopId: string) => {
  const connection = await prisma.shopChannelConnection.findUnique({
    where: {
      shopId_channelId: {
        shopId,
        channelId,
      },
    },
  });

  if (!connection) {
    throw notFound('Không tìm thấy kết nối');
  }

  await prisma.shopChannelConnection.update({
    where: { id: connection.id },
    data: {
      status: 'disconnected',
      accessToken: null,
      refreshToken: null,
    },
  });
};

export const syncOrders = async (channelId: string, shopId: string, userId: string) => {
  const connection = await prisma.shopChannelConnection.findUnique({
    where: {
      shopId_channelId: {
        shopId,
        channelId,
      },
    },
    include: { channel: true },
  });

  if (!connection || connection.status !== 'connected') {
    throw badRequest('Kênh chưa được kết nối');
  }

  // Demo sync cho Shopee và TikTok
  if (connection.channel.code === 'shopee') {
    const { syncDemoShopeeOrders } = await import('../../services/demo-channel-sync.service');
    return syncDemoShopeeOrders(shopId, channelId, userId);
  } else if (connection.channel.code === 'tiktok') {
    const { syncDemoTikTokOrders } = await import('../../services/demo-channel-sync.service');
    return syncDemoTikTokOrders(shopId, channelId, userId);
  }

  // In production, you would:
  // 1. Call the channel's API to fetch orders
  // 2. Map the response to our order format
  // 3. Create/update orders in our database

  // For other channels, return mock result
  await prisma.shopChannelConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });

  return {
    channel: connection.channel.name,
    synced: 0,
    created: 0,
    updated: 0,
    failed: 0,
    lastSyncAt: new Date(),
  };
};

export const syncProducts = async (channelId: string, shopId: string, userId: string) => {
  const connection = await prisma.shopChannelConnection.findUnique({
    where: {
      shopId_channelId: {
        shopId,
        channelId,
      },
    },
    include: { channel: true },
  });

  if (!connection || connection.status !== 'connected') {
    throw badRequest('Kênh chưa được kết nối');
  }

  // In production, you would call the channel's API to sync products

  await prisma.shopChannelConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });

  return {
    channel: connection.channel.name,
    synced: 0,
    created: 0,
    updated: 0,
    failed: 0,
    lastSyncAt: new Date(),
  };
};
