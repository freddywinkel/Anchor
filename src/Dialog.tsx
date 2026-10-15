import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Dialog({
  title,
  children,
  onClose,
  dismissOnBackdrop = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  dismissOnBackdrop?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const focusFrame = useRef(0);
  const backdropPointer = useRef<number | null>(null);
  const titleId = useId();
  function outsideDialog(
    dialog: HTMLDialogElement,
    clientX: number,
    clientY: number,
  ) {
    const bounds = dialog.getBoundingClientRect();
    return (
      clientX < bounds.left ||
      clientX > bounds.right ||
      clientY < bounds.top ||
      clientY > bounds.bottom
    );
  }
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement;
    const previousRoute = location.hash;
    dialog.showModal();
    return () => {
      cancelAnimationFrame(focusFrame.current);
      dialog.close();
      requestAnimationFrame(() => {
        const activeDialog =
          document.querySelector<HTMLDialogElement>("dialog[open]");
        if (activeDialog) {
          if (!activeDialog.contains(document.activeElement))
            activeDialog.querySelector<HTMLElement>("button")?.focus();
          return;
        }
        if (location.hash !== previousRoute) return;
        if (
          previous instanceof HTMLElement &&
          previous.isConnected &&
          previous !== document.body &&
          previous !== document.documentElement
        ) {
          previous.focus({ preventScroll: true });
          if (document.activeElement === previous) return;
        }
        // Switching dialogs can leave BODY as the captured opener. A draft
        // deletion can also replace the original button with a new page.
        const menu = document.querySelector<HTMLElement>(
          '[aria-label="Meer opties"]',
        );
        const fallback = menu?.getClientRects().length
          ? menu
          : document.querySelector<HTMLElement>("main h1");
        fallback?.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <dialog
      className="dp-dialog"
      ref={ref}
      aria-labelledby={titleId}
      onPointerDown={(event) => {
        backdropPointer.current =
          dismissOnBackdrop &&
          event.isPrimary &&
          event.button === 0 &&
          event.target === event.currentTarget &&
          outsideDialog(event.currentTarget, event.clientX, event.clientY)
            ? event.pointerId
            : null;
      }}
      onPointerUp={(event) => {
        const beganOutside = backdropPointer.current === event.pointerId;
        backdropPointer.current = null;
        if (
          dismissOnBackdrop &&
          beganOutside &&
          outsideDialog(event.currentTarget, event.clientX, event.clientY)
        )
          onClose();
      }}
      onPointerCancel={() => {
        backdropPointer.current = null;
      }}
      onFocusCapture={(event) => {
        const dialog = event.currentTarget;
        const target = event.target;
        if (!(target instanceof HTMLElement) || target === dialog) return;
        cancelAnimationFrame(focusFrame.current);
        focusFrame.current = requestAnimationFrame(() => {
          if (
            !dialog.open ||
            !dialog.contains(target) ||
            document.activeElement !== target
          )
            return;
          const bounds = dialog.getBoundingClientRect();
          const top = bounds.top + dialog.clientTop + 12;
          const bottom =
            bounds.top + dialog.clientTop + dialog.clientHeight - 12;
          const rect = target.getBoundingClientRect();
          const movement =
            rect.height > bottom - top || rect.top < top
              ? rect.top - top
              : rect.bottom > bottom
                ? rect.bottom - bottom
                : 0;
          // WebKit can focus a control outside a scrolled dialog. Move only
          // this dialog's content; the page behind it keeps its position.
          if (movement) dialog.scrollTop += movement;
        });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          // Search inputs can consume Escape to clear their text. Closing the
          // dialog should consistently cancel the pending criteria instead.
          event.preventDefault();
          onClose();
          return;
        }
        if (event.key !== "Tab") return;
        const controls = [
          ...ref.current!.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
          ),
        ].filter((element) => element.getClientRects().length);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="dp-section-head">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="dp-button"
          aria-label="Venster sluiten"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
