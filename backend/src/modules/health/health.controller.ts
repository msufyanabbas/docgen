import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const [{ ok }] = await this.prisma.$queryRawUnsafe<any[]>('SELECT 1 as ok');
    const uplCount = await this.prisma.uplItem.count();
    return { status: 'ok', db: ok === 1, uplItems: uplCount, uptime: process.uptime() };
  }
}
