import { computed, onScopeDispose, shallowRef, type ComputedRef } from "vue";
import { useEventListener } from "@vueuse/core";
import type { QInput } from "quasar";

/** Pixels the pointer must travel horizontally before a press becomes a drag. */
const DRAG_THRESHOLD_PIXELS = 3;

/** Body class that holds the resize cursor while a drag runs outside its field. */
const DRAGGING_BODY_CLASS = "drag-number--active";

/** Numeric inputs currently being scrubbed by a pointer drag. */
const activeDragCount = shallowRef(0);

/**
 * Whether any numeric input is currently being scrubbed, for callers that must
 * apply a scrubbed value immediately instead of animating to it.
 */
export const isNumberDragActive: ComputedRef<boolean> = computed(
  () => activeDragCount.value > 0
);

/** Value and per-pixel sensitivity a drag starts with. */
export interface NumberDragOrigin {
  value: number;
  step: number;
}

/** Accessors a {@link useNumberDrag} drag reads and writes. */
export interface NumberDragOptions {
  /** Reads the value and step a drag would start from, or null when the field is not drag-editable. */
  getDragOrigin: () => NumberDragOrigin | null;
  /** Writes the value a drag step produced. */
  setValue: (value: number) => void;
}

/**
 * Scrub a Quasar input's numeric value by dragging horizontally on it, leaving a
 * press without movement to focus the field for typing.
 * @param getField Getter for the input to scrub.
 * @param options Value accessors for the drag.
 */
export function useNumberDrag(
  getField: () => QInput | null | undefined,
  options: NumberDragOptions
): void {
  const getElement = () => (getField()?.$el as HTMLElement | undefined) ?? null;

  let startX: number | null = null;
  let origin: NumberDragOrigin | null = null;
  let isDragging = false;

  /**
   * Begin tracking a press, suppressing the focus and text selection it would
   * otherwise start; a press that never moves is honoured as a click on release.
   * @param event Press that may become a drag.
   */
  function onPointerDown(event: PointerEvent): void {
    const field = getField();
    const element = event.currentTarget as HTMLElement;
    if (
      event.button !== 0 ||
      field?.$props.disable === true ||
      field?.$props.readonly === true ||
      // A focused field is being typed into: leave the press to place the caret.
      element.contains(document.activeElement)
    ) {
      return;
    }
    const dragOrigin = options.getDragOrigin();
    if (dragOrigin === null) return;

    startX = event.clientX;
    origin = dragOrigin;
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
  }

  /**
   * Write the value the pointer's horizontal travel maps to, once that travel
   * passes the click threshold.
   * @param event Pointer movement during a tracked press.
   */
  function onPointerMove(event: PointerEvent): void {
    if (startX === null || origin === null) return;
    const deltaX = event.clientX - startX;
    if (!isDragging) {
      if (Math.abs(deltaX) < DRAG_THRESHOLD_PIXELS) return;
      isDragging = true;
      activeDragCount.value++;
      document.body.classList.add(DRAGGING_BODY_CLASS);
    }
    options.setValue(
      roundToStepPrecision(origin.value + deltaX * origin.step, origin.step)
    );
  }

  /** Release the global scrub state this field's drag holds, if it holds any. */
  function clearDrag(): void {
    if (!isDragging) return;

    isDragging = false;
    activeDragCount.value--;
    document.body.classList.remove(DRAGGING_BODY_CLASS);
  }

  /**
   * End a tracked press, focusing the field when it never became a drag.
   * @param event Release or cancellation of the tracked press.
   */
  function onPointerUp(event: PointerEvent): void {
    if (startX === null) return;
    const element = event.currentTarget as HTMLElement;
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
    startX = null;
    origin = null;
    if (isDragging) clearDrag();
    else getField()?.focus();
  }

  useEventListener(getElement, "pointerdown", onPointerDown);
  useEventListener(getElement, "pointermove", onPointerMove);
  useEventListener(getElement, ["pointerup", "pointercancel"], onPointerUp);

  onScopeDispose(clearDrag);
}

/**
 * Round a dragged value to the decimal places its step implies, so accumulated
 * steps land on clean values instead of float noise.
 * @param value Value the drag produced.
 * @param step Value change per pixel.
 */
function roundToStepPrecision(value: number, step: number): number {
  const decimals =
    step > 0 ? Math.min(20, Math.max(0, -Math.floor(Math.log10(step)))) : 0;
  return Number(value.toFixed(decimals));
}
