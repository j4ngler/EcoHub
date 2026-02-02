import {
  PrismaClient,
  RoleName,
  CarrierStatus,
  Prisma,
  OrderStatus,
  PaymentStatus,
  VideoProcessingStatus,
  TrackingCodePosition,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // ============================================
  // SEED ROLES
  // ============================================
  console.log('📝 Creating roles...');
  
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
  ]);

  console.log(`✅ Created ${roles.length} roles`);

  // ============================================
  // SEED PERMISSIONS
  // ============================================
  console.log('📝 Creating permissions...');

  const permissionData = [
    // User management
    { name: 'users.view', description: 'Xem danh sách người dùng', module: 'users' },
    { name: 'users.create', description: 'Tạo người dùng mới', module: 'users' },
    { name: 'users.update', description: 'Cập nhật người dùng', module: 'users' },
    { name: 'users.delete', description: 'Xóa người dùng', module: 'users' },
    
    // Order management
    { name: 'orders.view', description: 'Xem đơn hàng', module: 'orders' },
    { name: 'orders.create', description: 'Tạo đơn hàng', module: 'orders' },
    { name: 'orders.update', description: 'Cập nhật đơn hàng', module: 'orders' },
    { name: 'orders.delete', description: 'Xóa/hủy đơn hàng', module: 'orders' },
    { name: 'orders.status', description: 'Cập nhật trạng thái đơn hàng', module: 'orders' },
    
    // Product management
    { name: 'products.view', description: 'Xem sản phẩm', module: 'products' },
    { name: 'products.create', description: 'Thêm sản phẩm', module: 'products' },
    { name: 'products.update', description: 'Cập nhật sản phẩm', module: 'products' },
    { name: 'products.delete', description: 'Xóa sản phẩm', module: 'products' },
    
    // Video management
    { name: 'videos.view', description: 'Xem video', module: 'videos' },
    { name: 'videos.upload', description: 'Tải video lên', module: 'videos' },
    { name: 'videos.approve', description: 'Phê duyệt video', module: 'videos' },
    { name: 'videos.delete', description: 'Xóa video', module: 'videos' },
    
    // Reports
    { name: 'reports.view', description: 'Xem báo cáo', module: 'reports' },
    { name: 'reports.export', description: 'Xuất báo cáo', module: 'reports' },
    
    // Settings
    { name: 'settings.view', description: 'Xem cài đặt', module: 'settings' },
    { name: 'settings.update', description: 'Cập nhật cài đặt', module: 'settings' },
    
    // Shipping
    { name: 'shipping.view', description: 'Xem vận chuyển', module: 'shipping' },
    { name: 'shipping.manage', description: 'Quản lý vận chuyển', module: 'shipping' },
    
    // Returns
    { name: 'returns.view', description: 'Xem hoàn trả', module: 'returns' },
    { name: 'returns.process', description: 'Xử lý hoàn trả', module: 'returns' },
  ];

  const permissions = await Promise.all(
    permissionData.map((p) =>
      prisma.permission.upsert({
        where: { name: p.name },
        update: {},
        create: p,
      })
    )
  );

  console.log(`✅ Created ${permissions.length} permissions`);

  // ============================================
  // SEED ROLE-PERMISSIONS
  // ============================================
  console.log('📝 Assigning permissions to roles...');

  const superAdminRole = roles.find(r => r.name === RoleName.super_admin)!;
  const adminRole = roles.find(r => r.name === RoleName.admin)!;
  const staffRole = roles.find(r => r.name === RoleName.staff)!;
  const customerServiceRole = roles.find(r => r.name === RoleName.customer_service)!;
  const customerRole = roles.find(r => r.name === RoleName.customer)!;

  // Super Admin gets all permissions
  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: superAdminRole.id,
        permissionId: permission.id,
      },
    });
  }

  // Admin permissions
  const adminPermissions = permissions.filter(p => 
    !p.name.startsWith('settings.') || p.name === 'settings.view'
  );
  for (const permission of adminPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: permission.id,
      },
    });
  }

  // Staff permissions
  const staffPermissions = permissions.filter(p => 
    ['orders.view', 'orders.status', 'products.view', 'products.create', 'products.update',
     'videos.view', 'videos.upload'].includes(p.name)
  );
  for (const permission of staffPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: staffRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: staffRole.id,
        permissionId: permission.id,
      },
    });
  }

  // Customer Service (Nhân viên chăm sóc khách hàng): xem đơn, cập nhật trạng thái đơn, xem/xử lý hoàn trả, xem sản phẩm, xem video
  const customerServicePermissions = permissions.filter(p => 
    ['orders.view', 'orders.status', 'products.view', 'videos.view',
     'returns.view', 'returns.process', 'shipping.view'].includes(p.name)
  );
  for (const permission of customerServicePermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: customerServiceRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: customerServiceRole.id,
        permissionId: permission.id,
      },
    });
  }

  // Customer permissions
  const customerPermissions = permissions.filter(p => 
    ['orders.view', 'videos.view', 'returns.view'].includes(p.name)
  );
  for (const permission of customerPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: customerRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: customerRole.id,
        permissionId: permission.id,
      },
    });
  }

  console.log('✅ Assigned permissions to roles');

  // ============================================
  // SEED SALES CHANNELS
  // ============================================
  console.log('📝 Creating sales channels...');

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
    channelsData.map((c) =>
      prisma.salesChannel.upsert({
        where: { code: c.code },
        update: {},
        create: c,
      })
    )
  );

  console.log(`✅ Created ${channels.length} sales channels`);

  // ============================================
  // SEED SHIPPING CARRIERS
  // ============================================
  console.log('📝 Creating shipping carriers...');

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
    { code: 'TNH', name: 'Tủ Nhận Hàng', isBulkySupported: false },
    { code: 'SWIFTX', name: 'SwiftX', isBulkySupported: false },
  ];

  const carriers = await Promise.all(
    carriersData.map((c) =>
      prisma.shippingCarrier.upsert({
        where: { code: c.code },
        update: {},
        create: {
          code: c.code,
          name: c.name,
          isBulkySupported: c.isBulkySupported,
          status: CarrierStatus.active,
        },
      })
    )
  );

  console.log(`✅ Created ${carriers.length} shipping carriers`);

  // ============================================
  // SEED SUPER ADMIN USER
  // ============================================
  console.log('📝 Creating super admin user...');

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

  // Check if userRole already exists
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

  console.log('✅ Created super admin user');
  console.log('   Email: admin@ecohub.vn');
  console.log('   Password: Admin@123');

  // ============================================
  // SEED DEMO SHOP + SAMPLE DATA
  // ============================================
  console.log('🧪 Creating demo shop & sample data...');

  // Create demo admin (shop owner)
  const adminPasswordHash = await bcrypt.hash('Admin@123', 12);
  const demoAdmin = await prisma.user.upsert({
    where: { email: 'admin.demo@ecohub.vn' },
    update: {
      fullName: 'Admin Demo',
      phone: '0911111111',
      status: 'active',
      emailVerified: true,
    },
    create: {
      username: 'admindemo',
      email: 'admin.demo@ecohub.vn',
      passwordHash: adminPasswordHash,
      fullName: 'Admin Demo',
      phone: '0911111111',
      status: 'active',
      emailVerified: true,
    },
  });

  // Create demo shop owned by admin demo
  const demoShop = await prisma.shop.upsert({
    where: { code: 'ECOHUB_DEMO' },
    update: {
      name: 'EcoHub Demo Shop',
      ownerId: demoAdmin.id,
      address: 'TP.HCM',
      phone: '0280000000',
      email: 'shop.demo@ecohub.vn',
    },
    create: {
      code: 'ECOHUB_DEMO',
      name: 'EcoHub Demo Shop',
      ownerId: demoAdmin.id,
      address: 'TP.HCM',
      phone: '0280000000',
      email: 'shop.demo@ecohub.vn',
      status: 'active',
    },
  });

  // Assign admin role scoped to demo shop
  const existingAdminRole = await prisma.userRole.findFirst({
    where: { userId: demoAdmin.id, roleId: adminRole.id, shopId: demoShop.id },
  });
  if (!existingAdminRole) {
    await prisma.userRole.create({
      data: {
        userId: demoAdmin.id,
        roleId: adminRole.id,
        shopId: demoShop.id,
        assignedBy: superAdmin.id,
      },
    });
  }

  // Create demo staff
  const staffPasswordHash = await bcrypt.hash('Staff@123', 12);
  const demoStaff = await prisma.user.upsert({
    where: { email: 'staff.demo@ecohub.vn' },
    update: {
      fullName: 'Nhân viên Demo',
      phone: '0922222222',
      status: 'active',
      emailVerified: true,
    },
    create: {
      username: 'staffdemo',
      email: 'staff.demo@ecohub.vn',
      passwordHash: staffPasswordHash,
      fullName: 'Nhân viên Demo',
      phone: '0922222222',
      status: 'active',
      emailVerified: true,
    },
  });

  const existingStaffRole = await prisma.userRole.findFirst({
    where: { userId: demoStaff.id, roleId: staffRole.id, shopId: demoShop.id },
  });
  if (!existingStaffRole) {
    await prisma.userRole.create({
      data: {
        userId: demoStaff.id,
        roleId: staffRole.id,
        shopId: demoShop.id,
        assignedBy: demoAdmin.id,
      },
    });
  }

  // Create demo customer
  const customerPasswordHash = await bcrypt.hash('Customer@123', 12);
  const demoCustomer = await prisma.user.upsert({
    where: { email: 'customer.demo@ecohub.vn' },
    update: {
      fullName: 'Khách hàng Demo',
      phone: '0933333333',
      status: 'active',
      emailVerified: true,
    },
    create: {
      username: 'customerdemo',
      email: 'customer.demo@ecohub.vn',
      passwordHash: customerPasswordHash,
      fullName: 'Khách hàng Demo',
      phone: '0933333333',
      status: 'active',
      emailVerified: true,
    },
  });

  const existingCustomerRole = await prisma.userRole.findFirst({
    where: { userId: demoCustomer.id, roleId: customerRole.id, shopId: demoShop.id },
  });
  if (!existingCustomerRole) {
    await prisma.userRole.create({
      data: {
        userId: demoCustomer.id,
        roleId: customerRole.id,
        shopId: demoShop.id,
        assignedBy: demoAdmin.id,
      },
    });
  }

  // Create default warehouse for demo shop
  await prisma.warehouse.upsert({
    where: { shopId_code: { shopId: demoShop.id, code: 'WH_DEMO' } },
    update: {
      name: 'Kho Demo',
      isDefault: true,
      address: 'TP.HCM',
      contactPhone: '0280000000',
      status: 'active',
    },
    create: {
      shopId: demoShop.id,
      code: 'WH_DEMO',
      name: 'Kho Demo',
      isDefault: true,
      address: 'TP.HCM',
      contactPhone: '0280000000',
      status: 'active',
    },
  });

  // Create product categories (idempotent)
  const ensureCategory = async (name: string) => {
    const existing = await prisma.productCategory.findFirst({
      where: { shopId: demoShop.id, name },
    });
    if (existing) return existing;
    return prisma.productCategory.create({ data: { shopId: demoShop.id, name, level: 1 } });
  };

  const catElectronics = await ensureCategory('Thiết bị');
  const catGreen = await ensureCategory('Eco/Green');

  // Create products (upsert by [shopId, sku])
  const products = await Promise.all([
    prisma.product.upsert({
      where: { shopId_sku: { shopId: demoShop.id, sku: 'ECO-LED-9W' } },
      update: {
        name: 'Bóng đèn LED 9W tiết kiệm điện',
        price: new Prisma.Decimal('80000'),
        costPrice: new Prisma.Decimal('50000'),
        stockQuantity: 500,
        minStockLevel: 50,
        categoryId: catGreen.id,
        status: 'active',
        createdBy: demoAdmin.id,
      },
      create: {
        shopId: demoShop.id,
        sku: 'ECO-LED-9W',
        name: 'Bóng đèn LED 9W tiết kiệm điện',
        description: 'Tiết kiệm điện, tuổi thọ cao.',
        price: new Prisma.Decimal('80000'),
        costPrice: new Prisma.Decimal('50000'),
        stockQuantity: 500,
        minStockLevel: 50,
        categoryId: catGreen.id,
        status: 'active',
        createdBy: demoAdmin.id,
      },
    }),
    prisma.product.upsert({
      where: { shopId_sku: { shopId: demoShop.id, sku: 'SOLAR-200W' } },
      update: {
        name: 'Pin năng lượng mặt trời 200W',
        price: new Prisma.Decimal('1500000'),
        costPrice: new Prisma.Decimal('1200000'),
        stockQuantity: 150,
        minStockLevel: 20,
        categoryId: catElectronics.id,
        status: 'active',
        createdBy: demoAdmin.id,
      },
      create: {
        shopId: demoShop.id,
        sku: 'SOLAR-200W',
        name: 'Pin năng lượng mặt trời 200W',
        description: 'Tấm pin hiệu suất cao cho hệ thống dân dụng.',
        price: new Prisma.Decimal('1500000'),
        costPrice: new Prisma.Decimal('1200000'),
        stockQuantity: 150,
        minStockLevel: 20,
        categoryId: catElectronics.id,
        status: 'active',
        createdBy: demoAdmin.id,
      },
    }),
    prisma.product.upsert({
      where: { shopId_sku: { shopId: demoShop.id, sku: 'RECYCLE-BIN-3' } },
      update: {
        name: 'Thùng rác tái chế 3 ngăn',
        price: new Prisma.Decimal('450000'),
        costPrice: new Prisma.Decimal('300000'),
        stockQuantity: 120,
        minStockLevel: 15,
        categoryId: catGreen.id,
        status: 'active',
        createdBy: demoAdmin.id,
      },
      create: {
        shopId: demoShop.id,
        sku: 'RECYCLE-BIN-3',
        name: 'Thùng rác tái chế 3 ngăn',
        description: 'Phân loại rác tại nguồn.',
        price: new Prisma.Decimal('450000'),
        costPrice: new Prisma.Decimal('300000'),
        stockQuantity: 120,
        minStockLevel: 15,
        categoryId: catGreen.id,
        status: 'active',
        createdBy: demoAdmin.id,
      },
    }),
  ]);

  // Pick one channel & carrier for demo orders
  const demoChannel = await prisma.salesChannel.findUnique({ where: { code: 'shopee' } });
  const demoCarrier = await prisma.shippingCarrier.findUnique({ where: { code: 'GHN' } });

  // Create some orders across statuses (idempotent by unique orderCode)
  const now = Date.now();
  const orderSpecs: Array<{
    code: string;
    status: OrderStatus;
    tracking: string;
    itemIdx: number;
    qty: number;
    cod: string;
  }> = [
    { code: 'DEMO-ORDER-0001', status: OrderStatus.confirmed, tracking: 'GHNDEMO0001', itemIdx: 0, qty: 2, cod: '160000' },
    { code: 'DEMO-ORDER-0002', status: OrderStatus.packing, tracking: 'GHNDEMO0002', itemIdx: 1, qty: 1, cod: '1500000' },
    { code: 'DEMO-ORDER-0003', status: OrderStatus.packed, tracking: 'GHNDEMO0003', itemIdx: 2, qty: 1, cod: '450000' },
    { code: 'DEMO-ORDER-0004', status: OrderStatus.shipped, tracking: 'GHNDEMO0004', itemIdx: 0, qty: 5, cod: '400000' },
    { code: 'DEMO-ORDER-0005', status: OrderStatus.delivered, tracking: 'GHNDEMO0005', itemIdx: 1, qty: 1, cod: '1500000' },
  ];

  const createdOrders = [];
  for (let i = 0; i < orderSpecs.length; i++) {
    const spec = orderSpecs[i];
    const product = products[spec.itemIdx];
    const unitPrice = product.price;
    const totalPrice = new Prisma.Decimal(unitPrice.toString()).mul(spec.qty);

    const order = await prisma.order.upsert({
      where: { orderCode: spec.code },
      update: {
        shopId: demoShop.id,
        customerId: demoCustomer.id,
        customerName: 'Khách hàng Demo',
        customerPhone: demoCustomer.phone || '0933333333',
        customerEmail: demoCustomer.email,
        shippingAddress: 'TP.HCM',
        shippingProvince: 'TP.HCM',
        shippingDistrict: 'Quận 1',
        shippingWard: 'Phường Bến Nghé',
        channelId: demoChannel?.id,
        carrierId: demoCarrier?.id,
        trackingCode: spec.tracking,
        shippingFee: new Prisma.Decimal('30000'),
        codAmount: new Prisma.Decimal(spec.cod),
        subtotal: totalPrice,
        discountAmount: new Prisma.Decimal('0'),
        totalAmount: totalPrice,
        status: spec.status,
        paymentStatus: PaymentStatus.pending,
        createdBy: demoStaff.id,
        notes: 'Đơn demo để hiển thị báo cáo',
      },
      create: {
        shopId: demoShop.id,
        orderCode: spec.code,
        channelId: demoChannel?.id,
        carrierId: demoCarrier?.id,
        channelOrderId: `SHP-${now}-${i}`,
        customerId: demoCustomer.id,
        customerName: 'Khách hàng Demo',
        customerPhone: demoCustomer.phone || '0933333333',
        customerEmail: demoCustomer.email,
        shippingAddress: 'TP.HCM',
        shippingProvince: 'TP.HCM',
        shippingDistrict: 'Quận 1',
        shippingWard: 'Phường Bến Nghé',
        trackingCode: spec.tracking,
        shippingFee: new Prisma.Decimal('30000'),
        codAmount: new Prisma.Decimal(spec.cod),
        subtotal: totalPrice,
        discountAmount: new Prisma.Decimal('0'),
        totalAmount: totalPrice,
        status: spec.status,
        paymentStatus: PaymentStatus.pending,
        paymentMethod: 'COD',
        createdBy: demoStaff.id,
        notes: 'Đơn demo để hiển thị báo cáo',
      },
    });

    // Ensure order item exists (simple approach: delete+recreate if needed)
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        quantity: spec.qty,
        unitPrice: unitPrice,
        totalPrice: totalPrice,
      },
    });

    createdOrders.push(order);
  }

  // Create some package videos for some orders
  const videoOrders = createdOrders.slice(0, 4);
  for (let i = 0; i < videoOrders.length; i++) {
    const o = videoOrders[i];
    const trackingCode = o.trackingCode || `DEMO-${o.orderCode}`;

    // Upsert by unique index? (not defined) -> findFirst then create if missing
    const existingVideo = await prisma.packageVideo.findFirst({
      where: { orderId: o.id },
    });

    if (!existingVideo) {
      await prisma.packageVideo.create({
        data: {
          orderId: o.id,
          trackingCode,
          originalVideoUrl: `/uploads/demo/${o.orderCode}.mp4`,
          originalVideoSize: BigInt(25_000_000),
          originalDuration: 45,
          processedVideoUrl: `/uploads/demo/${o.orderCode}.processed.mp4`,
          processedVideoSize: BigInt(18_000_000),
          thumbnailUrl: `/uploads/demo/${o.orderCode}.jpg`,
          processingStatus: i % 2 === 0 ? VideoProcessingStatus.approved : VideoProcessingStatus.processed,
          trackingCodePosition: i % 2 === 0 ? TrackingCodePosition.bottom_right : TrackingCodePosition.top_left,
          trackingCodeStartTime: 1,
          trackingCodeEndTime: 40,
          recordedBy: demoStaff.id,
          approvedBy: i % 2 === 0 ? demoAdmin.id : null,
          approvedAt: i % 2 === 0 ? new Date() : null,
        },
      });
    }
  }

  console.log('✅ Demo data ready');
  console.log('   Demo Admin: admin.demo@ecohub.vn / Admin@123');
  console.log('   Demo Staff: staff.demo@ecohub.vn / Staff@123');
  console.log('   Demo Customer: customer.demo@ecohub.vn / Customer@123');
  console.log('\n🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
