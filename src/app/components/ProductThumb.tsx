import { cn } from "@/lib/utils";
import type { Product } from "@/domain/types";
import ktl from "@/assets/products/ktl.webp";
import grd from "@/assets/products/grd.webp";
import drp from "@/assets/products/drp.webp";
import flt from "@/assets/products/flt.webp";
import cbj from "@/assets/products/cbj.webp";
import mug from "@/assets/products/mug.webp";

/**
 * Photos for the demo products, keyed by product code: free-to-use Unsplash
 * photos (Unsplash License), chosen with no brand logos in frame and
 * cropped square at 256 px. Credits are in the README. Any other product
 * shows its code instead.
 */
const PHOTOS: Record<string, string> = { KTL: ktl, GRD: grd, DRP: drp, FLT: flt, CBJ: cbj, MUG: mug };

const SIZE = {
  xs: "size-8 rounded-md text-[9px]",
  sm: "size-10 rounded-lg text-[10px]",
  lg: "size-16 rounded-xl text-xs sm:size-20",
} as const;

export function ProductThumb({ product, size = "sm", className }: { product: Pick<Product, "code">; size?: keyof typeof SIZE; className?: string }) {
  const src = PHOTOS[product.code];
  const cls = cn("shrink-0 bg-muted ring-1 ring-border", SIZE[size], className);
  if (src) return <img src={src} alt="" loading="lazy" decoding="async" draggable={false} className={cn(cls, "object-cover")} />;
  return (
    <span aria-hidden className={cn(cls, "grid place-items-center font-mono font-semibold text-muted-foreground")}>
      {product.code}
    </span>
  );
}
