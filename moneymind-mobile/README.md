# MoneyMind Mobile — React Native + Expo

## Project Structure

```
moneymind-mobile/
├── app/
│   ├── _layout.tsx              ← Root layout + font loader
│   ├── (tabs)/
│   │   ├── _layout.tsx          ← Bottom tab navigator
│   │   ├── index.tsx            ← Home / Dashboard
│   │   ├── transactions.tsx     ← Transaction list + filter
│   │   ├── analytics.tsx        ← Charts + spending breakdown
│   │   ├── scan.tsx             ← Camera / OCR scan
│   │   └── profile.tsx          ← User settings
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx            ← Google / GitHub / Email login
│   │   └── callback.tsx         ← OAuth redirect handler
│   ├── add-transaction.tsx      ← Modal: numpad + category
│   ├── scan.tsx                 ← Full-screen receipt scan
│   ├── ai-chat.tsx              ← AI financial assistant
│   ├── transaction/[id].tsx     ← Transaction detail
│   ├── budgets.tsx
│   └── notifications.tsx
│
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   └── ProgressBar.tsx
│   ├── charts/
│   │   ├── AreaChart.tsx        ← Victory Native area chart
│   │   └── DonutChart.tsx
│   └── scan/
│       └── CameraScanner.tsx    ← Expo Camera + OCR upload
│
├── constants/
│   └── theme.ts                 ← Colors, fonts, spacing tokens
│
├── hooks/
│   ├── useReceiptOcr.ts         ← OCR upload + realtime poll
│   └── useNotifications.ts
│
├── store/
│   ├── authStore.ts             ← Zustand auth state
│   └── transactionStore.ts      ← Zustand transactions + realtime
│
├── supabase/
│   └── client.ts                ← Shared from web project
│
├── utils/
│   └── format.ts                ← formatTHB, relativeDate, etc.
│
├── assets/
│   └── fonts/
│       ├── DMSerifDisplay-Regular.ttf
│       ├── GeistMono-Regular.ttf
│       ├── GeistMono-Medium.ttf
│       ├── Geist-Regular.ttf
│       └── Geist-Medium.ttf
│
├── app.json
├── eas.json
└── package.json
```

---

## Setup (ขั้นตอน)

### 1. สร้าง Expo project

```bash
npx create-expo-app moneymind-mobile --template blank-typescript
cd moneymind-mobile
```

### 2. ติดตั้ง dependencies

```bash
npx expo install expo-router expo-camera expo-image-picker \
  expo-secure-store expo-notifications expo-haptics \
  expo-linear-gradient expo-blur expo-font

npx expo install react-native-reanimated react-native-gesture-handler \
  react-native-safe-area-context react-native-screens react-native-svg

npm install @supabase/supabase-js \
  @react-native-async-storage/async-storage \
  victory-native zustand date-fns
```

### 3. โหลดฟอนต์

ดาวน์โหลดฟอนต์ไปไว้ที่ `assets/fonts/`:
- [Geist](https://vercel.com/font) — Regular, Medium
- [Geist Mono](https://vercel.com/font) — Regular, Medium  
- [DM Serif Display](https://fonts.google.com/specimen/DM+Serif+Display)

### 4. ตั้งค่า app.json

```json
{
  "expo": {
    "name": "MoneyMind",
    "slug": "moneymind",
    "scheme": "moneymind",
    "plugins": [
      "expo-router",
      "expo-camera",
      "expo-image-picker",
      [
        "expo-notifications",
        { "icon": "./assets/notification-icon.png" }
      ]
    ],
    "ios": {
      "bundleIdentifier": "th.dev.moneymind",
      "infoPlist": {
        "NSCameraUsageDescription": "ใช้กล้องถ่ายรูปสลิปเพื่อ scan อัตโนมัติ",
        "NSPhotoLibraryUsageDescription": "เลือกรูปสลิปจาก Photos"
      }
    },
    "android": {
      "package": "th.dev.moneymind",
      "permissions": ["CAMERA", "READ_MEDIA_IMAGES"]
    }
  }
}
```

### 5. Environment variables (.env)

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 6. เริ่ม dev server

```bash
npx expo start
# กด 'a' สำหรับ Android emulator
# กด 'i' สำหรับ iOS simulator
# สแกน QR บน Expo Go app (physical device)
```

---

## Supabase Auth Deep Link (OAuth callback)

เพิ่มใน `app/(auth)/callback.tsx`:

```typescript
import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import { supabase } from '@/supabase/client'

export default function AuthCallback() {
  const router = useRouter()
  
  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') router.replace('/(tabs)')
    })
  }, [])
  
  return null
}
```

---

## Build สำหรับ Production

```bash
# ติดตั้ง EAS CLI
npm install -g eas-cli
eas login

# Build APK (Android)
eas build --platform android --profile preview

# Build IPA (iOS) — ต้องมี Apple Developer Account
eas build --platform ios
```

---

## Screens ที่สร้างแล้ว

| Screen | ไฟล์ | สถานะ |
|--------|------|-------|
| Home Dashboard | `(tabs)/index.tsx` | ✅ |
| Add Transaction | `add-transaction.tsx` | ✅ |
| Tab Navigator | `(tabs)/_layout.tsx` | ✅ |
| Theme System | `constants/theme.ts` | ✅ |
| Auth Store | `store/authStore.ts` | ✅ |
| Transaction Store | `store/transactionStore.ts` | ✅ |
| Format Utils | `utils/format.ts` | ✅ |

## ต้องสร้างเพิ่ม

| Screen | หมายเหตุ |
|--------|---------|
| `(tabs)/transactions.tsx` | List + search + filter |
| `(tabs)/analytics.tsx` | Victory Native charts |
| `(tabs)/scan.tsx` | Expo Camera + OCR |
| `(auth)/login.tsx` | Google/GitHub OAuth |
| `ai-chat.tsx` | Supabase Edge Function stream |
