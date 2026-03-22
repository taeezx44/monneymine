// app/(tabs)/index.tsx
// Home screen — balance card, quick actions, recent transactions
import { useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Animated, Pressable, Dimensions, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { Colors, Fonts, FontSize, FontWeight, Spacing, Radius, cardStyle, TAB_BAR_HEIGHT } from '@/constants/theme'
import { useAuthStore } from '@/store/authStore'
import { useTransactionStore } from '@/store/transactionStore'
import { formatTHB, formatDateTH, thisMonth } from '@/utils/format'

const { width: SCREEN_W } = Dimensions.get('window')

// ── Quick action button ───────────────────────────────────────
interface QuickActionProps {
  icon:  string
  label: string
  onPress: () => void
  accent?: boolean
}

function QuickAction({ icon, label, onPress, accent }: QuickActionProps) {
  const scale = useRef(new Animated.Value(1)).current

  const press = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.93, duration: 80,  useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 120, useNativeDriver: true }),
    ]).start()
    onPress()
  }

  return (
    <Animated.View style={{ transform: [{ scale }], flex: 1 }}>
      <TouchableOpacity
        onPress={press}
        style={[
          styles.qaBtn,
          accent && { backgroundColor: Colors.greenBg, borderColor: Colors.greenBorder },
        ]}
        activeOpacity={1}
      >
        <Text style={[styles.qaIcon, accent && { color: Colors.green }]}>{icon}</Text>
        <Text style={[styles.qaLabel, accent && { color: Colors.green }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  )
}

// ── Transaction row ───────────────────────────────────────────
interface TxnRowProps {
  merchant:  string
  category:  string
  catIcon:   string
  catColor:  string
  amount:    number
  type:      'income' | 'expense'
  date:      string
  aiTagged?: boolean
}

function TxnRow({ merchant, category, catIcon, catColor, amount, type, date, aiTagged }: TxnRowProps) {
  return (
    <TouchableOpacity style={styles.txnRow} activeOpacity={0.7}
      onPress={() => Haptics.selectionAsync()}
    >
      <View style={[styles.txnIcon, { backgroundColor: catColor + '22', borderColor: catColor + '44' }]}>
        <Text style={styles.txnIconText}>{catIcon}</Text>
      </View>
      <View style={styles.txnInfo}>
        <Text style={styles.txnMerchant} numberOfLines={1}>{merchant}</Text>
        <View style={styles.txnMeta}>
          <Text style={[styles.txnCat, { color: catColor }]}>{category}</Text>
          <Text style={styles.txnSep}>·</Text>
          <Text style={styles.txnDate}>{date}</Text>
          {aiTagged && (
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>✦ AI</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={[styles.txnAmount, type === 'income' ? styles.amtIn : styles.amtOut]}>
        {type === 'income' ? '+' : '-'}{formatTHB(amount)}
      </Text>
    </TouchableOpacity>
  )
}

// ── AI Insight card ───────────────────────────────────────────
function InsightCard() {
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, delay: 300, useNativeDriver: true }).start()
  }, [])

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <TouchableOpacity
        style={styles.insightCard}
        activeOpacity={0.8}
        onPress={() => router.push('/ai-chat')}
      >
        <View style={styles.insightLeft}>
          <Text style={styles.insightEmoji}>📊</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.insightLabel}>AI Insight</Text>
            <Text style={styles.insightText} numberOfLines={2}>
              คุณใช้เงินกับ <Text style={{ color: Colors.amber }}>อาหาร 42%</Text> สูงกว่าปกติ 18% — แตะเพื่อดูคำแนะนำ
            </Text>
          </View>
        </View>
        <Text style={styles.insightArrow}>›</Text>
      </TouchableOpacity>
    </Animated.View>
  )
}

// ── Main screen ───────────────────────────────────────────────
const MOCK_TXNS: TxnRowProps[] = [
  { merchant: 'ข้าวมันไก่ประตูน้ำ', category: 'อาหาร',    catIcon: '🍜', catColor: Colors.catFood,   amount: 65,    type: 'expense', date: 'วันนี้',     aiTagged: true  },
  { merchant: 'Grab',                category: 'เดินทาง',  catIcon: '🚗', catColor: Colors.catTravel, amount: 120,   type: 'expense', date: 'วันนี้',     aiTagged: true  },
  { merchant: 'เงินเดือน ม.ค.',      category: 'เงินเดือน',catIcon: '💵', catColor: Colors.catSalary, amount: 21250, type: 'income',  date: 'เมื่อวาน',   aiTagged: false },
  { merchant: 'Netflix',             category: 'บันเทิง',  catIcon: '🎮', catColor: Colors.catFun,    amount: 279,   type: 'expense', date: '15 ม.ค.',    aiTagged: true  },
  { merchant: 'Villa Market',        category: 'ช้อปปิ้ง', catIcon: '🛍️', catColor: Colors.catShop,   amount: 1240,  type: 'expense', date: 'เมื่อวาน',   aiTagged: true  },
]

export default function HomeScreen() {
  const headerAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start()
  }, [])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.greeting}>สวัสดี, Tae 👋</Text>
            <Text style={styles.monthLabel}>{thisMonth()}</Text>
          </View>
          <TouchableOpacity style={styles.notifBtn} onPress={() => router.push('/notifications')}>
            <Text style={styles.notifIcon}>🔔</Text>
            <View style={styles.notifDot} />
          </TouchableOpacity>
        </View>

        {/* ── Balance card ── */}
        <Animated.View style={{
          opacity: headerAnim,
          transform: [{ translateY: headerAnim.interpolate({ inputRange: [0,1], outputRange: [20, 0] }) }],
        }}>
          <LinearGradient
            colors={['#1a2410', '#0e160a', '#0a0a0b']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.balanceCard}
          >
            {/* Decorative glow */}
            <View style={styles.cardGlow} />

            <Text style={styles.balanceLabel}>NET SAVINGS · ม.ค. 2026</Text>
            <Text style={styles.balanceAmount}>฿14,160</Text>

            <View style={styles.balanceRow}>
              <View style={styles.balanceStat}>
                <View style={styles.statDot} />
                <View>
                  <Text style={styles.statLabel}>รายรับ</Text>
                  <Text style={styles.statValue}>฿42,500</Text>
                </View>
              </View>
              <View style={styles.balanceDivider} />
              <View style={styles.balanceStat}>
                <View style={[styles.statDot, { backgroundColor: Colors.red }]} />
                <View>
                  <Text style={styles.statLabel}>รายจ่าย</Text>
                  <Text style={[styles.statValue, { color: Colors.red }]}>฿28,340</Text>
                </View>
              </View>
            </View>

            {/* Savings rate bar */}
            <View style={styles.savingsBarWrap}>
              <View style={styles.savingsBarBg}>
                <View style={[styles.savingsBarFill, { width: '33%' }]} />
              </View>
              <Text style={styles.savingsBarLabel}>ออม 33%</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ── Quick actions ── */}
        <View style={styles.qaRow}>
          <QuickAction icon="+" label="เพิ่มรายการ" accent onPress={() => router.push('/add-transaction')} />
          <QuickAction icon="⊡" label="สแกนสลิป"   onPress={() => router.push('/scan')} />
          <QuickAction icon="◱" label="รายงาน"     onPress={() => router.push('/analytics')} />
          <QuickAction icon="✦" label="AI Chat"    onPress={() => router.push('/ai-chat')} />
        </View>

        {/* ── AI Insight ── */}
        <InsightCard />

        {/* ── Budget bars ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>งบประมาณเดือนนี้</Text>
            <TouchableOpacity onPress={() => router.push('/budgets')}>
              <Text style={styles.sectionLink}>ดูทั้งหมด ›</Text>
            </TouchableOpacity>
          </View>
          {[
            { name: 'อาหาร',    icon: '🍜', color: Colors.catFood,   spent: 11900, budget: 8000  },
            { name: 'เดินทาง', icon: '🚗', color: Colors.catTravel, spent: 2400,  budget: 3000  },
            { name: 'ช้อปปิ้ง', icon: '🛍️', color: Colors.catShop,  spent: 4800,  budget: 5000  },
          ].map(b => {
            const pct = Math.min(1, b.spent / b.budget)
            const over = b.spent > b.budget
            return (
              <View key={b.name} style={styles.budgetRow}>
                <Text style={styles.budgetIcon}>{b.icon}</Text>
                <View style={styles.budgetInfo}>
                  <View style={styles.budgetTop}>
                    <Text style={styles.budgetName}>{b.name}</Text>
                    <Text style={[styles.budgetSpent, over && { color: Colors.red }]}>
                      {formatTHB(b.spent)} <Text style={styles.budgetOf}>/ {formatTHB(b.budget)}</Text>
                    </Text>
                  </View>
                  <View style={styles.budgetBarBg}>
                    <View style={[styles.budgetBarFill, {
                      width: `${pct * 100}%`,
                      backgroundColor: over ? Colors.red : b.color,
                    }]} />
                  </View>
                  {over && <Text style={styles.overTag}>⚠ เกินงบ {Math.round((pct - 1) * 100)}%</Text>}
                </View>
              </View>
            )
          })}
        </View>

        {/* ── Recent transactions ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>รายการล่าสุด</Text>
            <TouchableOpacity onPress={() => router.push('/transactions')}>
              <Text style={styles.sectionLink}>ดูทั้งหมด ›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.txnCard}>
            {MOCK_TXNS.map((t, i) => (
              <View key={i}>
                <TxnRow {...t} />
                {i < MOCK_TXNS.length - 1 && <View style={styles.txnDivider} />}
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: TAB_BAR_HEIGHT + 16 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing['2xl'], gap: Spacing.lg },

  /* Top bar */
  topBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  greeting:    { fontSize: FontSize.xl, fontFamily: Fonts.sans, fontWeight: FontWeight.medium, color: Colors.text },
  monthLabel:  { fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.muted, marginTop: 2, letterSpacing: 0.5 },
  notifBtn:    { width: 38, height: 38, borderRadius: Radius.md, backgroundColor: Colors.bg2, borderWidth: 0.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  notifIcon:   { fontSize: 16 },
  notifDot:    { position: 'absolute', top: 7, right: 7, width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.green },

  /* Balance card */
  balanceCard:  { borderRadius: Radius.xl, padding: Spacing['2xl'], borderWidth: 0.5, borderColor: Colors.greenBorder, overflow: 'hidden', position: 'relative' },
  cardGlow:     { position: 'absolute', top: -40, left: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: Colors.green, opacity: 0.06 },
  balanceLabel: { fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.muted, letterSpacing: 1.5, marginBottom: Spacing.sm },
  balanceAmount:{ fontSize: FontSize['4xl'], fontFamily: Fonts.mono, fontWeight: FontWeight.medium, color: Colors.text, letterSpacing: -1, marginBottom: Spacing.lg },
  balanceRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xl },
  balanceStat:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  balanceDivider: { width: 1, height: 32, backgroundColor: Colors.border },
  statDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.green },
  statLabel:    { fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.muted, letterSpacing: 0.5 },
  statValue:    { fontSize: FontSize.md, fontFamily: Fonts.mono, fontWeight: FontWeight.medium, color: Colors.text, marginTop: 2 },
  savingsBarWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.lg },
  savingsBarBg:   { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 99 },
  savingsBarFill: { height: '100%', backgroundColor: Colors.green, borderRadius: 99, opacity: 0.8 },
  savingsBarLabel:{ fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.green, letterSpacing: 0.5 },

  /* Quick actions */
  qaRow: { flexDirection: 'row', gap: Spacing.sm },
  qaBtn: { borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.bg2, padding: Spacing.md, alignItems: 'center', gap: 5 },
  qaIcon:  { fontSize: 20, color: Colors.text3 },
  qaLabel: { fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.muted, letterSpacing: 0.5 },

  /* AI Insight */
  insightCard:   { backgroundColor: Colors.bg2, borderRadius: Radius.lg, borderWidth: 0.5, borderColor: 'rgba(251,191,36,0.25)', padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  insightLeft:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  insightEmoji:  { fontSize: 22 },
  insightLabel:  { fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.muted, letterSpacing: 1, marginBottom: 3, textTransform: 'uppercase' },
  insightText:   { fontSize: FontSize.sm, fontFamily: Fonts.sans, color: Colors.text2, lineHeight: 18 },
  insightArrow:  { fontSize: 20, color: Colors.muted },

  /* Section */
  section:        { gap: Spacing.md },
  sectionHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle:   { fontSize: FontSize.md, fontFamily: Fonts.sans, fontWeight: FontWeight.medium, color: Colors.text2 },
  sectionLink:    { fontSize: FontSize.sm, fontFamily: Fonts.mono, color: Colors.green },

  /* Budget */
  budgetRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.bg2, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 0.5, borderColor: Colors.border },
  budgetIcon: { fontSize: 18, marginTop: 2 },
  budgetInfo: { flex: 1, gap: 5 },
  budgetTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  budgetName: { fontSize: FontSize.md, fontFamily: Fonts.sans, color: Colors.text2 },
  budgetSpent:{ fontSize: FontSize.sm, fontFamily: Fonts.mono, color: Colors.text },
  budgetOf:   { color: Colors.faint },
  budgetBarBg:{ height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' },
  budgetBarFill: { height: '100%', borderRadius: 99, opacity: 0.85 },
  overTag:    { fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.red, marginTop: 2 },

  /* Transactions */
  txnCard:     { backgroundColor: Colors.bg2, borderRadius: Radius.lg, borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden' },
  txnRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  txnDivider:  { height: 0.5, backgroundColor: 'rgba(255,255,255,0.04)', marginHorizontal: Spacing.lg },
  txnIcon:     { width: 38, height: 38, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  txnIconText: { fontSize: 16 },
  txnInfo:     { flex: 1, gap: 3 },
  txnMerchant: { fontSize: FontSize.md, fontFamily: Fonts.sans, color: Colors.text },
  txnMeta:     { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  txnCat:      { fontSize: FontSize.xs, fontFamily: Fonts.sans, fontWeight: FontWeight.medium },
  txnSep:      { fontSize: FontSize.xs, color: Colors.faint },
  txnDate:     { fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.faint },
  aiBadge:     { backgroundColor: Colors.greenBg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  aiBadgeText: { fontSize: 9, fontFamily: Fonts.mono, color: Colors.green },
  txnAmount:   { fontSize: FontSize.md, fontFamily: Fonts.mono, fontWeight: FontWeight.medium },
  amtIn:       { color: Colors.green },
  amtOut:      { color: Colors.text },
})
