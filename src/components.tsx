import { tr } from '../shared/i18n';
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { COLORS, type Character } from '../shared/model';
import { initials } from './geometry';

export function Avatar({
  character,
  size = 36,
}: {
  character: Pick<Character, 'name' | 'color' | 'image'>;
  size?: number;
}) {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: character.image ? undefined : character.color,
        fontSize: size * 0.32,
      }}
    >
      {character.image ? <img src={character.image} alt="" /> : initials(character.name)}
    </span>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="color-picker">
      <div className="swatches">
        {COLORS.map((color) => (
          <button
            type="button"
            key={color}
            className={color.toLowerCase() === value.toLowerCase() ? 'swatch active' : 'swatch'}
            style={{ background: color }}
            aria-label={tr('colors.swatchLabel', color)}
            onClick={() => onChange(color)}
          >
            {color.toLowerCase() === value.toLowerCase() && <Check size={16} />}
          </button>
        ))}
      </div>
      <label className="custom-color">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={tr('colors.custom')}
        />
        <span>{value.toUpperCase()}</span>
      </label>
    </div>
  );
}

export function ScrollArea({
  className,
  scrollKey,
  positions,
  children,
}: {
  className: string;
  scrollKey: string;
  positions: Map<string, number>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.scrollTop = positions.get(scrollKey) || 0;
    const remember = () => positions.set(scrollKey, element.scrollTop);
    element.addEventListener('scroll', remember);
    return () => {
      if (element.isConnected) remember();
      element.removeEventListener('scroll', remember);
    };
  }, [scrollKey, positions]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current;
    const focusables = () =>
      Array.from(
        element?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]',
        ) || [],
      ).filter((el) => el.offsetParent !== null);
    const firstInput = element?.querySelector<HTMLElement>('input:not([type="file"]), select');
    (firstInput || focusables()[0])?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const list = focusables();
        const first = list[0];
        const last = list[list.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label={tr('actions.close')} onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="empty-hint">{children}</p>;
}
