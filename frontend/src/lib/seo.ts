import { useEffect } from 'react';

interface SeoInput {
  title: string;
  description?: string;
  canonicalPath?: string;
  image?: string | null;
  type?: 'website' | 'product' | 'article';
  jsonLd?: Record<string, unknown> | Record<string, unknown>[] | null;
  noIndex?: boolean;
}

const SITE_NAME = 'Nile Mart';
const DEFAULT_DESCRIPTION =
  "Shop electronics, fashion, home, beauty and more at Nile Mart. Genuine products, secure payment and delivery across Ethiopia.";
const DEFAULT_IMAGE = '/og-image.jpg';
const JSON_LD_ID = 'nm-json-ld';

function setMeta(attribute: 'name' | 'property', key: string, value: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', value);
}

function setLink(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }
  element.setAttribute('href', href);
}

export function useSeo({
  title,
  description = DEFAULT_DESCRIPTION,
  canonicalPath,
  image,
  type = 'website',
  jsonLd,
  noIndex,
}: SeoInput) {
  useEffect(() => {
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    document.title = fullTitle;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:site_name', SITE_NAME);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', description);

    const origin = window.location.origin;
    if (canonicalPath) {
      const canonical = new URL(canonicalPath, origin).toString();
      setLink('canonical', canonical);
      setMeta('property', 'og:url', canonical);
    }
    const absoluteImage = new URL(image || DEFAULT_IMAGE, origin).toString();
    setMeta('property', 'og:image', absoluteImage);
    setMeta('name', 'twitter:image', absoluteImage);
    setMeta('name', 'robots', noIndex ? 'noindex,nofollow' : 'index,follow');

    document.getElementById(JSON_LD_ID)?.remove();
    if (jsonLd) {
      const script = document.createElement('script');
      script.id = JSON_LD_ID;
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }
  }, [title, description, canonicalPath, image, type, jsonLd, noIndex]);
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: new URL(item.path, window.location.origin).toString(),
    })),
  };
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: window.location.origin,
    slogan: 'Shop quality. Live better.',
    areaServed: 'ET',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Addis Ababa',
      addressCountry: 'ET',
    },
  };
}
