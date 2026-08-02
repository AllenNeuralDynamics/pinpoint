import { useQuasar } from "quasar";

/** A negative (error) or warning toast notifier, bound to the calling component's `$q`. */
export interface Notifier {
  notifyError: (message: string, caption: string) => void;
  notifyWarning: (message: string, caption: string) => void;
}

/**
 * Build negative and warning toast notifiers sharing Pinpoint's standard shape.
 */
export function useNotify(): Notifier {
  const $q = useQuasar();

  function notifyError(message: string, caption: string): void {
    $q.notify({ message, caption, color: "negative", icon: "error" });
  }

  function notifyWarning(message: string, caption: string): void {
    $q.notify({ message, caption, color: "warning", icon: "warning" });
  }

  return { notifyError, notifyWarning };
}
