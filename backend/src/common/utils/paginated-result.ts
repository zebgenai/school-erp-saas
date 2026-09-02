export function paginatedResult<T>(data: T[], total: number, limit: number, skip: number) {
  return { data, total, limit, skip };
}
