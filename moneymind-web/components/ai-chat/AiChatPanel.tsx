'use client'

// components/ai-chat/AiChatPanel.tsx
// ─────────────────────────────────────────────────────────────
// AI Financial Chat — full page panel
// Streaming tokens, suggested prompts, markdown-lite rendering
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { useAiChat, type ChatMessage } from '@/hooks/useAiChat'

interface AiChatPanelProps {
  userId: string
}

// Suggested prompts by category
const SUGGESTED_PROMPTS = [
  { icon: '📊', text: 'วิเคราะห์การใช้เงินเดือนนี้',    color: '#84cc16' },
  { icon: '✂️', text: 'ควรลดค่าใช้จ่ายส่วนไหนก่อน?',   color: '#f97316' },
  { icon: '💰', text: 'ฉันออมได้ดีแค่ไหนเทียบกับเดือนที่แล้ว', color: '#60a5fa' },
  { icon: '🎯', text: 'ตั้งเป้าออม ฿5,000 เดือนหน้าทำได้ไหม?', color: '#a78bfa' },
  { icon: '🍜', text: 'ค่าอาหารของฉันแพงไปไหม?',         color: '#f87171' },
  { icon: '📈', text: 'แนวทางลงทุนสำหรับเงินที่เหลือ',   color: '#34d399' },
]

// ── Markdown-lite: bold, newlines, bullet points ────────────
function renderContent(text: string) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    // Bullet
    const isBullet = /^[-•*]\s/.test(line) || /^\d+\.\s/.test(line)
    // Bold **text**
    const parts = line.split(/(\*\*[^*]+\*\*)/)
    const rendered = parts.map((p, j) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={j} style={{ color: '#f5f3ed', fontWeight: 500 }}>{p.slice(2, -2)}</strong>
        : <span key={j}>{p}</span>
    )
    return (
      <p key={i} style={{
        margin: isBullet ? '3px 0' : i > 0 ? '8px 0 0' : '0',
        paddingLeft: isBullet ? '14px',
        position: 'relative',
        ...(isBullet ? { ':before': {} } : {}),
      }}>
        {isBullet && (
          <span style={{ position: 'absolute', left: 0, color: '#84cc16' }}>
            {/^\d+\./.test(line) ? '' : '·'}
          </span>
        )}
        {rendered}
      </p>
    )
  })
}

// ── Typing cursor ────────────────────────────────────────────
function Cursor() {
  return (
    <>
      <span className="cursor" />
      <style jsx>{`
        .cursor {
          display: inline-block;
          width: 8px; height: 14px;
          background: #84cc16;
          border-radius: 2px;
          margin-left: 2px;
          vertical-align: text-bottom;
          animation: blink .7s ease-in-out infinite;
          opacity: .9;
        }
        @keyframes blink { 0%,100%{opacity:.9} 50%{opacity:.2} }
      `}</style>
    </>
  )
}

// ── Single message bubble ────────────────────────────────────
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <>
      <div className={`bubble-row ${isUser ? 'user' : 'ai'}`}>
        {!isUser && (
          <div className="ai-avatar">
            <span>✦</span>
          </div>
        )}
        <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-ai'} ${msg.error ? 'bubble-err' : ''}`}>
          <div className="bubble-content">
            {msg.content
              ? renderContent(msg.content)
              : <span style={{ color: '#444440' }}>...</span>
            }
            {msg.pending && <Cursor />}
          </div>
        </div>
      </div>

      <style jsx>{`
        .bubble-row {
          display: flex;
          gap: 10px;
          align-items: flex-end;
          animation: popIn .2s cubic-bezier(.16,1,.3,1) both;
        }
        @keyframes popIn {
          from { opacity:0; transform: translateY(8px) scale(.97); }
          to   { opacity:1; transform: none; }
        }
        .bubble-row.user { flex-direction: row-reverse; }

        .ai-avatar {
          width: 28px; height: 28px; border-radius: 50%;
          background: rgba(132,204,22,.12);
          border: .5px solid rgba(132,204,22,.3);
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; color: #84cc16;
          flex-shrink: 0;
        }

        .bubble {
          max-width: 75%;
          border-radius: 16px;
          padding: 12px 16px;
          line-height: 1.6;
        }
        .bubble-user {
          background: rgba(132,204,22,.12);
          border: .5px solid rgba(132,204,22,.25);
          border-bottom-right-radius: 4px;
        }
        .bubble-ai {
          background: #161618;
          border: .5px solid rgba(255,255,255,.08);
          border-bottom-left-radius: 4px;
        }
        .bubble-err {
          background: rgba(248,113,113,.08);
          border-color: rgba(248,113,113,.2);
        }
        .bubble-content {
          font-size: 14px;
          color: #c8c6c0;
          font-family: 'Geist', sans-serif;
        }
        .bubble-user .bubble-content { color: #e8e6e0; }
      `}</style>
    </>
  )
}

// ── Main panel ───────────────────────────────────────────────
export function AiChatPanel({ userId }: AiChatPanelProps) {
  const { messages, isStreaming, send, reset, stopStream } = useAiChat({ userId })
  const [input,    setInput]    = useState('')
  const [started,  setStarted]  = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (text = input) => {
    if (!text.trim()) return
    setInput('')
    setStarted(true)
    inputRef.current?.focus()
    await send(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      <div className="chat-root">
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-left">
            <div className="chat-avatar">✦</div>
            <div>
              <div className="chat-title">MoneyMind AI</div>
              <div className={`chat-status ${isStreaming ? 'thinking' : 'ready'}`}>
                {isStreaming ? 'กำลังคิด...' : 'ผู้ช่วยการเงิน'}
              </div>
            </div>
          </div>
          <button className="chat-reset" onClick={reset} title="เริ่มใหม่">
            ↺
          </button>
        </div>

        {/* Messages area */}
        <div className="chat-body">
          {/* Empty state */}
          {!started && messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-glyph">✦</div>
              <div className="empty-title">MoneyMind AI</div>
              <div className="empty-sub">ถามอะไรเกี่ยวกับการเงินของคุณก็ได้</div>

              <div className="prompts-grid">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p.text}
                    className="prompt-chip"
                    onClick={() => handleSend(p.text)}
                    style={{ '--chip-color': p.color } as React.CSSProperties}
                  >
                    <span className="prompt-icon">{p.icon}</span>
                    <span className="prompt-text">{p.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="messages-list">
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
          </div>

          {/* Streaming dots when AI is "thinking" (no content yet) */}
          {isStreaming && messages[messages.length - 1]?.content === '' && (
            <div className="thinking-row">
              <div className="ai-avatar-sm">✦</div>
              <div className="thinking-dots">
                <span /><span /><span />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Suggested follow-ups (shown after first exchange) */}
        {started && !isStreaming && messages.length >= 2 && (
          <div className="follow-ups">
            {SUGGESTED_PROMPTS.slice(0, 3).map(p => (
              <button
                key={p.text}
                className="follow-chip"
                onClick={() => handleSend(p.text)}
              >
                {p.icon} {p.text}
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div className="input-bar">
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ถามเกี่ยวกับการเงินของคุณ..."
            rows={1}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button className="stop-btn" onClick={stopStream} title="หยุด">
              ◼
            </button>
          ) : (
            <button
              className={`send-btn ${input.trim() ? 'send-btn--active' : ''}`}
              onClick={() => handleSend()}
              disabled={!input.trim()}
            >
              ↑
            </button>
          )}
        </div>

        <div className="chat-footer">ข้อมูลจาก MoneyMind · AI อาจผิดพลาดได้ ตรวจสอบก่อนตัดสินใจเสมอ</div>
      </div>

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Geist+Mono:wght@400;500&family=Geist:wght@400;500&display=swap');

        .chat-root {
          display: flex; flex-direction: column;
          height: 100%;
          background: #0a0a0b;
          font-family: 'Geist', sans-serif;
        }

        /* ── Header ── */
        .chat-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px;
          border-bottom: .5px solid rgba(255,255,255,.07);
          flex-shrink: 0;
        }
        .chat-header-left { display: flex; align-items: center; gap: 12px; }
        .chat-avatar {
          width: 36px; height: 36px; border-radius: 50%;
          background: rgba(132,204,22,.12); border: .5px solid rgba(132,204,22,.35);
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; color: #84cc16;
          box-shadow: 0 0 12px rgba(132,204,22,.15);
        }
        .chat-title { font-size: 15px; font-weight: 500; color: #f5f3ed; font-family: 'DM Serif Display', serif; }
        .chat-status { font-size: 11px; font-family: 'Geist Mono', monospace; color: #555550; margin-top: 1px; transition: color .3s; }
        .chat-status.thinking { color: #84cc16; }
        .chat-reset {
          width: 32px; height: 32px; border-radius: 8px;
          background: rgba(255,255,255,.04); border: .5px solid rgba(255,255,255,.08);
          color: #555550; font-size: 16px; cursor: pointer;
          transition: color .15s, background .15s;
        }
        .chat-reset:hover { color: #e8e6e0; background: rgba(255,255,255,.08); }

        /* ── Body ── */
        .chat-body {
          flex: 1; overflow-y: auto;
          padding: 20px;
          display: flex; flex-direction: column; gap: 16px;
          scroll-behavior: smooth;
        }
        .chat-body::-webkit-scrollbar { width: 4px; }
        .chat-body::-webkit-scrollbar-track { background: transparent; }
        .chat-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 99px; }

        /* ── Empty state ── */
        .empty-state {
          display: flex; flex-direction: column; align-items: center;
          padding: 40px 0 24px; gap: 10px; text-align: center;
        }
        .empty-glyph {
          font-size: 32px; color: #84cc16;
          filter: drop-shadow(0 0 14px rgba(132,204,22,.4));
          margin-bottom: 4px;
        }
        .empty-title { font-family: 'DM Serif Display', serif; font-size: 22px; color: #f5f3ed; }
        .empty-sub   { font-size: 13px; color: #555550; font-family: 'Geist Mono', monospace; }

        .prompts-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 8px; margin-top: 16px; width: 100%; max-width: 520px;
        }
        .prompt-chip {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 14px; border-radius: 10px;
          background: #111113; border: .5px solid rgba(255,255,255,.07);
          cursor: pointer; text-align: left;
          transition: background .15s, border-color .15s;
          font-family: 'Geist', sans-serif;
        }
        .prompt-chip:hover {
          background: rgba(255,255,255,.04);
          border-color: rgba(var(--chip-color), .3);
        }
        .prompt-icon { font-size: 16px; flex-shrink: 0; }
        .prompt-text { font-size: 12px; color: #888882; line-height: 1.4; }

        /* ── Messages ── */
        .messages-list { display: flex; flex-direction: column; gap: 14px; }

        /* ── Thinking dots ── */
        .thinking-row { display: flex; align-items: center; gap: 10px; }
        .ai-avatar-sm {
          width: 28px; height: 28px; border-radius: 50%;
          background: rgba(132,204,22,.1); border: .5px solid rgba(132,204,22,.25);
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; color: #84cc16; flex-shrink: 0;
        }
        .thinking-dots {
          display: flex; align-items: center; gap: 4px;
          padding: 12px 16px; background: #161618;
          border: .5px solid rgba(255,255,255,.08); border-radius: 12px 12px 12px 4px;
        }
        .thinking-dots span {
          width: 6px; height: 6px; border-radius: 50%; background: #555550;
          animation: bounce .8s ease-in-out infinite;
        }
        .thinking-dots span:nth-child(2) { animation-delay: .15s; }
        .thinking-dots span:nth-child(3) { animation-delay: .3s; }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px); background:#84cc16;} }

        /* ── Follow-ups ── */
        .follow-ups {
          display: flex; gap: 6px; padding: 0 20px 12px;
          overflow-x: auto; flex-shrink: 0;
          scrollbar-width: none;
        }
        .follow-ups::-webkit-scrollbar { display: none; }
        .follow-chip {
          flex-shrink: 0; padding: 6px 12px;
          background: rgba(255,255,255,.03); border: .5px solid rgba(255,255,255,.08);
          border-radius: 99px; font-size: 12px; color: #888882;
          cursor: pointer; white-space: nowrap;
          font-family: 'Geist', sans-serif;
          transition: background .15s, border-color .15s, color .15s;
        }
        .follow-chip:hover { background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.15); color: #c8c6c0; }

        /* ── Input bar ── */
        .input-bar {
          display: flex; align-items: flex-end; gap: 10px;
          padding: 12px 16px;
          border-top: .5px solid rgba(255,255,255,.06);
          background: #0c0c0e;
          flex-shrink: 0;
        }
        .chat-input {
          flex: 1; resize: none; max-height: 120px;
          background: rgba(255,255,255,.04); border: .5px solid rgba(255,255,255,.1);
          border-radius: 12px; padding: 10px 14px;
          color: #e8e6e0; font-size: 14px;
          font-family: 'Geist', sans-serif; line-height: 1.5;
          outline: none; transition: border-color .15s;
          scrollbar-width: none;
        }
        .chat-input:focus { border-color: rgba(132,204,22,.4); }
        .chat-input::placeholder { color: #444440; }
        .chat-input:disabled { opacity: .5; }

        .send-btn, .stop-btn {
          width: 36px; height: 36px; border-radius: 10px; border: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; font-size: 16px; flex-shrink: 0;
          transition: all .15s;
        }
        .send-btn {
          background: rgba(255,255,255,.06); color: #555550;
        }
        .send-btn--active { background: #84cc16; color: #0a0a0b; box-shadow: 0 0 12px rgba(132,204,22,.3); }
        .send-btn--active:hover { background: #a3e635; }
        .send-btn:disabled { cursor: not-allowed; }
        .stop-btn { background: rgba(248,113,113,.12); color: #f87171; border: .5px solid rgba(248,113,113,.2); }
        .stop-btn:hover { background: rgba(248,113,113,.2); }

        /* ── Footer ── */
        .chat-footer {
          text-align: center; font-size: 10px; font-family: 'Geist Mono', monospace;
          color: #333330; padding: 8px 16px;
          flex-shrink: 0;
        }
      `}</style>
    </>
  )
}
