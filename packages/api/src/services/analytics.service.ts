import { db } from '../db.js'
import { AppError } from './AppError.js'

// ── Recording helpers ────────────────────────────────────────────────────────

export async function recordProfileView(workerId: string, ip: string) {
  const worker = await db.worker.findUnique({ where: { id: workerId } })
  if (!worker) throw new AppError('Worker not found', 404)

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const existing = await db.profileView.findFirst({
    where: { workerId, ip, viewedAt: { gte: today } },
  })

  await db.workerAnalytics.upsert({
    where: { workerId },
    create: { workerId, totalViews: 1, uniqueViews: existing ? 0 : 1 },
    update: {
      totalViews: { increment: 1 },
      ...(existing ? {} : { uniqueViews: { increment: 1 } }),
    },
  })

  if (!existing) {
    await db.profileView.create({ data: { workerId, ip } })
  }
}

export async function recordTip(workerId: string, amount: number) {
  await db.workerAnalytics.upsert({
    where: { workerId },
    create: { workerId, totalTips: amount, tipCount: 1 },
    update: { totalTips: { increment: amount }, tipCount: { increment: 1 } },
  })
}

export async function updateBookmarkCount(workerId: string, delta: 1 | -1) {
  await db.workerAnalytics.upsert({
    where: { workerId },
    create: { workerId, bookmarkCount: delta === 1 ? 1 : 0 },
    update: { bookmarkCount: { increment: delta } },
  })
}

export async function recordContact(workerId: string) {
  await db.workerAnalytics.upsert({
    where: { workerId },
    create: { workerId, contactCount: 1 },
    update: { contactCount: { increment: 1 } },
  })
}

// ── Worker-level analytics (curator/admin) ───────────────────────────────────

export async function getWorkerAnalytics(workerId: string) {
  const worker = await db.worker.findUnique({
    where: { id: workerId },
    include: { category: true },
  })
  if (!worker) throw new AppError('Worker not found', 404)

  const analytics = await db.workerAnalytics.findUnique({ where: { workerId } })

  const [reviewAgg, recentViews, recentContacts] = await Promise.all([
    db.review.aggregate({
      where: { workerId, status: 'approved' },
      _avg: { rating: true },
      _count: true,
    }),
    db.profileView.groupBy({
      by: ['workerId'],
      where: {
        workerId,
        viewedAt: { gte: daysAgo(30) },
      },
      _count: true,
    }),
    db.contactRequest.count({
      where: { workerId, createdAt: { gte: daysAgo(30) } },
    }),
  ])

  const respondedContacts = await db.contactRequest.count({
    where: { workerId, status: { not: 'pending' } },
  })
  const totalContacts = await db.contactRequest.count({ where: { workerId } })
  const responseRate = totalContacts > 0 ? Math.round((respondedContacts / totalContacts) * 100) : 0

  return {
    workerId,
    workerName: worker.name,
    category: worker.category.name,
    totalViews: analytics?.totalViews ?? 0,
    uniqueViews: analytics?.uniqueViews ?? 0,
    viewsLast30Days: recentViews[0]?._count ?? 0,
    totalTips: analytics?.totalTips ?? 0,
    tipCount: analytics?.tipCount ?? 0,
    bookmarkCount: analytics?.bookmarkCount ?? 0,
    contactCount: analytics?.contactCount ?? 0,
    contactsLast30Days: recentContacts,
    responseRate,
    avgRating: reviewAgg._avg.rating ?? 0,
    reviewCount: reviewAgg._count,
    updatedAt: analytics?.updatedAt ?? null,
  }
}

// ── Curator analytics ────────────────────────────────────────────────────────

export async function getCuratorAnalytics(curatorId: string) {
  const workers = await db.worker.findMany({
    where: { curatorId },
    select: { id: true, name: true, isActive: true, category: { select: { name: true } } },
  })

  if (workers.length === 0) {
    return {
      totalWorkers: 0,
      activeWorkers: 0,
      workers: [],
      totals: { views: 0, uniqueViews: 0, tips: 0, tipCount: 0, bookmarks: 0, contacts: 0, avgRating: 0 },
    }
  }

  const workerIds = workers.map((w) => w.id)

  const [analyticsRows, reviewAgg, contactsThisMonth, viewsThisMonth] = await Promise.all([
    db.workerAnalytics.findMany({ where: { workerId: { in: workerIds } } }),
    db.review.aggregate({
      where: { workerId: { in: workerIds }, status: 'approved' },
      _avg: { rating: true },
      _count: true,
    }),
    db.contactRequest.count({
      where: { workerId: { in: workerIds }, createdAt: { gte: daysAgo(30) } },
    }),
    db.profileView.count({
      where: { workerId: { in: workerIds }, viewedAt: { gte: daysAgo(30) } },
    }),
  ])

  const analyticsMap = new Map(analyticsRows.map((a) => [a.workerId, a]))

  const workerSummaries = workers.map((w) => {
    const a = analyticsMap.get(w.id)
    return {
      id: w.id,
      name: w.name,
      category: w.category.name,
      isActive: w.isActive,
      views: a?.totalViews ?? 0,
      uniqueViews: a?.uniqueViews ?? 0,
      tips: a?.totalTips ?? 0,
      tipCount: a?.tipCount ?? 0,
      bookmarks: a?.bookmarkCount ?? 0,
      contacts: a?.contactCount ?? 0,
    }
  })

  const totals = analyticsRows.reduce(
    (acc, a) => ({
      views: acc.views + a.totalViews,
      uniqueViews: acc.uniqueViews + a.uniqueViews,
      tips: acc.tips + a.totalTips,
      tipCount: acc.tipCount + a.tipCount,
      bookmarks: acc.bookmarks + a.bookmarkCount,
      contacts: acc.contacts + a.contactCount,
    }),
    { views: 0, uniqueViews: 0, tips: 0, tipCount: 0, bookmarks: 0, contacts: 0 },
  )

  return {
    totalWorkers: workers.length,
    activeWorkers: workers.filter((w) => w.isActive).length,
    workers: workerSummaries,
    totals: {
      ...totals,
      avgRating: reviewAgg._avg.rating ?? 0,
      reviewCount: reviewAgg._count,
      contactsThisMonth,
      viewsThisMonth,
    },
  }
}

// ── Platform-wide analytics (admin) ──────────────────────────────────────────

export async function getPlatformAnalytics() {
  const now = new Date()
  const thirtyDaysAgo = daysAgo(30)
  const sixtyDaysAgo = daysAgo(60)

  const [
    totalWorkers,
    activeWorkers,
    totalUsers,
    totalCurators,
    workersThisMonth,
    workersLastMonth,
    usersThisMonth,
    usersLastMonth,
    totalViews,
    viewsThisMonth,
    totalReviews,
    reviewsThisMonth,
    totalContacts,
    contactsThisMonth,
    topCategories,
    recentWorkers,
    recentUsers,
    tipAgg,
    userGrowth,
    workerGrowth,
  ] = await Promise.all([
    db.worker.count(),
    db.worker.count({ where: { isActive: true } }),
    db.user.count(),
    db.user.count({ where: { role: 'curator' } }),
    db.worker.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.worker.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    db.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.user.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    db.profileView.count(),
    db.profileView.count({ where: { viewedAt: { gte: thirtyDaysAgo } } }),
    db.review.count(),
    db.review.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.contactRequest.count(),
    db.contactRequest.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.category.findMany({
      select: { id: true, name: true, _count: { select: { workers: true } } },
      orderBy: { workers: { _count: 'desc' } },
      take: 10,
    }),
    db.worker.findMany({
      select: { id: true, name: true, createdAt: true, category: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.user.findMany({
      select: { id: true, firstName: true, lastName: true, email: true, createdAt: true, role: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.workerAnalytics.aggregate({
      _sum: { totalTips: true, tipCount: true },
    }),
    getGrowthData('user', 6),
    getGrowthData('worker', 6),
  ])

  return {
    overview: {
      totalWorkers,
      activeWorkers,
      totalUsers,
      totalCurators,
    },
    engagement: {
      totalViews,
      viewsThisMonth,
      totalReviews,
      reviewsThisMonth,
      totalContacts,
      contactsThisMonth,
    },
    revenue: {
      totalTips: tipAgg._sum.totalTips ?? 0,
      totalTipCount: tipAgg._sum.tipCount ?? 0,
    },
    growth: {
      workersThisMonth,
      workersLastMonth,
      workerGrowthPct: calcGrowthPct(workersThisMonth, workersLastMonth),
      usersThisMonth,
      usersLastMonth,
      userGrowthPct: calcGrowthPct(usersThisMonth, usersLastMonth),
    },
    trends: {
      userGrowth,
      workerGrowth,
    },
    topCategories: topCategories.map((cat) => ({
      name: cat.name,
      count: cat._count.workers,
    })),
    recentWorkers,
    recentUsers,
  }
}

// ── View trends for a worker (daily views over N days) ───────────────────────

export async function getWorkerViewTrends(workerId: string, days = 30) {
  const worker = await db.worker.findUnique({ where: { id: workerId } })
  if (!worker) throw new AppError('Worker not found', 404)

  const since = daysAgo(days)
  const views = await db.profileView.findMany({
    where: { workerId, viewedAt: { gte: since } },
    select: { viewedAt: true },
    orderBy: { viewedAt: 'asc' },
  })

  const dailyMap = new Map<string, number>()
  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - (days - 1 - i))
    dailyMap.set(d.toISOString().slice(0, 10), 0)
  }
  for (const v of views) {
    const key = v.viewedAt.toISOString().slice(0, 10)
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1)
  }

  return Array.from(dailyMap.entries()).map(([date, count]) => ({ date, views: count }))
}

// ── Export analytics as CSV ──────────────────────────────────────────────────

export async function exportWorkerAnalyticsCsv(curatorId: string) {
  const workers = await db.worker.findMany({
    where: { curatorId },
    include: { category: true },
  })

  const workerIds = workers.map((w) => w.id)
  const analyticsRows = await db.workerAnalytics.findMany({
    where: { workerId: { in: workerIds } },
  })
  const analyticsMap = new Map(analyticsRows.map((a) => [a.workerId, a]))

  const reviewAggs = await Promise.all(
    workerIds.map(async (id) => {
      const agg = await db.review.aggregate({
        where: { workerId: id, status: 'approved' },
        _avg: { rating: true },
        _count: true,
      })
      return { id, avg: agg._avg.rating ?? 0, count: agg._count }
    }),
  )
  const reviewMap = new Map(reviewAggs.map((r) => [r.id, r]))

  const header = 'Worker Name,Category,Total Views,Unique Views,Tips (XLM),Tip Count,Bookmarks,Contacts,Avg Rating,Reviews'
  const rows = workers.map((w) => {
    const a = analyticsMap.get(w.id)
    const r = reviewMap.get(w.id)
    return [
      csvEscape(w.name),
      csvEscape(w.category.name),
      a?.totalViews ?? 0,
      a?.uniqueViews ?? 0,
      a?.totalTips ?? 0,
      a?.tipCount ?? 0,
      a?.bookmarkCount ?? 0,
      a?.contactCount ?? 0,
      (r?.avg ?? 0).toFixed(1),
      r?.count ?? 0,
    ].join(',')
  })

  return [header, ...rows].join('\n')
}

export async function exportPlatformAnalyticsCsv() {
  const workers = await db.worker.findMany({
    include: { category: true, curator: { select: { firstName: true, lastName: true } } },
  })

  const workerIds = workers.map((w) => w.id)
  const analyticsRows = await db.workerAnalytics.findMany({
    where: { workerId: { in: workerIds } },
  })
  const analyticsMap = new Map(analyticsRows.map((a) => [a.workerId, a]))

  const header = 'Worker Name,Category,Curator,Total Views,Unique Views,Tips (XLM),Tip Count,Bookmarks,Contacts'
  const rows = workers.map((w) => {
    const a = analyticsMap.get(w.id)
    return [
      csvEscape(w.name),
      csvEscape(w.category.name),
      csvEscape(`${w.curator.firstName} ${w.curator.lastName}`),
      a?.totalViews ?? 0,
      a?.uniqueViews ?? 0,
      a?.totalTips ?? 0,
      a?.tipCount ?? 0,
      a?.bookmarkCount ?? 0,
      a?.contactCount ?? 0,
    ].join(',')
  })

  return [header, ...rows].join('\n')
}

// ── Top workers leaderboard ──────────────────────────────────────────────────

export async function getTopWorkers(metric: 'views' | 'tips' | 'bookmarks' | 'rating', limit = 10) {
  const orderField = {
    views: 'totalViews',
    tips: 'totalTips',
    bookmarks: 'bookmarkCount',
    rating: 'avgRating',
  }[metric] as string

  const rows = await db.workerAnalytics.findMany({
    orderBy: { [orderField]: 'desc' },
    take: limit,
    include: { worker: { select: { name: true, category: { select: { name: true } } } } },
  })

  return rows.map((r, i) => ({
    rank: i + 1,
    workerId: r.workerId,
    workerName: r.worker.name,
    category: r.worker.category.name,
    totalViews: r.totalViews,
    totalTips: r.totalTips,
    bookmarkCount: r.bookmarkCount,
    avgRating: r.avgRating,
  }))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function calcGrowthPct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

async function getGrowthData(model: 'user' | 'worker', months: number) {
  const data: { month: string; count: number }[] = []
  const now = new Date()

  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const label = start.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })

    const count = await db[model].count({
      where: { createdAt: { gte: start, lt: end } },
    })
    data.push({ month: label, count })
  }

  return data
}
