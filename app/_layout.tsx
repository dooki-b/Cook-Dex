// 파일 위치: app/_layout.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { auth } from '../firebaseConfig';

export default function RootLayout() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [user, setUser] = useState(null);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const autoLoginSetting = await AsyncStorage.getItem('cookdex_auto_login');
        if (autoLoginSetting === 'false') {
          await signOut(auth);
          setUser(null);
        } else {
          setUser(currentUser);
        }
      } else {
        setUser(null);
      }
      if (isInitializing) setIsInitializing(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isInitializing) return; 

    const inTabsGroup = segments[0] === '(tabs)';

    if (!user && inTabsGroup) {
      router.replace('/login');
    } 
    // 🚨 치명적 에러 해결: 스캐너(scanner) 화면일 때는 홈으로 튕겨내지 않도록 예외 처리 추가!!
    else if (user && segments[0] !== '(tabs)' && segments[0] !== 'scanner') {
      router.replace('/(tabs)');
    }
  }, [user, isInitializing, segments]);

  if (isInitializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF8C00" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
      <Stack.Screen name="scanner" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFDF9' }
});