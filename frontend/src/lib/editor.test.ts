import { describe, expect, it } from 'vitest';
import {
  addTextBox,
  appendPointToStroke,
  beginStroke,
  clearCanvas,
  getStrokeElements,
  getTextElements,
  redoElement,
  removeTextBox,
  undoElement,
  updateTextBox,
} from './editor';

describe('editor reducer', () => {
  it('supports undo and redo for saved strokes', () => {
    let state = beginStroke(undefined, '#ff3b30', { x: 10, y: 20 });
    state = appendPointToStroke(state, { x: 12, y: 24 });
    state = beginStroke(state, '#34c759', { x: 30, y: 44 });

    expect(getStrokeElements(state)).toHaveLength(2);

    state = undoElement(state);
    expect(getStrokeElements(state)).toHaveLength(1);
    expect(state.redoStack).toHaveLength(1);

    state = redoElement(state);
    expect(getStrokeElements(state)).toHaveLength(2);
    expect(state.redoStack).toHaveLength(0);
  });

  it('clears redo stack when a new stroke starts after undo', () => {
    let state = beginStroke(undefined, '#ff3b30', { x: 10, y: 20 });
    state = beginStroke(state, '#34c759', { x: 30, y: 44 });

    state = undoElement(state);
    expect(state.redoStack).toHaveLength(1);

    state = beginStroke(state, '#0a84ff', { x: 80, y: 96 });
    expect(state.redoStack).toHaveLength(0);
    const strokes = getStrokeElements(state);
    expect(strokes.at(-1)?.color).toBe('#0a84ff');
  });

  it('removes elements on clear', () => {
    let state = beginStroke(undefined, '#ff3b30', { x: 10, y: 20 });
    state = addTextBox(state, {
      color: '#0a84ff',
      text: '标记',
      x: 30,
      y: 44,
      width: 180,
      fontSize: 24,
    });
    state = clearCanvas();

    expect(state.elements).toEqual([]);
    expect(state.redoStack).toEqual([]);
  });

  it('adds and updates text boxes', () => {
    let state = addTextBox(undefined, {
      id: 'text-1',
      color: '#111111',
      text: '初始文本',
      x: 16,
      y: 28,
      width: 220,
      fontSize: 22,
    });

    expect(getTextElements(state)).toHaveLength(1);

    state = updateTextBox(state, 'text-1', {
      text: '修改后的文本',
      x: 40,
    });

    expect(getTextElements(state)[0]).toMatchObject({
      id: 'text-1',
      text: '修改后的文本',
      x: 40,
      y: 28,
    });
  });

  it('removes text boxes and supports redo', () => {
    let state = addTextBox(undefined, {
      id: 'text-2',
      color: '#111111',
      text: '待删除',
      x: 16,
      y: 28,
      width: 220,
      fontSize: 22,
    });

    state = removeTextBox(state, 'text-2');
    expect(getTextElements(state)).toHaveLength(0);
    expect(state.redoStack).toHaveLength(1);

    state = redoElement(state);
    expect(getTextElements(state)).toHaveLength(1);
  });
});
