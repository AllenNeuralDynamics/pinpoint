import { useQuasar } from "quasar";

/** An error, warning, or success toast notifier, bound to the calling component's `$q`. */
export interface Notifier {
  notifyError: (message: string, caption: string) => void;
  notifyWarning: (message: string, caption: string) => void;
  notifySuccess: (message: string, caption: string) => void;
}

/**
 * Build error, warning, and success toast notifiers using Quasar's predefined notify types.
 */
export function useNotify(): Notifier {
  const $q = useQuasar();

  function notifyError(message: string, caption: string): void {
    $q.notify({ message, caption, type: "negative" });
  }

  function notifyWarning(message: string, caption: string): void {
    $q.notify({ message, caption, type: "warning" });
  }

  function notifySuccess(message: string, caption: string): void {
    $q.notify({ message, caption, type: "positive" });
  }

  return { notifyError, notifyWarning, notifySuccess };
}
