import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export default function Dialog({
  children,
  className,
  titleId,
  closeLabel,
  onClose,
}: {
  children: ReactNode;
  className: string;
  titleId: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current
      ?.querySelector<HTMLElement>("button, input, select, textarea, a[href]")
      ?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close.current();
        return;
      }
      if (event.key !== "Tab") return;
      const targets = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary",
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = targets[0],
        last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div className="dialog-backdrop" onClick={() => close.current()}>
      <section
        ref={dialog}
        className={`dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button dialog-close"
          aria-label={closeLabel}
          onClick={onClose}
        >
          <X size={19} />
        </button>
        {children}
      </section>
    </div>
  );
}
