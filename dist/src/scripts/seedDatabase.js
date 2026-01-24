"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function seedDatabase() {
    try {
        console.log('🌱 Starting database seeding...');
        // Check if data already exists
        const existingUsers = await prisma.user.count();
        if (existingUsers > 0) {
            console.log('⚠️  Database already contains data. Skipping seeding.');
            return;
        }
        // Create default units
        console.log('📏 Creating default units...');
        const defaultUnits = [
            { name: 'Pieces', symbol: 'pieces', description: 'Count/quantity unit' },
            { name: 'Kilograms', symbol: 'kg', description: 'Weight unit - kilograms' },
            { name: 'Grams', symbol: 'g', description: 'Weight unit - grams' },
            { name: 'Liters', symbol: 'liters', description: 'Volume unit - liters' },
            { name: 'Milliliters', symbol: 'ml', description: 'Volume unit - milliliters' },
            { name: 'Meters', symbol: 'm', description: 'Length unit - meters' },
            { name: 'Centimeters', symbol: 'cm', description: 'Length unit - centimeters' },
            { name: 'Millimeters', symbol: 'mm', description: 'Length unit - millimeters' },
        ];
        // Check if units already exist
        const existingUnits = await prisma.unit.count();
        if (existingUnits === 0) {
            await Promise.all(defaultUnits.map((unit) => prisma.unit.create({
                data: unit,
            })));
            console.log(`✅ Created ${defaultUnits.length} default units.`);
        }
        else {
            console.log('⚠️  Units already exist. Skipping unit creation.');
        }
        // Create sample categories
        console.log('📦 Creating categories...');
        const categories = await Promise.all([
            prisma.category.create({
                data: {
                    name: 'Ice Cream',
                    description: 'Frozen dairy desserts',
                    isActive: true,
                },
            }),
            prisma.category.create({
                data: {
                    name: 'Frozen Yogurt',
                    description: 'Frozen yogurt products',
                    isActive: true,
                },
            }),
            prisma.category.create({
                data: {
                    name: 'Sorbet',
                    description: 'Fruit-based frozen desserts',
                    isActive: true,
                },
            }),
        ]);
        // Create sample flavors
        console.log('🍦 Creating flavors...');
        const flavors = await Promise.all([
            prisma.flavor.create({
                data: {
                    name: 'Vanilla',
                    isActive: true,
                },
            }),
            prisma.flavor.create({
                data: {
                    name: 'Chocolate',
                    isActive: true,
                },
            }),
            prisma.flavor.create({
                data: {
                    name: 'Strawberry',
                    isActive: true,
                },
            }),
            prisma.flavor.create({
                data: {
                    name: 'Mint Chocolate Chip',
                    isActive: true,
                },
            }),
            prisma.flavor.create({
                data: {
                    name: 'Cookies & Cream',
                    isActive: true,
                },
            }),
        ]);
        // Create packaging types
        console.log('📦 Creating packaging types...');
        const packagingTypes = await Promise.all([
            prisma.packagingType.create({
                data: {
                    name: 'Cup (500ml)',
                    isActive: true,
                },
            }),
            prisma.packagingType.create({
                data: {
                    name: 'Cone',
                    isActive: true,
                },
            }),
            prisma.packagingType.create({
                data: {
                    name: 'Tub (1L)',
                    isActive: true,
                },
            }),
            prisma.packagingType.create({
                data: {
                    name: 'Tub (2L)',
                    isActive: true,
                },
            }),
        ]);
        // Create sample shops
        console.log('🏪 Creating shops...');
        const shops = await Promise.all([
            prisma.shop.create({
                data: {
                    name: 'Main Street Ice Cream',
                    description: 'Main branch ice cream shop',
                    address: '123 Main Street, City Center',
                    contactNumber: '+1-555-0101',
                    email: 'main@blissicecream.com',
                    operatingHours: '9:00 AM - 10:00 PM',
                    isActive: true,
                },
            }),
            prisma.shop.create({
                data: {
                    name: 'Mall Location',
                    description: 'Shopping mall ice cream kiosk',
                    address: '456 Mall Drive, Shopping Center',
                    contactNumber: '+1-555-0102',
                    email: 'mall@blissicecream.com',
                    operatingHours: '10:00 AM - 9:00 PM',
                    isActive: true,
                },
            }),
            prisma.shop.create({
                data: {
                    name: 'Beach Branch',
                    description: 'Beachfront ice cream shop',
                    address: '789 Ocean View, Beach District',
                    contactNumber: '+1-555-0103',
                    email: 'beach@blissicecream.com',
                    operatingHours: '8:00 AM - 11:00 PM',
                    isActive: true,
                },
            }),
        ]);
        // Get roles for user creation
        const adminRole = await prisma.role.findFirst({ where: { name: 'Admin' } });
        const shopOwnerRole = await prisma.role.findFirst({ where: { name: 'Shop_Owner' } });
        if (!adminRole || !shopOwnerRole) {
            throw new Error('Roles not found. Please run "npm run role" first.');
        }
        // Create default admin user
        console.log('👥 Creating default admin user...');
        const hashedPassword = await bcryptjs_1.default.hash('Password@123', 10);
        const adminUser = await prisma.user.create({
            data: {
                name: 'Admin',
                email: 'bhesaniaom@gmail.com',
                password: hashedPassword,
                publicId: 'admin-' + Date.now(),
                role: 'Admin',
                roleId: adminRole.id,
                contact: '+1-555-0001',
            },
        });
        // Create shop owners (optional - comment out if you only want admin)
        const shopOwner1 = await prisma.user.create({
            data: {
                name: 'John Smith',
                email: 'john@blissicecream.com',
                password: hashedPassword,
                publicId: 'shop-owner-1-' + Date.now(),
                role: 'Shop_Owner',
                roleId: shopOwnerRole.id,
                contact: '+1-555-0002',
                managedShops: {
                    connect: { id: shops[0].id },
                },
            },
        });
        const shopOwner2 = await prisma.user.create({
            data: {
                name: 'Sarah Johnson',
                email: 'sarah@blissicecream.com',
                password: hashedPassword,
                publicId: 'shop-owner-2-' + Date.now(),
                role: 'Shop_Owner',
                roleId: shopOwnerRole.id,
                contact: '+1-555-0003',
                managedShops: {
                    connect: { id: shops[1].id },
                },
            },
        });
        // Update shops with managers
        await prisma.shop.update({
            where: { id: shops[0].id },
            data: { managerId: shopOwner1.publicId },
        });
        await prisma.shop.update({
            where: { id: shops[1].id },
            data: { managerId: shopOwner2.publicId },
        });
        // Create sample products
        console.log('🍨 Creating products...');
        const products = await Promise.all([
            prisma.product.create({
                data: {
                    sku: 'IC-VAN-500',
                    name: 'Vanilla Ice Cream',
                    description: 'Classic vanilla ice cream',
                    categoryId: categories[0].id,
                    flavorId: flavors[0].id,
                    packagingTypeId: packagingTypes[0].id,
                    quantityInLiters: 0.5,
                    unitSize: 0.5,
                    unitMeasurement: 'L',
                    unitPrice: 4.99,
                    totalStock: 100,
                    minStockLevel: 20,
                    barcode: '1234567890123',
                    isActive: true,
                },
            }),
            prisma.product.create({
                data: {
                    sku: 'IC-CHOC-500',
                    name: 'Chocolate Ice Cream',
                    description: 'Rich chocolate ice cream',
                    categoryId: categories[0].id,
                    flavorId: flavors[1].id,
                    packagingTypeId: packagingTypes[0].id,
                    quantityInLiters: 0.5,
                    unitSize: 0.5,
                    unitMeasurement: 'L',
                    unitPrice: 4.99,
                    totalStock: 80,
                    minStockLevel: 15,
                    barcode: '1234567890124',
                    isActive: true,
                },
            }),
            prisma.product.create({
                data: {
                    sku: 'IC-STR-500',
                    name: 'Strawberry Ice Cream',
                    description: 'Fresh strawberry ice cream',
                    categoryId: categories[0].id,
                    flavorId: flavors[2].id,
                    packagingTypeId: packagingTypes[0].id,
                    quantityInLiters: 0.5,
                    unitSize: 0.5,
                    unitMeasurement: 'L',
                    unitPrice: 5.49,
                    totalStock: 60,
                    minStockLevel: 10,
                    barcode: '1234567890125',
                    isActive: true,
                },
            }),
            prisma.product.create({
                data: {
                    sku: 'IC-MINT-500',
                    name: 'Mint Chocolate Chip',
                    description: 'Mint ice cream with chocolate chips',
                    categoryId: categories[0].id,
                    flavorId: flavors[3].id,
                    packagingTypeId: packagingTypes[0].id,
                    quantityInLiters: 0.5,
                    unitSize: 0.5,
                    unitMeasurement: 'L',
                    unitPrice: 5.99,
                    totalStock: 40,
                    minStockLevel: 8,
                    barcode: '1234567890126',
                    isActive: true,
                },
            }),
            prisma.product.create({
                data: {
                    sku: 'IC-COOK-500',
                    name: 'Cookies & Cream',
                    description: 'Vanilla ice cream with cookie pieces',
                    categoryId: categories[0].id,
                    flavorId: flavors[4].id,
                    packagingTypeId: packagingTypes[0].id,
                    quantityInLiters: 0.5,
                    unitSize: 0.5,
                    unitMeasurement: 'L',
                    unitPrice: 5.99,
                    totalStock: 50,
                    minStockLevel: 10,
                    barcode: '1234567890127',
                    isActive: true,
                },
            }),
        ]);
        // Create shop inventory
        console.log('📊 Creating shop inventory...');
        for (const shop of shops) {
            for (const product of products) {
                const randomStock = Math.floor(Math.random() * 50) + 10; // 10-60 stock
                const randomMinStock = Math.floor(randomStock * 0.3); // 30% of current stock
                await prisma.shopInventory.create({
                    data: {
                        shopId: shop.id,
                        productId: product.id,
                        currentStock: randomStock,
                        minStockPerItem: randomMinStock,
                        lowStockAlertsEnabled: true,
                        lastRestockDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within last 30 days
                        isActive: true,
                    },
                });
            }
        }
        // Create some sample restock requests
        console.log('📋 Creating restock requests...');
        const lowStockItems = await prisma.shopInventory.findMany({
            where: {
                currentStock: { lte: 15 },
            },
            include: { product: true, shop: true },
            take: 3,
        });
        for (const item of lowStockItems) {
            await prisma.restockRequest.create({
                data: {
                    shopId: item.shopId,
                    productId: item.productId,
                    requestedAmount: Math.floor(Math.random() * 30) + 20, // 20-50 units
                    status: 'pending',
                    requestType: 'RESTOCK',
                    notes: `Low stock alert: Only ${item.currentStock} units remaining`,
                },
            });
        }
        // Create sample notifications
        console.log('🔔 Creating notifications...');
        await prisma.notification.createMany({
            data: [
                {
                    type: 'low_stock',
                    message: 'Vanilla Ice Cream is running low at Main Street location',
                    userId: adminUser.publicId,
                    isRead: false,
                },
                {
                    type: 'restock_request',
                    message: 'New restock request from Mall Location',
                    userId: adminUser.publicId,
                    isRead: false,
                },
                {
                    type: 'system',
                    message: 'Welcome to Bliss Ice Cream Management System!',
                    userId: adminUser.publicId,
                    isRead: true,
                },
            ],
        });
        // Create sample billing records
        console.log('💰 Creating sample billing records...');
        const sampleBilling = await prisma.billing.create({
            data: {
                shopId: shops[0].id,
                customerName: 'John Doe',
                customerEmail: 'john.doe@email.com',
                items: [
                    {
                        productId: products[0].id,
                        productName: products[0].name,
                        quantity: 2,
                        unitPrice: products[0].unitPrice,
                        total: products[0].unitPrice * 2,
                    },
                    {
                        productId: products[1].id,
                        productName: products[1].name,
                        quantity: 1,
                        unitPrice: products[1].unitPrice,
                        total: products[1].unitPrice,
                    },
                ],
                subtotal: (products[0].unitPrice * 2) + products[1].unitPrice,
                tax: ((products[0].unitPrice * 2) + products[1].unitPrice) * 0.08,
                discount: 0,
                total: ((products[0].unitPrice * 2) + products[1].unitPrice) * 1.08,
                paymentStatus: 'completed',
                createdBy: shopOwner1.publicId,
                createdByRole: 'Shop_Owner',
                invoiceNumber: 'INV-001',
            },
        });
        console.log('✅ Database seeding completed successfully!');
        console.log('\n📊 Summary:');
        console.log(`- ${categories.length} categories created`);
        console.log(`- ${flavors.length} flavors created`);
        console.log(`- ${packagingTypes.length} packaging types created`);
        console.log(`- ${shops.length} shops created`);
        console.log(`- 3 users created (1 default admin, 2 shop owners)`);
        console.log(`- ${products.length} products created`);
        console.log(`- ${shops.length * products.length} shop inventory records created`);
        console.log(`- ${lowStockItems.length} restock requests created`);
        console.log(`- 3 notifications created`);
        console.log(`- 1 sample billing record created`);
        console.log('\n🔑 Default Login Credentials:');
        console.log('Admin: bhesaniaom@gmail.com / Password@123');
        console.log('Shop Owner 1: john@blissicecream.com / password123');
        console.log('Shop Owner 2: sarah@blissicecream.com / password123');
    }
    catch (error) {
        console.error('❌ Error seeding database:', error);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
// Run the seeding function
seedDatabase()
    .then(() => {
    console.log('🎉 Seeding process completed!');
    process.exit(0);
})
    .catch((error) => {
    console.error('💥 Seeding process failed:', error);
    process.exit(1);
});
