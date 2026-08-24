import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './modules/storage/storage.module';
import { UplModule } from './modules/upl/upl.module';
import { GclModule } from './modules/gcl/gcl.module';
import { PackagesModule } from './modules/packages/packages.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { HealthController } from './modules/health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 240 }]),
    PrismaModule,
    StorageModule,
    UplModule,
    GclModule,
    PackagesModule,
    DocumentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
