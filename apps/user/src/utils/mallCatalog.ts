import type { Product, ProductCategory } from "@/services/mall";

export interface MallCategoryOption {
  id: string;
  name: string;
  code: string;
}

export function resolveMallCategoryOptions(
  configuredValues: string[],
  categories: ProductCategory[]
): MallCategoryOption[] {
  const available = uniqueCategories(categories);
  const configured = configuredValues
    .map(readConfiguredCategoryToken)
    .filter((value) => value && !isAllCategory(value));

  if (configured.length === 0) return available;

  const matched = configured
    .map((value) => available.find((category) => categoryMatches(category, value)))
    .filter((category): category is MallCategoryOption => Boolean(category));

  return matched.length > 0 ? uniqueCategoryOptions(matched) : available;
}

export function productCategoriesFromProducts(products: Product[]): ProductCategory[] {
  const seen = new Set<string>();
  const categories: ProductCategory[] = [];

  for (const product of products) {
    if (!product.category || seen.has(product.category.id)) continue;
    seen.add(product.category.id);
    categories.push({
      id: product.category.id,
      name: product.category.name,
      code: product.category.code,
      description: null,
      sortOrder: categories.length
    });
  }

  return categories;
}

function readConfiguredCategoryToken(value: string): string {
  const parts = value.split(/[｜|]/).map((item) => item.trim()).filter(Boolean);
  return parts[1] || parts[0] || "";
}

function isAllCategory(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "all" || normalized === "全部" || normalized === "*";
}

function categoryMatches(category: MallCategoryOption, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return [category.id, category.code, category.name].some((candidate) => candidate.trim().toLowerCase() === normalized);
}

function uniqueCategories(categories: ProductCategory[]): MallCategoryOption[] {
  return uniqueCategoryOptions(
    [...categories]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((category) => ({ id: category.id, name: category.name, code: category.code }))
  );
}

function uniqueCategoryOptions(categories: MallCategoryOption[]): MallCategoryOption[] {
  const seen = new Set<string>();
  return categories.filter((category) => {
    if (!category.id || seen.has(category.id)) return false;
    seen.add(category.id);
    return true;
  });
}
