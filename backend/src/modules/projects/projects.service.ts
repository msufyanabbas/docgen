import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './projects.dto';

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/**
 * Projects are created by the user — nothing is seeded. A project belongs to a
 * project category, and that category decides which MOP categories are
 * available when a document is generated.
 */
@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(includeInactive = false) {
    return this.prisma.project.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        projectCategory: {
          include: { templates: { include: { mopCategory: true } } },
        },
        _count: { select: { documents: true } },
      },
    });
  }

  async findOne(idOrSlug: string) {
    const project = await this.prisma.project.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        projectCategory: {
          include: {
            templates: {
              include: { mopCategory: true },
              orderBy: { mopCategory: { sortOrder: 'asc' } },
            },
          },
        },
        _count: { select: { documents: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async create(dto: CreateProjectDto) {
    const category = await this.prisma.projectCategory.findUnique({
      where: { id: dto.projectCategoryId },
    });
    if (!category) throw new BadRequestException('Choose a valid project category');

    const slug = slugify(dto.slug || dto.name);
    if (await this.prisma.project.findUnique({ where: { slug } })) {
      throw new ConflictException(`A project with the slug "${slug}" already exists`);
    }

    return this.prisma.project.create({
      data: {
        name: dto.name.trim(),
        slug,
        projectCategoryId: category.id,
        description: dto.description ?? null,
        sortOrder: dto.sortOrder ?? 99,
      },
      include: { projectCategory: true },
    });
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findOne(id);
    return this.prisma.project.update({
      where: { id },
      data: dto,
      include: { projectCategory: true },
    });
  }

  async remove(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { _count: { select: { documents: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');

    // Deleting cascades to its MOPs, so keep the history and hide it instead.
    if (project._count.documents > 0) {
      throw new BadRequestException(
        `This project has ${project._count.documents} generated document(s). Hide it instead of deleting.`,
      );
    }
    await this.prisma.project.delete({ where: { id } });
    return { deleted: true };
  }
}
