import { PrismaClient } from '@prisma/client';
import { DEFAULT_PERMISSIONS, ModuleName, ActionType } from './src/types/modules';

const prisma = new PrismaClient();

/**
 * This script syncs new modules and permissions to the database without deleting existing data.
 * It will:
 * 1. Create any missing Permission records (action + resource combinations)
 * 2. Link missing permissions to roles based on DEFAULT_PERMISSIONS
 * 
 * Run with: npm run sync:modules
 */
async function syncModules() {
  try {
    console.log('🔄 Starting module sync...\n');

    // Get all roles from database
    const roles = await prisma.role.findMany();
    console.log(`Found ${roles.length} roles in database:`);
    roles.forEach(role => console.log(`  - ${role.name} (${role.id})`));
    console.log('');

    // Track stats
    let permissionsCreated = 0;
    let rolePermissionsCreated = 0;
    let skipped = 0;

    // Iterate through each role in DEFAULT_PERMISSIONS
    for (const [roleName, modulePermissions] of Object.entries(DEFAULT_PERMISSIONS)) {
      console.log(`\n📋 Processing role: ${roleName}`);
      
      // Find the role in the database
      const role = roles.find(r => r.name === roleName);
      if (!role) {
        console.log(`  ⚠️  Role "${roleName}" not found in database, skipping...`);
        continue;
      }

      // Get existing role permissions
      const existingRolePermissions = await prisma.rolePermission.findMany({
        where: { roleId: role.id },
        include: { permission: true }
      });
      
      const existingPermissionKeys = new Set(
        existingRolePermissions.map(rp => `${rp.permission.action}:${rp.permission.resource}`)
      );

      // Iterate through each module for this role
      for (const [moduleName, actions] of Object.entries(modulePermissions as Record<ModuleName, ActionType[]>)) {
        if (!actions || actions.length === 0) {
          continue; // Skip modules with no actions
        }

        console.log(`  📦 Module: ${moduleName} - Actions: [${actions.join(', ')}]`);

        for (const action of actions) {
          const permissionKey = `${action}:${moduleName}`;

          // Check if permission already exists for this role
          if (existingPermissionKeys.has(permissionKey)) {
            skipped++;
            continue;
          }

          // Upsert the permission record
          const permission = await prisma.permission.upsert({
            where: {
              action_resource: {
                action: action,
                resource: moduleName,
              },
            },
            update: {},
            create: {
              action: action,
              resource: moduleName,
              description: `${action} ${moduleName}`,
            },
          });

          // Check if rolePermission already exists
          const existingLink = await prisma.rolePermission.findFirst({
            where: {
              roleId: role.id,
              permissionId: permission.id,
            },
          });

          if (!existingLink) {
            // Create the role-permission link
            await prisma.rolePermission.create({
              data: {
                roleId: role.id,
                permissionId: permission.id,
              },
            });
            rolePermissionsCreated++;
            console.log(`    ✅ Added: ${action} ${moduleName}`);
          } else {
            skipped++;
          }
        }
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Sync Summary:');
    console.log(`  - Role-Permission links created: ${rolePermissionsCreated}`);
    console.log(`  - Already existed (skipped): ${skipped}`);
    console.log('='.repeat(50));
    console.log('\n✅ Module sync completed successfully!');

    // Show current state of permissions
    console.log('\n📋 Current permissions by role:');
    for (const role of roles) {
      const perms = await prisma.rolePermission.findMany({
        where: { roleId: role.id },
        include: { permission: true },
        orderBy: { permission: { resource: 'asc' } }
      });
      
      // Group by module
      const modulePerms: Record<string, string[]> = {};
      for (const rp of perms) {
        if (!modulePerms[rp.permission.resource]) {
          modulePerms[rp.permission.resource] = [];
        }
        modulePerms[rp.permission.resource].push(rp.permission.action);
      }

      console.log(`\n  ${role.name}:`);
      for (const [module, actions] of Object.entries(modulePerms)) {
        console.log(`    - ${module}: [${actions.join(', ')}]`);
      }
    }

  } catch (error) {
    console.error('❌ Error syncing modules:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

syncModules();
