import { describe, expect, it, vi } from "vitest";
import { useDragReorder } from "./useDragReorder";

function makeDragEvent(): DragEvent {
  return new DragEvent("dragover");
}

describe("useDragReorder", () => {
  it("calls reorder with the dragged and dropped-on indices after a startDrag", () => {
    const reorder = vi.fn();
    const { startDrag, dropRow } = useDragReorder(reorder);

    startDrag(0, makeDragEvent());
    dropRow(2);

    expect(reorder).toHaveBeenCalledWith(0, 2);
  });

  it("never calls reorder when a row is dropped without a preceding startDrag", () => {
    const reorder = vi.fn();
    const { dropRow } = useDragReorder(reorder);

    dropRow(2);

    expect(reorder).not.toHaveBeenCalled();
  });

  it("neither preventDefaults nor sets dropTargetIndex when dragOverRow fires before a startDrag", () => {
    const reorder = vi.fn();
    const { dragOverRow, dropTargetIndex } = useDragReorder(reorder);
    const event = makeDragEvent();
    const preventDefault = vi.spyOn(event, "preventDefault");

    dragOverRow(1, event);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(dropTargetIndex.value).toBeNull();
  });

  it("sets dropTargetIndex and prevents default when dragOverRow fires after a startDrag", () => {
    const reorder = vi.fn();
    const { startDrag, dragOverRow, dropTargetIndex } = useDragReorder(reorder);
    const event = makeDragEvent();
    const preventDefault = vi.spyOn(event, "preventDefault");

    startDrag(0, makeDragEvent());
    dragOverRow(1, event);

    expect(preventDefault).toHaveBeenCalled();
    expect(dropTargetIndex.value).toBe(1);
  });

  it("clears draggedIndex and dropTargetIndex on endDrag", () => {
    const reorder = vi.fn();
    const { startDrag, dragOverRow, endDrag, draggedIndex, dropTargetIndex } =
      useDragReorder(reorder);

    startDrag(0, makeDragEvent());
    dragOverRow(1, makeDragEvent());
    endDrag();

    expect(draggedIndex.value).toBeNull();
    expect(dropTargetIndex.value).toBeNull();
  });

  it("clears drag state after a drop", () => {
    const reorder = vi.fn();
    const { startDrag, dropRow, draggedIndex, dropTargetIndex } =
      useDragReorder(reorder);

    startDrag(0, makeDragEvent());
    dropRow(2);

    expect(draggedIndex.value).toBeNull();
    expect(dropTargetIndex.value).toBeNull();
  });
});
