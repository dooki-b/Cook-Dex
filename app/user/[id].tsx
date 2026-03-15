import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadows } from '../../constants/design-tokens';

// 임시 Mock 데이터 - 실제 구현 시 Firebase/DB 검색으로 대체
const MOCK_DB = {
  'user1': { nickname: '김요리', title: '👨‍🍳 수석 셰프', level: 3, exp: 200, nextExp: 500, recipes: 12, likes: 300 },
  'user2': { nickname: '이초보', title: '🍳 요리 쪼렙', level: 1, exp: 10, nextExp: 50, recipes: 2, likes: 5 },
  'user3': { nickname: '박마스터', title: '👑 마스터 셰프', level: 'MAX', exp: 9999, nextExp: 'MAX', recipes: 156, likes: 12050 },
  'user4': { nickname: '최장금', title: '🔪 견습 요리사', level: 2, exp: 80, nextExp: 150, recipes: 5, likes: 23 },
};

type UserProfileData = {
  nickname: string;
  title: string;
  level: number | 'MAX';
  exp: number;
  nextExp: number | 'MAX';
  recipes: number;
  likes: number;
};

// 임시 유저 작성 레시피 리스트
const MOCK_RECIPES = [
  { id: 'r1', title: '황금볶음밥 비법', likes: 120 },
  { id: 'r2', title: '초간단 계란말이', likes: 45 },
  { id: 'r3', title: '매콤달콤 떡볶이', likes: 210 },
];

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState<UserProfileData | null>(null);

  useEffect(() => {
    // 임시 데이터 페치 효과
    setTimeout(() => {
      setUserData((MOCK_DB as Record<string, UserProfileData>)[id] || null);
      setIsLoading(false);
    }, 600);
  }, [id]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (!userData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color={Colors.textMain} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="person-circle-outline" size={64} color={Colors.border} />
          <Text style={{ marginTop: 10, fontSize: 18, color: Colors.textSub }}>존재하지 않는 셰프입니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const expProgress = String(userData.level) === 'MAX' ? 100 : (userData.exp / Number(userData.nextExp)) * 100;

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={Colors.textMain} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}></Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
        {/* 상단 프로필 카드 */}
        <View style={styles.profileCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View style={styles.avatarWrap}>
              <Text style={styles.avatarText}>{userData.nickname[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.titleBadge}>{userData.title}</Text>
              <Text style={styles.nickname}>{userData.nickname} 셰프</Text>
            </View>
            <TouchableOpacity 
              style={styles.followBtn}
              onPress={() => Alert.alert("준비 중", "팔로우 기능은 곧 추가됩니다!")}
            >
              <Text style={styles.followBtnText}>팔로우</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>조회수/좋아요</Text>
              <Text style={styles.statValue}>{userData.likes.toLocaleString()}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>제작 레시피</Text>
              <Text style={styles.statValue}>{userData.recipes}개</Text>
            </View>
          </View>

          <View style={styles.levelHeader}>
            <Text style={styles.levelTitle}>Lv.{userData.level}</Text>
            {String(userData.level) !== 'MAX' && (
              <Text style={styles.expText}>{userData.exp} / {userData.nextExp} EXP</Text>
            )}
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${expProgress}%` }]} />
          </View>

          <TouchableOpacity style={styles.achievementBtn} activeOpacity={0.8} onPress={() => Alert.alert("준비 중", "타 유저의 뱃지와 업적은 추후 공개됩니다.")}>
            <Text style={styles.achievementBtnText}>🏆 보유 업적 및 뱃지 구경하기</Text>
            <Ionicons name="chevron-forward" size={16} color="#FFD700" />
          </TouchableOpacity>
        </View>

        {/* 유저가 작성한 레시피 리스트 */}
        <Text style={styles.sectionTitle}>{userData.nickname} 셰프의 주방 🍳</Text>
        <View style={styles.recipeListWrap}>
          {MOCK_RECIPES.map((recipe) => (
            <TouchableOpacity key={recipe.id} style={styles.recipeCard} activeOpacity={0.7}>
              <View style={styles.recipeCardIcon}>
                <Ionicons name="restaurant-outline" size={24} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.recipeCardTitle}>{recipe.title}</Text>
                <Text style={styles.recipeCardLikes}>❤️ {recipe.likes}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.border} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgMain },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textMain },
  
  profileCard: { backgroundColor: '#3A322F', borderRadius: 20, padding: 20, marginBottom: 30, borderWidth: 1, borderColor: '#4A3F3A', ...Shadows.soft },
  avatarWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 28, fontWeight: 'bold', color: Colors.textInverse },
  titleBadge: { backgroundColor: 'rgba(255, 140, 0, 0.2)', color: Colors.primary, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginBottom: 8, fontSize: 13, fontWeight: 'bold' },
  nickname: { fontSize: 22, fontWeight: 'bold', color: '#FFFDF9' },
  followBtn: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  followBtnText: { color: Colors.textInverse, fontWeight: 'bold', fontSize: 14 },
  
  statsRow: { flexDirection: 'row', backgroundColor: '#2A2421', borderRadius: Radius.md, paddingVertical: 16, marginTop: 24, marginBottom: 20 },
  statBox: { flex: 1, alignItems: 'center' },
  statLabel: { color: Colors.textSub, fontSize: 12, marginBottom: 4 },
  statValue: { color: Colors.primary, fontSize: 18, fontWeight: 'bold' },
  divider: { width: 1, backgroundColor: '#4A3F3A', marginVertical: 4 },

  levelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  levelTitle: { fontSize: 16, fontWeight: 'bold', color: '#FF8C00' },
  expText: { fontSize: 13, fontWeight: 'bold', color: '#A89F9C' },
  progressBarBg: { width: '100%', height: 10, backgroundColor: '#2A2421', borderRadius: 5, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#FF8C00', borderRadius: 5 },
  
  achievementBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20, backgroundColor: '#2A2421', paddingVertical: 14, borderRadius: Radius.md, gap: 4 },
  achievementBtnText: { color: '#FFD700', fontSize: 14, fontWeight: 'bold' },

  sectionTitle: { fontSize: 20, fontWeight: '900', color: Colors.textMain, marginBottom: 16, marginLeft: 4 },
  recipeListWrap: { gap: 12 },
  recipeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, padding: 16, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, ...Shadows.soft },
  recipeCardIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255, 140, 0, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  recipeCardTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textMain, marginBottom: 4 },
  recipeCardLikes: { fontSize: 13, color: Colors.textSub, fontWeight: '600' },
});
