import { PrismaClient, RoleName, ChannelStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log("=== Starting Migration to PostgreSQL ===");
  
  const migrationDataPath = path.join(__dirname, 'migration_data.json');
  if (!fs.existsSync(migrationDataPath)) {
    console.error("migration_data.json not found!");
    process.exit(1);
  }

  const rawData = fs.readFileSync(migrationDataPath, 'utf8');
  const data = JSON.parse(rawData);

  // 1. Find or create the target Shop (ECOHUB_DEMO)
  let shop = await prisma.shop.findUnique({
    where: { code: 'ECOHUB_DEMO' }
  });

  if (!shop) {
    console.log("Shop ECOHUB_DEMO not found. Creating it...");
    const superadmin = await prisma.user.findUnique({
      where: { email: 'admin@ecohub.vn' }
    });
    if (!superadmin) {
      throw new Error("Superadmin user not found in PostgreSQL. Run database seed first!");
    }
    shop = await prisma.shop.create({
      data: {
        name: 'EcoHub Demo Shop',
        code: 'ECOHUB_DEMO',
        ownerId: superadmin.id,
        status: 'active'
      }
    });
    console.log(`Created shop: ${shop.name} (${shop.code})`);
  } else {
    console.log(`Using existing shop: ${shop.name} (${shop.code})`);
  }

  // 2. Fetch roles
  const roles = await prisma.role.findMany();
  const adminRole = roles.find(r => r.name === RoleName.admin);
  const staffRole = roles.find(r => r.name === RoleName.staff);

  if (!adminRole || !staffRole) {
    throw new Error("Required roles (admin, staff) not found in PostgreSQL database!");
  }

  // 3. Create/Update 'admin' user
  const adminPasswordHash = await bcrypt.hash('123456', 12);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@demo-ecohub.local' },
    update: {
      fullName: 'EcoHub Local Admin',
      passwordHash: adminPasswordHash,
      status: 'active'
    },
    create: {
      username: 'admin',
      email: 'admin@demo-ecohub.local',
      passwordHash: adminPasswordHash,
      fullName: 'EcoHub Local Admin',
      status: 'active'
    }
  });
  console.log(`Upserted user: admin (${adminUser.id})`);

  // Link admin user to ECOHUB_DEMO shop with 'admin' role
  await prisma.userRole.upsert({
    where: {
      userId_roleId_shopId: {
        userId: adminUser.id,
        roleId: adminRole.id,
        shopId: shop.id
      }
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
      shopId: shop.id
    }
  });
  console.log("Linked admin user to ECOHUB_DEMO shop as admin.");

  // 4. Create/Update 'staff' user
  const staffPasswordHash = await bcrypt.hash('123456', 12);
  const staffUser = await prisma.user.upsert({
    where: { email: 'staff@demo-ecohub.local' },
    update: {
      fullName: 'EcoHub Staff',
      passwordHash: staffPasswordHash,
      status: 'active'
    },
    create: {
      username: 'staff',
      email: 'staff@demo-ecohub.local',
      passwordHash: staffPasswordHash,
      fullName: 'EcoHub Staff',
      status: 'active'
    }
  });
  console.log(`Upserted user: staff (${staffUser.id})`);

  // Link staff user to ECOHUB_DEMO shop with 'staff' role
  await prisma.userRole.upsert({
    where: {
      userId_roleId_shopId: {
        userId: staffUser.id,
        roleId: staffRole.id,
        shopId: shop.id
      }
    },
    update: {},
    create: {
      userId: staffUser.id,
      roleId: staffRole.id,
      shopId: shop.id
    }
  });
  console.log("Linked staff user to ECOHUB_DEMO shop as staff.");

  // 5. Update TikTok Shop Connection
  const tiktokAuth = data.tiktok_auth;
  if (tiktokAuth) {
    const salesChannel = await prisma.salesChannel.findUnique({
      where: { code: 'tiktok' }
    });

    if (!salesChannel) {
      throw new Error("SalesChannel 'tiktok' not found in PostgreSQL!");
    }

    const farFutureDate = new Date('2030-01-01T00:00:00Z');

    const connection = await prisma.shopChannelConnection.upsert({
      where: {
        shopId_channelId: {
          shopId: shop.id,
          channelId: salesChannel.id
        }
      },
      update: {
        channelShopId: tiktokAuth.shop_id,
        shopIdRemote: tiktokAuth.shop_id,
        merchantId: tiktokAuth.merchant_id,
        shopCipher: tiktokAuth.shop_cipher,
        accessToken: tiktokAuth.access_token,
        refreshToken: tiktokAuth.refresh_token,
        tokenExpiresAt: farFutureDate,
        status: ChannelStatus.connected
      },
      create: {
        shopId: shop.id,
        channelId: salesChannel.id,
        channelShopId: tiktokAuth.shop_id,
        shopIdRemote: tiktokAuth.shop_id,
        merchantId: tiktokAuth.merchant_id,
        shopCipher: tiktokAuth.shop_cipher,
        accessToken: tiktokAuth.access_token,
        refreshToken: tiktokAuth.refresh_token,
        tokenExpiresAt: farFutureDate,
        status: ChannelStatus.connected
      }
    });

    console.log(`Successfully migrated TikTok Shop Connection!`);
    console.log(`- Shop Remote ID: ${connection.shopIdRemote}`);
    console.log(`- Merchant ID: ${connection.merchantId}`);
    console.log(`- Status: ${connection.status}`);
  } else {
    console.log("No tiktok_auth found in migration_data.json. Skipping TikTok sync.");
  }
}

main()
  .catch(e => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
