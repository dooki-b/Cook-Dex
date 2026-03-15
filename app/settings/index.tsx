import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Colors } from '../../constants/design-tokens';

// 전체 메뉴 로직이 app/(tabs)/menu.tsx 로 통합되었으므로,
// 하위 버전 호환성 및 기존 파일 링크를 위해 자동 리다이렉트를 수행합니다.
export default function SettingsRedirectScreen() {
  const router = useRouter();

  useEffect(() => {
    // 마운트 시 즉각적으로 새 전체 메뉴 탭으로 이동
    const timer = setTimeout(() => {
      router.replace('/(tabs)/menu');
    }, 100);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bgMain, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}
