import { t } from '../i18n';

export const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, txt?: string | null): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

let toastT = 0;
export function toast(msg: string) {
  let d = document.querySelector<HTMLDivElement>('.toast');
  if (!d) { d = el('div', 'toast'); d.setAttribute('role', 'status'); document.body.appendChild(d); }
  d.textContent = msg; d.hidden = false;
  clearTimeout(toastT);
  toastT = window.setTimeout(() => { d!.hidden = true; }, 2000);
}

export function copyText(text: string, okMsg = t('copied')) {
  const fallback = () => {
    const ta = el('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(okMsg); } catch { toast(t('copyFailed')); }
    ta.remove();
  };
  try { navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback); } catch { fallback(); }
}

export const cssVar = (k: string) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
