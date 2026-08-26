import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));

  const config = new DocumentBuilder()
    .setTitle('Tawal DocGen API')
    .setDescription('GCL -> As-Built BOQ / Work Order / PAC generation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  // A default JWT secret in production would let anyone mint a valid admin token.
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    Logger.error('JWT_SECRET is not set. Refusing to start in production.', 'Bootstrap');
    process.exit(1);
  }

  const port = Number(process.env.PORT || 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API ready on http://localhost:${port}/api  (docs: /api/docs)`, 'Bootstrap');
}
bootstrap();
