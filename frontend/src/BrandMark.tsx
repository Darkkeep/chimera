/** The faceted lion, eagle, dragon and wings. Adjacent text supplies the brand name. */
export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return <img className={className} src={`${import.meta.env.BASE_URL}brand/app-icons/chimera-128.png?rev=rear-wings-20261024`} alt="" aria-hidden="true" width="48" height="48" draggable={false} />;
}
