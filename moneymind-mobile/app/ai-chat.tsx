// app/ai-chat.tsx  (React Native / Expo Router)
// ─────────────────────────────────────────────────────────────
// AI Financial Chat — Mobile screen
// Streaming via fetch SSE, keyboard-aware layout
// ─────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, Animated,
  ActivityIndicator, ScrollView,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { supabase } from '@/supabase/client'
import { Colors, Fonts, FontSize, FontWeight, Spacing, Radius } from '@/constants/theme'

// ── Types ─────────────────────────────────────────────────────
interface Message {
  id:       string
  role:     'user' | 'assistant'
  content:  string
  pending?: boolean
  error?:   boolean
}

const SUGGESTED = [
  '📊 วิเคราะห์การใช้เงินเดือนนี้',
  '✂️ ควรลดค่าใช้จ่ายส่วนไหน?',
  '💰 ฉันออมได้ดีแค่ไหน?',
  '🍜 ค่าอาหารแพงไปไหม?',
  '🎯 วางแผนออม ฿5,000/เดือน',
  '📈 แนวทางลงทุนสำหรับเงินเหลือ',
]

function makeId() { return Math.random().toString(36).slice(2) }

// ── Thinking dots ─────────────────────────────────────────────
function ThinkingDots() {
  const dot1 = useRef(new Animated.Value(0)).current
  const dot2 = useRef(new Animated.Value(0)).current
  const dot3 = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0,  duration: 300, useNativeDriver: true }),
        Animated.delay(400),
      ]))
    const a1 = anim(dot1, 0)
    const a2 = anim(dot2, 150)
    const a3 = anim(dot3, 300)
    a1.start(); a2.start(); a3.start()
    return () => { a1.stop(); a2.stop(); a3.stop() }
  }, [])

  return (
    <View style={styles.thinkingRow}>
      <View style={styles.aiAvatarSm}><Text style={styles.aiAvatarText}>✦</Text></View>
      <View style={styles.thinkingBubble}>
        {[dot1, dot2, dot3].map((d, i) => (
          <Animated.View key={i} style={[styles.dot, { transform: [{ translateY: d }] }]} />
        ))}
      </View>
    </View>
  )
}

// ── Message bubble ────────────────────────────────────────────
function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
  }, [])

  return (
    <Animated.View style={[
      styles.bubbleRow,
      isUser ? styles.bubbleRowUser : styles.bubbleRowAi,
      { opacity: fadeAnim },
    ]}>
      {!isUser && <View style={styles.aiAvatar}><Text style={styles.aiAvatarText}>✦</Text></View>}
      <View style={[
        styles.bubble,
        isUser ? styles.bubbleUser : styles.bubbleAi,
        msg.error && styles.bubbleErr,
      ]}>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
          {msg.content || (msg.pending ? '' : '...')}
          {msg.pending && msg.content === '' && ''}
        </Text>
        {msg.pending && msg.content.length > 0 && (
          <View style={styles.cursor} />
        )}
      </View>
    </Animated.View>
  )
}

// ── Main Screen ───────────────────────────────────────────────
export default function AiChatScreen() {
  const insets = useSafeAreaInsets()
  const [messages,       setMessages]       = useState<Message[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [input,          setInput]          = useState('')
  const [isStreaming,    setIsStreaming]     = useState(false)
  const [started,        setStarted]        = useState(false)

  const flatRef  = useRef<FlatList>(null)
  const abortRef = useRef<AbortController | null>(null)

  const scrollToBottom = () => {
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100)
  }

  const send = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    const userMsgId = makeId()
    const asstMsgId = makeId()

    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: 'user',      content: text },
      { id: asstMsgId, role: 'assistant', content: '', pending: true },
    ])
    setInput('')
    setStarted(true)
    setIsStreaming(true)
    scrollToBottom()

    abortRef.current = new AbortController()

    try {
      const { data: { session } } = await supabase.auth.getSession()

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-financial-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey':         process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            user_id:         session?.user?.id,
            conversation_id: conversationId,
            message:         text,
          }),
          signal: abortRef.current.signal,
        }
      )

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''
      let   accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const evt = JSON.parse(data)
            if (evt.type === 'conversation_id' && evt.id) {
              setConversationId(evt.id)
            }
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              accumulated += evt.delta.text ?? ''
              const snap = accumulated
              setMessages(prev => prev.map(m =>
                m.id === asstMsgId ? { ...m, content: snap } : m
              ))
              scrollToBottom()
            }
          } catch { /* skip */ }
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === asstMsgId ? { ...m, pending: false } : m
      ))
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setMessages(prev => prev.map(m =>
        m.id === asstMsgId
          ? { ...m, content: 'เกิดข้อผิดพลาด กรุณาลองใหม่', pending: false, error: true }
          : m
      ))
    } finally {
      setIsStreaming(false)
    }
  }, [conversationId, isStreaming])

  const stopStream = () => {
    abortRef.current?.abort()
    setIsStreaming(false)
    setMessages(prev => prev.map(m => m.pending ? { ...m, pending: false } : m))
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerAvatar}><Text style={styles.headerAvatarText}>✦</Text></View>
            <View>
              <Text style={styles.headerTitle}>MoneyMind AI</Text>
              <Text style={[styles.headerSub, isStreaming && { color: Colors.green }]}>
                {isStreaming ? 'กำลังคิด...' : 'ผู้ช่วยการเงิน'}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => { setMessages([]); setStarted(false); setConversationId(null) }} style={styles.backBtn}>
            <Text style={styles.backBtnText}>↺</Text>
          </TouchableOpacity>
        </View>

        {/* Message list */}
        {!started ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.emptyState} showsVerticalScrollIndicator={false}>
            <Text style={styles.emptyGlyph}>✦</Text>
            <Text style={styles.emptyTitle}>MoneyMind AI</Text>
            <Text style={styles.emptySub}>ถามอะไรเกี่ยวกับการเงินของคุณก็ได้</Text>
            <View style={styles.suggestGrid}>
              {SUGGESTED.map(s => (
                <TouchableOpacity key={s} style={styles.suggestChip} onPress={() => send(s)}>
                  <Text style={styles.suggestText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={m => m.id}
            renderItem={({ item }) => <Bubble msg={item} />}
            contentContainerStyle={styles.msgList}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              isStreaming && messages[messages.length - 1]?.content === ''
                ? <ThinkingDots />
                : null
            }
          />
        )}

        {/* Follow-up chips */}
        {started && !isStreaming && messages.length >= 2 && (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            style={styles.followScroll}
            contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.sm, paddingVertical: 6 }}
          >
            {SUGGESTED.slice(0, 4).map(s => (
              <TouchableOpacity key={s} style={styles.followChip} onPress={() => send(s)}>
                <Text style={styles.followChipText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="ถามเกี่ยวกับการเงิน..."
            placeholderTextColor={Colors.faint}
            multiline
            editable={!isStreaming}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
          />
          {isStreaming ? (
            <TouchableOpacity style={styles.stopBtn} onPress={stopStream}>
              <Text style={{ color: Colors.red, fontSize: 14 }}>◼</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, input.trim() && styles.sendBtnActive]}
              onPress={() => send(input)}
              disabled={!input.trim()}
            >
              <Text style={[styles.sendBtnText, input.trim() && { color: '#0a0a0b' }]}>↑</Text>
            </TouchableOpacity>
          )}
        </View>

      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, borderBottomWidth: .5, borderBottomColor: Colors.border },
  backBtn: { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: Colors.bg2, borderWidth: .5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 20, color: Colors.text3 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.greenBg, borderWidth: .5, borderColor: Colors.greenBorder, alignItems: 'center', justifyContent: 'center' },
  headerAvatarText: { fontSize: 13, color: Colors.green },
  headerTitle: { fontSize: 15, fontFamily: Fonts.sans, fontWeight: FontWeight.medium, color: Colors.text },
  headerSub: { fontSize: 10, fontFamily: Fonts.mono, color: Colors.muted, marginTop: 1 },

  emptyState: { padding: Spacing['2xl'], alignItems: 'center', gap: Spacing.sm, paddingTop: 60 },
  emptyGlyph: { fontSize: 36, color: Colors.green, marginBottom: 4 },
  emptyTitle: { fontSize: FontSize['2xl'], fontFamily: Fonts.display, color: Colors.text },
  emptySub:   { fontSize: FontSize.sm, fontFamily: Fonts.mono, color: Colors.muted },
  suggestGrid:{ width: '100%', gap: Spacing.sm, marginTop: Spacing.lg },
  suggestChip:{ padding: Spacing.md, backgroundColor: Colors.bg2, borderRadius: Radius.md, borderWidth: .5, borderColor: Colors.border },
  suggestText:{ fontSize: FontSize.sm, color: Colors.text3, fontFamily: Fonts.sans },

  msgList: { padding: Spacing.lg, gap: Spacing.md },

  bubbleRow:     { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end' },
  bubbleRowUser: { flexDirection: 'row-reverse' },
  bubbleRowAi:   {},
  aiAvatar:      { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.greenBg, borderWidth: .5, borderColor: Colors.greenBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  aiAvatarText:  { fontSize: 11, color: Colors.green },
  bubble:        { maxWidth: '78%', borderRadius: 16, padding: Spacing.md },
  bubbleUser:    { backgroundColor: Colors.greenBg, borderWidth: .5, borderColor: Colors.greenBorder, borderBottomRightRadius: 4 },
  bubbleAi:      { backgroundColor: Colors.bgCard, borderWidth: .5, borderColor: Colors.border, borderBottomLeftRadius: 4 },
  bubbleErr:     { backgroundColor: Colors.redBg, borderColor: 'rgba(248,113,113,.2)' },
  bubbleText:    { fontSize: FontSize.md, fontFamily: Fonts.sans, color: Colors.text2, lineHeight: 22 },
  bubbleTextUser:{ color: Colors.text },
  cursor:        { width: 8, height: 14, backgroundColor: Colors.green, borderRadius: 2, marginTop: 3 },

  thinkingRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  aiAvatarSm:     { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.greenBg, alignItems: 'center', justifyContent: 'center' },
  thinkingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgCard, borderWidth: .5, borderColor: Colors.border, borderRadius: 12, padding: 12 },
  dot:            { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.muted },

  followScroll: { maxHeight: 46, flexShrink: 0, borderTopWidth: .5, borderTopColor: Colors.border },
  followChip:   { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.bg2, borderRadius: Radius.full, borderWidth: .5, borderColor: Colors.border },
  followChipText:{ fontSize: 11, fontFamily: Fonts.mono, color: Colors.text3 },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, borderTopWidth: .5, borderTopColor: Colors.border, backgroundColor: Colors.bg3 },
  input:    { flex: 1, backgroundColor: Colors.bgInput, borderWidth: .5, borderColor: Colors.border, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.sm, color: Colors.text, fontSize: FontSize.md, fontFamily: Fonts.sans, maxHeight: 100 },
  sendBtn:       { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: Colors.bg2, borderWidth: .5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  sendBtnActive: { backgroundColor: Colors.green },
  sendBtnText:   { fontSize: 18, color: Colors.muted },
  stopBtn:       { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: Colors.redBg, borderWidth: .5, borderColor: 'rgba(248,113,113,.2)', alignItems: 'center', justifyContent: 'center' },
})
