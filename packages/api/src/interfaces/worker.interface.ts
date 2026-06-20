export interface CreateWorkerBody {
  name: string
  categoryId: string
  phone?: string
  email?: string
  bio?: string
  avatar?: string
  imageThumb?: string
  imageMedium?: string
  imageFull?: string
  walletAddress?: string
  locationId?: string
}

export interface UpdateWorkerBody extends Partial<CreateWorkerBody> {}

export interface WorkerQuery {
  category?: string       // single category id
  categories?: string     // comma-separated category ids
  search?: string
  lang?: string           // PostgreSQL regconfig language for FTS (default: 'simple')
  city?: string
  state?: string
  country?: string
  page?: string
  limit?: string
  minRating?: string      // minimum average rating (1-5)
  maxRating?: string      // maximum average rating (1-5)
  available?: string      // day of week 0-6
  listedSince?: string    // max years since listing
  sortBy?: string         // 'rating' | 'newest' | 'oldest' | 'name'
  sortOrder?: string      // 'asc' | 'desc'
  isVerified?: string     // 'true' | 'false'
}
