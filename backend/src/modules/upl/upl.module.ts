import { Module } from '@nestjs/common';
import { UplController } from './upl.controller';
import { UplService } from './upl.service';

@Module({ controllers: [UplController], providers: [UplService], exports: [UplService] })
export class UplModule {}
