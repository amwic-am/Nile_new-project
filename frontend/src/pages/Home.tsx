import { useHome } from '@/lib/queries';
import { useSeo, organizationJsonLd } from '@/lib/seo';
import {
  BrandStrip,
  CategoryGrid,
  Hero,
  PromoBanners,
  ProductRail,
  RecentlyViewedRail,
  Testimonials,
  TrustStrip,
} from '@/components/home/HomeSections';
import { ProductCardSkeleton } from '@/components/product/ProductCard';
import { Button } from '@/components/ui';

export default function HomePage() {
  const { data, isLoading, isError, refetch } = useHome();

  useSeo({
    title: data?.settings.seo.title ?? "Nile Mart — Ethiopia's premium online marketplace",
    description: data?.settings.seo.description,
    canonicalPath: '/',
    image: data?.banners.hero[0]?.imageUrl ?? null,
    jsonLd: organizationJsonLd(),
  });

  if (isLoading) {
    return (
      <div className="container-page pt-6">
        <div className="h-[440px] animate-pulse rounded-[26px] bg-sand sm:h-[520px]" />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-sand" />
          ))}
        </div>
        <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container-page py-24 text-center">
        <h1 className="text-2xl font-bold">The store could not load</h1>
        <p className="mt-2 text-sm text-slate-warm">
          We hit a snag reaching Nile Mart. Check your connection and try again.
        </p>
        <Button className="mt-6" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const { banners, categories, sections, brands, testimonials } = data;

  return (
    <>
      <Hero banner={banners.hero[0]} />
      <TrustStrip />
      <CategoryGrid categories={categories} />

      <ProductRail
        eyebrow="Handpicked"
        title="Featured this week"
        description="A considered edit of products our team keeps recommending."
        products={sections.featured}
        href="/products?featured=1"
      />

      <PromoBanners banners={banners.promo} />

      <ProductRail
        eyebrow="Loved by shoppers"
        title="Best sellers"
        products={sections.bestSellers}
        href="/products?sort=popular"
        tone="sand"
      />

      <ProductRail
        eyebrow="Just landed"
        title="New arrivals"
        description="Fresh stock from the brands you trust, added this month."
        products={sections.newArrivals}
        href="/products?sort=newest"
      />

      {sections.deals.length > 0 && (
        <ProductRail
          eyebrow="Limited time"
          title="Deals worth a look"
          products={sections.deals}
          href="/products?deals=1"
          tone="sand"
        />
      )}

      {sections.recommended.length > 0 && (
        <ProductRail
          eyebrow="For you"
          title="Recommended picks"
          description="Based on what you have browsed and bought at Nile Mart."
          products={sections.recommended}
          href="/products?sort=popular"
        />
      )}

      <BrandStrip brands={brands} />
      <Testimonials testimonials={testimonials} />
      <RecentlyViewedRail />
    </>
  );
}
