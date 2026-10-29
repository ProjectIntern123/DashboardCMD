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
import { getListenConfig } from './common/config/server.config';
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

  const { port, host } = getListenConfig();
  await app.listen(port, host);
  console.log(`NestJS application running on: http://${host}:${port}/api`);

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

bootstrap();
