import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../auth/public.decorator';
import { DocxToPdfService } from '../mop/docx-to-pdf.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: DocxToPdfService,
  ) {}

  // Left public so the deploy script and container healthcheck can reach it.
  @Public()
  @Get()
  async check() {
    const [{ ok }] = await this.prisma.$queryRawUnsafe<any[]>('SELECT 1 as ok');
    const [uplItems, users, projectCategories] = await Promise.all([
      this.prisma.uplItem.count(),
      this.prisma.user.count(),
      this.prisma.projectCategory.count(),
    ]);

    return {
      status: 'ok',
      db: ok === 1,
      uplItems,
      users,
      // Projects live in the tracker now, so what's countable here is the
      // category catalogue they map onto.
      projectCategories,
      // Surfaces a missing LibreOffice before someone tries to make a MOP PDF.
      pdfEngine: (await this.pdf.available()) ? 'ready' : 'unavailable',
      uptime: process.uptime(),
    };
  }
}
