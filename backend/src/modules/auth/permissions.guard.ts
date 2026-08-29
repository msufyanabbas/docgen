import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Action, PermissionMap, RESOURCE_LABELS, Resource, can } from './permissions';

export const PERMISSION_KEY = 'permission';

/** Marks a route as needing one permission, e.g. @RequirePermission('projects', 'create'). */
export const RequirePermission = (resource: Resource, action: Action = 'view') =>
  SetMetadata(PERMISSION_KEY, { resource, action });

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<{ resource: Resource; action: Action }>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const { user } = context.switchToHttp().getRequest();
    const permissions = (user?.permissions ?? null) as PermissionMap | null;

    if (!can(user?.role, permissions, required.resource, required.action)) {
      throw new ForbiddenException(
        `You do not have permission to ${required.action} ${RESOURCE_LABELS[required.resource]}.`,
      );
    }
    return true;
  }
}
