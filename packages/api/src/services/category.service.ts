import { categoryRepository } from '../repositories/category.repository.js'
import { AppError } from './AppError.js'

/**
 * Return all categories ordered by name.
 */
export async function listCategories() {
  return categoryRepository.findAll()
}

/**
 * Get a single category by id.
 * @throws AppError 404 if not found.
 */
export async function getCategory(id: string) {
  const category = await categoryRepository.findById(id)
  if (!category) throw new AppError('Not found', 404)
  return category
}
