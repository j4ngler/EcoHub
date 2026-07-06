import { PrismaClient, RoleName, CarrierStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function upsertRolePermissions(roleId: string, permissionIds: string[]) {
  for (const permissionId of permissionIds) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId,
          permissionId,
        },
      },
      update: {},
      create: {
        roleId,
        permissionId,
      },
    });
  }
}

async function main() {
  console.log('Starting seed...');

  console.log('Creating roles...');
  const roles = await Promise.all([
    prisma.role.upsert({
      where: { name: RoleName.super_admin },
      update: {},
      create: {
        name: RoleName.super_admin,
        description: 'Quản trị viên cao nhất, có toàn quyền quản lý hệ thống',
      },
    }),
    prisma.role.upsert({
      where: { name: RoleName.admin },
      update: {},
      create: {
        name: RoleName.admin,
        description: 'Quản trị viên shop, quản lý nhân viên và đơn hàng',
      },
    }),
    prisma.role.upsert({
      where: { name: RoleName.staff },
      update: {},
      create: {
        name: RoleName.staff,
        description: 'Nhân viên đóng gói, quay video và xử lý đơn hàng',
      },
    }),
    prisma.role.upsert({
      where: { name: RoleName.customer_service },
      update: {},
      create: {
        name: RoleName.customer_service,
        description: 'Nhân viên chăm sóc khách hàng, xử lý đơn hàng và hoàn trả',
      },
    }),
    prisma.role.upsert({
      where: { name: RoleName.customer },
      update: {},
      create: {
        name: RoleName.customer,
        description: 'Khách hàng mua hàng',
      },
    }),
    prisma.role.upsert({
      where: { name: RoleName.shipper },
      update: {},
      create: {
        name: RoleName.shipper,
        description: 'Shipper giao hàng, được tra cứu mọi đơn đang giao không phân biệt shop/chủ đơn',
      },
    }),
  ]);
  console.log(`Created ${roles.length} roles`);

  console.log('Creating permissions...');
  const permissionData = [
    { name: 'users.view', description: 'Xem danh sách người dùng', module: 'users' },
    { name: 'users.create', description: 'Tạo người dùng mới', module: 'users' },
    { name: 'users.update', description: 'Cập nhật người dùng', module: 'users' },
    { name: 'users.delete', description: 'Xóa người dùng', module: 'users' },
    { name: 'orders.view', description: 'Xem đơn hàng', module: 'orders' },
    { name: 'orders.create', description: 'Tạo đơn hàng', module: 'orders' },
    { name: 'orders.update', description: 'Cập nhật đơn hàng', module: 'orders' },
    { name: 'orders.delete', description: 'Xóa/hủy đơn hàng', module: 'orders' },
    { name: 'orders.status', description: 'Cập nhật trạng thái đơn hàng', module: 'orders' },
    { name: 'products.view', description: 'Xem sản phẩm', module: 'products' },
    { name: 'products.create', description: 'Thêm sản phẩm', module: 'products' },
    { name: 'products.update', description: 'Cập nhật sản phẩm', module: 'products' },
    { name: 'products.delete', description: 'Xóa sản phẩm', module: 'products' },
    { name: 'videos.view', description: 'Xem video', module: 'videos' },
    { name: 'videos.upload', description: 'Tải video lên', module: 'videos' },
    { name: 'videos.approve', description: 'Phê duyệt video', module: 'videos' },
    { name: 'videos.delete', description: 'Xóa video', module: 'videos' },
    { name: 'reports.view', description: 'Xem báo cáo', module: 'reports' },
    { name: 'reports.export', description: 'Xuất báo cáo', module: 'reports' },
    { name: 'settings.view', description: 'Xem cài đặt', module: 'settings' },
    { name: 'settings.update', description: 'Cập nhật cài đặt', module: 'settings' },
    { name: 'shipping.view', description: 'Xem vận chuyển', module: 'shipping' },
    { name: 'shipping.manage', description: 'Quản lý vận chuyển', module: 'shipping' },
    { name: 'returns.view', description: 'Xem hoàn trả', module: 'returns' },
    { name: 'returns.process', description: 'Xử lý hoàn trả', module: 'returns' },
  ];

  const permissions = await Promise.all(
    permissionData.map((permission) =>
      prisma.permission.upsert({
        where: { name: permission.name },
        update: {},
        create: permission,
      })
    )
  );
  console.log(`Created ${permissions.length} permissions`);

  console.log('Assigning permissions to roles...');
  const superAdminRole = roles.find((role) => role.name === RoleName.super_admin)!;
  const adminRole = roles.find((role) => role.name === RoleName.admin)!;
  const staffRole = roles.find((role) => role.name === RoleName.staff)!;
  const customerServiceRole = roles.find((role) => role.name === RoleName.customer_service)!;
  const customerRole = roles.find((role) => role.name === RoleName.customer)!;
  const shipperRole = roles.find((role) => role.name === RoleName.shipper)!;

  await upsertRolePermissions(
    superAdminRole.id,
    permissions.map((permission) => permission.id)
  );

  await upsertRolePermissions(
    adminRole.id,
    permissions
      .filter((permission) => !permission.name.startsWith('settings.') || permission.name === 'settings.view')
      .map((permission) => permission.id)
  );

  await upsertRolePermissions(
    staffRole.id,
    permissions
      .filter((permission) =>
        [
          'orders.view',
          'orders.status',
          'products.view',
          'products.create',
          'products.update',
          'videos.view',
          'videos.upload',
          'settings.view',
          'settings.update',
        ].includes(permission.name)
      )
      .map((permission) => permission.id)
  );

  await upsertRolePermissions(
    customerServiceRole.id,
    permissions
      .filter((permission) =>
        ['orders.view', 'orders.status', 'products.view', 'videos.view', 'returns.view', 'returns.process', 'shipping.view'].includes(
          permission.name
        )
      )
      .map((permission) => permission.id)
  );

  await upsertRolePermissions(
    customerRole.id,
    permissions
      .filter((permission) => ['orders.view', 'videos.view', 'returns.view'].includes(permission.name))
      .map((permission) => permission.id)
  );

  await upsertRolePermissions(
    shipperRole.id,
    permissions
      .filter((permission) => ['orders.view', 'videos.view', 'shipping.view'].includes(permission.name))
      .map((permission) => permission.id)
  );
  console.log('Assigned permissions to roles');

  console.log('Creating sales channels...');
  const channelsData = [
    { code: 'tiktok', name: 'TikTok Shop' },
    { code: 'shopee', name: 'Shopee' },
    { code: 'shopify', name: 'Shopify' },
    { code: 'lazada', name: 'Lazada' },
    { code: 'pancake', name: 'Pancake' },
    { code: 'kiot', name: 'Kiot' },
    { code: 'haravan', name: 'Haravan' },
    { code: 'sapo', name: 'Sapo' },
    { code: 'sapo_omni', name: 'SapoOmni' },
    { code: 'nhanh', name: 'Nhanh' },
  ];

  const channels = await Promise.all(
    channelsData.map((channel) =>
      prisma.salesChannel.upsert({
        where: { code: channel.code },
        update: {},
        create: channel,
      })
    )
  );
  console.log(`Created ${channels.length} sales channels`);

  console.log('Creating shipping carriers...');
  const carriersData = [
    { code: 'GHN', name: 'Giao Hàng Nhanh', isBulkySupported: false },
    { code: 'GHN_CK', name: 'GHN - Cồng Kềnh', isBulkySupported: true },
    { code: 'GHTK', name: 'GHTK', isBulkySupported: false },
    { code: 'VTP', name: 'ViettelPost', isBulkySupported: false },
    { code: 'VTP_CK', name: 'VTP - Hàng Cồng Kềnh', isBulkySupported: true },
    { code: 'SPX', name: 'SPX Express', isBulkySupported: false },
    { code: 'SPX_HCK', name: 'SPX - Hàng Cồng Kềnh', isBulkySupported: true },
    { code: 'SPX_TN', name: 'SPX Express - Giao Trong Ngày', isBulkySupported: false },
    { code: 'JT', name: 'J&T Express', isBulkySupported: false },
    { code: 'JTVN', name: 'J&T VN', isBulkySupported: false },
    { code: 'NJV', name: 'NinjaVan', isBulkySupported: false },
    { code: 'NJV_HK', name: 'NJV - Hàng Cồng Kềnh', isBulkySupported: true },
    { code: 'BEST', name: 'BEST Express', isBulkySupported: false },
    { code: 'AHAMOVE', name: 'Ahamove', isBulkySupported: false },
    { code: 'AHAMOVE_TN', name: 'Ahamove - Giao Trong Ngày', isBulkySupported: false },
    { code: 'GRAB', name: 'GrabExpress', isBulkySupported: false },
    { code: 'BE', name: 'beDelivery', isBulkySupported: false },
    { code: 'VNP_NHANH', name: 'VNPost Nhanh', isBulkySupported: false },
    { code: 'VNP_TK', name: 'VNPost Tiết Kiệm', isBulkySupported: false },
    { code: 'NTL', name: 'Nhất Tín Logistics', isBulkySupported: false },
    { code: 'LEX', name: 'LEX VN', isBulkySupported: false },
    { code: 'HOA_TOC', name: 'Hỏa Tốc', isBulkySupported: false },
    { code: 'HOA_TOC_4H', name: 'Hỏa Tốc - 4 Giờ', isBulkySupported: false },
    { code: 'SIEU_TOC_4H', name: 'Siêu Tốc - 4 Giờ', isBulkySupported: false },
    { code: 'TNH', name: 'Tự Nhận Hàng', isBulkySupported: false },
    { code: 'SWIFTX', name: 'SwiftX', isBulkySupported: false },
  ];

  const carriers = await Promise.all(
    carriersData.map((carrier) =>
      prisma.shippingCarrier.upsert({
        where: { code: carrier.code },
        update: {},
        create: {
          code: carrier.code,
          name: carrier.name,
          isBulkySupported: carrier.isBulkySupported,
          status: CarrierStatus.active,
        },
      })
    )
  );
  console.log(`Created ${carriers.length} shipping carriers`);

  console.log('Creating bootstrap admin user...');
  const hashedPassword = await bcrypt.hash('Admin@123', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@ecohub.vn' },
    update: {},
    create: {
      username: 'superadmin',
      email: 'admin@ecohub.vn',
      passwordHash: hashedPassword,
      fullName: 'Super Administrator',
      phone: '0900000000',
      status: 'active',
      emailVerified: true,
    },
  });

  const existingUserRole = await prisma.userRole.findFirst({
    where: {
      userId: superAdmin.id,
      roleId: superAdminRole.id,
      shopId: null,
    },
  });

  if (!existingUserRole) {
    await prisma.userRole.create({
      data: {
        userId: superAdmin.id,
        roleId: superAdminRole.id,
        shopId: null,
      },
    });
  }

  console.log('Created bootstrap admin user');
  console.log('   Email: admin@ecohub.vn');
  console.log('   Password: Admin@123');
  console.log('\nSeed completed successfully!');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
