import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Everything the landing dashboard needs, in one round trip.
 *
 * The counts are computed in the database rather than by pulling rows and
 * reducing in Node — a year of MOPs is a lot of rows to move just to count them.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const since = new Date();
    since.setMonth(since.getMonth() - 5, 1);
    since.setHours(0, 0, 0, 0);

    const [
      mopTotal,
      mopThisMonth,
      packageTotal,
      projectTotal,
      userTotal,
      uplItems,
      batches,
    ] = await Promise.all([
      this.prisma.mopDocument.count(),
      this.prisma.mopDocument.count({ where: { createdAt: { gte: startOfMonth() } } }),
      this.prisma.package.count(),
      this.prisma.projectCategory.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.uplItem.count(),
      this.prisma.mopBatch.count(),
    ]);

    const [byProject, byCategory, byImpact, monthly, recentMops, recentPackages, valueRows] =
      await Promise.all([
        this.mopsByProject(),
        this.mopsByCategory(),
        this.mopsByImpact(),
        this.mopsByMonth(since),
        this.recentMops(),
        this.recentPackages(),
        this.packageValue(),
      ]);

    return {
      cards: {
        mopTotal,
        mopThisMonth,
        packageTotal,
        projectTotal,
        userTotal,
        uplItems,
        batches,
        packageValue: valueRows._sum.netAmount ? Number(valueRows._sum.netAmount) : 0,
      },
      byProject,
      byCategory,
      byImpact,
      monthly,
      recentMops,
      recentPackages,
    };
  }

  /** Grouped by tracker site, using the title snapshotted at generation time. */
  private async mopsByProject() {
    const grouped = await this.prisma.mopDocument.groupBy({
      by: ['externalSiteId'],
      _count: { _all: true },
    });
    if (!grouped.length) return [];

    // One row per site is enough to recover the title and category colour
    // without joining the tracker, which may be unreachable.
    const samples = await this.prisma.mopDocument.findMany({
      where: { externalSiteId: { in: grouped.map((g: any) => g.externalSiteId) } },
      distinct: ['externalSiteId'],
      select: {
        externalSiteId: true,
        externalProjectTitle: true,
        externalCategory: true,
        projectCategory: { select: { colour: true } },
      },
    });
    const map = new Map<string, any>(samples.map((s: any) => [s.externalSiteId, s]));

    return grouped
      .map((g: any) => {
        const sample = map.get(g.externalSiteId);
        return {
          id: g.externalSiteId,
          name: sample?.externalProjectTitle || g.externalSiteId,
          slug: g.externalSiteId,
          category: sample?.externalCategory ?? '',
          colour: sample?.projectCategory?.colour ?? '#44489D',
          count: g._count._all,
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  private async mopsByCategory() {
    const grouped = await this.prisma.mopDocument.groupBy({
      by: ['mopCategoryId'],
      _count: { _all: true },
    });
    if (!grouped.length) return [];

    const cats = await this.prisma.mopCategory.findMany({
      where: { id: { in: grouped.map((g) => g.mopCategoryId) } },
    });
    const map = new Map(cats.map((c) => [c.id, c.name]));

    return grouped
      .map((g) => ({ id: g.mopCategoryId, name: map.get(g.mopCategoryId) ?? 'Unknown', count: g._count._all }))
      .sort((a, b) => b.count - a.count);
  }

  private async mopsByImpact() {
    const grouped = await this.prisma.mopDocument.groupBy({
      by: ['siteImpact'],
      _count: { _all: true },
    });
    return grouped.map((g) => ({ impact: g.siteImpact, count: g._count._all }));
  }

  /** Six months of MOP and package counts, zero-filled so the chart has no gaps. */
  private async mopsByMonth(since: Date) {
    const [mops, packages] = await Promise.all([
      this.prisma.mopDocument.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.package.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

    const buckets: { key: string; label: string; mops: number; packages: number }[] = [];
    const cursor = new Date(since);
    for (let i = 0; i < 6; i++) {
      buckets.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        label: cursor.toLocaleString('en-GB', { month: 'short' }),
        mops: 0,
        packages: 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const index = new Map(buckets.map((b) => [b.key, b]));
    const bump = (d: Date, field: 'mops' | 'packages') => {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = index.get(key);
      if (bucket) bucket[field]++;
    };

    mops.forEach((m) => bump(m.createdAt, 'mops'));
    packages.forEach((p) => bump(p.createdAt, 'packages'));
    return buckets;
  }

  private recentMops() {
    return this.prisma.mopDocument.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: {
        mopCategory: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });
  }

  private recentPackages() {
    return this.prisma.package.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true, siteNo: true, woNumber: true, netAmount: true,
        currency: true, status: true, createdAt: true,
      },
    });
  }

  private packageValue() {
    return this.prisma.package.aggregate({ _sum: { netAmount: true } });
  }
}

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
