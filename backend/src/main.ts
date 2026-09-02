import * as dns from 'node:dns';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { CorsHeadersInterceptor } from './common/interceptors/cors-headers.interceptor';
import {
  allowedCorsOrigins,
  applyCorsHeaders,
  nestCorsOptions,
} from './common/utils/cors-origin';

async function bootstrap() {
  // Windows dual-stack often tries IPv6 first; outbound HTTPS (Resend) then fails with "fetch failed".
  if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const isProd = config.get('NODE_ENV') === 'production';

  const corsOrigins = allowedCorsOrigins(isProd, config.get<string>('CORS_ORIGINS'));
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.locals.corsOrigins = corsOrigins;
  expressApp.locals.corsIsProd = isProd;
  expressApp.set('trust proxy', 1);

  // CORS must run before Helmet, JWT, and PDF body flush. A PDF (or a dropped
  // connection) without these headers is reported by the browser as a CORS failure.
  expressApp.use((req, res, next) => {
    applyCorsHeaders(req, res, corsOrigins, isProd);
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.enableCors(nestCorsOptions(corsOrigins, isProd));
  app.useGlobalInterceptors(new CorsHeadersInterceptor());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.setGlobalPrefix('api');

  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('School ERP SaaS API')
      .setDescription('REST API documentation for the School ERP SaaS backend')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT access token',
          in: 'header',
        },
        'access-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = Number(config.get('PORT') || process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';

  if (isProd) {
    const jwt = config.get<string>('JWT_SECRET') || '';
    if (!config.get<string>('DATABASE_URL')) {
      throw new Error('DATABASE_URL is required in production');
    }
    if (jwt.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
    if (!corsOrigins.length) {
      throw new Error('CORS_ORIGINS must be set in production to the frontend HTTPS origin');
    }
    if (!config.get<string>('FRONTEND_URL')) {
      throw new Error('FRONTEND_URL must be set in production (password-reset and email links)');
    }
  }

  expressApp.set('trust proxy', 1);
  await app.listen(port, host);
  console.log(`Backend running on http://${host}:${port}/api`);
  if (!isProd) {
    console.log(`Swagger docs at http://localhost:${port}/api/docs`);
  }
}

bootstrap();
