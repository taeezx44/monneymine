'use client'

// components/ui/NotificationBell.tsx  (Next.js)
// ─────────────────────────────────────────────────────────────
// Notification bell with realtime badge + animated dropdown
// ─────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from 'react'
import { useNotificationStore } from '@/store/notificationStore'
import { useSession } from 'next-auth/react'

const TYPE_ICONS: Record<string, string> = {
  receipt_done:     '✓',
  payment_verified: '💳',
  budget_alert:     '⚠',
  insight:          '✦',
  default:          '◈',
}

const TYPE_COLORS: Record<string, string> = {
  receipt_done:     '#84cc16',
  payment_verified: '#60a5fa',
  budget_alert:     '#fbbf24',
  insight:          '#a78bfa',
  default:          '#888882',
}

function formatRelativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)   return 'เมื่อกี้'
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`
  if (diff < 86400)return `${Math.floor(diff / 3600)} ชม.ที่แล้ว`
  return `${Math.floor(diff / 86400)} วันที่แล้ว`
}

export function NotificationBell() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const prevCount = useRef(0)

  const { notifications, unreadCount, markRead, markAllRead } = useNotificationStore()

  // Shake animation on new notification
  const [shaking, setShaking] = useState(false)
  useEffect(() => {
    if (unreadCount > prevCount.current) {
      setShaking(true)
      setTimeout(() => setShaking(false), 600)
    }
    prevCount.current = unreadCount
  }, [unreadCount])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <>
      <div className="notif-root" ref={ref}>
        <button
          className={`bell-btn ${shaking ? 'shake' : ''}`}
          onClick={() => setOpen(o => !o)}
          aria-label="Notifications"
        >
          <span className="bell-icon">🔔</span>
          {unreadCount > 0 && (
            <span className="badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </button>

        {open && (
          <div className="dropdown">
            <div className="dropdown-header">
              <span className="dropdown-title">Notifications</span>
              {unreadCount > 0 && (
                <button
                  className="mark-all-btn"
                  onClick={() => session?.user?.id && markAllRead(session.user.id)}
                >
                  อ่านทั้งหมด
                </button>
              )}
            </div>

            <div className="notif-list">
              {notifications.length === 0 ? (
                <div className="empty-notif">ไม่มีการแจ้งเตือน</div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    className={`notif-item ${!n.is_read ? 'unread' : ''}`}
                    onClick={() => !n.is_read && markRead(n.id)}
                  >
                    <div
                      className="notif-icon-wrap"
                      style={{ background: `${TYPE_COLORS[n.type] ?? TYPE_COLORS.default}18` }}
                    >
                      <span style={{ color: TYPE_COLORS[n.type] ?? TYPE_COLORS.default, fontSize: 13 }}>
                        {TYPE_ICONS[n.type] ?? TYPE_ICONS.default}
                      </span>
                    </div>
                    <div className="notif-body">
                      <div className="notif-title">{n.title}</div>
                      {n.body && <div className="notif-msg">{n.body}</div>}
                      <div className="notif-time">{formatRelativeTime(n.created_at)}</div>
                    </div>
                    {!n.is_read && <div className="unread-dot" />}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .notif-root { position: relative; }

        .bell-btn {
          width: 36px; height: 36px; border-radius: 9px;
          background: #111113; border: .5px solid rgba(255,255,255,.08);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; position: relative; transition: background .15s;
        }
        .bell-btn:hover { background: #161618; }
        .bell-icon { font-size: 15px; }

        .badge {
          position: absolute; top: -4px; right: -4px;
          min-width: 17px; height: 17px;
          background: #84cc16; color: #0a0a0b;
          border-radius: 99px; font-size: 9px;
          font-family: 'Geist Mono', monospace; font-weight: 500;
          display: flex; align-items: center; justify-content: center;
          padding: 0 4px; border: 1.5px solid #0a0a0b;
          animation: popIn .2s cubic-bezier(.16,1,.3,1);
        }
        @keyframes popIn { from { transform: scale(0); } to { transform: scale(1); } }

        @keyframes shake {
          0%,100% { transform: rotate(0deg); }
          20% { transform: rotate(-12deg); }
          40% { transform: rotate(10deg); }
          60% { transform: rotate(-8deg); }
          80% { transform: rotate(6deg); }
        }
        .shake .bell-icon { animation: shake .5s ease-in-out; }

        .dropdown {
          position: absolute; top: calc(100% + 10px); right: 0;
          width: 340px; background: #111113;
          border: .5px solid rgba(255,255,255,.1);
          border-radius: 16px; overflow: hidden;
          box-shadow: 0 20px 40px rgba(0,0,0,.5);
          animation: slideDown .2s cubic-bezier(.16,1,.3,1);
          z-index: 200;
        }
        @keyframes slideDown {
          from { opacity:0; transform: translateY(-8px) scale(.97); }
          to   { opacity:1; transform: none; }
        }

        .dropdown-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 16px; border-bottom: .5px solid rgba(255,255,255,.06);
        }
        .dropdown-title { font-size: 14px; font-weight: 500; color: #f5f3ed; }
        .mark-all-btn {
          font-size: 11px; font-family: 'Geist Mono', monospace;
          color: #84cc16; background: none; border: none; cursor: pointer;
          transition: opacity .15s;
        }
        .mark-all-btn:hover { opacity: .75; }

        .notif-list { max-height: 380px; overflow-y: auto; scrollbar-width: thin; }
        .notif-list::-webkit-scrollbar { width: 3px; }
        .notif-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); }

        .empty-notif {
          padding: 32px; text-align: center;
          font-size: 13px; color: #555550;
          font-family: 'Geist Mono', monospace;
        }

        .notif-item {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 12px 16px; cursor: pointer;
          border-bottom: .5px solid rgba(255,255,255,.04);
          transition: background .15s; position: relative;
        }
        .notif-item:last-child { border-bottom: none; }
        .notif-item:hover { background: rgba(255,255,255,.03); }
        .notif-item.unread { background: rgba(132,204,22,.03); }

        .notif-icon-wrap {
          width: 32px; height: 32px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        .notif-body { flex: 1; min-width: 0; }
        .notif-title {
          font-size: 13px; color: #e8e6e0; font-weight: 500;
          line-height: 1.3; margin-bottom: 2px;
        }
        .notif-msg { font-size: 12px; color: #888882; line-height: 1.4; margin-bottom: 4px; }
        .notif-time { font-size: 10px; font-family: 'Geist Mono', monospace; color: #444440; }

        .unread-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #84cc16; flex-shrink: 0; margin-top: 4px;
        }
      `}</style>
    </>
  )
}
