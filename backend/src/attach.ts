import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Mounts DocGen onto an Express app that already exists.
 *
 * DocGen is a module of PMS, not a second service: PMS creates the server and
 * this attaches to it, so there is one process, one port and one deploy. CORS
 * and body parsing are left to the host — configuring them twice on the same
 * app is how you end up with rules that silently disagree.
 *
 * Called from `pms/backend/server.js`.
 */
export async function attachDocgen(expressApp: any, options: { prefix?: string } = {}) {
  const prefix = options.prefix ?? 'api/docgen';

  // A default JWT secret in production would let anyone mint a valid admin
  // token. PMS enforces this too, but DocGen must not rely on that.
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    Logger.error('JWT_SECRET is not set. Refusing to start.', 'DocGen');
    throw new Error('JWT_SECRET is required in production');
  }

  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    bufferLogs: true,
    // PMS owns the HTTP server and its CORS policy.
    cors: false,
  });

  app.setGlobalPrefix(prefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // Generous limits: GCL and scope-sheet uploads run to several MB.
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));

  // init() rather than listen(): the routes are registered on the host's
  // server, which PMS is already listening on.
  await app.init();

  Logger.log(`DocGen mounted on /${prefix}`, 'DocGen');
  return app;
}
