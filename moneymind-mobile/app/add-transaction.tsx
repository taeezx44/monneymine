// app/add-transaction.tsx
// Bottom sheet modal — add income / expense
import { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Animated, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Colors, Fonts, FontSize, FontWeight, Spacing, Radius } from '@/constants/theme'

type TxType = 'expense' | 'income'

const CATEGORIES = [
  { id: 'food',    name: 'อาหาร',    icon: '🍜', color: Colors.catFood,   type: 'expense' },
  { id: 'travel',  name: 'เดินทาง',  icon: '🚗', color: Colors.catTravel, type: 'expense' },
  { id: 'shop',    name: 'ช้อปปิ้ง', icon: '🛍️', color: Colors.catShop,   type: 'expense' },
  { id: 'fun',     name: 'บันเทิง',  icon: '🎮', color: Colors.catFun,    type: 'expense' },
  { id: 'health',  name: 'สุขภาพ',   icon: '💊', color: Colors.catHealth, type: 'expense' },
  { id: 'bills',   name: 'บิล',      icon: '📄', color: Colors.catBills,  type: 'expense' },
  { id: 'salary',  name: 'เงินเดือน',icon: '💵', color: Colors.catSalary, type: 'income'  },
  { id: 'free',    name: 'ฟรีแลนซ์', icon: '💻', color: Colors.catSalary, type: 'income'  },
]

// ── Numpad key ─────────────────────────────────────────────────
function NumKey({ label, onPress, style }: { label: string; onPress: () => void; style?: object }) {
  const scale = useRef(new Animated.Value(1)).current
  const press = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 60,  useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 100, useNativeDriver: true }),
    ]).start()
    onPress()
  }
  return (
    <Animated.View style={[{ transform: [{ scale }] }, styles.numKeyWrap]}>
      <TouchableOpacity style={[styles.numKey, style]} onPress={press} activeOpacity={1}>
        <Text style={styles.numKeyText}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  )
}

export default function AddTransactionScreen() {
  const [type,     setType]     = useState<TxType>('expense')
  const [amount,   setAmount]   = useState('0')
  const [note,     setNote]     = useState('')
  const [merchant, setMerchant] = useState('')
  const [catId,    setCatId]    = useState('food')
  const [step,     setStep]     = useState<'amount' | 'details'>('amount')

  const cats = CATEGORIES.filter(c => c.type === type)
  const selCat = CATEGORIES.find(c => c.id === catId) ?? cats[0]

  const handleNum = (n: string) => {
    if (n === '.' && amount.includes('.')) return
    if (amount === '0' && n !== '.') { setAmount(n); return }
    if (amount.split('.')[1]?.length >= 2) return
    setAmount(prev => prev + n)
  }

  const handleDel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setAmount(prev => prev.length <= 1 ? '0' : prev.slice(0, -1))
  }

  const handleNext = () => {
    if (parseFloat(amount) <= 0) return
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setStep('details')
  }

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    // TODO: call createTransaction() from supabase/transactions.ts
    router.back()
  }

  // ── Amount entry step ──────────────────────────────────────
  if (step === 'amount') return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>เพิ่มรายการ</Text>
          <View style={{ width: 36 }} />
        </View>
      </SafeAreaView>

      {/* Type toggle */}
      <View style={styles.typeToggle}>
        {(['expense', 'income'] as TxType[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.typeBtn, type === t && (t === 'expense' ? styles.typeBtnExpActive : styles.typeBtnIncActive)]}
            onPress={() => { setType(t); setCatId(t === 'expense' ? 'food' : 'salary') }}
          >
            <Text style={[styles.typeBtnText, type === t && styles.typeBtnTextActive]}>
              {t === 'expense' ? '↓ รายจ่าย' : '↑ รายรับ'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Amount display */}
      <View style={styles.amountDisplay}>
        <Text style={styles.amountCurrency}>฿</Text>
        <Text style={[styles.amountValue,
          type === 'income' ? { color: Colors.green } : {}
        ]} numberOfLines={1} adjustsFontSizeToFit>
          {parseFloat(amount).toLocaleString('th-TH', { minimumFractionDigits: amount.includes('.') ? 2 : 0 })}
        </Text>
      </View>

      {/* Category quick-pick */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.catScroll} contentContainerStyle={{ paddingHorizontal: Spacing['2xl'], gap: Spacing.sm }}
      >
        {cats.map(c => (
          <TouchableOpacity
            key={c.id}
            style={[styles.catChip, catId === c.id && { backgroundColor: c.color + '22', borderColor: c.color + '66' }]}
            onPress={() => { setCatId(c.id); Haptics.selectionAsync() }}
          >
            <Text style={styles.catChipIcon}>{c.icon}</Text>
            <Text style={[styles.catChipName, catId === c.id && { color: c.color }]}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Numpad */}
      <View style={styles.numpad}>
        {[['1','2','3'],['4','5','6'],['7','8','9'],['.','0','⌫']].map((row, ri) => (
          <View key={ri} style={styles.numRow}>
            {row.map(k => (
              <NumKey key={k} label={k}
                onPress={() => k === '⌫' ? handleDel() : handleNum(k)}
                style={k === '⌫' ? styles.numKeyDel : undefined}
              />
            ))}
          </View>
        ))}
        <TouchableOpacity
          style={[styles.nextBtn, parseFloat(amount) > 0 && styles.nextBtnActive]}
          onPress={handleNext}
        >
          <Text style={[styles.nextBtnText, parseFloat(amount) > 0 && styles.nextBtnTextActive]}>
            ถัดไป →
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  // ── Details step ───────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <SafeAreaView edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setStep('amount')} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>รายละเอียด</Text>
            <View style={{ width: 36 }} />
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={{ padding: Spacing['2xl'], gap: Spacing.lg }}>
          {/* Amount summary */}
          <View style={styles.detailSummary}>
            <View style={[styles.detailCatIcon, { backgroundColor: selCat.color + '22', borderColor: selCat.color + '44' }]}>
              <Text style={{ fontSize: 24 }}>{selCat.icon}</Text>
            </View>
            <View>
              <Text style={styles.detailAmount}>
                {type === 'income' ? '+' : '-'}฿{parseFloat(amount).toLocaleString()}
              </Text>
              <Text style={[styles.detailCatName, { color: selCat.color }]}>{selCat.name}</Text>
            </View>
          </View>

          {/* Merchant input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ร้านค้า / บริการ</Text>
            <TextInput
              style={styles.input}
              placeholder="ชื่อร้านค้า (ถ้ามี)"
              placeholderTextColor={Colors.faint}
              value={merchant}
              onChangeText={setMerchant}
            />
          </View>

          {/* Note input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>หมายเหตุ</Text>
            <TextInput
              style={styles.input}
              placeholder="เพิ่มหมายเหตุ..."
              placeholderTextColor={Colors.faint}
              value={note}
              onChangeText={setNote}
            />
          </View>

          {/* Category grid */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>หมวดหมู่</Text>
            <View style={styles.catGrid}>
              {cats.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.catGridItem, catId === c.id && { backgroundColor: c.color + '22', borderColor: c.color }]}
                  onPress={() => { setCatId(c.id); Haptics.selectionAsync() }}
                >
                  <Text style={styles.catGridIcon}>{c.icon}</Text>
                  <Text style={[styles.catGridName, catId === c.id && { color: c.color }]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Save button */}
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>✓ บันทึกรายการ</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing['2xl'], paddingVertical: Spacing.md },
  closeBtn:      { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: Colors.bg2, borderWidth: 0.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  closeBtnText:  { fontSize: FontSize.lg, color: Colors.text3 },
  headerTitle:   { fontSize: FontSize.lg, fontFamily: Fonts.sans, fontWeight: FontWeight.medium, color: Colors.text },

  typeToggle:  { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing['2xl'], marginBottom: Spacing.lg },
  typeBtn:     { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.bg2, alignItems: 'center' },
  typeBtnExpActive: { backgroundColor: Colors.redBg,   borderColor: 'rgba(248,113,113,0.4)' },
  typeBtnIncActive: { backgroundColor: Colors.greenBg, borderColor: Colors.greenBorder },
  typeBtnText:       { fontSize: FontSize.md, fontFamily: Fonts.mono, color: Colors.muted },
  typeBtnTextActive: { color: Colors.text, fontWeight: FontWeight.medium },

  amountDisplay: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', paddingHorizontal: Spacing['2xl'], marginBottom: Spacing.xl, gap: 6 },
  amountCurrency:{ fontSize: FontSize['2xl'], fontFamily: Fonts.mono, color: Colors.muted, paddingBottom: 4 },
  amountValue:   { fontSize: 52, fontFamily: Fonts.mono, fontWeight: FontWeight.medium, color: Colors.text, letterSpacing: -2 },

  catScroll: { maxHeight: 52, flexGrow: 0 },
  catChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.bg2 },
  catChipIcon: { fontSize: 14 },
  catChipName: { fontSize: FontSize.sm, fontFamily: Fonts.sans, color: Colors.text3 },

  numpad:    { flex: 1, padding: Spacing.xl, gap: Spacing.sm, justifyContent: 'flex-end', paddingBottom: Spacing['3xl'] },
  numRow:    { flexDirection: 'row', gap: Spacing.sm },
  numKeyWrap:{ flex: 1 },
  numKey:    { height: 60, backgroundColor: Colors.bg2, borderRadius: Radius.lg, borderWidth: 0.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  numKeyDel: { backgroundColor: Colors.bgInput },
  numKeyText:{ fontSize: FontSize['2xl'], fontFamily: Fonts.mono, color: Colors.text2 },
  nextBtn:    { height: 52, borderRadius: Radius.lg, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.bg2, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  nextBtnActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  nextBtnText:   { fontSize: FontSize.lg, fontFamily: Fonts.mono, color: Colors.muted },
  nextBtnTextActive: { color: '#0a0a0b', fontWeight: FontWeight.medium },

  detailSummary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, padding: Spacing.lg, backgroundColor: Colors.bg2, borderRadius: Radius.lg, borderWidth: 0.5, borderColor: Colors.border },
  detailCatIcon: { width: 52, height: 52, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  detailAmount:  { fontSize: FontSize['2xl'], fontFamily: Fonts.mono, fontWeight: FontWeight.medium, color: Colors.text, letterSpacing: -0.5 },
  detailCatName: { fontSize: FontSize.sm, fontFamily: Fonts.sans, marginTop: 2 },

  inputGroup:  { gap: Spacing.sm },
  inputLabel:  { fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.muted, letterSpacing: 1, textTransform: 'uppercase' },
  input:       { backgroundColor: Colors.bg2, borderWidth: 0.5, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, color: Colors.text, fontSize: FontSize.md, fontFamily: Fonts.sans },

  catGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  catGridItem: { width: '22%', aspectRatio: 1, borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.bg2, alignItems: 'center', justifyContent: 'center', gap: 3 },
  catGridIcon: { fontSize: 20 },
  catGridName: { fontSize: 9, fontFamily: Fonts.mono, color: Colors.muted, textAlign: 'center' },

  saveBtn:     { padding: Spacing.lg, backgroundColor: Colors.green, borderRadius: Radius.lg, alignItems: 'center', marginTop: Spacing.sm },
  saveBtnText: { fontSize: FontSize.lg, fontFamily: Fonts.sans, fontWeight: FontWeight.medium, color: '#0a0a0b' },
})
