import type {
  EditorPoint,
  EditorState,
  EditorStroke,
  EditorTextBox,
} from '../types';

const DEFAULT_STATE: EditorState = {
  elements: [],
  redoStack: [],
};

const createTextId = (): string =>
  `text_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const beginStroke = (
  state: EditorState = DEFAULT_STATE,
  color: string,
  point: EditorPoint,
): EditorState => ({
  elements: [...state.elements, { kind: 'stroke', color, points: [point] }],
  redoStack: [],
});

export const appendPointToStroke = (
  state: EditorState = DEFAULT_STATE,
  point: EditorPoint,
): EditorState => {
  const currentStroke = state.elements.at(-1);

  if (!currentStroke || currentStroke.kind !== 'stroke') {
    return state;
  }

  const nextStroke: EditorStroke = {
    ...currentStroke,
    points: [...currentStroke.points, point],
  };

  return {
    elements: [...state.elements.slice(0, -1), nextStroke],
    redoStack: state.redoStack,
  };
};

export const addTextBox = (
  state: EditorState = DEFAULT_STATE,
  textBox: Omit<EditorTextBox, 'kind' | 'id'> & { id?: string },
): EditorState => ({
  elements: [
    ...state.elements,
    {
      kind: 'text',
      id: textBox.id ?? createTextId(),
      color: textBox.color,
      text: textBox.text,
      x: textBox.x,
      y: textBox.y,
      width: textBox.width,
      fontSize: textBox.fontSize,
    },
  ],
  redoStack: [],
});

export const updateTextBox = (
  state: EditorState = DEFAULT_STATE,
  id: string,
  patch: Partial<Omit<EditorTextBox, 'kind' | 'id'>>,
): EditorState => ({
  elements: state.elements.map((element) =>
    element.kind === 'text' && element.id === id
      ? {
          ...element,
          ...patch,
        }
      : element,
  ),
  redoStack: state.redoStack,
});

export const removeTextBox = (state: EditorState = DEFAULT_STATE, id: string): EditorState => {
  const target = state.elements.find((element) => element.kind === 'text' && element.id === id);

  if (!target) {
    return state;
  }

  return {
    elements: state.elements.filter((element) => !(element.kind === 'text' && element.id === id)),
    redoStack: [...state.redoStack, target],
  };
};

export const undoElement = (state: EditorState = DEFAULT_STATE): EditorState => {
  const currentElement = state.elements.at(-1);

  if (!currentElement) {
    return state;
  }

  return {
    elements: state.elements.slice(0, -1),
    redoStack: [...state.redoStack, currentElement],
  };
};

export const redoElement = (state: EditorState = DEFAULT_STATE): EditorState => {
  const nextElement = state.redoStack.at(-1);

  if (!nextElement) {
    return state;
  }

  return {
    elements: [...state.elements, nextElement],
    redoStack: state.redoStack.slice(0, -1),
  };
};

export const clearCanvas = (): EditorState => DEFAULT_STATE;

export const getStrokeElements = (state: EditorState = DEFAULT_STATE): EditorStroke[] =>
  state.elements.filter((element): element is EditorStroke => element.kind === 'stroke');

export const getTextElements = (state: EditorState = DEFAULT_STATE): EditorTextBox[] =>
  state.elements.filter((element): element is EditorTextBox => element.kind === 'text');

export const undoStroke = undoElement;
export const redoStroke = redoElement;
