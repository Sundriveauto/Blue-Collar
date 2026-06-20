/**
 * Generic repository interface.
 * All model-specific repositories extend this contract.
 */
export interface IRepository<T, CreateInput, UpdateInput> {
  findById(id: string): Promise<T | null>
  findAll(opts?: { skip?: number; take?: number }): Promise<T[]>
  create(data: CreateInput): Promise<T>
  update(id: string, data: UpdateInput): Promise<T>
  delete(id: string): Promise<T>
  count(where?: Record<string, unknown>): Promise<number>
}
