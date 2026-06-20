export interface ApiResponse<T = undefined> {
  status: 'success' | 'error'
  message: string
  code: number
  data?: T
  token?: string
}

export interface PaginatedResult<T> {
  data: T[]
  meta: {
    total: number
    page: number
    limit: number
    pages: number
  }
}
