/** The integrated wing, body, and tail. Adjacent text supplies the brand name. */
export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return <img className={className} src={`${import.meta.env.BASE_URL}brand/app-icons/chimera-128.png`} alt="" aria-hidden="true" width="48" height="48" draggable={false} />;
}
