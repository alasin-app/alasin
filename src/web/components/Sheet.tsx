// SPDX-License-Identifier: MIT
// iOS-style modal sheet: slides up from the bottom with a grabber on phones,
// a centred form sheet on larger screens. Escape, the backdrop and a downward
// swipe on the grabber close it; focus is kept inside while open.

import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open modals, topmost last: a sheet opened from another sheet handles the keys alone. */
const openModals: object[] = [];

export function useModalFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const token = {};
    openModals.push(token);
    el?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (openModals[openModals.length - 1] !== token) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab" && el) {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      openModals.splice(openModals.indexOf(token), 1);
      if (!openModals.length) document.body.classList.remove("modal-open");
      previous?.focus?.();
    };
  }, [open]);
  return ref;
}

export function Sheet(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Text of the close button in the sheet's navigation bar. */
  doneLabel: string;
  children: ComponentChildren;
}) {
  const ref = useModalFocus(props.open, props.onClose);
  const startY = useRef<number | null>(null);
  if (!props.open) return null;
  return (
    <div class="sheet-layer" role="presentation">
      <div class="sheet-backdrop" onClick={props.onClose} />
      <div class="sheet" role="dialog" aria-modal="true" aria-label={props.title} ref={ref}>
        <div
          class="sheet-grabber"
          aria-hidden="true"
          onTouchStart={(e) => (startY.current = e.touches[0]?.clientY ?? null)}
          onTouchEnd={(e) => {
            const end = e.changedTouches[0]?.clientY;
            if (startY.current !== null && end !== undefined && end - startY.current > 60) props.onClose();
            startY.current = null;
          }}
        />
        <header class="sheet-bar">
          <span />
          <h2 class="sheet-title">{props.title}</h2>
          <button type="button" class="btn-plain btn-bold" onClick={props.onClose}>
            {props.doneLabel}
          </button>
        </header>
        <div class="sheet-body">{props.children}</div>
      </div>
    </div>
  );
}

export interface SheetAction {
  label: string;
  destructive?: boolean;
  onSelect: () => void;
}

/**
 * Action sheet for confirmations: a bottom sheet on phones, a popover-style
 * card on larger screens. Destructive actions are shown in system red.
 */
export function ActionSheet(props: {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  actions: SheetAction[];
  cancelLabel: string;
}) {
  const ref = useModalFocus(props.open, props.onClose);
  if (!props.open) return null;
  return (
    <div class="sheet-layer action-layer" role="presentation">
      <div class="sheet-backdrop" onClick={props.onClose} />
      <div class="action-sheet" role="alertdialog" aria-modal="true" aria-label={props.title} ref={ref}>
        <div class="action-group">
          {(props.title || props.message) && (
            <div class="action-header">
              {props.title && <p class="action-title">{props.title}</p>}
              {props.message && <p class="action-message">{props.message}</p>}
            </div>
          )}
          {props.actions.map((a) => (
            <button
              type="button"
              class={`action-button${a.destructive ? " destructive" : ""}`}
              onClick={() => {
                props.onClose();
                a.onSelect();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div class="action-group">
          <button type="button" class="action-button action-cancel" onClick={props.onClose}>
            {props.cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
