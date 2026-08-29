import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './modules/storage/storage.module';
import { UplModule } from './modules/upl/upl.module';
import { GclModule } from './modules/gcl/gcl.module';
import { PackagesModule } from './modules/packages/packages.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ExternalProjectsModule } from './modules/external-projects/external-projects.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { MopModule } from './modules/mop/mop.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { PermissionsGuard } from './modules/auth/permissions.guard';
import { DocxToPdfService } from './modules/mop/docx-to-pdf.service';
import { HealthController } from './modules/health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 240 }]),
    PrismaModule,
    StorageModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ExternalProjectsModule,
    ProjectsModule,
    DashboardModule,
    MopModule,
    UplModule,
    GclModule,
    PackagesModule,
    DocumentsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Authentication is on for the whole platform. Routes opt out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Runs after authentication; routes opt in with @RequirePermission().
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // HealthController lives on this module and reports PDF-engine readiness.
    DocxToPdfService,
  ],
})
export class AppModule {}
