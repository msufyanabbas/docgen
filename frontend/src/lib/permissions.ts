/**
 * Per-user permissions.
 *
 * A resource is a screen or dataset; an action is what you can do to it.
 * Admins implicitly hold everything, so the stored map only ever needs to
 * describe non-admin accounts — that way promoting someone to Admin can't
 * leave them with a stale, narrower grant.
 */

export const RESOURCES = [
  'dashboard',
  'gcl',
  'mop',
  'projects',
  'projectCategories',
  'mopCategories',
  'priceList',
  'users',
] as const;

export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = ['view', 'create', 'edit', 'delete'] as const;
export type Action = (typeof ACTIONS)[number];

export type PermissionMap = Partial<Record<Resource, Partial<Record<Action, boolean>>>>;

export const RESOURCE_LABELS: Record<Resource, string> = {
  dashboard: 'Dashboard',
  gcl: 'GCL documents',
  mop: 'MOP documents',
  projects: 'Projects',
  projectCategories: 'Project categories',
  mopCategories: 'MOP categories',
  priceList: 'Price list',
  users: 'Users',
};

/** Actions that make sense per resource — the dashboard is read-only. */
export const RESOURCE_ACTIONS: Record<Resource, readonly Action[]> = {
  dashboard: ['view'],
  gcl: ['view', 'create', 'edit', 'delete'],
  mop: ['view', 'create', 'edit', 'delete'],
  projects: ['view', 'create', 'edit', 'delete'],
  projectCategories: ['view', 'create', 'edit', 'delete'],
  mopCategories: ['view', 'create', 'edit', 'delete'],
  priceList: ['view', 'create', 'edit', 'delete'],
  users: ['view', 'create', 'edit', 'delete'],
};

/**
 * What a new Project Manager gets. Deliberately able to do the day job —
 * raise GCLs and MOPs — without reshaping the platform underneath it.
 */
export const DEFAULT_PM_PERMISSIONS: PermissionMap = {
  dashboard: { view: true },
  gcl: { view: true, create: true, edit: true },
  mop: { view: true, create: true, edit: true },
  projects: { view: true },
  projectCategories: { view: true },
  mopCategories: { view: true },
};

export const ALL_PERMISSIONS: PermissionMap = Object.fromEntries(
  RESOURCES.map((r) => [r, Object.fromEntries(RESOURCE_ACTIONS[r].map((a) => [a, true]))]),
) as PermissionMap;

/** Admins bypass the map entirely. */
export function can(
  role: string,
  permissions: PermissionMap | null | undefined,
  resource: Resource,
  action: Action = 'view',
): boolean {
  if (role === 'ADMIN') return true;
  return Boolean(permissions?.[resource]?.[action]);
}

/** Drops unknown resources and actions, so a hand-edited payload can't widen
 *  the model or smuggle in keys the UI never shows. */
export function sanitize(input: unknown): PermissionMap {
  const out: PermissionMap = {};
  if (!input || typeof input !== 'object') return out;

  for (const resource of RESOURCES) {
    const raw = (input as Record<string, unknown>)[resource];
    if (!raw || typeof raw !== 'object') continue;

    const actions: Partial<Record<Action, boolean>> = {};
    for (const action of RESOURCE_ACTIONS[resource]) {
      if ((raw as Record<string, unknown>)[action] === true) actions[action] = true;
    }
    if (Object.keys(actions).length) out[resource] = actions;
  }
  return out;
}
