// Tiny DOM helpers.
import { audio } from '../audio/audio';

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** Minecraft-style button with hover/click sounds. */
export function button(label: string, onClick: () => void, opts: { disabled?: boolean; wide?: boolean; small?: boolean; title?: string } = {}): HTMLButtonElement {
  const b = h('button', { class: `mc-btn${opts.wide ? ' wide' : ''}${opts.small ? ' small' : ''}`, title: opts.title }, label);
  if (opts.disabled) b.disabled = true;
  b.addEventListener('mouseenter', () => { if (!b.disabled) audio.play('hover'); });
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (b.disabled) return;
    audio.init();
    audio.play('click');
    onClick();
  });
  return b;
}

export function slider(label: (v: number) => string, min: number, max: number, step: number, value: number, onInput: (v: number) => void): HTMLElement {
  const wrap = h('div', { class: 'mc-slider' });
  const text = h('span', { class: 'mc-slider-label' }, label(value));
  const input = h('input', { type: 'range', min, max, step, value }) as HTMLInputElement;
  input.addEventListener('input', () => {
    const v = Number(input.value);
    text.textContent = label(v);
    onInput(v);
  });
  input.addEventListener('change', () => audio.play('click'));
  wrap.append(input, text);
  return wrap;
}

export function fmtDate(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
