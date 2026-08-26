import { Injectable, Logger, OnModuleInit, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto, ChangePasswordDto } from './auth.dto';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Seeds the first Admin on an empty user table, so a fresh deployment is
   * reachable. Credentials come from env; the account is flagged to force a
   * password change on first login.
   */
  async onModuleInit() {
    if (await this.prisma.user.count()) return;

    const email = this.config.get<string>('admin.email')!;
    const password = this.config.get<string>('admin.password')!;

    await this.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: this.config.get<string>('admin.name') || 'Administrator',
        passwordHash: await bcrypt.hash(password, 12),
        role: UserRole.ADMIN,
        mustChangePassword: true,
      },
    });

    this.logger.warn(
      `Bootstrapped the first admin: ${email} — change this password on first login.`,
    );
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    // Same message and roughly the same work either way, so the response
    // doesn't reveal whether an address exists.
    const ok = user && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!ok) throw new UnauthorizedException('Email or password is incorrect');
    if (!user!.isActive) throw new UnauthorizedException('This account has been deactivated');

    await this.prisma.user.update({
      where: { id: user!.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issue(user!);
  }

  private issue(user: { id: string; email: string; name: string; role: UserRole; mustChangePassword: boolean }) {
    return {
      accessToken: this.jwt.sign({ sub: user.id, email: user.email, role: user.role }),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, role: true,
        mustChangePassword: true, lastLoginAt: true, createdAt: true,
      },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('The new password must be different');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, 12),
        mustChangePassword: false,
      },
    });

    return { changed: true };
  }
}
