// app/(tabs)/scan.tsx
// ─────────────────────────────────────────────────────────────
// Scan Screen — Expo Camera + OCR receipt pipeline
// Stages: Permission → Camera/Gallery → Scanning → Result → Confirm
// ─────────────────────────────────────────────────────────────

import {
  useState, useRef, useCallback, useEffect,
} from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Dimensions, ScrollView, TextInput,
  Platform, ActivityIndicator, Pressable,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Colors, Fonts, FontSize, FontWeight,
  Spacing, Radius, TAB_BAR_HEIGHT,
} from '@/constants/theme'
import { useReceiptOcr } from '@/hooks/useReceiptOcr'
import { useAuthStore } from '@/store/authStore'

const { width: W, height: H } = Dimensions.get('window')
const VIEWFINDER_W = W - 48
const VIEWFINDER_H = VIEWFINDER_W * 1.35   // receipt aspect ratio

type Stage = 'camera' | 'scanning' | 'result' | 'confirm'

// ── Animated scan line ────────────────────────────────────────
function ScanLine({ active }: { active: boolean }) {
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!active) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [active])

  const translateY = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, VIEWFINDER_H - 4],
  })

  if (!active) return null
  return (
    <Animated.View style={[styles.scanLine, { transform: [{ translateY }] }]} />
  )
}

// ── Corner brackets ───────────────────────────────────────────
function Corners({ color = Colors.green }: { color?: string }) {
  const cornerStyle = { borderColor: color }
  return (
    <>
      <View style={[styles.corner, styles.cornerTL, cornerStyle]} />
      <View style={[styles.corner, styles.cornerTR, cornerStyle]} />
      <View style={[styles.corner, styles.cornerBL, cornerStyle]} />
      <View style={[styles.corner, styles.cornerBR, cornerStyle]} />
    </>
  )
}

// ── Progress steps ────────────────────────────────────────────
function ProgressSteps({ current }: { current: number }) {
  const steps = ['Upload', 'OCR', 'AI Parse', 'Done']
  return (
    <View style={styles.stepsRow}>
      {steps.map((s, i) => (
        <View key={s} style={styles.stepItem}>
          <Text style={[
            styles.stepText,
            i < current  && { color: Colors.muted },
            i === current && { color: Colors.green },
          ]}>{s}</Text>
          {i < steps.length - 1 && (
            <Text style={styles.stepSep}>→</Text>
          )}
        </View>
      ))}
    </View>
  )
}

// ── Field row (result screen) ─────────────────────────────────
function FieldRow({
  label, value, editable = false,
  onChangeText, large = false, accent = false,
}: {
  label: string; value: string; editable?: boolean
  onChangeText?: (t: string) => void; large?: boolean; accent?: boolean
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {editable ? (
        <View style={styles.fieldInputWrap}>
          {large && <Text style={styles.fieldPrefix}>฿</Text>}
          <TextInput
            style={[
              styles.fieldInput,
              large && styles.fieldInputLarge,
              large && { paddingLeft: 28 },
              accent && { color: Colors.green },
            ]}
            value={value}
            onChangeText={onChangeText}
            keyboardType={large ? 'decimal-pad' : 'default'}
            placeholderTextColor={Colors.faint}
          />
        </View>
      ) : (
        <Text style={[styles.fieldStatic, accent && { color: Colors.green }]}>{value || '—'}</Text>
      )}
    </View>
  )
}

// ── Main Screen ───────────────────────────────────────────────
export default function ScanScreen() {
  const insets = useSafeAreaInsets()
  const [permission, requestPermission] = useCameraPermissions()
  const [stage,    setStage]    = useState<Stage>('camera')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [facing,   setFacing]   = useState<CameraType>('back')
  const [torch,    setTorch]    = useState(false)

  // Editable result fields
  const [editAmount,   setEditAmount]   = useState('')
  const [editMerchant, setEditMerchant] = useState('')
  const [editNote,     setEditNote]     = useState('')

  const cameraRef = useRef<CameraView>(null)
  const { user }  = useAuthStore()
  const {
    upload, state: ocrState, progress,
    result, errorMsg, reset: resetOcr,
  } = useReceiptOcr()

  // When OCR result arrives → populate fields
  useEffect(() => {
    if (ocrState === 'done' && result) {
      setEditAmount(result.amount?.toString() ?? '')
      setEditMerchant(result.merchant ?? '')
      setStage('result')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    }
    if (ocrState === 'failed') {
      setStage('result')
    }
  }, [ocrState, result])

  // ── Take photo ──────────────────────────────────────────────
  const takePhoto = useCallback(async () => {
    if (!cameraRef.current) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85, base64: false,
      })
      if (photo) {
        setImageUri(photo.uri)
        setStage('scanning')
        const file = await uriToFile(photo.uri, 'receipt.jpg')
        await upload(file, user?.id ?? '')
      }
    } catch (e) { console.error(e) }
  }, [upload, user])

  // ── Pick from gallery ───────────────────────────────────────
  const pickFromGallery = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    })
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      setImageUri(asset.uri)
      setStage('scanning')
      const file = await uriToFile(asset.uri, 'receipt.jpg')
      await upload(file, user?.id ?? '')
    }
  }, [upload, user])

  // ── Reset ───────────────────────────────────────────────────
  const handleReset = () => {
    resetOcr()
    setStage('camera')
    setImageUri(null)
    setEditAmount('')
    setEditMerchant('')
    setEditNote('')
  }

  // ── Confirm transaction ─────────────────────────────────────
  const handleConfirm = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    // TODO: createTransaction({ amount: parseFloat(editAmount), merchant: editMerchant, ... })
    handleReset()
    router.replace('/(tabs)')
  }

  // ── No permission ───────────────────────────────────────────
  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.permissionScreen}>
          <Text style={styles.permIcon}>📷</Text>
          <Text style={styles.permTitle}>ขอสิทธิ์กล้อง</Text>
          <Text style={styles.permSub}>MoneyMind ต้องการใช้กล้องเพื่อสแกนสลิป</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>อนุญาต</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.permSkip} onPress={pickFromGallery}>
            <Text style={styles.permSkipText}>เลือกจาก Photos แทน</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── STAGE: Camera ───────────────────────────────────────────
  if (stage === 'camera') {
    return (
      <View style={styles.cameraRoot}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          enableTorch={torch}
        />

        {/* Dark overlay with viewfinder cutout */}
        <View style={styles.overlay}>
          {/* Top bar */}
          <SafeAreaView edges={['top']}>
            <View style={styles.camTopBar}>
              <TouchableOpacity style={styles.camBtn} onPress={() => router.back()}>
                <Text style={styles.camBtnText}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.camTitle}>สแกนสลิป</Text>
              <TouchableOpacity style={styles.camBtn} onPress={() => setTorch(t => !t)}>
                <Text style={[styles.camBtnText, torch && { color: Colors.amber }]}>⚡</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          {/* Instruction */}
          <Text style={styles.camInstruction}>วางสลิปในกรอบ</Text>

          {/* Viewfinder */}
          <View style={styles.viewfinder}>
            <Corners />
            {/* Scan flash animation on mount */}
            <Animated.View style={styles.flashOverlay} />
          </View>

          {/* Bottom bar */}
          <View style={[styles.camBottomBar, { paddingBottom: insets.bottom + 24 }]}>
            <TouchableOpacity style={styles.galleryBtn} onPress={pickFromGallery}>
              <Text style={styles.galleryIcon}>🖼</Text>
              <Text style={styles.galleryLabel}>Photos</Text>
            </TouchableOpacity>

            {/* Shutter */}
            <TouchableOpacity
              style={styles.shutterOuter}
              onPress={takePhoto}
              activeOpacity={0.8}
            >
              <View style={styles.shutterInner} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.galleryBtn}
              onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
            >
              <Text style={styles.galleryIcon}>🔄</Text>
              <Text style={styles.galleryLabel}>Flip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  // ── STAGE: Scanning ─────────────────────────────────────────
  if (stage === 'scanning') {
    const stepIdx = progress < 30 ? 0 : progress < 60 ? 1 : progress < 85 ? 2 : 3
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.scanningScreen}>
          {/* Preview */}
          <View style={styles.scanImgWrap}>
            {imageUri && (
              <Image source={{ uri: imageUri }} style={styles.scanImg} contentFit="contain" />
            )}
            <ScanLine active />
            <Corners color={Colors.green} />
          </View>

          {/* Status */}
          <View style={styles.scanStatus}>
            <Text style={styles.scanStatusText}>
              {stepIdx === 0 && '⬆ กำลังอัปโหลด...'}
              {stepIdx === 1 && '◈ Google Vision OCR กำลังอ่าน...'}
              {stepIdx === 2 && '✦ Claude AI กำลังวิเคราะห์...'}
              {stepIdx === 3 && '✓ เกือบเสร็จแล้ว...'}
            </Text>

            {/* Progress bar */}
            <View style={styles.progBg}>
              <Animated.View style={[styles.progFill, { width: `${progress}%` as any }]} />
            </View>

            <ProgressSteps current={stepIdx} />
          </View>

          <TouchableOpacity style={styles.cancelBtn} onPress={handleReset}>
            <Text style={styles.cancelBtnText}>ยกเลิก</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── STAGE: Result (success or error) ─────────────────────────
  if (stage === 'result') {
    const isError = ocrState === 'failed'
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={[styles.resultScroll, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.resultHeader}>
            <Text style={[styles.resultCheck, isError && { color: Colors.red }]}>
              {isError ? '✕' : '✓'}
            </Text>
            <Text style={styles.resultTitle}>
              {isError ? 'OCR ล้มเหลว' : 'สแกนสำเร็จ'}
            </Text>
          </View>

          {isError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorMsg}>{errorMsg}</Text>
              <View style={styles.tipList}>
                {['ถ่ายรูปให้สว่างและชัดเจน', 'วางสลิปบนพื้นเรียบ', 'ภาพต้องไม่เบลอหรือเอียง'].map(t => (
                  <Text key={t} style={styles.tipText}>· {t}</Text>
                ))}
              </View>
            </View>
          ) : (
            <>
              {/* Thumbnail */}
              <View style={styles.thumbRow}>
                {imageUri && (
                  <View style={styles.thumbWrap}>
                    <Image source={{ uri: imageUri }} style={styles.thumbImg} contentFit="cover" />
                    {result && (
                      <View style={styles.confBadge}>
                        <Text style={styles.confText}>✦ {Math.round((result.confidence ?? 0.9) * 100)}%</Text>
                      </View>
                    )}
                  </View>
                )}
                <View style={styles.thumbFields}>
                  <FieldRow label="ยอดเงิน (฿)" value={editAmount} editable large accent onChangeText={setEditAmount} />
                  <FieldRow label="ร้านค้า" value={editMerchant} editable onChangeText={setEditMerchant} />
                </View>
              </View>

              {/* Date + Category */}
              <View style={styles.fieldRowPair}>
                <View style={{ flex: 1 }}>
                  <FieldRow label="วันที่" value={result?.date ? formatDate(result.date) : 'วันนี้'} />
                </View>
                <View style={{ flex: 1 }}>
                  <FieldRow label="หมวดหมู่ AI" value={result?.category_name ?? 'ไม่ระบุ'} accent={!!result?.category_name} />
                </View>
              </View>

              {/* Line items */}
              {result?.items && result.items.length > 0 && (
                <View style={styles.itemsBox}>
                  <Text style={styles.itemsTitle}>รายการสินค้า</Text>
                  {result.items.map((item, i) => (
                    <View key={i} style={[styles.itemRow, i < result.items!.length - 1 && styles.itemRowBorder]}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemPrice}>฿{item.price.toLocaleString()}</Text>
                    </View>
                  ))}
                </View>
              )}

              <FieldRow label="หมายเหตุ" value={editNote} editable onChangeText={setEditNote} />
            </>
          )}
        </ScrollView>

        {/* Bottom action buttons */}
        <View style={[styles.resultActions, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity style={styles.retryBtn} onPress={handleReset}>
            <Text style={styles.retryBtnText}>↺ สแกนใหม่</Text>
          </TouchableOpacity>
          {!isError && (
            <TouchableOpacity
              style={[styles.confirmBtn, !editAmount && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!editAmount}
            >
              <Text style={styles.confirmBtnText}>✓ บันทึกรายการ</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    )
  }

  return null
}

// ── Helpers ───────────────────────────────────────────────────
async function uriToFile(uri: string, name: string): Promise<File> {
  const res    = await fetch(uri)
  const blob   = await res.blob()
  return new File([blob], name, { type: blob.type || 'image/jpeg' })
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(iso))
  } catch { return iso }
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  // Camera
  cameraRoot: { flex: 1 },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    flexDirection: 'column', alignItems: 'center',
  },
  camTopBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', paddingHorizontal: 20, paddingVertical: 12,
  },
  camBtn: {
    width: 38, height: 38, borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  camBtnText:     { fontSize: 18, color: '#fff' },
  camTitle:       { fontSize: 16, fontFamily: Fonts.sans, fontWeight: FontWeight.medium, color: '#fff' },
  camInstruction: {
    fontSize: FontSize.sm, fontFamily: Fonts.mono, color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5, marginTop: 8, marginBottom: 16,
  },

  viewfinder: {
    width: VIEWFINDER_W, height: VIEWFINDER_H,
    borderRadius: Radius.md, overflow: 'hidden',
    position: 'relative',
  },
  scanLine: {
    position: 'absolute', left: 0, right: 0, height: 2,
    backgroundColor: Colors.green,
    shadowColor: Colors.green, shadowRadius: 8,
    shadowOpacity: 0.8, shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  flashOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: Colors.green, opacity: 0,
  },

  corner: { position: 'absolute', width: 24, height: 24, borderWidth: 2.5 },
  cornerTL: { top: 8, left: 8,  borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR: { top: 8, right: 8, borderLeftWidth: 0,  borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL: { bottom: 8, left: 8,  borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 8, right: 8, borderLeftWidth: 0,  borderTopWidth: 0, borderBottomRightRadius: 4 },

  camBottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    width: '100%', paddingTop: 28, paddingHorizontal: 40,
    marginTop: 'auto',
  },
  galleryBtn: { alignItems: 'center', gap: 5 },
  galleryIcon:  { fontSize: 24 },
  galleryLabel: { fontSize: 11, fontFamily: Fonts.mono, color: 'rgba(255,255,255,0.6)' },
  shutterOuter: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2.5, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },

  // Scanning
  scanningScreen: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing['2xl'], gap: Spacing.xl,
  },
  scanImgWrap: {
    width: VIEWFINDER_W, height: VIEWFINDER_H - 60,
    borderRadius: Radius.lg, overflow: 'hidden',
    position: 'relative', backgroundColor: Colors.bg2,
    borderWidth: 0.5, borderColor: Colors.border,
  },
  scanImg: { width: '100%', height: '100%', opacity: 0.7 },
  scanStatus: { width: '100%', gap: Spacing.sm },
  scanStatusText: {
    fontSize: FontSize.sm, fontFamily: Fonts.mono,
    color: Colors.green, letterSpacing: 0.3,
  },
  progBg: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 99, overflow: 'hidden',
  },
  progFill: { height: '100%', backgroundColor: Colors.green, borderRadius: 99 },
  stepsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepText: { fontSize: 10, fontFamily: Fonts.mono, color: Colors.faint },
  stepSep:  { fontSize: 10, color: Colors.faint },
  cancelBtn: { marginTop: Spacing.sm },
  cancelBtnText: { fontSize: FontSize.sm, color: Colors.text3, fontFamily: Fonts.mono },

  // Permission
  permissionScreen: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing['3xl'], gap: Spacing.md,
  },
  permIcon:  { fontSize: 48, marginBottom: 8 },
  permTitle: { fontSize: FontSize.xl, fontFamily: Fonts.sans, fontWeight: FontWeight.medium, color: Colors.text },
  permSub:   { fontSize: FontSize.sm, color: Colors.text3, textAlign: 'center', lineHeight: 20 },
  permBtn:   {
    marginTop: Spacing.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing['2xl'],
    backgroundColor: Colors.green, borderRadius: Radius.lg,
  },
  permBtnText: { fontSize: FontSize.lg, fontFamily: Fonts.sans, fontWeight: FontWeight.medium, color: '#0a0a0b' },
  permSkip: { marginTop: Spacing.sm },
  permSkipText: { fontSize: FontSize.sm, fontFamily: Fonts.mono, color: Colors.muted },

  // Result
  resultScroll: { padding: Spacing['2xl'], gap: Spacing.lg },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  resultCheck: { fontSize: 22, color: Colors.teal },
  resultTitle: { fontSize: FontSize.xl, fontFamily: Fonts.sans, fontWeight: FontWeight.medium, color: Colors.text },

  errorBox: {
    backgroundColor: Colors.bg2, borderRadius: Radius.lg,
    borderWidth: 0.5, borderColor: 'rgba(248,113,113,0.2)',
    padding: Spacing.lg, gap: Spacing.md,
  },
  errorMsg: { fontSize: FontSize.md, color: Colors.red },
  tipList:  { gap: Spacing.xs },
  tipText:  { fontSize: FontSize.xs, fontFamily: Fonts.mono, color: Colors.muted },

  thumbRow:   { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  thumbWrap:  { flexShrink: 0, position: 'relative' },
  thumbImg:   {
    width: 110, aspectRatio: 0.75, borderRadius: Radius.md,
    borderWidth: 0.5, borderColor: Colors.border,
  },
  confBadge:  {
    position: 'absolute', bottom: 6, left: 0, right: 0,
    alignItems: 'center',
  },
  confText:   {
    fontSize: 10, fontFamily: Fonts.mono, color: Colors.green,
    backgroundColor: Colors.greenBg, paddingHorizontal: 6,
    paddingVertical: 2, borderRadius: 5,
  },
  thumbFields: { flex: 1, gap: Spacing.md },

  fieldGroup:     { gap: 5 },
  fieldLabel:     {
    fontSize: FontSize.xs, fontFamily: Fonts.mono,
    color: Colors.muted, letterSpacing: 1, textTransform: 'uppercase',
  },
  fieldInputWrap: { position: 'relative', flexDirection: 'row', alignItems: 'center' },
  fieldPrefix:    {
    position: 'absolute', left: 12, zIndex: 1,
    fontSize: FontSize.md, fontFamily: Fonts.mono, color: Colors.muted,
  },
  fieldInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 0.5, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm, color: Colors.text,
    fontSize: FontSize.md, fontFamily: Fonts.sans,
  },
  fieldInputLarge: {
    fontSize: FontSize.xl, fontFamily: Fonts.mono,
    fontWeight: FontWeight.medium, color: Colors.green,
  },
  fieldStatic: {
    fontSize: FontSize.sm, fontFamily: Fonts.mono,
    color: Colors.text2, paddingVertical: Spacing.sm,
  },
  fieldRowPair: { flexDirection: 'row', gap: Spacing.md },

  itemsBox: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 0.5, borderColor: Colors.border,
    borderRadius: Radius.md, padding: Spacing.md, gap: 2,
  },
  itemsTitle:  { fontSize: 10, fontFamily: Fonts.mono, color: Colors.muted, letterSpacing: 1, marginBottom: 6 },
  itemRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  itemRowBorder:{ borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.04)' },
  itemName:    { fontSize: FontSize.sm, color: Colors.text3 },
  itemPrice:   { fontSize: FontSize.sm, fontFamily: Fonts.mono, color: Colors.text2 },

  resultActions: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing['2xl'], paddingTop: Spacing.md,
    borderTopWidth: 0.5, borderTopColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  retryBtn: {
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.bg2, borderWidth: 0.5, borderColor: Colors.border,
    borderRadius: Radius.lg,
  },
  retryBtnText: { fontSize: FontSize.md, fontFamily: Fonts.mono, color: Colors.text3 },
  confirmBtn: {
    flex: 1, paddingVertical: Spacing.md, alignItems: 'center',
    backgroundColor: Colors.green, borderRadius: Radius.lg,
  },
  confirmBtnDisabled: { backgroundColor: 'rgba(132,204,22,0.3)' },
  confirmBtnText: { fontSize: FontSize.md, fontFamily: Fonts.sans, fontWeight: FontWeight.medium, color: '#0a0a0b' },
})
