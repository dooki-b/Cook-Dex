import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius } from '../../constants/design-tokens';

const MENU_ITEMS = [
  { id: 'benefits', label: '혜택 상점', path: '/(tabs)/benefits' },
  { id: 'recipes', label: '내 주방 (레시피)', path: '/(tabs)/recipes' },
  { id: 'quest', label: '도파민 퀘스트', path: '/(tabs)/quest' },
  { id: 'tutorial', label: '앱 튜토리얼', path: '/tutorial' },
];

export default function MenuScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>전체 메뉴</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => router.push(item.path as any)}
          >
            <Text style={styles.rowLabel}>{item.label}</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgMain },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textMain },
  scroll: { paddingHorizontal: 20, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgElevated,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: Radius.lg,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowLabel: { fontSize: 16, fontWeight: '600', color: Colors.textMain },
  rowArrow: { fontSize: 20, color: Colors.textSub, fontWeight: '300' },
});
