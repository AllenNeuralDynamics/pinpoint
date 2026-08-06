import { useQuasar } from "quasar";

/** A negative (error), warning, or positive (success) toast notifier, bound to the calling component's `$q`. */
export interface Notifier {
  notifyError: (message: string, caption: string) => void;
  notifyWarning: (message: string, caption: string) => void;
  notifySuccess: (message: string, caption: string) => void;
}

/**
 * Build success, warning, and negative toast notifiers sharing Pinpoint's standard shape.
 */
export function useNotify(): Notifier {
  const $q = useQuasar();

  function notifyError(message: string, caption: string): void {
    $q.notify({ message, caption, color: "negative", icon: "error" });
  }

  function notifyWarning(message: string, caption: string): void {
    $q.notify({ message, caption, color: "warning", icon: "warning" });
  }

  function notifySuccess(message: string, caption: string): void {
    $q.notify({ message, caption, color: "positive", icon: "check_circle" });
  }

  return { notifyError, notifyWarning, notifySuccess };
}
