export function formatCent(value: number | null | undefined): string {
  const cent = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return (cent / 100).toFixed(2);
}
