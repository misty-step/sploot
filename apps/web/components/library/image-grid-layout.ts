export const IMAGE_GRID_BREAKPOINT_COLS = Object.freeze({
  default: 4,
  1280: 4,
  1024: 3,
  768: 2,
  640: 1,
});

export const IMAGE_GRID_SCROLL_CLASS =
  'h-full overflow-auto px-0 pt-2 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-2 md:p-6';

export function getMobileFeedDockPaddingClass(failedEmbeddingsCount: number) {
  return failedEmbeddingsCount > 0
    ? 'pb-[calc(9rem+env(safe-area-inset-bottom))]'
    : undefined;
}
