/** Small circular avatar; shows the photo or a bilingual-name initial. */
export default function Avatar({ src, name = '', size = 32 }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-700"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initial || '👤'}
    </div>
  );
}
