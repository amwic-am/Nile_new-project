import type { Sql } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';

export interface CategoryNode {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  position: number;
  productCount: number;
  children: CategoryNode[];
}

export interface ProductCard {
  id: string;
  name: string;
  slug: string;
  sku: string;
  shortDescription: string;
  brand: { id: string; name: string; slug: string } | null;
  category: { id: string; name: string; slug: string } | null;
  priceSantim: number;
  compareAtPriceSantim: number | null;
  minPriceSantim: number;
  maxPriceSantim: number;
  discountPercent: number | null;
  imageUrl: string | null;
  imageAlt: string;
  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
  available: number;
  lowStockThreshold: number;
  inStock: boolean;
  lowStock: boolean;
  isFeatured: boolean;
  isNew: boolean;
  isWishlisted: boolean;
  colors: string[];
  sizes: string[];
  publishedAt: string | null;
}

export interface ListFilters {
  q?: string;
  categorySlug?: string;
  brands?: string[];
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  inStock?: boolean;
  colors?: string[];
  sizes?: string[];
  deals?: boolean;
  featured?: boolean;
}

export type SortKey =
  | 'relevance'
  | 'popular'
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'rating'
  | 'discount';

const BASE_FROM = `
  from products p
  left join brands b on b.id = p.brand_id
  left join categories c on c.id = p.category_id
  left join lateral (
    select sum(i.quantity - i.reserved)::int as available,
           min(i.low_stock_threshold)::int as low
      from product_variants pv
      join inventory i on i.variant_id = pv.id
     where pv.product_id = p.id and pv.is_active
  ) inv on true
`;

const CARD_COLUMNS = `
  p.id, p.name, p.slug, p.sku, p.short_description,
  p.base_price::int as price_santim,
  p.compare_at_price::int as compare_at_price_santim,
  p.rating_avg::float8 as rating_avg,
  p.rating_count::int as rating_count,
  p.sold_count::int as sold_count,
  p.is_featured,
  p.published_at,
  b.id as brand_id, b.name as brand_name, b.slug as brand_slug,
  c.id as category_id, c.name as category_name, c.slug as category_slug,
  img.url as image_url, img.alt as image_alt,
  coalesce(inv.available, 0)::int as available,
  coalesce(inv.low, p.low_stock_threshold)::int as low_stock_threshold,
  coalesce(v.min_price, p.base_price)::int as min_price_santim,
  coalesce(v.max_price, p.base_price)::int as max_price_santim,
  attrs.colors, attrs.sizes,
  (wi.product_id is not null) as is_wishlisted
`;

const CARD_FROM = `
  ${BASE_FROM}
  left join lateral (
    select url, alt from product_images pi
     where pi.product_id = p.id
     order by pi.position, pi.created_at
     limit 1
  ) img on true
  left join lateral (
    select min(pv.price) as min_price, max(pv.price) as max_price
      from product_variants pv
     where pv.product_id = p.id and pv.is_active
  ) v on true
  left join lateral (
    select array_agg(distinct pa.value) filter (where lower(pa.name) = 'color') as colors,
           array_agg(distinct pa.value) filter (where lower(pa.name) = 'size') as sizes
      from product_attributes pa
     where pa.product_id = p.id
  ) attrs on true
  left join wishlists wl on wl.profile_id = app.current_user_id()
  left join wishlist_items wi on wi.wishlist_id = wl.id and wi.product_id = p.id
`;

type CardRow = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  short_description: string;
  price_santim: number;
  compare_at_price_santim: number | null;
  rating_avg: number;
  rating_count: number;
  sold_count: number;
  is_featured: boolean;
  published_at: string | Date | null;
  brand_id: string | null;
  brand_name: string | null;
  brand_slug: string | null;
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  image_url: string | null;
  image_alt: string | null;
  available: number;
  low_stock_threshold: number;
  min_price_santim: number;
  max_price_santim: number;
  colors: string[] | null;
  sizes: string[] | null;
  is_wishlisted: boolean;
};

const iso = (value: string | Date | null | undefined) =>
  value ? new Date(value).toISOString() : null;

export function mapCard(row: CardRow): ProductCard {
  const price = Number(row.price_santim);
  const compare = row.compare_at_price_santim == null ? null : Number(row.compare_at_price_santim);
  const discountPercent =
    compare && compare > price ? Math.round(((compare - price) / compare) * 100) : null;
  const available = Number(row.available ?? 0);
  const publishedAt = iso(row.published_at);
  const isNew = publishedAt
    ? Date.now() - new Date(publishedAt).getTime() < 30 * 24 * 60 * 60 * 1000
    : false;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    shortDescription: row.short_description,
    brand: row.brand_id
      ? { id: row.brand_id, name: row.brand_name ?? '', slug: row.brand_slug ?? '' }
      : null,
    category: row.category_id
      ? { id: row.category_id, name: row.category_name ?? '', slug: row.category_slug ?? '' }
      : null,
    priceSantim: price,
    compareAtPriceSantim: compare,
    minPriceSantim: Number(row.min_price_santim ?? price),
    maxPriceSantim: Number(row.max_price_santim ?? price),
    discountPercent,
    imageUrl: row.image_url,
    imageAlt: row.image_alt || row.name,
    ratingAvg: Number(row.rating_avg ?? 0),
    ratingCount: Number(row.rating_count ?? 0),
    soldCount: Number(row.sold_count ?? 0),
    available,
    lowStockThreshold: Number(row.low_stock_threshold ?? 5),
    inStock: available > 0,
    lowStock: available > 0 && available <= Number(row.low_stock_threshold ?? 5),
    isFeatured: row.is_featured,
    isNew,
    isWishlisted: Boolean(row.is_wishlisted),
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    publishedAt,
  };
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function buildConditions(filters: ListFilters, omit: string[] = []) {
  const values: unknown[] = [];
  const add = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const conditions = ["p.status = 'active'"];
  const skip = new Set(omit);

  if (filters.q && !skip.has('q')) {
    const term = filters.q.trim();
    if (term) {
      const searchParam = add(term);
      const likeParam = add(`%${escapeLike(term)}%`);
      conditions.push(
        `(p.search @@ websearch_to_tsquery('simple', ${searchParam}) or p.name ilike ${likeParam} or p.sku ilike ${likeParam} or b.name ilike ${likeParam})`,
      );
    }
  }
  if (filters.categorySlug && filters.categorySlug !== 'all' && !skip.has('category')) {
    conditions.push(
      `exists (
        with recursive subtree as (
          select id from categories where slug = ${add(filters.categorySlug)} and is_active
          union all
          select c2.id from categories c2 join subtree s on c2.parent_id = s.id where c2.is_active
        )
        select 1 from subtree where subtree.id = p.category_id
      )`,
    );
  }
  if (filters.brands?.length && !skip.has('brands')) {
    conditions.push(`b.slug = any(${add(filters.brands)}::text[])`);
  }
  if (filters.minPrice != null && !skip.has('price')) {
    conditions.push(`p.base_price >= ${add(filters.minPrice)}`);
  }
  if (filters.maxPrice != null && !skip.has('price')) {
    conditions.push(`p.base_price <= ${add(filters.maxPrice)}`);
  }
  if (filters.rating != null && filters.rating > 0 && !skip.has('rating')) {
    conditions.push(`p.rating_avg >= ${add(filters.rating)}`);
  }
  if (filters.inStock && !skip.has('inStock')) {
    conditions.push(`coalesce(inv.available, 0) > 0`);
  }
  if (filters.deals) {
    conditions.push(`p.compare_at_price is not null and p.compare_at_price > p.base_price`);
  }
  if (filters.featured) {
    conditions.push(`p.is_featured = true`);
  }
  if (filters.colors?.length && !skip.has('colors')) {
    conditions.push(
      `exists (select 1 from product_attributes pa where pa.product_id = p.id and lower(pa.name) = 'color' and lower(pa.value) = any(${add(
        filters.colors.map((color) => color.toLowerCase()),
      )}::text[]))`,
    );
  }
  if (filters.sizes?.length && !skip.has('sizes')) {
    conditions.push(
      `exists (select 1 from product_attributes pa where pa.product_id = p.id and lower(pa.name) = 'size' and lower(pa.value) = any(${add(
        filters.sizes.map((size) => size.toLowerCase()),
      )}::text[]))`,
    );
  }

  return { conditions, values };
}

async function fetchCards(
  db: Sql,
  conditions: string[],
  values: unknown[],
  orderBy: string,
  limit: number,
  offset = 0,
): Promise<ProductCard[]> {
  const limitParam = `$${values.length + 1}`;
  const offsetParam = `$${values.length + 2}`;
  const result = await db.query<CardRow>(
    `select ${CARD_COLUMNS} ${CARD_FROM}
      where ${conditions.join(' and ')}
      order by ${orderBy}
      limit ${limitParam} offset ${offsetParam}`,
    [...values, limit, offset],
  );
  return result.rows.map(mapCard);
}

function orderClause(sort: SortKey, hasQuery: boolean, values: unknown[]): string {
  switch (sort) {
    case 'newest':
      return 'p.published_at desc nulls last, p.created_at desc';
    case 'price_asc':
      return 'p.base_price asc, p.name asc';
    case 'price_desc':
      return 'p.base_price desc, p.name asc';
    case 'rating':
      return 'p.rating_avg desc, p.rating_count desc, p.sold_count desc';
    case 'discount':
      return '(coalesce(p.compare_at_price, 0) - p.base_price) desc, p.sold_count desc';
    case 'relevance':
      // Relevance ordering is built in listProducts when a search term exists.
      return 'p.sold_count desc';
    case 'popular':
    default:
      return 'p.sold_count desc, p.rating_avg desc, p.published_at desc';
  }
}

export async function listProducts(
  db: Sql,
  filters: ListFilters,
  options: { sort?: SortKey; page?: number; pageSize?: number; includeFacets?: boolean } = {},
) {
  const sort = options.sort ?? (filters.q ? 'relevance' : 'popular');
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, options.pageSize ?? 24));
  const { conditions, values } = buildConditions(filters);

  let orderBy: string;
  if (sort === 'relevance' && filters.q) {
    const rankParam = `$${values.length + 1}`;
    orderBy = `ts_rank(p.search, websearch_to_tsquery('simple', ${rankParam})) desc, p.sold_count desc`;
    values.push(filters.q);
  } else {
    orderBy = orderClause(sort, Boolean(filters.q), values);
  }

  const [items, totalResult] = await Promise.all([
    fetchCards(db, conditions, values, orderBy, pageSize, (page - 1) * pageSize),
    (async () => {
      const countResult = await db.query<{ total: number }>(
        `select count(*)::int as total ${BASE_FROM} where ${conditions.join(' and ')}`,
        // The count query must not include the ranking parameter, if any.
        filters.q && sort === 'relevance' ? values.slice(0, -1) : values,
      );
      return Number(countResult.rows[0]?.total ?? 0);
    })(),
  ]);

  let facets: {
    brands: { slug: string; name: string; count: number }[];
    attributes: { name: string; values: { value: string; count: number }[] }[];
    priceMin: number;
    priceMax: number;
  } | undefined;

  if (options.includeFacets !== false) {
    facets = await getFacets(db, filters);
  }

  return {
    items,
    page,
    pageSize,
    total: totalResult,
    totalPages: Math.max(1, Math.ceil(totalResult / pageSize)),
    sort,
    facets,
  };
}

async function getFacets(db: Sql, filters: ListFilters) {
  const brandFilter = buildConditions(filters, ['brands']);
  const attributeFilter = buildConditions(filters, ['colors', 'sizes']);
  const priceFilter = buildConditions(filters, ['price']);

  const [brands, attributes, bounds] = await Promise.all([
    db.query<{ slug: string; name: string; count: number }>(
      `select b.slug, b.name, count(distinct p.id)::int as count
       ${BASE_FROM}
       where ${brandFilter.conditions.join(' and ')} and b.id is not null
       group by b.id, b.slug, b.name
       order by count desc, b.name asc
       limit 24`,
      brandFilter.values,
    ),
    db.query<{ name: string; value: string; count: number }>(
      `select pa.name, pa.value, count(distinct p.id)::int as count
       ${BASE_FROM}
       join product_attributes pa on pa.product_id = p.id
       where ${attributeFilter.conditions.join(' and ')}
       group by pa.name, pa.value
       order by lower(pa.name), count desc, pa.value
       limit 120`,
      attributeFilter.values,
    ),
    db.query<{ min_price: number | null; max_price: number | null }>(
      `select min(p.base_price)::int as min_price, max(p.base_price)::int as max_price
       ${BASE_FROM}
       where ${priceFilter.conditions.join(' and ')}`,
      priceFilter.values,
    ),
  ]);

  const grouped = new Map<string, { name: string; values: { value: string; count: number }[] }>();
  for (const row of attributes.rows) {
    const key = row.name.toLowerCase();
    let group = grouped.get(key);
    if (!group) {
      group = { name: row.name, values: [] };
      grouped.set(key, group);
    }
    group.values.push({ value: row.value, count: Number(row.count) });
  }

  return {
    brands: brands.rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      count: Number(row.count),
    })),
    attributes: [...grouped.values()],
    priceMin: Number(bounds.rows[0]?.min_price ?? 0),
    priceMax: Number(bounds.rows[0]?.max_price ?? 0),
  };
}

export async function getCategoryTree(db: Sql, includeEmpty = true): Promise<CategoryNode[]> {
  const result = await db.query<{
    id: string;
    parent_id: string | null;
    name: string;
    slug: string;
    description: string;
    image_url: string | null;
    position: number;
    product_count: number;
  }>(
    `select c.id, c.parent_id, c.name, c.slug, c.description, c.image_url, c.position,
            count(p.id)::int as product_count
       from categories c
       left join products p on p.category_id = c.id and p.status = 'active'
      where c.is_active = true
      group by c.id
      order by c.position asc, c.name asc`,
  );

  const nodes = new Map<string, CategoryNode>();
  for (const row of result.rows) {
    nodes.set(row.id, {
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      imageUrl: row.image_url,
      position: row.position,
      productCount: Number(row.product_count),
      children: [],
    });
  }

  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const rollUp = (node: CategoryNode): number => {
    node.productCount += node.children.reduce((sum, child) => sum + rollUp(child), 0);
    return node.productCount;
  };
  for (const root of roots) rollUp(root);

  if (!includeEmpty) {
    const prune = (nodesToCheck: CategoryNode[]): CategoryNode[] =>
      nodesToCheck
        .map((node) => ({ ...node, children: prune(node.children) }))
        .filter((node) => node.productCount > 0 || node.children.length > 0);
    return prune(roots);
  }
  return roots;
}

export async function getBrands(db: Sql) {
  const result = await db.query<{
    id: string;
    name: string;
    slug: string;
    description: string;
    logo_url: string | null;
    product_count: number;
  }>(
    `select b.id, b.name, b.slug, b.description, b.logo_url, count(p.id)::int as product_count
       from brands b
       left join products p on p.brand_id = b.id and p.status = 'active'
      where b.is_active = true
      group by b.id
      having count(p.id) > 0
      order by count(p.id) desc, b.name asc`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    logoUrl: row.logo_url,
    productCount: Number(row.product_count),
  }));
}

export async function getBanners(db: Sql) {
  const result = await db.query<{
    id: string;
    title: string;
    subtitle: string;
    eyebrow: string;
    image_url: string | null;
    link_url: string | null;
    link_label: string;
    placement: string;
    theme: string;
    position: number;
  }>(
    `select id, title, subtitle, eyebrow, image_url, link_url, link_label, placement, theme, position
       from banners
      where is_active = true
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at >= now())
      order by placement, position asc, created_at desc`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    eyebrow: row.eyebrow,
    imageUrl: row.image_url,
    linkUrl: row.link_url,
    linkLabel: row.link_label,
    placement: row.placement,
    theme: row.theme,
    position: row.position,
  }));
}

export async function getTestimonials(db: Sql) {
  const result = await db.query<{
    id: string;
    rating: number;
    title: string;
    body: string;
    reviewer_name: string;
    created_at: Date;
    product_name: string;
    product_slug: string;
  }>(
    `select r.id, r.rating, r.title, r.body, r.reviewer_name, r.created_at,
            p.name as product_name, p.slug as product_slug
       from reviews r
       join products p on p.id = r.product_id
      where r.status = 'approved' and r.rating >= 4 and length(r.body) >= 30
        and p.status = 'active'
      order by r.created_at desc
      limit 6`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    rating: Number(row.rating),
    title: row.title,
    body: row.body,
    reviewerName: row.reviewer_name || 'Verified customer',
    createdAt: iso(row.created_at),
    product: { name: row.product_name, slug: row.product_slug },
  }));
}

async function recommendedCards(db: Sql, userId: string | null | undefined) {
  if (userId) {
    const categories = await db.query<{ category_id: string }>(
      `select distinct p.category_id
         from orders o
         join order_items oi on oi.order_id = o.id
         join products p on p.id = oi.product_id
        where o.profile_id = app.current_user_id() and p.category_id is not null
        order by p.category_id
        limit 4`,
    );
    const ids = categories.rows.map((row) => row.category_id);
    if (ids.length) {
      const conditions = ["p.status = 'active'", `p.category_id = any($1::uuid[])`];
      const cards = await fetchCards(
        db,
        conditions,
        [ids],
        'p.rating_avg desc, p.sold_count desc',
        8,
      );
      if (cards.length >= 4) return cards;
    }
  }
  return fetchCards(
    db,
    ["p.status = 'active'", 'p.rating_count > 0'],
    [],
    'p.rating_avg desc, p.rating_count desc',
    8,
  );
}

export async function getHomeData(db: Sql, userId: string | null | undefined) {
  const [banners, categories, featured, bestSellers, newArrivals, deals, recommended, brands, testimonials] =
    await Promise.all([
      getBanners(db),
      getCategoryTree(db),
      fetchCards(db, ["p.status = 'active'", 'p.is_featured = true'], [], 'p.sold_count desc, p.rating_avg desc', 8),
      fetchCards(db, ["p.status = 'active'"], [], 'p.sold_count desc, p.rating_avg desc', 8),
      fetchCards(db, ["p.status = 'active'"], [], 'p.published_at desc nulls last', 8),
      fetchCards(
        db,
        ["p.status = 'active'", 'p.compare_at_price is not null', 'p.compare_at_price > p.base_price'],
        [],
        '(p.compare_at_price - p.base_price) desc, p.sold_count desc',
        8,
      ),
      recommendedCards(db, userId),
      getBrands(db),
      getTestimonials(db),
    ]);

  return {
    banners: {
      hero: banners.filter((banner) => banner.placement === 'hero'),
      promo: banners.filter((banner) => banner.placement === 'promo'),
    },
    categories,
    sections: { featured, bestSellers, newArrivals, deals, recommended },
    brands: brands.slice(0, 10),
    testimonials,
  };
}

export async function getSuggested(db: Sql, query: string) {
  const term = query.trim();
  if (!term) return { products: [], categories: [], brands: [] };
  const like = `%${escapeLike(term)}%`;

  const [products, categories, brands] = await Promise.all([
    db.query<CardRow>(
      `select ${CARD_COLUMNS} ${CARD_FROM}
        where p.status = 'active' and (p.name ilike $1 or p.sku ilike $1 or b.name ilike $1)
        order by p.sold_count desc
        limit 5`,
      [like],
    ),
    db.query<{ id: string; name: string; slug: string }>(
      `select id, name, slug from categories
        where is_active = true and name ilike $1
        order by position, name limit 4`,
      [like],
    ),
    db.query<{ id: string; name: string; slug: string }>(
      `select id, name, slug from brands
        where is_active = true and name ilike $1
        order by name limit 4`,
      [like],
    ),
  ]);

  return {
    products: products.rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      priceSantim: Number(row.price_santim),
      imageUrl: row.image_url,
      brandName: row.brand_name,
    })),
    categories: categories.rows,
    brands: brands.rows,
  };
}

export async function getProductCardsByIds(db: Sql, ids: string[]) {
  const clean = [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 24);
  if (!clean.length) return [];
  const result = await db.query<CardRow>(
    `select ${CARD_COLUMNS} ${CARD_FROM}
      where p.status = 'active' and p.id = any($1::uuid[])`,
    [clean],
  );
  const byId = new Map(result.rows.map((row) => [row.id, mapCard(row)]));
  return clean.map((id) => byId.get(id)).filter(Boolean);
}

export async function getProductDetail(db: Sql, slug: string) {
  const base = await db.query<{
    id: string;
    name: string;
    slug: string;
    sku: string;
    barcode: string | null;
    short_description: string;
    description: string;
    base_price: number;
    compare_at_price: number | null;
    rating_avg: number;
    rating_count: number;
    sold_count: number;
    view_count: number;
    is_featured: boolean;
    specs: { label: string; value: string }[];
    warranty_info: string;
    return_info: string;
    meta_title: string | null;
    meta_description: string | null;
    published_at: Date | null;
    created_at: Date;
    category_id: string | null;
    category_name: string | null;
    category_slug: string | null;
    brand_id: string | null;
    brand_name: string | null;
    brand_slug: string | null;
  }>(
    `select p.id, p.name, p.slug, p.sku, p.barcode, p.short_description, p.description,
            p.base_price::int as base_price, p.compare_at_price::int as compare_at_price,
            p.rating_avg::float8 as rating_avg, p.rating_count::int as rating_count,
            p.sold_count::int as sold_count, p.view_count::int as view_count,
            p.is_featured, p.specs, p.warranty_info, p.return_info,
            p.meta_title, p.meta_description, p.published_at, p.created_at,
            c.id as category_id, c.name as category_name, c.slug as category_slug,
            b.id as brand_id, b.name as brand_name, b.slug as brand_slug
       from products p
       left join categories c on c.id = p.category_id
       left join brands b on b.id = p.brand_id
      where p.slug = $1
      limit 1`,
    [slug],
  );
  const product = base.rows[0];
  if (!product) throw notFound('Product not found');

  const [images, options, optionValues, variants, attributes, reviewSummary, wishlisted, breadcrumbs, related] =
    await Promise.all([
      db.query<{ id: string; url: string; alt: string }>(
        `select id, url, alt from product_images where product_id = $1 order by position, created_at`,
        [product.id],
      ),
      db.query<{ id: string; name: string; position: number }>(
        `select id, name, position from product_options where product_id = $1 order by position, name`,
        [product.id],
      ),
      db.query<{ option_id: string; id: string; value: string; position: number }>(
        `select v.id, v.option_id, v.value, v.position
           from product_option_values v
           join product_options o on o.id = v.option_id
          where o.product_id = $1
          order by v.position, v.value`,
        [product.id],
      ),
      db.query<{
        id: string;
        sku: string;
        option_values: Record<string, string>;
        price: number;
        compare_at_price: number | null;
        image_url: string | null;
        quantity: number;
        reserved: number;
        low_stock_threshold: number;
      }>(
        `select pv.id, pv.sku, pv.option_values, pv.price::int as price,
                pv.compare_at_price::int as compare_at_price, pv.image_url,
                coalesce(i.quantity, 0)::int as quantity,
                coalesce(i.reserved, 0)::int as reserved,
                coalesce(i.low_stock_threshold, p.low_stock_threshold)::int as low_stock_threshold
           from product_variants pv
           join products p on p.id = pv.product_id
           left join inventory i on i.variant_id = pv.id
          where pv.product_id = $1 and pv.is_active = true
          order by pv.position, pv.sku`,
        [product.id],
      ),
      db.query<{ name: string; value: string; position: number }>(
        `select name, value, position from product_attributes where product_id = $1 order by lower(name), position, value`,
        [product.id],
      ),
      db.query<{ rating: number; count: number }>(
        `select rating, count(*)::int as count
           from reviews where product_id = $1 and status = 'approved'
          group by rating`,
        [product.id],
      ),
      db.query<{ exists: boolean }>(
        `select exists (
          select 1 from wishlists w
          join wishlist_items wi on wi.wishlist_id = w.id
          where w.profile_id = app.current_user_id() and wi.product_id = $1
        ) as exists`,
        [product.id],
      ),
      product.category_id
        ? db.query<{ id: string; name: string; slug: string }>(
            `with recursive path as (
               select id, name, slug, parent_id from categories where id = $1
               union all
               select c.id, c.name, c.slug, c.parent_id
                 from categories c join path on c.id = path.parent_id
             )
             select id, name, slug from path`,
            [product.category_id],
          )
        : Promise.resolve({ rows: [] as { id: string; name: string; slug: string }[] }),
      db.query<CardRow>(
        `select ${CARD_COLUMNS} ${CARD_FROM}
          where p.status = 'active' and p.id <> $1
            and ($2::uuid is null or p.category_id = $2::uuid)
          order by p.sold_count desc, p.rating_avg desc
          limit 8`,
        [product.id, product.category_id],
      ),
    ]);

  const valuesByOption = new Map<string, { id: string; value: string }[]>();
  for (const row of optionValues.rows) {
    const list = valuesByOption.get(row.option_id) ?? [];
    list.push({ id: row.id, value: row.value });
    valuesByOption.set(row.option_id, list);
  }

  const variantRows = variants.rows.map((row) => {
    const available = Math.max(0, Number(row.quantity) - Number(row.reserved));
    return {
      id: row.id,
      sku: row.sku,
      optionValues: row.option_values ?? {},
      priceSantim: Number(row.price),
      compareAtPriceSantim: row.compare_at_price == null ? null : Number(row.compare_at_price),
      imageUrl: row.image_url,
      available,
      inStock: available > 0,
      lowStock: available > 0 && available <= Number(row.low_stock_threshold),
    };
  });

  const distribution = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: Number(reviewSummary.rows.find((row) => Number(row.rating) === rating)?.count ?? 0),
  }));
  const availableTotal = variantRows.reduce((sum, variant) => sum + variant.available, 0);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    barcode: product.barcode,
    shortDescription: product.short_description,
    description: product.description,
    priceSantim: Number(product.base_price),
    compareAtPriceSantim: product.compare_at_price == null ? null : Number(product.compare_at_price),
    ratingAvg: Number(product.rating_avg),
    ratingCount: Number(product.rating_count),
    soldCount: Number(product.sold_count),
    viewCount: Number(product.view_count),
    isFeatured: product.is_featured,
    specs: Array.isArray(product.specs) ? product.specs : [],
    warrantyInfo: product.warranty_info,
    returnInfo: product.return_info,
    metaTitle: product.meta_title,
    metaDescription: product.meta_description,
    publishedAt: iso(product.published_at),
    createdAt: iso(product.created_at),
    category: product.category_id
      ? { id: product.category_id, name: product.category_name ?? '', slug: product.category_slug ?? '' }
      : null,
    brand: product.brand_id
      ? { id: product.brand_id, name: product.brand_name ?? '', slug: product.brand_slug ?? '' }
      : null,
    images: images.rows.map((row) => ({ id: row.id, url: row.url, alt: row.alt || product.name })),
    options: options.rows.map((option) => ({
      id: option.id,
      name: option.name,
      values: valuesByOption.get(option.id) ?? [],
    })),
    attributes: attributes.rows.map((row) => ({ name: row.name, value: row.value })),
    variants: variantRows,
    availableTotal,
    inStock: availableTotal > 0,
    lowStock: availableTotal > 0 && availableTotal <= 10,
    isWishlisted: Boolean(wishlisted.rows[0]?.exists),
    breadcrumbs: [...breadcrumbs.rows].reverse().map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
    })),
    reviewSummary: {
      average: Number(product.rating_avg),
      total: Number(product.rating_count),
      distribution,
    },
    related: related.rows.map(mapCard),
  };
}

export async function getProductReviews(
  db: Sql,
  slug: string,
  options: { page?: number; pageSize?: number; rating?: number } = {},
) {
  const product = await db.query<{ id: string; rating_avg: number; rating_count: number }>(
    `select id, rating_avg::float8 as rating_avg, rating_count::int as rating_count
       from products where slug = $1 limit 1`,
    [slug],
  );
  const row = product.rows[0];
  if (!row) throw notFound('Product not found');

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 10));
  const values: unknown[] = [row.id];
  let filter = `product_id = $1 and status = 'approved'`;
  if (options.rating) {
    values.push(options.rating);
    filter += ` and rating = $${values.length}`;
  }

  const countResult = await db.query<{ total: number }>(
    `select count(*)::int as total from reviews where ${filter}`,
    values,
  );
  values.push(pageSize, (page - 1) * pageSize);
  const items = await db.query<{
    id: string;
    rating: number;
    title: string;
    body: string;
    reviewer_name: string;
    verified_purchase: boolean;
    admin_reply: string | null;
    created_at: Date;
  }>(
    `select id, rating, title, body, reviewer_name, verified_purchase, admin_reply, created_at
       from reviews where ${filter}
      order by created_at desc
      limit $${values.length - 1} offset $${values.length}`,
    values,
  );

  const distribution = await db.query<{ rating: number; count: number }>(
    `select rating, count(*)::int as count from reviews
      where product_id = $1 and status = 'approved' group by rating`,
    [row.id],
  );

  return {
    summary: {
      average: Number(row.rating_avg),
      total: Number(row.rating_count),
      distribution: [5, 4, 3, 2, 1].map((rating) => ({
        rating,
        count: Number(distribution.rows.find((item) => Number(item.rating) === rating)?.count ?? 0),
      })),
    },
    items: items.rows.map((item) => ({
      id: item.id,
      rating: Number(item.rating),
      title: item.title,
      body: item.body,
      reviewerName: item.reviewer_name || 'Verified customer',
      verifiedPurchase: item.verified_purchase,
      adminReply: item.admin_reply,
      createdAt: iso(item.created_at),
    })),
    page,
    pageSize,
    total: Number(countResult.rows[0]?.total ?? 0),
    totalPages: Math.max(1, Math.ceil(Number(countResult.rows[0]?.total ?? 0) / pageSize)),
  };
}

export async function createOrUpdateReview(
  db: Sql,
  slug: string,
  userId: string,
  reviewerName: string,
  input: { rating: number; title: string; body: string },
) {
  const product = await db.query<{ id: string }>(
    `select id from products where slug = $1 and status = 'active' limit 1`,
    [slug],
  );
  const productId = product.rows[0]?.id;
  if (!productId) throw notFound('Product not found');

  const purchased = await db.query<{ order_id: string }>(
    `select o.id as order_id
       from orders o
       join order_items oi on oi.order_id = o.id
      where o.profile_id = $1 and oi.product_id = $2
        and o.status in ('delivered', 'shipped', 'out_for_delivery')
      order by o.placed_at desc
      limit 1`,
    [userId, productId],
  );
  const orderId = purchased.rows[0]?.order_id ?? null;

  if (!input.body.trim()) throw badRequest('Share a few words about the product');

  const existing = await db.query<{ id: string }>(
    `select id from reviews where product_id = $1 and profile_id = $2`,
    [productId, userId],
  );

  if (existing.rows[0]) {
    await db.query(
      `update reviews
          set rating = $2, title = $3, body = $4, status = 'pending',
              reviewer_name = $5, verified_purchase = $6, updated_at = now()
        where id = $1`,
      [existing.rows[0].id, input.rating, input.title, input.body, reviewerName, Boolean(orderId)],
    );
    return { status: 'pending', updated: true };
  }

  await db.query(
    `insert into reviews (product_id, profile_id, order_id, rating, title, body, status, reviewer_name, verified_purchase)
     values ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)`,
    [productId, userId, orderId, input.rating, input.title, input.body, reviewerName, Boolean(orderId)],
  );
  return { status: 'pending', updated: false };
}
