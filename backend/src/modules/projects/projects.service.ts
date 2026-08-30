import { Injectable, NotFoundException } from '@nestjs/common';
import { ExternalProjectsService } from '../external-projects/external-projects.service';
import { CategoriesService } from '../categories/categories.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Projects live in the Tawal tracker. Nothing is stored here.
 *
 * This service only joins the tracker's list to local data: the project
 * category row that its `category` string resolves to (which decides the MOP
 * formats available), and how many MOPs have been generated for each site.
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly externalProjects: ExternalProjectsService,
    private readonly categories: CategoriesService,
  ) {}

  async findAll() {
    const { available, items, message, fetchedAt } = await this.externalProjects.list();

    // Makes sure a category seen upstream exists locally before we try to match.
    await this.categories.syncFromTracker().catch(() => undefined);

    const categories = await this.prisma.projectCategory.findMany({
      include: { templates: { include: { mopCategory: true } } },
    });
    const byName = new Map(categories.map((c: any) => [c.name.toLowerCase(), c]));

    const counts = await this.prisma.mopDocument.groupBy({
      by: ['externalSiteId'],
      _count: { _all: true },
    });
    const countBySite = new Map(counts.map((c: any) => [c.externalSiteId, c._count._all]));

    return {
      available,
      message,
      fetchedAt,
      items: items.map((p) => ({
        ...p,
        projectCategory: byName.get((p.category ?? '').toLowerCase()) ?? null,
        mopCount: countBySite.get(p.siteId) ?? 0,
      })),
    };
  }

  async findOne(siteId: string) {
    const project = await this.externalProjects.findBySiteId(siteId);
    if (!project) throw new NotFoundException(`Project "${siteId}" was not found in the tracker.`);

    const projectCategory = await this.categories.resolveByName(project.category);
    return { ...project, projectCategory };
  }
}
