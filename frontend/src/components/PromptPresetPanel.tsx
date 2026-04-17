import React, { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { PromptPreset } from '../types';

interface PromptPresetPanelProps {
  presets: PromptPreset[];
  activePresetIds?: string[];
  onApplyPreset: (presetId: string, text: string) => void;
  onCreatePreset: (text: string) => void;
  onUpdatePreset: (presetId: string, text: string) => void;
  onDeletePreset: (presetId: string) => void;
}

export const PromptPresetPanel: React.FC<PromptPresetPanelProps> = ({
  presets,
  activePresetIds = [],
  onApplyPreset,
  onCreatePreset,
  onUpdatePreset,
  onDeletePreset,
}) => {
  const [draftText, setDraftText] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const submitDraft = () => {
    const nextText = draftText.trim();

    if (!nextText) {
      return;
    }

    onCreatePreset(nextText);
    setDraftText('');
  };

  const startEditing = (preset: PromptPreset) => {
    setEditingPresetId(preset.id);
    setEditingText(preset.text);
  };

  const submitEditing = () => {
    if (!editingPresetId) {
      return;
    }

    const nextText = editingText.trim();

    if (!nextText) {
      onDeletePreset(editingPresetId);
    } else {
      onUpdatePreset(editingPresetId, nextText);
    }

    setEditingPresetId(null);
    setEditingText('');
  };

  return (
    <div className="preset-panel">
      <div className="composer-section-title">提示词</div>
      <div className="preset-create-row">
        <input
          className="preset-input"
          placeholder="输入新提示词..."
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submitDraft();
            }
          }}
        />
        <button type="button" className="preset-add-btn" onClick={submitDraft} aria-label="新增提示词">
          <Plus size={18} />
        </button>
      </div>

      <div className="preset-list">
        {presets.map((preset) => {
          const isEditing = editingPresetId === preset.id;
          const isActive = activePresetIds.includes(preset.id);

          return (
            <div
              key={preset.id}
              className={`preset-card ${isActive ? 'active' : ''} ${isEditing ? 'editing' : ''}`}
            >
              {isEditing ? (
                <>
                  <input
                    className="preset-card-input"
                    value={editingText}
                    onChange={(event) => setEditingText(event.target.value)}
                    autoFocus
                  />
                  <div className="preset-card-actions">
                    <button
                      type="button"
                      className="preset-icon-btn primary"
                      onClick={submitEditing}
                      aria-label="保存提示词"
                    >
                      <Check size={15} />
                    </button>
                    <button
                      type="button"
                      className="preset-icon-btn"
                      aria-label="取消编辑提示词"
                      onClick={() => {
                        setEditingPresetId(null);
                        setEditingText('');
                      }}
                    >
                      <X size={15} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="preset-apply-btn"
                    onClick={() => onApplyPreset(preset.id, preset.text)}
                  >
                    {preset.text}
                  </button>
                  <div className="preset-card-actions">
                    <button
                      type="button"
                      className="preset-icon-btn"
                      aria-label="编辑提示词"
                      onClick={() => startEditing(preset)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="preset-icon-btn"
                      aria-label="删除提示词"
                      onClick={() => onDeletePreset(preset.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
