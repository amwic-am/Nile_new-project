import type * as React from 'react';
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-lg bg-sand', className)} {...props} />;
}

export { Skeleton };
