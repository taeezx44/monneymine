// app/(tabs)/analytics.tsx
// ─────────────────────────────────────────────────────────────
// Analytics Screen — charts, spending breakdown, trends
// Uses Victory Native for charts (SVG-based, smooth)
// ─────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useMemo } from 'react'
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Animated, Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  VictoryChart, VictoryArea, VictoryAxis, VictoryTheme,
  VictoryBar, VictoryPie, VictoryTooltip, VictoryVoronoiContainer,
} from 'victory-native'
import {
  Colors, Fonts, FontSize, FontWeight,
  Spacing, Radius, TAB_BAR_HEIGHT,
} from '@/constants/theme'

const { width: W } = Dimensions.get('window')
const CHART_W = W - Spacing['2xl'] * 2

// ── Mock data ─────────────────────────────────────────────────
const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.']

const MONTHLY_DATA = [
  { month: 'ม.ค.',  income: 42500, expense: 28340, savings: 14160 },
  { month: 'ก.พ.',  income: 42500, expense: 31200, savings: 11300 },
  { month: 'มี.ค.', income: 45000, expense: 29800, savings: 15200 },
  { month: 'เม.ย.', income: 42500, expense: 35400, savings: 7100  },
  { month: 'พ.ค.',  income: 42500, expense: 27900, savings: 14600 },
  { month: 'มิ.ย.', income: 48000, expense: 30200, savings: 17800 },
]

const CATEGORIES = [
  { name: 'อาหาร',    icon: '🍜', color: Colors.catFood,   amount: 11900, budget: 8000,  pct: 42 },
  { name: 'บิล',      icon: '📄', color: Colors.catBills,  amount: 6200,  budget: 6000,  pct: 22 },
  { name: 'ช้อปปิ้ง', icon: '🛍️', color: Colors.catShop,   amount: 4800,  budget: 5000,  pct: 17 },
  { name: 'เดินทาง', icon: '🚗', color: Colors.catTravel, amount: 2400,  budget: 3000,  pct: 8  },
  { name: 'บันเทิง',  icon: '🎮', color: Colors.catFun,    amount: 1240,  budget: 2000,  pct: 4  },
  { name: 'สุขภาพ',   icon: '💊', color: Colors.catHealth, amount: 1800,  budget: 2500,  pct: 6  },
]

const DAILY_EXPENSE = Array.from({ length: 31 }, (_, i) => ({
  x: i + 1,
  y: Math.round(Math.random() * 1500 + 200) * (((i + 1) % 7 === 0 || (i + 1) % 7 === 6) ? 1.8 : 1),
}))

type ViewMode = 'monthly' | 'daily'
type ChartType = 'area' | 'bar'

// ── Stat card ─────────────────────────────────────────────────
function StatCard({
  label, value, change, accent = false, delay = 0,
}: {
  label: string; value: string; change: string; accent?: boolean; delay?: number
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(12)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start()
  }, [])

  const isUp = change.startsWith('+') || change.startsWith('↑')
  return (
    <Animated.View style={[
      styles.statCard,
      accent && styles.statCardAccent,
      { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
    ]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && { color: Colors.green }]}>{value}</Text>
      <Text style={[styles.statChange, isUp ? styles.changeUp : styles.changeDn]}>{change}</Text>
    </Animated.View>
  )
}

// ── Category row ──────────────────────────────────────────────
function CategoryRow({ cat, rank }: { cat: typeof CATEGORIES[0]; rank: number }) {
  const widthAnim = useRef(new Animated.Value(0)).current
  const overBudget = cat.amount > cat.budget

  useEffect(() => {
    const pct = Math.min(cat.amount / cat.budget, 1)
    Animated.timing(widthAnim, {
      toValue: pct, duration: 700,
      delay: rank * 80,
      useNativeDriver: false,
    }).start()
  }, [])

  return (
    <View style={styles.catRow}>
      <View style={styles.catLeft}>
        <Text style={styles.catIcon}>{cat.icon}</Text>
        <View style={styles.catInfo}>
          <View style={styles.catInfoTop}>
            <Text style={styles.catName}>{cat.name}</Text>
            {overBudget && <Text style={styles.overTag}>เกินงบ</Text>}
          </View>
          <View style={styles.barBg}>
            <Animated.View style={[
              styles.barFill,
              {
                backgroundColor: overBudget ? Colors.red : cat.color,
                width: widthAnim.interpolate({
                  inputRange: [0, 1], outputRange: ['0%', '100%'],
                }),
              },
            ]} />
          </View>
        </View>
      </View>
      <View style={styles.catRight}>
        <Text style={[styles.catAmt, overBudget && { color: Colors.red }]}>
          ฿{cat.amount.toLocaleString()}
        </Text>
        <Text style={styles.catBudget}>/ ฿{cat.budget.toLocaleString()}</Text>
      </View>
    </View>
  )
}

// ── Insight pill ──────────────────────────────────────────────
const INSIGHTS = [
  { icon: '📉', text: 'อาหารสูงกว่าเดือนก่อน ฿1,200', color: Colors.red   },
  { icon: '💚', text: 'ออมเพิ่มขึ้น 18% จากเดือนก่อน', color: Colors.green },
  { icon: '⚡', text: 'ค่าบิลเพิ่มขึ้นในช่วงสิ้นเดือน', color: Colors.amber },
]

// ── Main Screen ───────────────────────────────────────────────
export default function AnalyticsScreen() {
  const [viewMode, setViewMode]   = useState<ViewMode>('monthly')
  const [chartType, setChartType] = useState<ChartType>('area')
  const [activeMonth, setActiveMonth] = useState(5)  // June (index 5)

  const cur  = MONTHLY_DATA[activeMonth]
  const prev = MONTHLY_DATA[Math.max(0, activeMonth - 1)]
  const savingsChange = cur.savings > prev.savings
    ? `+${Math.round(((cur.savings - prev.savings) / prev.savings) * 100)}%`
    : `${Math.round(((cur.savings - prev.savings) / prev.savings) * 100)}%`

  const pieData = useMemo(() => CATEGORIES.map(c => ({
    x: c.name, y: c.amount, label: `${c.pct}%`,
  })), [])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_HEIGHT + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Analytics</Text>
            <Text style={styles.headerSub}>ม.ค. — มิ.ย. 2026</Text>
          </View>
          {/* Chart type toggle */}
          <View style={styles.chartToggle}>
            {(['area', 'bar'] as ChartType[]).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.toggleBtn, chartType === t && styles.toggleBtnActive]}
                onPress={() => setChartType(t)}
              >
                <Text style={[styles.toggleBtnText, chartType === t && { color: Colors.text }]}>
                  {t === 'area' ? '〰' : '▊'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Stat cards */}
        <View style={styles.statGrid}>
          <StatCard label="รายรับ"  value={`฿${(cur.income/1000).toFixed(0)}k`}  change="+8.3%" accent delay={0}  />
          <StatCard label="รายจ่าย" value={`฿${(cur.expense/1000).toFixed(0)}k`} change="-3.1%"       delay={60} />
          <StatCard label="ออม"     value={`฿${(cur.savings/1000).toFixed(1)}k`} change={savingsChange} delay={120} />
          <StatCard label="รายการ" value="47"                                    change="+5.2%"       delay={180} />
        </View>

        {/* Month selector */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={styles.monthScroll}
          contentContainerStyle={{ paddingHorizontal: Spacing['2xl'], gap: Spacing.sm }}
        >
          {MONTHLY_DATA.map((d, i) => (
            <TouchableOpacity
              key={d.month}
              style={[styles.monthChip, activeMonth === i && styles.monthChipActive]}
              onPress={() => setActiveMonth(i)}
            >
              <Text style={[styles.monthChipText, activeMonth === i && { color: Colors.green }]}>
                {d.month}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Main chart */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.sectionLabel}>Cash Flow</Text>
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.green }]} />
                  <Text style={styles.legendText}>รายรับ</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.red }]} />
                  <Text style={styles.legendText}>รายจ่าย</Text>
                </View>
              </View>
            </View>
            {/* View toggle */}
            <View style={styles.chartToggle}>
              {(['monthly', 'daily'] as ViewMode[]).map(v => (
                <TouchableOpacity
                  key={v}
                  style={[styles.toggleBtn, viewMode === v && styles.toggleBtnActive]}
                  onPress={() => setViewMode(v)}
                >
                  <Text style={[styles.toggleBtnText, viewMode === v && { color: Colors.text }]}>
                    {v === 'monthly' ? 'เดือน' : 'วัน'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {viewMode === 'monthly' ? (
            <VictoryChart
              width={CHART_W}
              height={180}
              padding={{ top: 10, bottom: 30, left: 48, right: 12 }}
              theme={VictoryTheme.clean}
              containerComponent={<VictoryVoronoiContainer />}
            >
              <VictoryAxis
                tickFormat={t => MONTHLY_DATA[t - 1]?.month ?? ''}
                style={{
                  axis:     { stroke: 'transparent' },
                  tickLabels: { fill: Colors.muted, fontSize: 10, fontFamily: Fonts.mono },
                  grid:     { stroke: 'transparent' },
                }}
              />
              <VictoryAxis
                dependentAxis
                tickFormat={v => `${(v / 1000).toFixed(0)}k`}
                style={{
                  axis:       { stroke: 'transparent' },
                  tickLabels: { fill: Colors.muted, fontSize: 10, fontFamily: Fonts.mono },
                  grid:       { stroke: 'rgba(255,255,255,0.04)', strokeWidth: 0.5 },
                }}
              />
              {chartType === 'area' ? (
                <>
                  <VictoryArea
                    data={MONTHLY_DATA.map((d, i) => ({ x: i + 1, y: d.income }))}
                    style={{
                      data: { fill: `${Colors.green}28`, stroke: Colors.green, strokeWidth: 1.5 },
                    }}
                    interpolation="monotoneX"
                  />
                  <VictoryArea
                    data={MONTHLY_DATA.map((d, i) => ({ x: i + 1, y: d.expense }))}
                    style={{
                      data: { fill: `${Colors.red}20`, stroke: Colors.red, strokeWidth: 1.5 },
                    }}
                    interpolation="monotoneX"
                  />
                </>
              ) : (
                <>
                  <VictoryBar
                    data={MONTHLY_DATA.map((d, i) => ({ x: i + 0.8, y: d.income }))}
                    barWidth={8}
                    style={{ data: { fill: Colors.green, opacity: 0.8 } }}
                    cornerRadius={{ top: 3 }}
                  />
                  <VictoryBar
                    data={MONTHLY_DATA.map((d, i) => ({ x: i + 1.2, y: d.expense }))}
                    barWidth={8}
                    style={{ data: { fill: Colors.red, opacity: 0.7 } }}
                    cornerRadius={{ top: 3 }}
                  />
                </>
              )}
            </VictoryChart>
          ) : (
            <VictoryChart
              width={CHART_W}
              height={180}
              padding={{ top: 10, bottom: 30, left: 48, right: 12 }}
              theme={VictoryTheme.clean}
            >
              <VictoryAxis
                tickFormat={v => v % 5 === 0 ? `${v}` : ''}
                style={{
                  axis:       { stroke: 'transparent' },
                  tickLabels: { fill: Colors.muted, fontSize: 10, fontFamily: Fonts.mono },
                  grid:       { stroke: 'transparent' },
                }}
              />
              <VictoryAxis
                dependentAxis
                tickFormat={v => `${(v / 1000).toFixed(0)}k`}
                style={{
                  axis:       { stroke: 'transparent' },
                  tickLabels: { fill: Colors.muted, fontSize: 10, fontFamily: Fonts.mono },
                  grid:       { stroke: 'rgba(255,255,255,0.04)', strokeWidth: 0.5 },
                }}
              />
              <VictoryArea
                data={DAILY_EXPENSE}
                style={{
                  data: { fill: `${Colors.red}22`, stroke: Colors.red, strokeWidth: 1.5 },
                }}
                interpolation="monotoneX"
              />
            </VictoryChart>
          )}
        </View>

        {/* Donut + insights */}
        <View style={styles.donutSection}>
          {/* Donut */}
          <View style={styles.donutCard}>
            <Text style={styles.sectionLabel}>สัดส่วนรายจ่าย</Text>
            <View style={styles.donutWrap}>
              <VictoryPie
                data={pieData}
                width={CHART_W * 0.55}
                height={CHART_W * 0.55}
                innerRadius={CHART_W * 0.10}
                colorScale={CATEGORIES.map(c => c.color)}
                style={{
                  labels: { display: 'none' },
                  data:   { opacity: 0.88 },
                }}
                padding={8}
              />
              <View style={styles.donutCenter}>
                <Text style={styles.donutTotal}>฿28k</Text>
                <Text style={styles.donutSub}>รวม</Text>
              </View>
            </View>
          </View>
          {/* Legend */}
          <View style={styles.pieLegend}>
            {CATEGORIES.slice(0, 4).map(c => (
              <View key={c.name} style={styles.pieLegendItem}>
                <View style={[styles.pieLegendDot, { backgroundColor: c.color }]} />
                <Text style={styles.pieLegendName}>{c.name}</Text>
                <Text style={styles.pieLegendPct}>{c.pct}%</Text>
              </View>
            ))}
          </View>
        </View>

        {/* AI Insights */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>AI Insights</Text>
          <View style={styles.insightsList}>
            {INSIGHTS.map((ins, i) => (
              <View key={i} style={[styles.insightPill, { borderColor: `${ins.color}30` }]}>
                <Text style={styles.insightIcon}>{ins.icon}</Text>
                <Text style={styles.insightText}>{ins.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Category breakdown */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>หมวดหมู่</Text>
            <Text style={styles.sectionSub}>เดือนนี้</Text>
          </View>
          <View style={styles.catCard}>
            {CATEGORIES.map((cat, i) => (
              <View key={cat.name}>
                <CategoryRow cat={cat} rank={i} />
                {i < CATEGORIES.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        </View>

        {/* Savings trend */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>แนวโน้มการออม</Text>
          <View style={styles.savingsCard}>
            {MONTHLY_DATA.map((d, i) => {
              const maxSav = Math.max(...MONTHLY_DATA.map(m => m.savings))
              const h = Math.max(0.1, d.savings / maxSav)
              return (
                <View key={d.month} style={styles.savingsBarCol}>
                  <Text style={styles.savingsAmt}>
                    {(d.savings / 1000).toFixed(0)}k
                  </Text>
                  <View style={styles.savingsBarOuter}>
                    <View style={[
                      styles.savingsBarInner,
                      {
                        height: `${h * 100}%`,
                        backgroundColor: i === activeMonth ? Colors.green : `${Colors.green}44`,
                      },
                    ]} />
                  </View>
                  <Text style={[styles.savingsMonth, i === activeMonth && { color: Colors.green }]}>
                    {d.month}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg },
  scroll:  { flex: 1 },
  content: { padding: Spacing['2xl'], gap: Spacing.lg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 4,
  },
  headerTitle: { fontSize: FontSize.xl, fontFamily: Fonts.sans, fontWeight: FontWeight.medium, color: Colors.text },
  headerSub:   { fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.muted, marginTop: 2, letterSpacing: 0.5 },

  // Stats
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statCard: {
    width: (W - Spacing['2xl'] * 2 - Spacing.sm) / 2,
    backgroundColor: Colors.bg2, borderRadius: Radius.md,
    borderWidth: 0.5, borderColor: Colors.border,
    padding: Spacing.md, gap: 4,
  },
  statCardAccent: { borderColor: Colors.greenBorder, backgroundColor: 'rgba(10,20,5,0.8)' },
  statLabel:  { fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.muted, letterSpacing: 1, textTransform: 'uppercase' },
  statValue:  { fontSize: FontSize['2xl'], fontFamily: Fonts.mono, fontWeight: FontWeight.medium, color: Colors.text, letterSpacing: -1 },
  statChange: { fontSize: FontSize.xs, fontFamily: Fonts.mono },
  changeUp:   { color: Colors.green },
  changeDn:   { color: Colors.red   },

  // Month chips
  monthScroll: { maxHeight: 40, flexGrow: 0, marginHorizontal: -Spacing['2xl'] },
  monthChip:   {
    paddingHorizontal: 14, paddingVertical: 6,
    backgroundColor: Colors.bg2, borderRadius: Radius.full,
    borderWidth: 0.5, borderColor: Colors.border,
  },
  monthChipActive: { backgroundColor: Colors.greenBg, borderColor: Colors.greenBorder },
  monthChipText:   { fontSize: FontSize.sm, fontFamily: Fonts.mono, color: Colors.muted },

  // Chart card
  chartCard: {
    backgroundColor: Colors.bg2, borderRadius: Radius.lg,
    borderWidth: 0.5, borderColor: Colors.border,
    padding: Spacing.lg, overflow: 'hidden',
  },
  chartHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: Spacing.sm,
  },
  sectionLabel: {
    fontSize: FontSize.xs, fontFamily: Fonts.mono,
    color: Colors.muted, letterSpacing: 1.5, textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  legendRow:  { flexDirection: 'row', gap: Spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.muted },

  chartToggle: {
    flexDirection: 'row', backgroundColor: Colors.bg3,
    borderRadius: Radius.sm, padding: 2, gap: 2,
    borderWidth: 0.5, borderColor: Colors.border,
  },
  toggleBtn: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.sm - 2,
  },
  toggleBtnActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  toggleBtnText: { fontSize: 10, fontFamily: Fonts.mono, color: Colors.muted },

  // Donut
  donutSection: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  donutCard: {
    flex: 1, backgroundColor: Colors.bg2, borderRadius: Radius.lg,
    borderWidth: 0.5, borderColor: Colors.border, padding: Spacing.md,
  },
  donutWrap:  { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  donutCenter:{
    position: 'absolute', alignItems: 'center',
  },
  donutTotal: { fontSize: FontSize.lg, fontFamily: Fonts.mono, fontWeight: FontWeight.medium, color: Colors.text },
  donutSub:   { fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.muted },
  pieLegend:  { flex: 1, gap: Spacing.sm },
  pieLegendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  pieLegendDot:  { width: 8, height: 8, borderRadius: 2 },
  pieLegendName: { flex: 1, fontSize: FontSize.sm, color: Colors.text3 },
  pieLegendPct:  { fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.muted },

  // Insights
  section: { gap: Spacing.md },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionSub: { fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.muted },
  insightsList: { gap: Spacing.sm },
  insightPill: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.bg2, borderRadius: Radius.md,
    borderWidth: 0.5, padding: Spacing.md,
  },
  insightIcon: { fontSize: 16, flexShrink: 0 },
  insightText: { fontSize: FontSize.sm, color: Colors.text2, flex: 1, lineHeight: 18 },

  // Category
  catCard: {
    backgroundColor: Colors.bg2, borderRadius: Radius.lg,
    borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden',
  },
  catRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  catLeft:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  catInfo:    { flex: 1, gap: 5 },
  catInfoTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  catIcon:    { fontSize: 16, flexShrink: 0 },
  catName:    { fontSize: FontSize.sm, color: Colors.text2 },
  overTag: {
    fontSize: 9, fontFamily: Fonts.mono, color: Colors.red,
    backgroundColor: Colors.redBg, paddingHorizontal: 5,
    paddingVertical: 1, borderRadius: 4,
  },
  barBg:   { height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 99, opacity: 0.85 },
  catRight: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  catAmt:   { fontSize: FontSize.sm, fontFamily: Fonts.mono, fontWeight: FontWeight.medium, color: Colors.text },
  catBudget:{ fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.faint },
  divider:  { height: 0.5, backgroundColor: 'rgba(255,255,255,0.04)', marginHorizontal: Spacing.lg },

  // Savings bars
  savingsCard: {
    backgroundColor: Colors.bg2, borderRadius: Radius.lg,
    borderWidth: 0.5, borderColor: Colors.border,
    padding: Spacing.lg, flexDirection: 'row',
    alignItems: 'flex-end', gap: Spacing.sm, height: 140,
  },
  savingsBarCol:   { flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' },
  savingsAmt:      { fontSize: 9, fontFamily: Fonts.mono, color: Colors.muted },
  savingsBarOuter: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  savingsBarInner: { width: '100%', borderRadius: 3, minHeight: 4 },
  savingsMonth:    { fontSize: 9, fontFamily: Fonts.mono, color: Colors.faint },
})
