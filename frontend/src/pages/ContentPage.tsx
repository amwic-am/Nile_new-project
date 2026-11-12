import { type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, FileText, Mail, Phone } from 'lucide-react';
import { ButtonLink, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useContentPage, useSite } from '@/lib/queries';
import { useSeo } from '@/lib/seo';

const PRETTY_PATHS: Record<string, string> = {
  about: '/about',
  contact: '/contact',
  shipping: '/shipping',
  returns: '/returns',
  privacy: '/privacy',
  terms: '/terms',
};

export function contentPath(slug: string) {
  return PRETTY_PATHS[slug] ?? `/content/${slug}`;
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold text-brand-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="text-[14px] leading-[1.85] text-slate-warm">
        {inline(paragraph.join(' '))}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="space-y-2.5">
        {list.map((item, index) => (
          <li key={index} className="flex gap-2.5 text-[14px] leading-[1.75] text-slate-warm">
            <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-gold-500" aria-hidden />
            <span>{inline(item)}</span>
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushAll();
      continue;
    }
    if (trimmed.startsWith('### ')) {
      flushAll();
      blocks.push(
        <h3 key={`h3-${blocks.length}`} className="pt-1 text-[17px] font-bold text-brand-900">
          {inline(trimmed.slice(4))}
        </h3>,
      );
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushAll();
      blocks.push(
        <h2 key={`h2-${blocks.length}`} className="pt-2 text-[22px] font-extrabold text-brand-900">
          {inline(trimmed.slice(3))}
        </h2>,
      );
      continue;
    }
    if (trimmed.startsWith('- ')) {
      flushParagraph();
      list.push(trimmed.slice(2));
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushAll();

  return <div className="space-y-4">{blocks}</div>;
}

export default function ContentPage({ slug: slugProp }: { slug?: string }) {
  const params = useParams();
  const slug = slugProp ?? params.slug ?? '';
  const { data, isLoading, isError, error } = useContentPage(slug);
  const { data: site } = useSite();
  const page = data?.page;

  useSeo({
    title: page?.metaTitle || page?.title || 'Information',
    description: page?.metaDescription || undefined,
    canonicalPath: contentPath(slug),
  });

  const pages = site?.pages ?? [];

  if (isLoading) {
    return (
      <div className="container-page py-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-52 rounded-2xl" />
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !page) {
    return (
      <div className="container-page py-16 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-sand text-brand-900">
          <FileText className="size-6" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">Page not found</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-warm">
          {isError && error ? errorMessage(error) : 'This page is unavailable or has not been published.'}
        </p>
        <ButtonLink to="/" className="mt-6">
          Back to home
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="container-page py-8 sm:py-11">
      <div className="grid gap-8 lg:grid-cols-[1fr_280px] lg:gap-12">
        <article className="rounded-2xl border border-line bg-white p-6 shadow-soft sm:p-9">
          <p className="eyebrow mb-2">Nile Mart information</p>
          <h1 className="text-[28px] font-extrabold leading-tight sm:text-[34px]">{page.title}</h1>
          <p className="mt-2 text-[11.5px] text-slate-warm">Last updated {formatDate(page.updatedAt)}</p>
          <div className="mt-7 border-t border-line pt-6">
            <Markdown source={page.body} />
          </div>
        </article>

        <aside className="space-y-4">
          <nav aria-label="Information pages" className="rounded-2xl border border-line bg-white p-2">
            <p className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-warm">
              Help & information
            </p>
            {pages.length === 0 ? (
              <p className="px-3 py-2 text-[12px] text-slate-warm">No pages published yet.</p>
            ) : (
              pages.map((item) => (
                <Link
                  key={item.slug}
                  to={contentPath(item.slug)}
                  aria-current={item.slug === slug ? 'page' : undefined}
                  className={
                    item.slug === slug
                      ? 'mt-0.5 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2.5 text-[13px] font-semibold text-brand-900'
                      : 'mt-0.5 flex items-center justify-between rounded-xl px-3 py-2.5 text-[13px] text-slate-warm transition hover:bg-cream hover:text-brand-900'
                  }
                >
                  {item.title}
                  <ArrowRight className="size-3.5 opacity-50" />
                </Link>
              ))
            )}
          </nav>

          <div className="rounded-2xl bg-brand-900 p-5 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-300">Need help?</p>
            <p className="mt-2 font-display text-lg font-bold leading-snug">Our Addis Ababa team is here</p>
            <div className="mt-4 space-y-2.5 text-[12.5px] text-white/80">
              {site?.store.phone && (
                <a href={`tel:${site.store.phone.replace(/\s/g, '')}`} className="flex items-center gap-2 hover:text-white">
                  <Phone className="size-3.5 text-gold-400" /> {site.store.phone}
                </a>
              )}
              {site?.store.email && (
                <a href={`mailto:${site.store.email}`} className="flex items-center gap-2 hover:text-white">
                  <Mail className="size-3.5 text-gold-400" /> {site.store.email}
                </a>
              )}
            </div>
            <p className="mt-3 text-[11px] text-white/50">
              {site?.supportHours.weekdays ?? 'Monday to Saturday'}, 8:30–18:30 EAT
            </p>
            <ButtonLink to="/contact" size="sm" variant="gold" className="mt-4">
              Contact support
            </ButtonLink>
          </div>
        </aside>
      </div>
    </div>
  );
}
