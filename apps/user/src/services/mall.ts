import { request } from "./request";

export interface ApiList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductCategory {
  id: string;
  name: string;
  code: string;
  description: string | null;
  sortOrder: number;
}

export interface ProductSku {
  id: string;
  name: string;
  priceCent: number;
  stock: number;
  soldCount: number;
  specsJson: Record<string, unknown> | null;
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
}

export interface Product {
  id: string;
  title: string;
  subtitle: string | null;
  descriptionJson: Record<string, unknown> | null;
  coverImageUrl: string | null;
  category: { id: string; name: string; code: string } | null;
  skus: ProductSku[];
  images: ProductImage[];
}

export function getProductCategories(): Promise<{ items: ProductCategory[] }> {
  return request<{ items: ProductCategory[] }>("/mall/categories", {
    auth: false
  });
}

export function getProducts(params: { page?: number; pageSize?: number; categoryId?: string; keyword?: string } = {}): Promise<ApiList<Product>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.categoryId) query.set("categoryId", params.categoryId);
  if (params.keyword) query.set("keyword", params.keyword);
  return request<ApiList<Product>>(`/mall/products${query.toString() ? `?${query.toString()}` : ""}`, {
    auth: false
  });
}

export function getProductDetail(id: string): Promise<Product> {
  return request<Product>(`/mall/products/${encodeURIComponent(id)}`, {
    auth: false
  });
}
