export interface Category {
  id: string;
  name: string;
  icon?: string | null;
}

export interface PortfolioImage {
  id: string;
  url: string;
  caption?: string | null;
  order?: number;
}

export interface Worker {
  id: string;
  name: string;
  bio?: string | null;
  avatar?: string | null;
  phone?: string | null;
  email?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isVerified: boolean;
  locationId?: string | null;
  walletAddress?: string | null;
  category: Category;
  averageRating?: number | null;
  reviewCount?: number;
  portfolioImages?: PortfolioImage[];
}

export interface Review {
  id: string;
  rating: number;
  comment?: string | null;
  workerId: string;
  authorId: string;
  createdAt: string;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string | null;
  };
}

export interface Meta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface RatingDistributionEntry {
  rating: number;
  count: number;
  percentage: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: Meta;
  status: string;
  code: number;
}

// ── Analytics types ──────────────────────────────────────────────────────────

export interface WorkerAnalytics {
  workerId: string;
  workerName: string;
  category: string;
  totalViews: number;
  uniqueViews: number;
  viewsLast30Days: number;
  totalTips: number;
  tipCount: number;
  bookmarkCount: number;
  contactCount: number;
  contactsLast30Days: number;
  responseRate: number;
  avgRating: number;
  reviewCount: number;
  updatedAt: string | null;
}

export interface WorkerSummary {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
  views: number;
  uniqueViews: number;
  tips: number;
  tipCount: number;
  bookmarks: number;
  contacts: number;
}

export interface CuratorAnalytics {
  totalWorkers: number;
  activeWorkers: number;
  workers: WorkerSummary[];
  totals: {
    views: number;
    uniqueViews: number;
    tips: number;
    tipCount: number;
    bookmarks: number;
    contacts: number;
    avgRating: number;
    reviewCount: number;
    contactsThisMonth: number;
    viewsThisMonth: number;
  };
}

export interface PlatformAnalytics {
  overview: {
    totalWorkers: number;
    activeWorkers: number;
    totalUsers: number;
    totalCurators: number;
  };
  engagement: {
    totalViews: number;
    viewsThisMonth: number;
    totalReviews: number;
    reviewsThisMonth: number;
    totalContacts: number;
    contactsThisMonth: number;
  };
  revenue: {
    totalTips: number;
    totalTipCount: number;
  };
  growth: {
    workersThisMonth: number;
    workersLastMonth: number;
    workerGrowthPct: number;
    usersThisMonth: number;
    usersLastMonth: number;
    userGrowthPct: number;
  };
  trends: {
    userGrowth: Array<{ month: string; count: number }>;
    workerGrowth: Array<{ month: string; count: number }>;
  };
  topCategories: Array<{ name: string; count: number }>;
  recentWorkers: Array<{
    id: string;
    name: string;
    createdAt: string;
    category: { name: string };
  }>;
  recentUsers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    createdAt: string;
    role: string;
  }>;
}

export interface ViewTrend {
  date: string;
  views: number;
}

export interface TopWorker {
  rank: number;
  workerId: string;
  workerName: string;
  category: string;
  totalViews: number;
  totalTips: number;
  bookmarkCount: number;
  avgRating: number;
}
