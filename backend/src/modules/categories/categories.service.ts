import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { listTemplates } from '../mop/mop.templates';
import { UpsertMopCategoryDto, UpsertProjectCategoryDto, UpsertTemplateLinkDto } from './categories.dto';

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/**
 * Starting catalog. Projects are NOT seeded — you create those yourself — but the
 * categories and their template pairings are, so the first MOP can be made
 * without configuring anything. All of it is editable afterwards.
 */
const SEED_PROJECT_CATEGORIES = [
  { name: 'RMS', description: 'Remote Monitoring System', colour: '#01C2F3', sortOrder: 1 },
  { name: 'CCTV', description: 'Camera installation and acceptance', colour: '#C36BA9', sortOrder: 2 },
  { name: 'SIM Swap', description: 'Replacing SIMs in deployed RMS units', colour: '#F59042', sortOrder: 3 },
  { name: 'Smart Locks', description: 'Smart lock installation and acceptance', colour: '#44489D', sortOrder: 4 },
];

const SEED_MOP_CATEGORIES = [
  { name: 'Survey', sortOrder: 0 },
  { name: 'Installation', sortOrder: 1 },
  { name: 'PAT', sortOrder: 2 },
];

/** [project category, MOP category, template, default summary] */
const SEED_LINKS: [string, string, string, string][] = [
  ['RMS', 'Survey', 'Site_Survey', 'Site Survey'],
  ['RMS', 'Installation', 'INSTALLATION', 'Smart Tower Implementation'],
  ['RMS', 'PAT', 'INSTALLATION', 'Smart Tower PAT'],
  ['CCTV', 'Survey', 'Site_Survey', 'CCTV Site Survey'],
  ['CCTV', 'Installation', 'CCTV_Installation', 'CCTV Implementation'],
  ['CCTV', 'PAT', 'CCTV_Installation', 'CCTV PAT'],
  // SIM Swap has no installation or acceptance stage — one pairing only.
  ['SIM Swap', 'Survey', 'SIM_SWAP', 'Smart Tower SIM SWAP'],
  ['Smart Locks', 'Survey', 'Site_Survey', 'Smart Lock Site Survey'],
  ['Smart Locks', 'Installation', 'INSTALLATION', 'Smart Lock Implementation'],
  ['Smart Locks', 'PAT', 'INSTALLATION', 'Smart Lock PAT'],
];

@Injectable()
export class CategoriesService implements OnModuleInit {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    if (await this.prisma.projectCategory.count()) return;

    const projectCats = new Map<string, string>();
    for (const c of SEED_PROJECT_CATEGORIES) {
      const created = await this.prisma.projectCategory.create({
        data: { ...c, slug: slugify(c.name) },
      });
      projectCats.set(c.name, created.id);
    }

    const mopCats = new Map<string, string>();
    for (const c of SEED_MOP_CATEGORIES) {
      const created = await this.prisma.mopCategory.create({
        data: { ...c, slug: slugify(c.name) },
      });
      mopCats.set(c.name, created.id);
    }

    for (const [pc, mc, templateKey, defaultTcnSummary] of SEED_LINKS) {
      await this.prisma.categoryTemplate.create({
        data: {
          projectCategoryId: projectCats.get(pc)!,
          mopCategoryId: mopCats.get(mc)!,
          templateKey,
          defaultTcnSummary,
        },
      });
    }

    this.logger.log(
      `Seeded ${SEED_PROJECT_CATEGORIES.length} project categories, ` +
        `${SEED_MOP_CATEGORIES.length} MOP categories, ${SEED_LINKS.length} pairings`,
    );
  }

  /* ------------------------------------------------- project categories */

  projectCategories(includeInactive = false) {
    return this.prisma.projectCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        templates: { include: { mopCategory: true } },
        _count: { select: { projects: true } },
      },
    });
  }

  async createProjectCategory(dto: UpsertProjectCategoryDto) {
    const slug = slugify(dto.slug || dto.name);
    if (await this.prisma.projectCategory.findUnique({ where: { slug } })) {
      throw new ConflictException(`A project category "${dto.name}" already exists`);
    }
    return this.prisma.projectCategory.create({
      data: { ...dto, slug, sortOrder: dto.sortOrder ?? 99 },
      include: { templates: true },
    });
  }

  async updateProjectCategory(id: string, dto: Partial<UpsertProjectCategoryDto>) {
    await this.getProjectCategory(id);
    const { slug, ...rest } = dto;
    return this.prisma.projectCategory.update({ where: { id }, data: rest });
  }

  async removeProjectCategory(id: string) {
    const cat = await this.prisma.projectCategory.findUnique({
      where: { id },
      include: { _count: { select: { projects: true } } },
    });
    if (!cat) throw new NotFoundException('Project category not found');
    if (cat._count.projects > 0) {
      throw new BadRequestException(
        `${cat._count.projects} project(s) use this category. Move or delete them first, or just hide the category.`,
      );
    }
    await this.prisma.projectCategory.delete({ where: { id } });
    return { deleted: true };
  }

  private async getProjectCategory(id: string) {
    const cat = await this.prisma.projectCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Project category not found');
    return cat;
  }

  /* ----------------------------------------------------- MOP categories */

  mopCategories(includeInactive = false) {
    return this.prisma.mopCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        templates: { include: { projectCategory: true } },
        _count: { select: { documents: true } },
      },
    });
  }

  async createMopCategory(dto: UpsertMopCategoryDto) {
    const slug = slugify(dto.slug || dto.name);
    if (await this.prisma.mopCategory.findUnique({ where: { slug } })) {
      throw new ConflictException(`A MOP category "${dto.name}" already exists`);
    }
    return this.prisma.mopCategory.create({
      data: { ...dto, slug, sortOrder: dto.sortOrder ?? 99 },
    });
  }

  async updateMopCategory(id: string, dto: Partial<UpsertMopCategoryDto>) {
    const cat = await this.prisma.mopCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('MOP category not found');
    const { slug, ...rest } = dto;
    return this.prisma.mopCategory.update({ where: { id }, data: rest });
  }

  async removeMopCategory(id: string) {
    const cat = await this.prisma.mopCategory.findUnique({
      where: { id },
      include: { _count: { select: { documents: true } } },
    });
    if (!cat) throw new NotFoundException('MOP category not found');
    if (cat._count.documents > 0) {
      throw new BadRequestException(
        `${cat._count.documents} document(s) were generated in this category. Hide it instead of deleting.`,
      );
    }
    await this.prisma.mopCategory.delete({ where: { id } });
    return { deleted: true };
  }

  /* --------------------------------------------------------- pairings */

  templates() {
    return listTemplates();
  }

  /** Which MOP categories a given project category offers. */
  async availableFor(projectCategoryId: string) {
    return this.prisma.categoryTemplate.findMany({
      where: { projectCategoryId, mopCategory: { isActive: true } },
      include: { mopCategory: true },
      orderBy: { mopCategory: { sortOrder: 'asc' } },
    });
  }

  async linkTemplate(dto: UpsertTemplateLinkDto) {
    const available = listTemplates().map((t) => t.key);
    if (!available.includes(dto.templateKey)) {
      throw new BadRequestException(
        `Unknown MOP format "${dto.templateKey}". Available: ${available.join(', ')}`,
      );
    }
    return this.prisma.categoryTemplate.upsert({
      where: {
        projectCategoryId_mopCategoryId: {
          projectCategoryId: dto.projectCategoryId,
          mopCategoryId: dto.mopCategoryId,
        },
      },
      create: dto,
      update: { templateKey: dto.templateKey, defaultTcnSummary: dto.defaultTcnSummary },
      include: { mopCategory: true, projectCategory: true },
    });
  }

  async unlinkTemplate(projectCategoryId: string, mopCategoryId: string) {
    await this.prisma.categoryTemplate.deleteMany({
      where: { projectCategoryId, mopCategoryId },
    });
    return { unlinked: true };
  }
}
