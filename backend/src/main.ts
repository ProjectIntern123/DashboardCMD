(global as any).DOMMatrix = class DOMMatrix {};
(global as any).ImageData = class ImageData {};
(global as any).Path2D = class Path2D {};
if (typeof process !== 'undefined' && !(process as any).getBuiltinModule) {
  (process as any).getBuiltinModule = (name: string) => {
    try {
      return require(name);
    } catch (e) {
      return undefined;
    }
  };
}
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import * as express from 'express';
import cookieParser = require('cookie-parser');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Trust proxy for secure cookies behind reverse proxy (like Nginx)
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);
  
  // Enable global prefix
  app.setGlobalPrefix('api');
  
  // Enable cookie parser
  app.use(cookieParser());
  
  // Increase request body payload limits for large configs and documents
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  
  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false,
      transform: true,
    }),
  );
  
  // Enable CORS
  app.enableCors({
    origin: true,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });

  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`NestJS application running on: http://localhost:${port}/api`);

  // Run automatic Super Admin role migration
  try {
    const prisma = app.get(PrismaService);
    await migrateSuperAdminToAdmin(prisma);
  } catch (err) {
    console.error('Failed to run startup database migration:', err);
  }

  // Log local network IP address
  try {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`NestJS application also accessible on: http://${net.address}:${port}/api`);
        }
      }
    }
  } catch (e) {
    // Ignore
  }
}

async function migrateSuperAdminToAdmin(prisma: any) {
  try {
    const superAdminRole = await prisma.role.findUnique({ where: { name: 'Super Admin' } });
    let adminRole = await prisma.role.findUnique({ where: { name: 'Admin' } });
    if (!adminRole) {
      adminRole = await prisma.role.create({ data: { name: 'Admin' } });
    }

    if (superAdminRole) {
      console.log('--- STARTING SUPER ADMIN TO ADMIN DATA MIGRATION ---');
      
      // 1. Move all users linked to Super Admin to Admin
      const affectedUsers = await prisma.user.updateMany({
        where: { roleId: superAdminRole.id },
        data: { roleId: adminRole.id }
      });
      console.log(`Migrated ${affectedUsers.count} users from Super Admin to Admin role.`);

      // 2. Move approval matrices
      const affectedMatrices = await prisma.approvalMatrix.updateMany({
        where: { roleId: superAdminRole.id },
        data: { roleId: adminRole.id }
      });
      console.log(`Migrated ${affectedMatrices.count} approval matrices to Admin role.`);

      // 3. Move permission relations
      const superAdminPerms = await prisma.rolePermission.findMany({
        where: { roleId: superAdminRole.id }
      });
      console.log(`Cloning ${superAdminPerms.length} permissions to Admin role.`);
      for (const sap of superAdminPerms) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: adminRole.id,
              permissionId: sap.permissionId
            }
          },
          update: {},
          create: {
            roleId: adminRole.id,
            permissionId: sap.permissionId
          }
        });
      }

      // 4. Delete Super Admin permissions
      await prisma.rolePermission.deleteMany({
        where: { roleId: superAdminRole.id }
      });

      // 5. Delete Super Admin role
      await prisma.role.delete({
        where: { id: superAdminRole.id }
      });
      console.log('--- SUPER ADMIN TO ADMIN DATA MIGRATION COMPLETED ---');
    }
  } catch (error) {
    console.error('Error during automatic Super Admin to Admin migration:', error);
  }
}

bootstrap();
