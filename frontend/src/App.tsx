import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import axios from 'axios';
import { OptionsPanel } from './components/OptionsPanel';
import { SessionSidebar } from './components/SessionSidebar';
import { ImageGenerator } from './components/ImageGenerator';
import {
  createChatSession,
  deriveSessionTitle,
  migrateStoredSessions,
  STORAGE_KEY,
} from './lib/sessions';
import { STARTING_BALANCE_USD } from './lib/costs';
import type { BalanceResponse, ChatSession, ModelId } from './types';

type PresetRequest = {
  sessionId: string;
  presetId: string;
  text: string;
  nonce: number;
} | null;

function App() {
  const [aspectRatio, setAspectRatio] = useState('auto');
  const [resolution, setResolution] = useState('1k');
  const [bootstrapSession] = useState(() => createChatSession(STARTING_BALANCE_USD));
  const [selectedModels, setSelectedModels] = useState<ModelId[]>([
    'gemini-3.1-flash-image-preview',
  ]);
  const [sessions, setSessions] = useState<ChatSession[]>([bootstrapSession]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(bootstrapSession.id);
  const [isHydrating, setIsHydrating] = useState(true);
  const [currentBalanceUsd, setCurrentBalanceUsd] = useState(STARTING_BALANCE_USD);
  const [presetRequest, setPresetRequest] = useState<PresetRequest>(null);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      let fetchedBalance = STARTING_BALANCE_USD;

      fetchedBalance = STARTING_BALANCE_USD;

      const nextSessions = await migrateStoredSessions(stored, fetchedBalance);

      if (!isMounted) {
        return;
      }

      setSessions(nextSessions);
      setCurrentSessionId(nextSessions[0]?.id ?? null);
      setCurrentBalanceUsd(fetchedBalance);
      setIsHydrating(false);
    };

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrating && sessions.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    }
  }, [isHydrating, sessions]);

  const updateSession = (sessionId: string, patch: Partial<ChatSession>) => {
    setSessions((previousSessions) =>
      previousSessions.map((session) => {
        if (session.id !== sessionId) {
          return session;
        }

        const nextMessages = patch.messages ?? session.messages;

        return {
          ...session,
          ...patch,
          messages: nextMessages,
          title: patch.title ?? deriveSessionTitle(nextMessages, session.title),
          timestamp: Date.now(),
        };
      }),
    );

    if (typeof patch.remainingBalanceUsd === 'number') {
      setCurrentBalanceUsd(patch.remainingBalanceUsd);
    }
  };

  const createNewSession = () => {
    const nextSession = createChatSession(currentBalanceUsd);
    setSessions((previousSessions) => [nextSession, ...previousSessions]);
    setCurrentSessionId(nextSession.id);
  };

  const updatePromptPresets = (sessionId: string, updater: (session: ChatSession) => ChatSession) => {
    setSessions((previousSessions) =>
      previousSessions.map((session) =>
        session.id === sessionId
          ? {
              ...updater(session),
              timestamp: Date.now(),
            }
          : session,
      ),
    );
  };

  const deleteSession = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();

    setSessions((previousSessions) => {
      const filteredSessions = previousSessions.filter((session) => session.id !== id);

      if (filteredSessions.length === 0) {
        const fallbackSession = createChatSession(currentBalanceUsd);
        setCurrentSessionId(fallbackSession.id);
        return [fallbackSession];
      }

      if (currentSessionId === id) {
        setCurrentSessionId(filteredSessions[0].id);
      }

      return filteredSessions;
    });
  };

  const currentSession = sessions.find((session) => session.id === currentSessionId) ?? sessions[0];

  return (
    <div
      className={`app ${leftSidebarCollapsed ? 'left-collapsed' : ''} ${rightSidebarCollapsed ? 'right-collapsed' : ''}`}
      style={
        {
          '--left-panel-width': leftSidebarCollapsed ? '0px' : '232px',
          '--right-panel-width': rightSidebarCollapsed ? '0px' : '284px',
        } as React.CSSProperties
      }
    >
      <header className="header">
        <div className="logo">
          <img src="/favicon.svg" alt="" className="logo-badge" />
          <span>nananobanana mirror</span>
        </div>
        <div className="header-badge">AI 生图工作台</div>
      </header>

      {!leftSidebarCollapsed && (
        <SessionSidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          onNewChat={createNewSession}
          onSelectSession={setCurrentSessionId}
          onDeleteSession={deleteSession}
        />
      )}

      {currentSession && (
        <ImageGenerator
          key={currentSession.id}
          session={currentSession}
          currentBalanceUsd={currentBalanceUsd}
          aspectRatio={aspectRatio}
          resolution={resolution}
          selectedModels={selectedModels}
          onSessionUpdate={updateSession}
          appliedPresetRequest={presetRequest}
        />
      )}

      {!rightSidebarCollapsed && (
        <OptionsPanel
          aspectRatio={aspectRatio}
          setAspectRatio={setAspectRatio}
          resolution={resolution}
          setResolution={setResolution}
          selectedModels={selectedModels}
          setSelectedModels={setSelectedModels}
          promptPresets={currentSession?.promptPresets ?? []}
          onApplyPreset={(presetId, text) => {
            if (!currentSession) {
              return;
            }

            updatePromptPresets(currentSession.id, (session) => ({
              ...session,
              promptPresets: session.promptPresets.map((preset) =>
                preset.id === presetId
                  ? {
                      ...preset,
                      lastUsedAt: Date.now(),
                    }
                  : preset,
              ),
            }));

            setPresetRequest({
              sessionId: currentSession.id,
              presetId,
              text,
              nonce: Date.now(),
            });
          }}
          onCreatePreset={(text) => {
            if (!currentSession) {
              return;
            }

            updatePromptPresets(currentSession.id, (session) => ({
              ...session,
              promptPresets: [
                ...session.promptPresets,
                {
                  id: `${Date.now()}`,
                  text,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              ],
            }));
          }}
          onUpdatePreset={(presetId, text) => {
            if (!currentSession) {
              return;
            }

            updatePromptPresets(currentSession.id, (session) => ({
              ...session,
              promptPresets: session.promptPresets.map((preset) =>
                preset.id === presetId
                  ? {
                      ...preset,
                      text,
                      updatedAt: Date.now(),
                    }
                  : preset,
              ),
            }));
          }}
          onDeletePreset={(presetId) => {
            if (!currentSession) {
              return;
            }

            updatePromptPresets(currentSession.id, (session) => ({
              ...session,
              promptPresets: session.promptPresets.filter((preset) => preset.id !== presetId),
            }));
          }}
        />
      )}

      <button
        type="button"
        className={`sidebar-toggle left ${leftSidebarCollapsed ? 'collapsed' : ''}`}
        aria-label={leftSidebarCollapsed ? '展开左侧边栏' : '隐藏左侧边栏'}
        onClick={() => setLeftSidebarCollapsed((value) => !value)}
      >
        {leftSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
      <button
        type="button"
        className={`sidebar-toggle right ${rightSidebarCollapsed ? 'collapsed' : ''}`}
        aria-label={rightSidebarCollapsed ? '展开右侧边栏' : '隐藏右侧边栏'}
        onClick={() => setRightSidebarCollapsed((value) => !value)}
      >
        {rightSidebarCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
    </div>
  );
}

export default App;
