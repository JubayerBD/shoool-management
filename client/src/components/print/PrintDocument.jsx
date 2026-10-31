import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SCHOOL } from '../../config/school.js';
import { amountInWords } from '../../utils/amountInWords.js';
import { t as bilingual } from '../../utils/bilingual.js';
import './print.css';

/** Formatting helpers shared by every printed document. */
export function useDocText() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const locale = lang === 'bn' ? 'bn-BD' : 'en-IN'; // en-IN groups digits as lakh/crore, like Bangladesh.
  const dateFormat = (options) => new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { timeZone: 'Asia/Dhaka', ...options });
  return {
    lang,
    d: (key, options) => t(`doc.${key}`, options),
    bt: (value) => bilingual(value, lang),
    money: (amount) => `৳ ${Number(amount || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    date: (value) => (value ? dateFormat({ day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—'),
    dateTime: (value) => dateFormat({ day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)),
    words: (amount) => amountInWords(amount, lang),
  };
}

// The logo file is optional. Probe it once so the letterhead shows the monogram
// until a real image is confirmed (never a broken-image box on paper).
let logoProbe;
function useLogoReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!SCHOOL.logo) return undefined;
    logoProbe ??= new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth > 0);
      image.onerror = () => resolve(false);
      image.src = SCHOOL.logo;
    });
    let current = true;
    logoProbe.then((ok) => { if (current) setReady(ok); });
    return () => { current = false; };
  }, []);
  return ready;
}

function Letterhead() {
  const { d, bt } = useDocText();
  const logoReady = useLogoReady();
  const address = [bt(SCHOOL.address), SCHOOL.established && `${d('established')} ${SCHOOL.established}`].filter(Boolean);
  const contacts = [
    SCHOOL.eiin && `${d('eiin')}: ${SCHOOL.eiin}`,
    SCHOOL.phone && `${d('phone')}: ${SCHOOL.phone}`,
    SCHOOL.email && `${d('email')}: ${SCHOOL.email}`,
  ].filter(Boolean);
  return (
    <header className="doc-letterhead">
      <div className="doc-logo">
        {logoReady
          ? <img src={SCHOOL.logo} alt="" />
          : <span className="doc-monogram">{SCHOOL.monogram}</span>}
      </div>
      <div className="doc-school">
        <div className="doc-school-bn">{SCHOOL.name.bn}</div>
        <div className="doc-school-en">{SCHOOL.name.en}</div>
        {address.length > 0 && <div className="doc-school-meta">{address.join(' · ')}</div>}
        {contacts.length > 0 && <div className="doc-school-meta">{contacts.join(' · ')}</div>}
      </div>
      <div className="doc-logo" aria-hidden="true" />
    </header>
  );
}

function Sheet({ title, copies, stamp, signatures, printedAt, children }) {
  const { d, dateTime } = useDocText();
  return (
    <div className={`doc-sheet${copies.length > 1 ? ' doc-compact' : ''}`}>
      {copies.map((copy, index) => (
        <Fragment key={index}>
          {index > 0 && <div className="doc-cut" aria-hidden="true"><span>✂</span></div>}
          <section className="doc-copy">
            <Letterhead />
            <div className="doc-titlebar">
              {stamp && <span className={`doc-stamp doc-stamp-${stamp.tone}`}>{stamp.label}</span>}
              <span className="doc-title">{title}</span>
              {copy && <span className="doc-copy-label">{copy}</span>}
            </div>
            {children}
            {signatures.length > 0 && (
              <div className="doc-signatures" style={{ gridTemplateColumns: `repeat(${signatures.length}, 1fr)` }}>
                {signatures.map((signature, i) => {
                  const { label, name } = typeof signature === 'string' ? { label: signature } : signature;
                  return <div key={i} className="doc-sig"><div className="doc-sig-name">{name || ''}</div><div className="doc-sig-line">{label}</div></div>;
                })}
              </div>
            )}
            <footer className="doc-footer">
              <span>{d('computerGenerated')}</span>
              <span>{d('printedOn', { date: dateTime(printedAt) })}</span>
            </footer>
          </section>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * A printable A4 document with the school letterhead. Shows an on-screen preview and
 * prints from a copy mounted directly under <body>, so modals, scroll containers and
 * app chrome never clip or push the page.
 *
 * @param {string}   title       Document title, e.g. "Money Receipt".
 * @param {Array}    copies      One label per copy, e.g. ['Student copy', 'Office copy'].
 * @param {{label:string,tone:'paid'|'partial'|'unpaid'|'cancelled'}} [stamp]
 * @param {Array<string|{label:string,name?:string}>} signatures
 * @param {React.ReactNode} toolbar  Extra buttons shown beside Print.
 */
export default function PrintDocument({ title, copies = [null], stamp, signatures = [], toolbar, children }) {
  const { t } = useTranslation();
  const { d } = useDocText();
  const printRef = useRef(null);
  const [printedAt, setPrintedAt] = useState(() => new Date());

  const print = async () => {
    setPrintedAt(new Date());
    await document.fonts?.ready;
    const target = printRef.current;
    if (!target) return;
    const cleanup = () => {
      document.body.classList.remove('doc-printing');
      target.classList.remove('doc-print-target');
      window.removeEventListener('afterprint', cleanup);
    };
    document.body.classList.add('doc-printing');
    target.classList.add('doc-print-target');
    window.addEventListener('afterprint', cleanup);
    // Let React commit the new "printed on" time before the print snapshot.
    requestAnimationFrame(() => window.print());
  };

  const sheet = <Sheet title={title} copies={copies} stamp={stamp} signatures={signatures} printedAt={printedAt}>{children}</Sheet>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2 no-print">
        {toolbar}
        <span className="text-xs text-slate-400">
          {d('paperA4')}{copies.length > 1 ? ` · ${d('copiesPerPage', { count: copies.length })}` : ''}
        </span>
        <button
          type="button"
          onClick={print}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          🖨 {t('common.print')}
        </button>
      </div>
      <div className="doc-preview">{sheet}</div>
      {createPortal(<div ref={printRef} className="doc-print">{sheet}</div>, document.body)}
    </div>
  );
}

/** Label/value pairs laid out in two columns. Pass [label, value] rows. */
export function DocFields({ rows }) {
  return (
    <dl className="doc-fields">
      {rows.filter(Boolean).map(([label, value]) => (
        <div key={label} className="doc-field"><dt>{label}</dt><dd>{value || '—'}</dd></div>
      ))}
    </dl>
  );
}

/**
 * Itemised table with a totals footer.
 * @param {Array<{label:string, sub?:string, amount:number}>} items
 * @param {Array<{label:string, amount:number, minus?:boolean, strong?:boolean}>} totals
 */
export function DocItems({ items, totals = [] }) {
  const { d, money } = useDocText();
  return (
    <table className="doc-table">
      <thead>
        <tr><th className="sl">{d('sl')}</th><th>{d('particulars')}</th><th className="num">{d('amount')}</th></tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          <tr key={index}>
            <td className="sl">{index + 1}</td>
            <td>{item.label}{item.sub && <span className="doc-sub">{item.sub}</span>}</td>
            <td className="num">{money(item.amount)}</td>
          </tr>
        ))}
      </tbody>
      {totals.length > 0 && (
        <tfoot>
          {totals.filter(Boolean).map((row) => (
            <tr key={row.label} className={row.strong ? 'strong' : ''}>
              <td colSpan={2} className="label">{row.label}{row.sub && <span className="doc-sub">{row.sub}</span>}</td>
              <td className="num">{row.minus ? '− ' : ''}{money(row.amount)}</td>
            </tr>
          ))}
        </tfoot>
      )}
    </table>
  );
}

export function DocWords({ amount }) {
  const { d, words } = useDocText();
  return <p className="doc-words"><b>{d('inWords')}:</b>{words(amount)}</p>;
}

export function DocNote({ children }) {
  return <p className="doc-note">{children}</p>;
}
