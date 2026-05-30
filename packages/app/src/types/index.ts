// ─── Core domain types ────────────────────────────────────────────────────────

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

// ─── Auth types ───────────────────────────────────────────────────────────────

/** Authenticated user shape returned from /auth/me and stored in AuthContext. */
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "user" | "curator" | "admin";
  verified: boolean;
  avatar?: string | null;
  onboardingCompleted?: boolean;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

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

// ─── API response wrappers ────────────────────────────────────────────────────

/** Standard API envelope returned by all endpoints. */
export interface ApiResponse<T> {
  data: T;
  meta?: Meta;
  status: string;
  code: number;
  message?: string;
}

/** Paginated list response. */
export type PaginatedResponse<T> = ApiResponse<T[]> & { meta: Meta };

// ─── Form types ───────────────────────────────────────────────────────────────

export interface LoginForm {
  email: string;
  password: string;
}

export interface RegisterForm {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}
