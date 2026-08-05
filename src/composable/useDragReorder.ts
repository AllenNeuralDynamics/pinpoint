import { ref, type Ref } from "vue";

/**
 * Drag-and-drop reordering state and handlers for a list rendered as rows.
 * @param reorder Callback invoked with the dragged and dropped-on indices.
 */
export function useDragReorder(
  reorder: (fromIndex: number, toIndex: number) => void
): {
  draggedIndex: Ref<number | null>;
  dropTargetIndex: Ref<number | null>;
  startDrag: (index: number, event: DragEvent) => void;
  dragOverRow: (index: number, event: DragEvent) => void;
  dropRow: (index: number) => void;
  endDrag: () => void;
} {
  const draggedIndex = ref<number | null>(null);
  const dropTargetIndex = ref<number | null>(null);

  /**
   * Begin dragging the row at the given index.
   * @param index Index of the dragged row.
   * @param event Drag event to mark as a move.
   */
  function startDrag(index: number, event: DragEvent) {
    draggedIndex.value = index;
    if (event.dataTransfer) {
      event.dataTransfer.setData("text/plain", String(index));
      event.dataTransfer.effectAllowed = "move";
    }
  }

  /**
   * Mark the row at the given index as the drop target and allow the drop.
   * @param index Index of the row being hovered.
   * @param event Drag event to accept.
   */
  function dragOverRow(index: number, event: DragEvent) {
    if (draggedIndex.value === null) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    dropTargetIndex.value = index;
  }

  /**
   * Move the dragged row to the dropped-on index.
   * @param index Index the drag was dropped on.
   */
  function dropRow(index: number) {
    if (draggedIndex.value !== null) {
      reorder(draggedIndex.value, index);
    }
    endDrag();
  }

  /**
   * Clear drag state after a drop or a cancelled drag.
   */
  function endDrag() {
    draggedIndex.value = null;
    dropTargetIndex.value = null;
  }

  return {
    draggedIndex,
    dropTargetIndex,
    startDrag,
    dragOverRow,
    dropRow,
    endDrag
  };
}
