// 파일 위치: app/_layout.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Colors } from '../constants/design-tokens';
import { auth } from '../firebaseConfig';

export default function RootLayout() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [user, setUser] = useState(null);
  const router = useRouter();
  const segments = useSegments();
  const [isTutorialReady, setIsTutorialReady] = useState(false);

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
    else if (user && segments[0] !== '(tabs)' && segments[0] !== 'scanner' && segments[0] !== 'create-recipe' && segments[0] !== 'tutorial' && segments[0] !== 'benefits' && segments[0] !== 'search' && segments[0] !== 'recipe-detail' && segments[0] !== 'plaza-hof' && segments[0] !== 'plaza-ranking' && segments[0] !== 'categories') {
      router.replace('/(tabs)');
    }
  }, [user, isInitializing, segments]);

  useEffect(() => {
    const checkTutorialAgreed = async () => {
      try {
        const hasAgreed = await AsyncStorage.getItem('cookdex_has_agreed');
        
        // 동의하지 않았고, 현재 튜토리얼 화면이 아니라면 강제 이동
        if (hasAgreed !== 'true' && segments[0] !== 'tutorial') {
          router.replace('/tutorial');
        }
      } catch (error) {
        console.error("튜토리얼 상태 확인 오류:", error);
      } finally {
        setIsTutorialReady(true);
      }
    };

    checkTutorialAgreed();
  }, [segments]);

  if (isInitializing || !isTutorialReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
      <Stack.Screen name="scanner" />
      <Stack.Screen name="tutorial" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="benefits" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="search" />
      <Stack.Screen name="recipe-detail" />
      <Stack.Screen name="plaza-hof" />
      <Stack.Screen name="plaza-ranking" />
      <Stack.Screen name="categories" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bgMain,
  },
});