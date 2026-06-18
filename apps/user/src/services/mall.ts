import { request } from "./request";
import { stringifyQuery } from "@/utils/query";

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
  lockedStock: number;
  soldCount: number;
  availableStock: number;
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
  detailImageUrls: string[];
  availableStock: number;
}

export function getProductCategories(): Promise<{ items: ProductCategory[] }> {
  return request<{ items: ProductCategory[] }>("/mall/categories", {
    auth: false
  });
}

export function getProducts(params: { page?: number; pageSize?: number; categoryId?: string; keyword?: string } = {}): Promise<ApiList<Product>> {
  const query = stringifyQuery(params);
  return request<ApiList<Product>>(`/mall/products${query ? `?${query}` : ""}`, {
    auth: false
  });
}

export function getProductDetail(id: string): Promise<Product> {
  return request<Product>(`/mall/products/${encodeURIComponent(id)}`, {
    auth: false
  });
}
