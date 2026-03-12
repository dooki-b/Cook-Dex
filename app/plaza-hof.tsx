import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { db } from '../firebaseConfig';
import { Colors, Radius, Shadows } from '../constants/design-tokens';

const DAILY_PLAZA_LIMIT = 5;

export default function PlazaHofScreen() {
  const router = useRouter();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewsLeft, setViewsLeft] = useState(DAILY_PLAZA_LIMIT);
  const [isProUser, setIsProUser] = useState(false);

  const loadDailyViews = useCallback(async () => {
    try {
      const today = new Date().toLocaleDateString();
      const raw = await AsyncStorage.getItem('cookdex_plaza_daily_views');
      if (raw) {
        const data = JSON.parse(raw);
        if (data.date === today) setViewsLeft(data.count);
        else setViewsLeft(DAILY_PLAZA_LIMIT);
      } else setViewsLeft(DAILY_PLAZA_LIMIT);
    } catch (_) {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        setLoading(true);
        try {
          const ref = collection(db, 'global_recipes');
          const q = query(ref, orderBy('createdAt', 'desc'), limit(50));
          const snap = await getDocs(q);
          const recipes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          const score = (r) => (r.ratingAvg ?? 0) * (r.reviewCount ?? 0) || (r.likes || 0) + (r.comments?.length || 0) * 2;
          const sorted = [...recipes].sort((a, b) => score(b) - score(a));
          setList(sorted);
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
        loadDailyViews();
      };
      fetchData();
    }, [loadDailyViews])
  );

  const extractTitle = (content) => (content && content.match(/#\s+(.*)/)) ? content.match(/#\s+(.*)/)[1] : '이름 없는 요리';
  const formatDate = (iso) => !iso ? '' : new Date(iso).toLocaleDateString();

  const handleRecipePress = async (item) => {
    if (!isProUser && viewsLeft <= 0) {
      Alert.alert('열람 한도 소진', '오늘 남은 열람 횟수를 모두 사용했습니다. 내일 다시 이용해 주세요.');
      return;
    }
    if (!isProUser) {
      const newCount = viewsLeft - 1;
      setViewsLeft(newCount);
      await AsyncStorage.setItem('cookdex_plaza_daily_views', JSON.stringify({ date: new Date().toLocaleDateString(), count: newCount }));
    }
    router.push({ pathname: '/recipe-detail', params: { source: 'plaza', id: item.id } });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>명예의 전당</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>명예의 전당</Text>
        <View style={styles.limitBadge}>
          <Text style={styles.limitBadgeText}>{isProUser ? '무제한' : `${viewsLeft}회 남음`}</Text>
        </View>
      </View>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <TouchableOpacity style={styles.card} onPress={() => handleRecipePress(item)} activeOpacity={0.8}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankBadgeText}>{index + 1}위</Text>
            </View>
            <Text style={styles.cardAuthor}>{item.authorName} 셰프</Text>
            <Text style={styles.cardTitle} numberOfLines={1}>{extractTitle(item.content)}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>★ {(item.ratingAvg ?? 0) || (item.likes > 0 ? '4.0' : '-')} ({(item.reviewCount ?? item.comments?.length ?? 0)})</Text>
            </View>
          </TouchableOpacity>
        )}
      />
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
  limitBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primarySoft,
  },
  limitBadgeText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 80 },
  card: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  rankBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    marginBottom: 8,
  },
  rankBadgeText: { color: Colors.textInverse, fontSize: 12, fontWeight: '800' },
  cardAuthor: { fontSize: 13, color: Colors.textSub, marginBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: Colors.textMain, marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaText: { fontSize: 12, color: Colors.textSub, fontWeight: '600' },
});
