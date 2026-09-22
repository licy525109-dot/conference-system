export function tableRowNumber(index: number, page = 1, pageSize = 20): number {
  const currentPage = Number.isInteger(page) && page > 0 ? page : 1;
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 20;
  return (currentPage - 1) * size + index + 1;
}
