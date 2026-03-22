// app/_layout.tsx
// Root layout — loads fonts, wraps with providers
import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { Colors } from '@/constants/theme'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [loaded] = useFonts({
    'DMSerifDisplay': require('../assets/fonts/DMSerifDisplay-Regular.ttf'),
    'GeistMono':      require('../assets/fonts/GeistMono-Regular.ttf'),
    'GeistMono-Medium': require('../assets/fonts/GeistMono-Medium.ttf'),
    'Geist':          require('../assets/fonts/Geist-Regular.ttf'),
    'Geist-Medium':   require('../assets/fonts/Geist-Medium.ttf'),
  })

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync()
  }, [loaded])

  if (!loaded) return null

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <StatusBar style="light" backgroundColor={Colors.bg} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="add-transaction" options={{ presentation: 'modal' }} />
        <Stack.Screen name="scan"            options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="transaction/[id]" />
      </Stack>
    </GestureHandlerRootView>
  )
}


// ─────────────────────────────────────────────────────────────
// app/(tabs)/_layout.tsx  — Bottom tab navigator
// ─────────────────────────────────────────────────────────────
// (save as separate file: app/(tabs)/_layout.tsx)

import { Tabs } from 'expo-router'
import { View, Text, StyleSheet, Platform } from 'react-native'
import { BlurView } from 'expo-blur'
import { Colors, Fonts, FontSize, Radius, TAB_BAR_HEIGHT } from '@/constants/theme'

interface TabIconProps {
  glyph:  string
  label:  string
  focused: boolean
}

function TabIcon({ glyph, label, focused }: TabIconProps) {
  return (
    <View style={[tabStyles.iconWrap, focused && tabStyles.iconWrapActive]}>
      <Text style={[tabStyles.glyph, focused && tabStyles.glyphActive]}>{glyph}</Text>
      <Text style={[tabStyles.label, focused && tabStyles.labelActive]}>{label}</Text>
    </View>
  )
}

const tabStyles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    gap: 3,
  },
  iconWrapActive: {
    backgroundColor: Colors.greenBg,
  },
  glyph: {
    fontSize: 18,
    color: Colors.muted,
  },
  glyphActive: {
    color: Colors.green,
  },
  label: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    color: Colors.muted,
    letterSpacing: 0.5,
  },
  labelActive: {
    color: Colors.green,
  },
})

export function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : Colors.bg3,
          borderTopWidth: 0.5,
          borderTopColor: Colors.border,
          height: TAB_BAR_HEIGHT,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ tabBarIcon: ({ focused }) => <TabIcon glyph="◈" label="home"    focused={focused} /> }}
      />
      <Tabs.Screen
        name="transactions"
        options={{ tabBarIcon: ({ focused }) => <TabIcon glyph="⇅" label="txns"    focused={focused} /> }}
      />
      <Tabs.Screen
        name="scan"
        options={{ tabBarIcon: ({ focused }) => <TabIcon glyph="⊡" label="scan"    focused={focused} /> }}
      />
      <Tabs.Screen
        name="analytics"
        options={{ tabBarIcon: ({ focused }) => <TabIcon glyph="◱" label="charts"  focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ tabBarIcon: ({ focused }) => <TabIcon glyph="⊙" label="profile" focused={focused} /> }}
      />
    </Tabs>
  )
}
