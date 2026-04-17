import React from 'react';
import { Clock, MessageSquarePlus, Trash2 } from 'lucide-react';
import type { ChatSession } from '../types';

interface SessionSidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string, event: React.MouseEvent) => void;
}

export const SessionSidebar: React.FC<SessionSidebarProps> = ({
  sessions,
  currentSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
}) => (
  <aside className="session-sidebar">
    <button className="btn-new-chat" onClick={onNewChat}>
      <MessageSquarePlus size={18} />
      <span>新建对话</span>
    </button>

    <div className="recent-section">
      <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Clock size={12} />
        最近对话
      </div>
      <div className="history-list">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`history-item ${currentSessionId === session.id ? 'active' : ''}`}
            onClick={() => onSelectSession(session.id)}
          >
            <div className="history-title">{session.title || '新对话'}</div>
            <button
              className="btn-history-delete"
              onClick={(event) => onDeleteSession(session.id, event)}
              title="删除对话"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="history-scroll-hint">上下滑动浏览更多对话</div>
    </div>
  </aside>
);
