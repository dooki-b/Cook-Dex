import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radius } from '../constants/design-tokens';

export default function PlazaRankingScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>랭킹</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderEmoji}>🏆</Text>
        <Text style={styles.placeholderTitle}>셰프 랭킹</Text>
        <Text style={styles.placeholderSub}>별점·요리 후기를 가장 많이 받은 셰프 순위가 여기에 표시됩니다. (추후 오픈)</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgMain },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 24 : 12,
    paddingBottom: 12,
    backgroundColor: Colors.bgMain,
  },
  backBtn: {
    padding: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backBtnText: { fontSize: 18, color: Colors.textMain, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: Colors.textMain },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  placeholderEmoji: { fontSize: 48, marginBottom: 16 },
  placeholderTitle: { fontSize: 18, fontWeight: '800', color: Colors.textMain, marginBottom: 8 },
  placeholderSub: { fontSize: 14, color: Colors.textSub, textAlign: 'center' },
});
