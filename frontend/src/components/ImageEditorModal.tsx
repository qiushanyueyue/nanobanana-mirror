import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Eraser, PencilLine, Redo2, Type, Undo2, X } from 'lucide-react';
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
} from '../lib/editor';
import type { EditorState, EditorTextBox } from '../types';

interface ImageEditorModalProps {
  imageUrl: string;
  onClose: () => void;
  onSave: (blob: Blob) => void;
}

const COLOR_SWATCHES = ['#ff3b30', '#ffcc00', '#30d158', '#0a84ff', '#f5f5f7'];
const DEFAULT_TEXT_WIDTH = 220;

const EMPTY_EDITOR_STATE: EditorState = {
  elements: [],
  redoStack: [],
};

type EditorTool = 'draw' | 'text';

const wrapText = (context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const source = text.trim();

  if (!source) {
    return [];
  }

  const paragraphs = source.split('\n');
  const lines: string[] = [];

  paragraphs.forEach((paragraph) => {
    if (!paragraph) {
      lines.push('');
      return;
    }

    let currentLine = '';

    Array.from(paragraph).forEach((character) => {
      const nextLine = `${currentLine}${character}`;

      if (!currentLine || context.measureText(nextLine).width <= maxWidth) {
        currentLine = nextLine;
        return;
      }

      lines.push(currentLine);
      currentLine = character;
    });

    if (currentLine) {
      lines.push(currentLine);
    }
  });

  return lines;
};

const drawTextBox = (
  context: CanvasRenderingContext2D,
  textBox: EditorTextBox,
  scaleX: number,
  scaleY: number,
) => {
  if (!textBox.text.trim()) {
    return;
  }

  const fontSize = textBox.fontSize * scaleY;
  const boxWidth = textBox.width * scaleX;

  context.font = `600 ${fontSize}px "IBM Plex Sans", "PingFang SC", sans-serif`;
  const lines = wrapText(context, textBox.text, boxWidth);
  const lineHeight = fontSize * 1.3;
  const x = textBox.x * scaleX;
  const y = textBox.y * scaleY;

  context.save();
  context.fillStyle = textBox.color;
  context.textBaseline = 'top';

  lines.forEach((line, index) => {
    context.fillText(line || ' ', x, y + index * lineHeight);
  });
  context.restore();
};

export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
  imageUrl,
  onClose,
  onSave,
}) => {
  const [strokeColor, setStrokeColor] = useState(COLOR_SWATCHES[0]);
  const [editorState, setEditorState] = useState<EditorState>(EMPTY_EDITOR_STATE);
  const [isImageReady, setIsImageReady] = useState(false);
  const [tool, setTool] = useState<EditorTool>('draw');
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const isDrawingRef = useRef(false);

  const strokeElements = useMemo(() => getStrokeElements(editorState), [editorState]);
  const textElements = useMemo(() => getTextElements(editorState), [editorState]);
  const canUndo = editorState.elements.length > 0;
  const canRedo = editorState.redoStack.length > 0;

  const redrawCanvas = useMemo(
    () => () => {
      const canvas = canvasRef.current;
      const image = imageRef.current;

      if (!canvas || !image) {
        return;
      }

      const context = canvas.getContext('2d');

      if (!context) {
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      strokeElements.forEach((stroke) => {
        if (stroke.points.length === 0) {
          return;
        }

        context.strokeStyle = stroke.color;
        context.lineWidth = Math.max(canvas.width * 0.005, 3);
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        context.moveTo(stroke.points[0].x, stroke.points[0].y);

        stroke.points.slice(1).forEach((point) => {
          context.lineTo(point.x, point.y);
        });

        context.stroke();
      });
    },
    [strokeElements],
  );

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;

      const canvas = canvasRef.current;

      if (!canvas) {
        return;
      }

      const maxWidth = 960;
      const maxHeight = 640;
      const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);

      canvas.width = image.width * ratio;
      canvas.height = image.height * ratio;
      setCanvasSize({
        width: canvas.width,
        height: canvas.height,
      });
      setIsImageReady(true);
    };
    image.src = imageUrl;

    return () => {
      imageRef.current = null;
      setCanvasSize({ width: 0, height: 0 });
      setIsImageReady(false);
    };
  }, [imageUrl]);

  useEffect(() => {
    if (isImageReady) {
      redrawCanvas();
    }
  }, [isImageReady, redrawCanvas]);

  const getCanvasPoint = (event: React.PointerEvent<HTMLElement>) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const bounds = canvas.getBoundingClientRect();
    const scaleX = canvas.width / bounds.width;
    const scaleY = canvas.height / bounds.height;

    return {
      x: (event.clientX - bounds.left) * scaleX,
      y: (event.clientY - bounds.top) * scaleY,
    };
  };

  const selectedText = textElements.find((element) => element.id === selectedTextId) ?? null;
  const commitSelectedText = () => {
    if (!selectedTextId) {
      return false;
    }

    const latest = getTextElements(editorState).find((item) => item.id === selectedTextId);

    if (latest && !latest.text.trim()) {
      setEditorState((state) => removeTextBox(state, selectedTextId));
    }

    setSelectedTextId(null);
    return true;
  };

  return (
    <div className="editor-modal" onClick={onClose}>
      <div className="editor-panel" onClick={(event) => event.stopPropagation()}>
        <div className="editor-toolbar">
          <div className="editor-swatches">
            {COLOR_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                className={`editor-swatch ${strokeColor === color ? 'active' : ''}`}
                style={{ background: color }}
                onClick={() => setStrokeColor(color)}
              />
            ))}
          </div>
          <div className="editor-actions">
            <button
              type="button"
              className={`editor-action-btn ${tool === 'draw' ? 'active' : ''}`}
              onClick={() => setTool('draw')}
            >
              <PencilLine size={16} />
              画笔
            </button>
            <button
              type="button"
              className={`editor-action-btn ${tool === 'text' ? 'active' : ''}`}
              onClick={() => setTool('text')}
            >
              <Type size={16} />
              文本框
            </button>
            <button
              type="button"
              className="editor-action-btn"
              onClick={() => setEditorState((state) => undoElement(state))}
              disabled={!canUndo}
            >
              <Undo2 size={16} />
              撤回
            </button>
            <button
              type="button"
              className="editor-action-btn"
              onClick={() => setEditorState((state) => redoElement(state))}
              disabled={!canRedo}
            >
              <Redo2 size={16} />
              前进
            </button>
            <button
              type="button"
              className="editor-action-btn"
              onClick={() => {
                setEditorState(clearCanvas());
                setSelectedTextId(null);
              }}
              disabled={!canUndo}
            >
              <Eraser size={16} />
              清空
            </button>
            <button
              type="button"
              className="editor-action-btn"
              onClick={() => {
                if (!selectedTextId) {
                  return;
                }

                setEditorState((state) => removeTextBox(state, selectedTextId));
                setSelectedTextId(null);
              }}
              disabled={!selectedTextId}
            >
              <X size={16} />
              删除文本
            </button>
          </div>
        </div>

        <div className="editor-canvas-shell">
          <div
            ref={stageRef}
            className="editor-stage"
            style={{
              width: canvasSize.width || undefined,
              height: canvasSize.height || undefined,
            }}
            onPointerDown={(event) => {
              const target = event.target as HTMLElement;

              if (
                tool !== 'text' ||
                (
                  event.target !== stageRef.current &&
                  event.target !== canvasRef.current &&
                  !target.classList.contains('editor-text-layer')
                )
              ) {
                return;
              }

              if (commitSelectedText()) {
                return;
              }

              const point = getCanvasPoint(event);
              const nextState = addTextBox(editorState, {
                color: strokeColor,
                text: '',
                x: point.x,
                y: point.y,
                width: Math.min(DEFAULT_TEXT_WIDTH, Math.max((canvasSize.width || 220) - point.x - 18, 140)),
                fontSize: Math.max((canvasSize.width || 600) * 0.032, 18),
              });
              const createdText = getTextElements(nextState).at(-1);
              setEditorState(nextState);
              setSelectedTextId(createdText?.id ?? null);
            }}
          >
            <canvas
              ref={canvasRef}
              className="editor-canvas"
              onPointerDown={(event) => {
                if (tool !== 'draw') {
                  return;
                }

                isDrawingRef.current = true;
                setSelectedTextId(null);
                setEditorState((state) => beginStroke(state, strokeColor, getCanvasPoint(event)));
              }}
              onPointerMove={(event) => {
                if (!isDrawingRef.current || tool !== 'draw') {
                  return;
                }

                setEditorState((state) => appendPointToStroke(state, getCanvasPoint(event)));
              }}
              onPointerUp={() => {
                isDrawingRef.current = false;
              }}
              onPointerLeave={() => {
                isDrawingRef.current = false;
              }}
            />

            <div className="editor-text-layer">
              {textElements.map((textBox) => {
                const isSelected = selectedTextId === textBox.id;

                return (
                  <div
                    key={textBox.id}
                    className={`editor-text-box ${isSelected ? 'active' : ''}`}
                    style={{
                      left: textBox.x,
                      top: textBox.y,
                      width: textBox.width,
                      color: textBox.color,
                      fontSize: textBox.fontSize,
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setSelectedTextId(textBox.id);
                    }}
                  >
                    {isSelected ? (
                      <textarea
                        className="editor-text-input"
                        autoFocus
                        placeholder="输入文字"
                        value={textBox.text}
                        onChange={(event) =>
                          setEditorState((state) =>
                            updateTextBox(state, textBox.id, { text: event.target.value }),
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            commitSelectedText();
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="editor-text-display"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedTextId(textBox.id);
                        }}
                      >
                        {textBox.text}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="editor-footer">
          <div className="editor-footer-tip">
            {tool === 'draw' ? '拖动画笔进行标注' : '点击图片空白处添加文本框'}
            {selectedText ? '，可直接输入文字' : ''}
          </div>
          <div className="editor-footer-actions">
            <button type="button" className="editor-secondary-btn" onClick={onClose}>
              <X size={16} />
              取消
            </button>
            <button
              type="button"
              className="editor-primary-btn"
              onClick={() => {
                const canvas = canvasRef.current;
                const image = imageRef.current;

                if (!canvas || !image) {
                  return;
                }

                const exportCanvas = document.createElement('canvas');
                exportCanvas.width = image.width;
                exportCanvas.height = image.height;
                const exportContext = exportCanvas.getContext('2d');

                if (!exportContext) {
                  return;
                }

                const scaleX = image.width / canvas.width;
                const scaleY = image.height / canvas.height;

                exportContext.drawImage(image, 0, 0, exportCanvas.width, exportCanvas.height);

                strokeElements.forEach((stroke) => {
                  if (stroke.points.length === 0) {
                    return;
                  }

                  exportContext.strokeStyle = stroke.color;
                  exportContext.lineWidth = Math.max(exportCanvas.width * 0.005, 3);
                  exportContext.lineCap = 'round';
                  exportContext.lineJoin = 'round';
                  exportContext.beginPath();
                  exportContext.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY);

                  stroke.points.slice(1).forEach((point) => {
                    exportContext.lineTo(point.x * scaleX, point.y * scaleY);
                  });

                  exportContext.stroke();
                });

                textElements.forEach((textBox) => {
                  drawTextBox(exportContext, textBox, scaleX, scaleY);
                });

                exportCanvas.toBlob((blob) => {
                  if (blob) {
                    onSave(blob);
                  }
                }, 'image/png');
              }}
            >
              <Check size={16} />
              保存编辑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
