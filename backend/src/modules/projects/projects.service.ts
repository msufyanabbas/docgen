import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { listTemplates } from '../mop/mop.templates';
import { PROJECT_TYPES, mobTypeOf, projectType } from './project-types';
import { CreateMobDto, CreateProjectDto, UpdateMobDto, UpdateProjectDto } from './projects.dto';

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /* ------------------------------------------------------------- projects */

  findAll(includeInactive = false) {
    return this.prisma.project.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        mobs: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
        _count: { select: { documents: true } },
      },
    });
  }

  async findOne(idOrSlug: string) {
    const project = await this.prisma.project.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        mobs: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
        _count: { select: { documents: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  /** The catalog the create form is built from. */
  types() {
    return PROJECT_TYPES;
  }

  /**
   * Creating a project picks a type, and the type decides which MOBs exist —
   * SIM Swap gets Survey only, everything else also gets Installation and PAT.
   * The caller may narrow that further, but never widen it.
   */
  async create(dto: CreateProjectDto) {
    const type = projectType(dto.type);
    if (!type) {
      throw new BadRequestException(
        `Unknown project type "${dto.type}". Choose one of: ${PROJECT_TYPES.map((t) => t.key).join(', ')}`,
      );
    }

    const slug = slugify(dto.slug || dto.name);
    if (await this.prisma.project.findUnique({ where: { slug } })) {
      throw new ConflictException(`A project with the slug "${slug}" already exists`);
    }

    const requested = dto.mobTypes?.length ? dto.mobTypes : type.mobTypes.map((m) => m.key);
    const invalid = requested.filter((k) => !mobTypeOf(type.key, k));
    if (invalid.length) {
      throw new BadRequestException(
        `${type.label} does not support: ${invalid.join(', ')}. Available: ${type.mobTypes
          .map((m) => m.key)
          .join(', ')}`,
      );
    }

    const mobs = type.mobTypes
      .filter((m) => requested.includes(m.key))
      .map((m) => ({
        name: m.name,
        slug: slugify(m.name),
        mobType: m.key,
        templateKey: m.templateKey,
        defaultTcnSummary: m.defaultTcnSummary,
        sortOrder: m.sortOrder,
      }));

    return this.prisma.project.create({
      data: {
        name: dto.name.trim(),
        slug,
        type: type.key,
        description: dto.description ?? type.description,
        colour: dto.colour ?? type.colour,
        sortOrder: dto.sortOrder ?? 99,
        mobs: { create: mobs },
      },
      include: { mobs: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  /** MOB types valid for a project but not yet added to it. */
  async availableMobTypes(projectId: string) {
    const project = await this.findOne(projectId);
    const type = projectType(project.type);
    if (!type) return [];
    const taken = new Set(project.mobs.map((m) => m.mobType));
    return type.mobTypes.filter((m) => !taken.has(m.key));
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findOne(id);
    return this.prisma.project.update({ where: { id }, data: dto, include: { mobs: true } });
  }

  async remove(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { _count: { select: { documents: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');

    // Deleting would cascade to its MOPs, so keep the history and hide it instead.
    if (project._count.documents > 0) {
      throw new BadRequestException(
        `This project has ${project._count.documents} generated document(s). Deactivate it instead of deleting.`,
      );
    }
    await this.prisma.project.delete({ where: { id } });
    return { deleted: true };
  }

  /* ----------------------------------------------------------------- mobs */

  async addMob(projectId: string, dto: CreateMobDto) {
    const project = await this.findOne(projectId);

    const definition = mobTypeOf(project.type, dto.mobType);
    if (!definition) {
      const type = projectType(project.type);
      throw new BadRequestException(
        `${type?.label ?? project.type} does not support a "${dto.mobType}" MOB. ` +
          `Available: ${type?.mobTypes.map((m) => m.key).join(', ') ?? 'none'}`,
      );
    }

    const name = dto.name?.trim() || definition.name;
    const slug = slugify(dto.slug || name);
    const clash = await this.prisma.mob.findUnique({
      where: { projectId_slug: { projectId, slug } },
    });
    if (clash) throw new ConflictException(`This project already has a MOB named "${name}"`);

    return this.prisma.mob.create({
      data: {
        projectId,
        name,
        slug,
        mobType: definition.key,
        // The template comes from the catalog, so a MOB can never point at the
        // wrong MOP format for its project type.
        templateKey: definition.templateKey,
        defaultTcnSummary: dto.defaultTcnSummary ?? definition.defaultTcnSummary,
        sortOrder: dto.sortOrder ?? definition.sortOrder,
      },
    });
  }

  async updateMob(mobId: string, dto: UpdateMobDto) {
    const mob = await this.prisma.mob.findUnique({ where: { id: mobId } });
    if (!mob) throw new NotFoundException('MOB not found');
    if (dto.templateKey) this.assertTemplate(dto.templateKey);
    return this.prisma.mob.update({ where: { id: mobId }, data: dto });
  }

  async removeMob(mobId: string) {
    const mob = await this.prisma.mob.findUnique({
      where: { id: mobId },
      include: { _count: { select: { documents: true } } },
    });
    if (!mob) throw new NotFoundException('MOB not found');
    if (mob._count.documents > 0) {
      throw new BadRequestException(
        `This MOB has ${mob._count.documents} generated document(s). Deactivate it instead of deleting.`,
      );
    }
    await this.prisma.mob.delete({ where: { id: mobId } });
    return { deleted: true };
  }

  templates() {
    return listTemplates();
  }

  private assertTemplate(key: string) {
    const available = listTemplates().map((t) => t.key);
    if (!available.includes(key)) {
      throw new BadRequestException(
        `Unknown template "${key}". Available: ${available.join(', ')}`,
      );
    }
  }
}
