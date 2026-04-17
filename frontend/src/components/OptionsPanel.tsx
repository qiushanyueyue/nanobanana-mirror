import React from 'react';
import { Sparkles } from 'lucide-react';
import { PromptPresetPanel } from './PromptPresetPanel';
import type { ModelId, PromptPreset } from '../types';

const MODELS = [
  {
    id: 'gemini-3.1-flash-image-preview' as ModelId,
    name: 'Nano Banana 2',
    tag: '高速生成 · 性价比首选',
    color: '#60a5fa',
  },
  {
    id: 'gemini-3-pro-image-preview' as ModelId,
    name: 'Nano Banana Pro',
    tag: '最高质量 · 旗舰生图',
    color: '#a78bfa',
  },
];

const RATIOS = [
  { label: '自动', value: 'auto' },
  { label: '1:1', value: '1:1' },
  { label: '9:16', value: '9:16' },
  { label: '16:9', value: '16:9' },
  { label: '3:4', value: '3:4' },
  { label: '4:3', value: '4:3' },
  { label: '3:2', value: '3:2' },
  { label: '2:3', value: '2:3' },
  { label: '5:4', value: '5:4' },
  { label: '4:5', value: '4:5' },
  { label: '21:9', value: '21:9' },
];

const RESOLUTIONS = [
  { label: '1K', value: '1k', desc: '标准精度' },
  { label: '2K', value: '2k', desc: '高清精度' },
  { label: '4K', value: '4k', desc: '超高清精度' },
];

interface OptionsPanelProps {
  aspectRatio: string;
  setAspectRatio: (v: string) => void;
  resolution: string;
  setResolution: (v: string) => void;
  selectedModels: ModelId[];
  setSelectedModels: (v: ModelId[]) => void;
  promptPresets: PromptPreset[];
  onApplyPreset: (presetId: string, text: string) => void;
  onCreatePreset: (text: string) => void;
  onUpdatePreset: (presetId: string, text: string) => void;
  onDeletePreset: (presetId: string) => void;
}

export const OptionsPanel: React.FC<OptionsPanelProps> = ({
  aspectRatio,
  setAspectRatio,
  resolution,
  setResolution,
  selectedModels,
  setSelectedModels,
  promptPresets,
  onApplyPreset,
  onCreatePreset,
  onUpdatePreset,
  onDeletePreset,
}) => {
  const toggleModel = (id: ModelId) => {
    if (selectedModels.includes(id)) {
      if (selectedModels.length > 1) {
        setSelectedModels(selectedModels.filter((m) => m !== id));
      }
    } else {
      setSelectedModels([...selectedModels, id]);
    }
  };

  return (
    <aside className="sidebar">
      <div>
        <div className="section-label">选择模型</div>
        <div className="model-list">
          {MODELS.map((model) => {
            const active = selectedModels.includes(model.id);
            return (
              <div
                key={model.id}
                className={`model-card ${active ? 'active' : ''}`}
                onClick={() => toggleModel(model.id)}
              >
                <div className="model-checkbox">
                  {active && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path
                        d="M1 4L3.5 6.5L9 1"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <div className="model-info">
                  <div className="model-name">{model.name}</div>
                  <div className="model-tag">{model.tag}</div>
                </div>
              </div>
            );
          })}
        </div>

        {selectedModels.length === 2 && (
          <div className="tip-box" style={{ marginTop: 10 }}>
            <Sparkles size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>双模型并发开启</span>
          </div>
        )}
      </div>

      {/* ─── 图幅比例 ─── */}
      <div>
        <div className="section-label">图幅比例</div>
        <div className="select-dropdown-wrap">
          <select
            className="select-dropdown"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
          >
            {RATIOS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <span className="select-arrow">›</span>
        </div>
      </div>

      {/* ─── 分辨率 ─── */}
      <div>
        <div className="section-label">分辨率</div>
        <div className="select-dropdown-wrap">
          <select
            className="select-dropdown"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          >
            {RESOLUTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label} — {r.desc}
              </option>
            ))}
          </select>
          <span className="select-arrow">›</span>
        </div>
      </div>

      <div className="sidebar-prompt-shell">
        <PromptPresetPanel
          presets={promptPresets}
          onApplyPreset={onApplyPreset}
          onCreatePreset={onCreatePreset}
          onUpdatePreset={onUpdatePreset}
          onDeletePreset={onDeletePreset}
        />
      </div>
    </aside>
  );
};
