// 파일 위치: app/(tabs)/ranking.tsx
import { useFocusEffect } from 'expo-router';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../../firebaseConfig';

// 칭호 계산기 (index.tsx와 동일한 로직)
const calculateLevel = (exp) => {
  if (exp < 30) return "초급";
  if (exp < 100) return "견습";
  if (exp < 300) return "수석";
  return "마스터";
};

export default function RankingScreen() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRankData, setMyRankData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // 🚨 화면에 들어올 때마다 최신 랭킹 데이터를 서버에서 불러옵니다.
  useFocusEffect(
    useCallback(() => {
      const fetchRanking = async () => {
        setIsLoading(true);
        try {
          const currentUser = auth.currentUser;
          
          // 파이어베이스에서 totalExp 기준 내림차순(desc)으로 상위 50명을 불러옵니다.
          const usersRef = collection(db, "users");
          const q = query(usersRef, orderBy("totalExp", "desc"), limit(50));
          const querySnapshot = await getDocs(q);

          let rankList = [];
          let currentRank = 1;
          
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            const userData = {
              id: doc.id,
              rank: currentRank,
              nickname: data.nickname || "익명 셰프",
              totalExp: data.totalExp || 0,
              title: calculateLevel(data.totalExp || 0)
            };
            rankList.push(userData);
            
            // 내 데이터 찾기
            if (currentUser && doc.id === currentUser.uid) {
              setMyRankData(userData);
            }
            currentRank++;
          });

          setLeaderboard(rankList);

          // 만약 내가 상위 50위 밖이라서 리스트에 없다면? -> 순위권 밖 처리
          if (currentUser && !rankList.find(user => user.id === currentUser.uid)) {
            setMyRankData({
              id: currentUser.uid,
              rank: "50+",
              nickname: currentUser.displayName || "내 주방",
              totalExp: "??",
              title: "도전자"
            });
          }

        } catch (error) {
          console.error("랭킹 로드 실패:", error);
        } finally {
          setIsLoading(false);
        }
      };

      fetchRanking();
    }, [])
  );

  // 리스트 아이템 렌더링 함수
  const renderItem = ({ item }) => {
    const isMe = auth.currentUser?.uid === item.id;
    let rankDisplay = <Text style={styles.rankNumber}>{item.rank}</Text>;
    
    // Top 3 특별 보상 디자인
    if (item.rank === 1) rankDisplay = <Text style={styles.rankMedal}>🥇</Text>;
    if (item.rank === 2) rankDisplay = <Text style={styles.rankMedal}>🥈</Text>;
    if (item.rank === 3) rankDisplay = <Text style={styles.rankMedal}>🥉</Text>;

    return (
      <View style={[styles.rankCard, isMe && styles.myRankCardActive]}>
        <View style={styles.rankLeft}>
          <View style={styles.rankCircle}>{rankDisplay}</View>
          <View>
            <Text style={styles.userTitle}>{item.title}</Text>
            <Text style={[styles.userNickname, isMe && styles.myNicknameText]}>
              {item.nickname} {isMe && "(나)"}
            </Text>
          </View>
        </View>
        <View style={styles.expBadge}>
          <Text style={styles.expText}>{item.totalExp} EXP</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>명예의 전당</Text>
        <Text style={styles.headerSub}>글로벌 셰프들과 경험치를 겨뤄보세요</Text>
      </View>

      {/* 🚨 내 순위 고정 패널 (Sticky My Rank) */}
      {myRankData && (
        <View style={styles.myStickyPanel}>
          <Text style={styles.myStickyLabel}>내 현재 순위</Text>
          <View style={styles.rankCard}>
            <View style={styles.rankLeft}>
              <View style={[styles.rankCircle, { backgroundColor: '#FF8C00' }]}>
                <Text style={styles.myRankNumber}>{myRankData.rank}</Text>
              </View>
              <View>
                <Text style={styles.userTitle}>{myRankData.title}</Text>
                <Text style={styles.userNickname}>{myRankData.nickname}</Text>
              </View>
            </View>
            <View style={[styles.expBadge, { backgroundColor: '#FFF3E0' }]}>
              <Text style={[styles.expText, { color: '#E65100' }]}>{myRankData.totalExp} EXP</Text>
            </View>
          </View>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#FF8C00" />
          <Text style={styles.loadingText}>글로벌 랭킹 집계 중...</Text>
        </View>
      ) : (
        <FlatList 
          data={leaderboard} 
          keyExtractor={(item) => item.id} 
          renderItem={renderItem} 
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// 🎨 미슐랭 웜톤 테마 완벽 적용
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDF9' },
  header: { paddingTop: 30, paddingBottom: 15, paddingHorizontal: 20, backgroundColor: '#FFFDF9' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#3A2E2B', marginBottom: 5 },
  headerSub: { fontSize: 14, color: '#8C7A76', fontWeight: '600' },
  
  myStickyPanel: { paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#E8D5D0', backgroundColor: '#FFFDF9', zIndex: 10, shadowColor: '#8C7A76', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 3 },
  myStickyLabel: { fontSize: 12, fontWeight: 'bold', color: '#FF8C00', marginBottom: 8 },
  myRankNumber: { fontSize: 16, fontWeight: '900', color: '#fff' },
  
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 15, fontSize: 15, fontWeight: 'bold', color: '#8C7A76' },
  
  listContent: { padding: 20, paddingBottom: 80 },
  rankCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12, shadowColor: '#8C7A76', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  myRankCardActive: { borderWidth: 2, borderColor: '#FF8C00', backgroundColor: '#FFFDF9' },
  
  rankLeft: { flexDirection: 'row', alignItems: 'center' },
  rankCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#F9F5F3', justifyContent: 'center', alignItems: 'center', marginRight: 15, borderWidth: 1, borderColor: '#E8D5D0' },
  rankNumber: { fontSize: 16, fontWeight: 'bold', color: '#3A2E2B' },
  rankMedal: { fontSize: 22 },
  
  userTitle: { fontSize: 11, color: '#8C7A76', fontWeight: 'bold', marginBottom: 3 },
  userNickname: { fontSize: 16, fontWeight: '800', color: '#3A2E2B' },
  myNicknameText: { color: '#FF8C00' },
  
  expBadge: { backgroundColor: '#F5EBE7', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  expText: { fontSize: 13, fontWeight: '900', color: '#3A2E2B' }
});