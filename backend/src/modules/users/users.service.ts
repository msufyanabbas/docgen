import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, QueryUsersDto, ResetPasswordDto, UpdateUserDto } from './users.dto';

const SAFE = {
  id: true, email: true, name: true, role: true, isActive: true,
  mustChangePassword: true, lastLoginAt: true, createdAt: true,
  createdBy: { select: { id: true, name: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(q: QueryUsersDto) {
    const where: any = {};
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    if (q.role) where.role = q.role;

    const take = Math.min(q.limit ?? 50, 200);
    const skip = ((q.page ?? 1) - 1) * take;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: SAFE, orderBy: { createdAt: 'desc' }, take, skip }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: q.page ?? 1, limit: take };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SAFE });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto, creatorId: string) {
    const email = dto.email.toLowerCase().trim();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('An account with that email already exists');
    }

    return this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash: await bcrypt.hash(dto.password, 12),
        role: dto.role ?? UserRole.PM,
        createdById: creatorId,
        // The admin knows this password, so the user must replace it.
        mustChangePassword: true,
      },
      select: SAFE,
    });
  }

  async update(id: string, dto: UpdateUserDto, actingUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // Guard against an admin locking themselves — or everyone — out.
    if (id === actingUserId) {
      if (dto.isActive === false) throw new BadRequestException('You cannot deactivate your own account');
      if (dto.role && dto.role !== user.role) {
        throw new BadRequestException('You cannot change your own role');
      }
    }

    if (user.role === UserRole.ADMIN && (dto.role === UserRole.PM || dto.isActive === false)) {
      const admins = await this.prisma.user.count({
        where: { role: UserRole.ADMIN, isActive: true },
      });
      if (admins <= 1) throw new BadRequestException('At least one active admin must remain');
    }

    return this.prisma.user.update({ where: { id }, data: dto, select: SAFE });
  }

  async resetPassword(id: string, dto: ResetPasswordDto) {
    await this.findOne(id);
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, 12),
        mustChangePassword: true,
      },
    });
    return { reset: true };
  }

  async remove(id: string, actingUserId: string) {
    if (id === actingUserId) throw new BadRequestException('You cannot delete your own account');

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (user.role === UserRole.ADMIN) {
      const admins = await this.prisma.user.count({ where: { role: UserRole.ADMIN, isActive: true } });
      if (admins <= 1) throw new BadRequestException('At least one active admin must remain');
    }

    // Documents keep their history via onDelete: SetNull on createdById.
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }
}
