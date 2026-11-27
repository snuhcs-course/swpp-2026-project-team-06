/** Measure intrinsic text, excluding the currently imposed textarea height. */
export function pageTextHeight(el: Pick<HTMLTextAreaElement, "style" | "scrollTop" | "scrollHeight">): number {
  const previous = el.style.height, scroll = el.scrollTop;
  el.style.height = "0px";
  // PageCanvas uses border-box with a one-pixel border on both sides.
  const height = Math.max(40, Math.ceil(el.scrollHeight) + 2);
  el.style.height = previous;
  el.scrollTop = scroll;
  return height;
}
