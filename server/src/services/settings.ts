import type { Sql } from '../db/index.js';

export interface DeliveryMethod {
  id: string;
  label: string;
  description: string;
  fee: number;
  enabled: boolean;
}

export interface StoreSettings {
  store: {
    name: string;
    legalName: string;
    tagline: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    country: string;
    currency: string;
    timezone: string;
  };
  announcement: { enabled: boolean; message: string; link?: string };
  deliveryMethods: DeliveryMethod[];
  freeShippingThreshold: number;
  socialLinks: { label: string; url: string }[];
  returns: { windowDays: number; summary: string };
  seo: { title: string; description: string; keywords: string };
  supportHours: { weekdays: string; timezone: string };
  pages: { slug: string; title: string }[];
}

export async function getSetting<T>(db: Sql, key: string, fallback: T): Promise<T> {
  const result = await db.query<{ value: T }>(
    `select value from store_settings where key = $1`,
    [key],
  );
  return result.rows[0]?.value ?? fallback;
}

export async function getPublicSettings(db: Sql): Promise<StoreSettings> {
  const rows = await db.query<{ key: string; value: unknown }>(
    `select key, value from store_settings where is_public = true`,
  );
  const map = new Map(rows.rows.map((row) => [row.key, row.value]));
  const pages = await db.query<{ slug: string; title: string }>(
    `select slug, title from content_pages where is_published = true order by title`,
  );

  return {
    store: map.get('store') as StoreSettings['store'],
    announcement: map.get('announcement') as StoreSettings['announcement'],
    deliveryMethods: (map.get('delivery_methods') as DeliveryMethod[]) ?? [],
    freeShippingThreshold: Number(map.get('free_shipping_threshold') ?? 0),
    socialLinks: (map.get('social_links') as StoreSettings['socialLinks']) ?? [],
    returns: map.get('returns') as StoreSettings['returns'],
    seo: map.get('seo') as StoreSettings['seo'],
    supportHours: map.get('support_hours') as StoreSettings['supportHours'],
    pages: pages.rows,
  };
}

export async function getDeliveryMethods(db: Sql): Promise<DeliveryMethod[]> {
  const methods = await getSetting<DeliveryMethod[]>(db, 'delivery_methods', []);
  return methods.filter((method) => method.enabled);
}

export async function getFreeShippingThreshold(db: Sql): Promise<number> {
  return Number(await getSetting<number>(db, 'free_shipping_threshold', 0));
}
