import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, doc, getDocs, increment, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, Modal, PanResponder, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';
import { Colors, Radius, Shadows } from '../../constants/design-tokens';

// ====================================================================
// 🎮 EXP 밸런스 공식: 100 * (level ^ 1.8) — 최대 레벨 999
// ====================================================================
export const expForLevel = (level: number): number =>
  level <= 1 ? 0 : Math.floor(100 * Math.pow(level, 1.8));

export const calculateLevel = (totalExp: number): { level: number; title: string; currentLevelExp: number; nextLevelExp: number } => {
  let level = 1;
  while (level < 999 && totalExp >= expForLevel(level + 1)) level++;
  const TITLES: Record<number, string> = {
    1: '🥄 요리 초급', 5: '🍳 견습 요리사', 10: '👨‍🍳 수석 셰프', 20: '🌟 마스터 셰프', 50: '🏆 전설의 셰프', 100: '🔱 요리의 신'
  };
  const titleKey = Object.keys(TITLES).map(Number).filter(k => k <= level).pop() ?? 1;
  return { level, title: TITLES[titleKey], currentLevelExp: expForLevel(level), nextLevelExp: expForLevel(level + 1) };
};

const INITIAL_MISSIONS = [
  { id: 'm1', text: '오늘의 주방 입장 (출석)', exp: 10, isCompleted: true, isClaimed: false },
  { id: 'm2', text: 'AI 레시피 1회 생성하기', exp: 20, isCompleted: false, isClaimed: false },
  { id: 'm3', text: '식재료 AI 스캔 1회 하기', exp: 30, isCompleted: false, isClaimed: false },
];

// ====================================================================
// 🏅 업적(Achievement) 데이터 정의
// ====================================================================
const ACHIEVEMENTS = [
  {
    id: 'ach_miracle',
    icon: '🌞',
    name: '미라클 모닝 셰프',
    condition: '오전 5:00~8:30 사이 아침 식사 레시피 요리 인증 3회',
    reward: "'갓생 셰프' 에픽 칭호 + 골드 에그 타이머 UI 프레임 (+200 EXP)",
    maxProgress: 3,
    storageKey: 'ach_miracle_progress',
  },
  {
    id: 'ach_egg',
    icon: '🍳',
    name: '계란 애호가 (에그 마스터)',
    condition: "주 재료 '계란'을 활용한 서로 다른 조리법 요리 5종 완성",
    reward: "'단백질 수호자' 칭호 + 황금 프라이팬 이펙트 해금 (+150 EXP)",
    maxProgress: 5,
    storageKey: 'ach_egg_progress',
  },
  {
    id: 'ach_fridge',
    icon: '🧊',
    name: '냉장고 구출 작전',
    condition: "AI 스캔으로 '유통기한 임박' 또는 '자투리 채소' 3종 이상 조합 요리 1회",
    reward: "'지구방위대 셰프' 히든 뱃지 + 무료 룰렛 티켓 1장 (+300 EXP)",
    maxProgress: 1,
    storageKey: 'ach_fridge_progress',
  },
];

export default function QuestScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  // 🎮 게이미피케이션 상태
  const [userExp, setUserExp] = useState(0);
  const [missions, setMissions] = useState(INITIAL_MISSIONS);
  const [isExpBuffActive, setIsExpBuffActive] = useState(false);
  const [mockAdPlaying, setMockAdPlaying] = useState(false);
  const [adCountdown, setAdCountdown] = useState(3);

  // 🏅 업적 진행도 상태 (Mock 초기값)
  const [achProgress, setAchProgress] = useState<Record<string, number>>({});
  const [selectedAch, setSelectedAch] = useState<typeof ACHIEVEMENTS[0] | null>(null);
  const [achModalVisible, setAchModalVisible] = useState(false);

  // 🗳️ 투표 시스템 상태 (New)
  const [votingData, setVotingData] = useState<any[]>([]);

  useEffect(() => {
    const fetchValidationData = async () => {
      try {
        // Firestore의 'validationQueue' 컬렉션에서 대기 중인 데이터 호출
        const querySnapshot = await getDocs(collection(db, "validationQueue"));
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setVotingData(data);
      } catch(e) { console.log("DB 호출 에러 (테스트 모드 유지)", e); }
    };
    fetchValidationData();
  }, []);

  // 🗳️ 스와이프 애니메이션 로직 (New)
  const SCREEN_WIDTH = Dimensions.get('window').width;
  const swipePosition = useRef(new Animated.ValueXY()).current;
  
  const handleSwipeComplete = async (isCorrect: boolean) => {
    const currentItem = votingData[0];
    if(currentItem) {
      try {
        // Firebase에 투표 결과 업데이트 (맞음: approve +1, 틀림: reject +1)
        const docRef = doc(db, "validationQueue", currentItem.id);
        await updateDoc(docRef, { [isCorrect ? 'approveCount' : 'rejectCount']: increment(1) });
        
        // 유저 경험치 +10P 지급
        const currentExp = parseInt(await AsyncStorage.getItem('cookdex_user_exp') || '0');
        await AsyncStorage.setItem('cookdex_user_exp', (currentExp + 10).toString());
        Alert.alert("투표 완료!", "+10 EXP 획득 🐣");
      } catch(e) { console.log("투표 업데이트 에러", e); }
      
      // 화면에서 현재 카드 제거 (다음 카드로 갱신)
      setVotingData(prev => prev.slice(1)); 
    }
    swipePosition.setValue({ x: 0, y: 0 }); // 위치 초기화
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        swipePosition.setValue({ x: gestureState.dx, y: gestureState.dy });
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > 120) {
          // 우측 스와이프 (O 맞음)
          Animated.spring(swipePosition, { toValue: { x: SCREEN_WIDTH + 100, y: gestureState.dy }, useNativeDriver: false }).start(() => handleSwipeComplete(true));
        } else if (gestureState.dx < -120) {
          // 좌측 스와이프 (X 아님)
          Animated.spring(swipePosition, { toValue: { x: -SCREEN_WIDTH - 100, y: gestureState.dy }, useNativeDriver: false }).start(() => handleSwipeComplete(false));
        } else {
          // 제자리 복귀
          Animated.spring(swipePosition, { toValue: { x: 0, y: 0 }, friction: 4, useNativeDriver: false }).start();
        }
      }
    })
  ).current;

  const rotate = swipePosition.x.interpolate({ inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2], outputRange: ['-10deg', '0deg', '10deg'], extrapolate: 'clamp' });

  useFocusEffect(
    useCallback(() => {
      const loadQuestData = async () => {
        try {
          const expRaw = await AsyncStorage.getItem('cookdex_user_exp');
          const currentExp = expRaw ? parseInt(expRaw) : 0;
          setUserExp(currentExp);

          const buffData = await AsyncStorage.getItem('cookdex_exp_buff_date');
          if (buffData === new Date().toLocaleDateString()) setIsExpBuffActive(true);

          const missionsRaw = await AsyncStorage.getItem('cookdex_daily_missions');
          if (missionsRaw) {
            const parsedMissions = JSON.parse(missionsRaw);
            if (parsedMissions.date === new Date().toLocaleDateString()) {
              setMissions(parsedMissions.data);
            } else {
              setMissions(INITIAL_MISSIONS);
              await AsyncStorage.setItem('cookdex_daily_missions', JSON.stringify({ date: new Date().toLocaleDateString(), data: INITIAL_MISSIONS }));
            }
          } else {
            await AsyncStorage.setItem('cookdex_daily_missions', JSON.stringify({ date: new Date().toLocaleDateString(), data: INITIAL_MISSIONS }));
          }

          // 🏅 업적 진행도 로드 (AsyncStorage Mock)
          const progressMap: Record<string, number> = {};
          for (const ach of ACHIEVEMENTS) {
            const raw = await AsyncStorage.getItem(ach.storageKey);
            progressMap[ach.id] = raw ? parseInt(raw) : 0;
          }
          setAchProgress(progressMap);

          setIsLoading(false);
        } catch (error) {
          setIsLoading(false);
        }
      };
      loadQuestData();
    }, [])
  );

  // 칭호 해금 로직 삭제됨

  const claimMissionReward = async (missionId: string, baseExp: number) => {
    const earnedExp = isExpBuffActive ? baseExp * 2 : baseExp;
    const newExp = userExp + earnedExp;
    setUserExp(newExp);
    await AsyncStorage.setItem('cookdex_user_exp', newExp.toString());

    const updatedMissions = missions.map(m => m.id === missionId ? { ...m, isClaimed: true } : m);
    setMissions(updatedMissions);
    await AsyncStorage.setItem('cookdex_daily_missions', JSON.stringify({ date: new Date().toLocaleDateString(), data: updatedMissions }));

    Alert.alert("미션 달성", `${earnedExp} EXP를 획득했습니다. ${isExpBuffActive ? '(버프 2배 적용)' : ''}`);
  };

  const playBuffAd = () => {
    setMockAdPlaying(true);
    let timeLeft = 3;
    setAdCountdown(timeLeft);
    const timer = setInterval(async () => {
      timeLeft -= 1;
      setAdCountdown(timeLeft);
      if (timeLeft <= 0) {
        clearInterval(timer);
        setMockAdPlaying(false);
        setIsExpBuffActive(true);
        await AsyncStorage.setItem('cookdex_exp_buff_date', new Date().toLocaleDateString());
        Alert.alert("버프 발동! 🔥", "오늘 하루 모든 요리 활동의 경험치가 2배로 증가합니다!");
      }
    }, 1000);
  };

  // 칭호 장착 로직 삭제됨

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/(tabs)')} style={styles.backBtn}>
          <Text style={styles.backBtnText}>뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>도파민 퀘스트</Text>
        <View style={{width: 60}} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* 🏅 업적 보드 */}
        <View style={styles.achSection}>
          <Text style={styles.sectionTitle}>🏅 업적 / 히든 도전</Text>
          <Text style={styles.sectionSub}>조건을 달성하면 특별 보상을 획득합니다!</Text>
          <View style={styles.achGrid}>
            {ACHIEVEMENTS.map(ach => {
              const progress = achProgress[ach.id] ?? 0;
              const isUnlocked = progress >= ach.maxProgress;
              return (
                <TouchableOpacity
                  key={ach.id}
                  style={[styles.achBadge, isUnlocked ? styles.achBadgeUnlocked : styles.achBadgeLocked]}
                  activeOpacity={0.8}
                  onPress={() => { setSelectedAch(ach); setAchModalVisible(true); }}
                >
                  <View style={styles.achIconWrap}>
                    <Text style={[styles.achIcon, !isUnlocked && { opacity: 0.4 }]}>{ach.icon}</Text>
                    {!isUnlocked && <Text style={styles.achLockOverlay}>🔒</Text>}
                  </View>
                  <Text style={[styles.achName, !isUnlocked && { opacity: 0.4, color: Colors.textSub }]} numberOfLines={2}>{ach.name}</Text>
                  <View style={styles.achProgressBarBg}>
                    <View style={[styles.achProgressBarFill, { width: `${Math.min(100, (progress / ach.maxProgress) * 100)}%`, opacity: isUnlocked ? 1 : 0.5 }]} />
                  </View>
                  <Text style={[styles.achProgressText, !isUnlocked && { opacity: 0.4 }]}>{Math.min(progress, ach.maxProgress)} / {ach.maxProgress}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 행운의 룰렛 메가 버튼 */}
        <TouchableOpacity 
          style={styles.rouletteMegaBtn} 
          activeOpacity={0.8}
          onPress={() => {
            // TODO: 실제 룰렛 모달 띄우기 로직 연결 (기존 index.tsx에 있던 로직 이식 예정)
            Alert.alert("행운의 룰렛 🎰", "룰렛 시스템 준비 중입니다!");
          }}
        >
          <View style={styles.rouletteTextLayout}>
            <Text style={styles.rouletteMegaTitle}>오늘의 행운 룰렛 돌리기</Text>
            <Text style={styles.rouletteMegaSub}>매일 1회 무료! EXP와 특별 보상을 노려보세요</Text>
          </View>
          <View style={styles.rouletteGoBtn}>
            <Text style={styles.rouletteGoText}>GO</Text>
          </View>
        </TouchableOpacity>

        {!isExpBuffActive && (
          <TouchableOpacity style={styles.buffAdBtn} onPress={playBuffAd}>
            <Text style={styles.buffAdTitle}>30초 스폰서 광고 시청하기</Text>
            <Text style={styles.buffAdSub}>오늘 하루 모든 미션/요리 경험치 2배 (x2) 획득!</Text>
          </TouchableOpacity>
        )}

        <View style={styles.settingSection}>
          <Text style={styles.sectionTitle}>📋 오늘의 셰프 미션</Text>
          <Text style={styles.sectionSub}>매일 자정에 초기화됩니다. 달성하고 보상을 챙기세요!</Text>
          {missions.map(mission => (
            <View key={mission.id} style={styles.missionRow}>
              <View style={{flex: 1}}>
                <Text style={[styles.missionText, mission.isClaimed && {color: '#8C7A76', textDecorationLine: 'line-through'}]}>{mission.text}</Text>
                <Text style={styles.missionExp}>보상: {mission.exp} EXP {isExpBuffActive && '(버프 +'+mission.exp+')'}</Text>
              </View>
              {mission.isClaimed ? (
                <View style={styles.missionBtnDone}><Text style={styles.missionBtnDoneText}>완료됨</Text></View>
              ) : mission.isCompleted ? (
                <TouchableOpacity style={styles.missionBtnClaim} onPress={() => claimMissionReward(mission.id, mission.exp)}>
                  <Text style={styles.missionBtnClaimText}>보상 받기</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.missionBtnLock}><Text style={styles.missionBtnLockText}>진행 중</Text></View>
              )}
            </View>
          ))}
        </View>

        {/* 스와이프 데이터 검증 */}
        <View style={styles.voteSection}>
          <Text style={styles.voteSectionTitle}>식재료 검증하고 EXP 받기!</Text>

          {votingData.length > 0 ? (
            <Animated.View
              {...panResponder.panHandlers}
              style={[
                styles.voteCard,
                {
                  transform: [
                    { translateX: swipePosition.x },
                    { translateY: swipePosition.y },
                    { rotate },
                  ],
                },
              ]}
            >
              <Text style={styles.voteQuestion}>
                이 항목이 &apos;{votingData[0].proposedName}&apos;입니까?
              </Text>
              <Text style={styles.voteHint}>카드를 좌우로 스와이프하거나 아래 버튼을 눌러 주세요.</Text>
            </Animated.View>
          ) : (
            <View style={styles.voteEmptyBox}>
              <Text style={styles.voteEmptyEmoji}>🧺</Text>
              <Text style={styles.voteEmptyText}>현재 검증 대기 중인 데이터가 없습니다.</Text>
              <Text style={styles.voteEmptySub}>잠시 후 새로운 검증 요청이 도착할 거예요.</Text>
            </View>
          )}

          {votingData.length > 0 && (
            <View style={styles.voteActionsRow}>
              <TouchableOpacity
                style={styles.voteBtnNo}
                onPress={() => handleSwipeComplete(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.voteBtnNoText}>X 아니에요</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.voteBtnYes}
                onPress={() => handleSwipeComplete(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.voteBtnYesText}>O 맞아요</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

      </ScrollView>

      {/* 🏅 업적 상세 바텀 시트 모달 */}
      <Modal visible={achModalVisible} transparent animationType="slide" onRequestClose={() => setAchModalVisible(false)}>
        <TouchableOpacity style={styles.achModalOverlay} activeOpacity={1} onPress={() => setAchModalVisible(false)}>
          <View style={styles.achModalSheet}>
            {selectedAch && (
              <>
                <Text style={styles.achModalIcon}>{selectedAch.icon}</Text>
                <Text style={styles.achModalName}>{selectedAch.name}</Text>
                <View style={styles.achModalDivider} />
                <Text style={styles.achModalLabel}>달성 조건</Text>
                <Text style={styles.achModalValue}>{selectedAch.condition}</Text>
                <View style={{ height: 12 }} />
                <Text style={styles.achModalLabel}>달성 보상</Text>
                <Text style={styles.achModalValue}>{selectedAch.reward}</Text>
                <View style={{ height: 20 }} />
                <View style={styles.achProgressBarBg}>
                  <View style={[styles.achProgressBarFill, { width: `${Math.min(100, ((achProgress[selectedAch.id] ?? 0) / selectedAch.maxProgress) * 100)}%` }]} />
                </View>
                <Text style={[styles.achProgressText, { textAlign: 'center', marginTop: 6 }]}>{achProgress[selectedAch.id] ?? 0} / {selectedAch.maxProgress} 진행 중</Text>
              </>
            )}
            <TouchableOpacity style={styles.achModalCloseBtn} onPress={() => setAchModalVisible(false)}>
              <Text style={styles.achModalCloseBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 기존 Mock 광고 모달 */}
      <Modal visible={mockAdPlaying} transparent={false} animationType="slide">
        <View style={styles.mockAdContainer}>
          <Text style={styles.mockAdTitle}>스폰서 광고 재생 중...</Text>
          <Text style={styles.mockAdTimer}>{adCountdown}초 후 버프가 발동됩니다</Text>
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 30 }} />
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgMain },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 32 : 16, paddingBottom: 12, backgroundColor: Colors.bgMain },
  backBtn: { backgroundColor: Colors.bgElevated, paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  backBtnText: { color: Colors.textSub, fontSize: 13, fontWeight: '600' },
  pageTitle: { fontSize: 20, fontWeight: '900', color: Colors.textMain },
  scrollContent: { padding: 20, paddingBottom: 100 },

  // 업적 보드
  achSection: { backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: Colors.border, ...Shadows.soft },
  achGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  achBadge: { width: '29%', minHeight: 120, borderRadius: Radius.lg, padding: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  achBadgeUnlocked: { backgroundColor: Colors.primarySoft, borderColor: Colors.primary, ...Shadows.glow },
  achBadgeLocked: { backgroundColor: Colors.bgMuted, borderColor: Colors.border },
  achIconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  achIcon: { fontSize: 32 },
  achLockOverlay: { position: 'absolute', bottom: -4, right: -6, fontSize: 14, opacity: 0.6 },
  achName: { fontSize: 11, fontWeight: '700', color: Colors.textMain, textAlign: 'center', marginBottom: 8, lineHeight: 15 },
  achProgressBarBg: { width: '100%', height: 4, backgroundColor: Colors.bgMain, borderRadius: 2, overflow: 'hidden' },
  achProgressBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
  achProgressText: { fontSize: 10, color: Colors.textSub, marginTop: 4, fontWeight: '600' },

  // 업적 바텀 시트 모달
  achModalOverlay: { flex: 1, backgroundColor: Colors.overlayDark, justifyContent: 'flex-end' },
  achModalSheet: { backgroundColor: Colors.bgModal, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: 28, paddingBottom: 48, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  achModalIcon: { fontSize: 48, marginBottom: 10 },
  achModalName: { fontSize: 20, fontWeight: '900', color: Colors.textMain, textAlign: 'center', marginBottom: 16 },
  achModalDivider: { width: '100%', height: 1, backgroundColor: Colors.border, marginBottom: 16 },
  achModalLabel: { fontSize: 12, fontWeight: '800', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, alignSelf: 'flex-start' },
  achModalValue: { fontSize: 14, color: Colors.textMain, lineHeight: 20, alignSelf: 'flex-start' },
  achModalCloseBtn: { marginTop: 20, backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: 40, borderRadius: Radius.pill },
  achModalCloseBtnText: { color: Colors.textInverse, fontWeight: '900', fontSize: 15 },

  profileCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.xl,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  equippedTitleBadge: {
    backgroundColor: Colors.primarySoft,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textMain,
    marginBottom: 12,
  },
  changeTitleBtn: {
    backgroundColor: Colors.bgMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  changeTitleBtnText: {
    color: Colors.textMain,
    fontSize: 12,
    fontWeight: '600',
  },
  levelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  levelTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textMain,
  },
  levelBuffText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '700',
  } as any,
  expText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSub,
  },
  progressBarBg: {
    width: '100%',
    height: 10,
    backgroundColor: Colors.bgMuted,
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 6,
  },

  buffAdBtn: {
    backgroundColor: Colors.primarySoft,
    padding: 18,
    borderRadius: Radius.lg,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buffAdTitle: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  buffAdSub: {
    color: Colors.textSub,
    fontSize: 12,
  },

  settingSection: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.xl,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.textMain,
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 12,
    color: Colors.textSub,
    marginBottom: 14,
  },
  missionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bgMuted,
    padding: 14,
    borderRadius: Radius.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  missionText: {
    color: Colors.textMain,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  missionExp: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  missionBtnClaim: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  missionBtnClaimText: {
    color: Colors.textInverse,
    fontWeight: '800',
    fontSize: 12,
  },
  missionBtnLock: {
    backgroundColor: Colors.bgElevated,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  missionBtnLockText: {
    color: Colors.textSub,
    fontWeight: '700',
    fontSize: 12,
  },
  missionBtnDone: {
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  missionBtnDoneText: {
    color: Colors.textSub,
    fontWeight: '700',
    fontSize: 12,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.bgModal,
    borderRadius: Radius.xl,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    width: '100%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.textMain,
    marginBottom: 6,
  },
  modalSub: {
    fontSize: 13,
    color: Colors.textSub,
    marginBottom: 18,
  },
  titleOption: {
    width: '100%',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    borderRadius: Radius.md,
    marginBottom: 6,
  },
  titleOptionText: {
    color: Colors.textMain,
    fontSize: 15,
    textAlign: 'center',
  },
  closeModalBtn: {
    marginTop: 18,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: Radius.lg,
  },
  closeModalBtnText: {
    color: Colors.textInverse,
    fontWeight: '800',
  },
  mockAdContainer: {
    flex: 1,
    backgroundColor: Colors.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mockAdTitle: {
    color: Colors.textMain,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 16,
  },
  mockAdTimer: {
    color: Colors.primary,
    fontSize: 32,
    fontWeight: '900',
  },

  rouletteMegaBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    padding: 18,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Shadows.glow,
  },
  rouletteTextLayout: {
    flex: 1,
    paddingRight: 10,
  },
  rouletteMegaTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.textInverse,
    marginBottom: 4,
  },
  rouletteMegaSub: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textInverse,
  },
  rouletteGoBtn: {
    backgroundColor: Colors.bgElevated,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rouletteGoText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '900',
  },

  // 스와이프 투표
  voteSection: {
    marginTop: 26,
    backgroundColor: Colors.bgElevated,
    padding: 20,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    ...Shadows.soft,
  },
  voteSectionTitle: {
    color: Colors.textMain,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 16,
  },
  voteCard: {
    backgroundColor: Colors.bgElevated,
    padding: 24,
    borderRadius: Radius.xl,
    width: '100%',
    alignItems: 'center',
    ...Shadows.glassDiffused,
  },
  voteQuestion: {
    color: Colors.textMain,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  voteHint: {
    marginTop: 12,
    fontSize: 12,
    color: Colors.textSub,
    textAlign: 'center',
  },
  voteEmptyBox: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  voteEmptyEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  voteEmptyText: {
    color: Colors.textMain,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  voteEmptySub: {
    color: Colors.textSub,
    fontSize: 12,
    textAlign: 'center',
  },
  voteActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    width: '100%',
  },
  voteBtnNo: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
    backgroundColor: Colors.bgMuted,
    alignItems: 'center',
  },
  voteBtnNoText: {
    color: Colors.textSub,
    fontSize: 13,
    fontWeight: '700',
  },
  voteBtnYes: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primary,
    marginLeft: 8,
    alignItems: 'center',
  },
  voteBtnYesText: {
    color: Colors.textInverse,
    fontSize: 13,
    fontWeight: '800',
  },
});