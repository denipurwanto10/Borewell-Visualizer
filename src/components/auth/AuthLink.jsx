/**
 * Tautan antar halaman autentikasi tanpa memuat ulang aplikasi.
 * Tetap berupa <a href> sungguhan (klik tengah / Ctrl+klik / buka di tab baru berfungsi).
 */
export default function AuthLink({ href, children, className, ...props }) {
  const onClick = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (window.location.pathname !== href) window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo({ top: 0 });
  };
  return <a href={href} onClick={onClick} className={className} {...props}>{children}</a>;
}
