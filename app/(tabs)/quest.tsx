import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const INITIAL_MISSIONS = [
  { id: 'm1', text: '오늘의 주방 입장 (출석)', exp: 10, isCompleted: true, isClaimed: false },
  { id: 'm2', text: 'AI 레시피 1회 생성하기', exp: 20, isCompleted: false, isClaimed: false },
  { id: 'm3', text: '식재료 AI 스캔 1회 하기', exp: 30, isCompleted: false, isClaimed: false },
];

const calculateLevel = (exp) => {
  if (exp < 50) return { level: 1, title: "🍳 요리 쪼렙", nextExp: 50 };
  if (exp < 150) return { level: 2, title: "🔪 견습 요리사", nextExp: 150 };
  if (exp < 500) return { level: 3, title: "👨‍🍳 수석 셰프", nextExp: 500 };
  return { level: 'MAX', title: "👑 마스터 셰프", nextExp: exp };
};

export default function QuestScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  // 🎮 게이미피케이션 상태
  const [userExp, setUserExp] = useState(0);
  const [missions, setMissions] = useState(INITIAL_MISSIONS);
  const [equippedTitle, setEquippedTitle] = useState("🍳 요리 쪼렙");
  const [unlockedTitles, setUnlockedTitles] = useState(["🍳 요리 쪼렙"]);
  
  const [titleModalVisible, setTitleModalVisible] = useState(false);
  const [isExpBuffActive, setIsExpBuffActive] = useState(false);
  const [mockAdPlaying, setMockAdPlaying] = useState(false);
  const [adCountdown, setAdCountdown] = useState(3);

  useFocusEffect(
    useCallback(() => {
      const loadQuestData = async () => {
        try {
          const expRaw = await AsyncStorage.getItem('cookdex_user_exp');
          const currentExp = expRaw ? parseInt(expRaw) : 0;
          setUserExp(currentExp);

          const savedTitle = await AsyncStorage.getItem('cookdex_equipped_title');
          if (savedTitle) setEquippedTitle(savedTitle);

          const savedUnlocked = await AsyncStorage.getItem('cookdex_unlocked_titles');
          if (savedUnlocked) setUnlockedTitles(JSON.parse(savedUnlocked));

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

          setIsLoading(false);
        } catch (error) {
          setIsLoading(false);
        }
      };
      loadQuestData();
    }, [])
  );

  const checkAndUnlockTitles = async (newTitle, currentUnlocked) => {
    if (!currentUnlocked.includes(newTitle)) {
      const updatedTitles = [...currentUnlocked, newTitle];
      setUnlockedTitles(updatedTitles);
      await AsyncStorage.setItem('cookdex_unlocked_titles', JSON.stringify(updatedTitles));
      Alert.alert("🎉 새로운 칭호 획득!", `[${newTitle}] 칭호가 해금되었습니다! 장착해보세요.`);
    }
  };

  const claimMissionReward = async (missionId, baseExp) => {
    const earnedExp = isExpBuffActive ? baseExp * 2 : baseExp;
    const newExp = userExp + earnedExp;
    setUserExp(newExp);
    await AsyncStorage.setItem('cookdex_user_exp', newExp.toString());

    const updatedMissions = missions.map(m => m.id === missionId ? { ...m, isClaimed: true } : m);
    setMissions(updatedMissions);
    await AsyncStorage.setItem('cookdex_daily_missions', JSON.stringify({ date: new Date().toLocaleDateString(), data: updatedMissions }));

    const levelInfo = calculateLevel(newExp);
    checkAndUnlockTitles(levelInfo.title, unlockedTitles);
    Alert.alert("미션 달성! 🎁", `${earnedExp} EXP를 획득했습니다! ${isExpBuffActive ? '(버프 2배 적용)' : ''}`);
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

  const handleEquipTitle = async (title) => {
    setEquippedTitle(title);
    setTitleModalVisible(false);
    await AsyncStorage.setItem('cookdex_equipped_title', title);
  };

  if (isLoading) return <View style={[styles.container, {justifyContent: 'center'}]}><ActivityIndicator size="large" color="#FF8C00" /></View>;

  const currentLevelInfo = calculateLevel(userExp);
  const expProgress = currentLevelInfo.level === 'MAX' ? 100 : (userExp / currentLevelInfo.nextExp) * 100;

  return (
    <SafeAreaView style={styles.container}>
      {/* 🔙 헤더 (홈에서 퀵메뉴로 들어왔을 때를 위한 뒤로가기) */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/(tabs)')} style={styles.backBtn}>
          <Text style={styles.backBtnText}>◀ 홈으로</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>도파민 퀘스트 📜</Text>
        <View style={{width: 60}} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* 🎮 레벨 및 칭호 카드 */}
        <View style={styles.profileCard}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
            <View>
              <Text style={styles.equippedTitleBadge}>{equippedTitle}</Text>
              <Text style={styles.userName}>나의 요리 등급</Text>
            </View>
            <TouchableOpacity style={styles.changeTitleBtn} onPress={() => setTitleModalVisible(true)}>
              <Text style={styles.changeTitleBtnText}>칭호 변경 🏅</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.levelHeader}>
            <Text style={styles.levelTitle}>Lv.{currentLevelInfo.level} {isExpBuffActive && <Text style={{color: '#E53935'}}>(🔥EXP 2배 버프 중)</Text>}</Text>
            <Text style={styles.expText}>{userExp} / {currentLevelInfo.level === 'MAX' ? 'MAX' : currentLevelInfo.nextExp} EXP</Text>
          </View>
          <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${expProgress}%` }]} /></View>
        </View>

        {/* 🎰 행운의 룰렛 메가 버튼 (도파민 폭발) */}
        <TouchableOpacity 
          style={styles.rouletteMegaBtn} 
          activeOpacity={0.8}
          onPress={() => {
            // TODO: 실제 룰렛 모달 띄우기 로직 연결 (기존 index.tsx에 있던 로직 이식 예정)
            Alert.alert("행운의 룰렛 🎰", "룰렛 시스템 준비 중입니다!");
          }}
        >
          <View style={styles.rouletteTextLayout}>
            <Text style={styles.rouletteMegaTitle}>오늘의 행운 룰렛 돌리기 🎰</Text>
            <Text style={styles.rouletteMegaSub}>매일 1회 무료! EXP와 특별 보상을 노려보세요</Text>
          </View>
          <View style={styles.rouletteGoBtn}>
            <Text style={styles.rouletteGoText}>GO</Text>
          </View>
        </TouchableOpacity>

        {/* 📺 광고 버프 발동 버튼 */}
        {!isExpBuffActive && (
          <TouchableOpacity style={styles.buffAdBtn} onPress={playBuffAd}>
            <Text style={styles.buffAdTitle}>📺 30초 스폰서 광고 시청하기</Text>
            <Text style={styles.buffAdSub}>오늘 하루 모든 미션/요리 경험치 2배 (x2) 획득!</Text>
          </TouchableOpacity>
        )}

        {/* 📜 일일 미션 시스템 */}
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

      </ScrollView>

      {/* 🏅 칭호 변경 모달 */}
      <Modal visible={titleModalVisible} transparent={true} animationType="slide" onRequestClose={() => setTitleModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>내 칭호 장착함 🏅</Text>
            <Text style={styles.modalSub}>해금된 칭호를 선택하여 뽐내보세요!</Text>
            <ScrollView style={{width: '100%', maxHeight: 300}}>
              {unlockedTitles.map(title => (
                <TouchableOpacity key={title} style={[styles.titleOption, equippedTitle === title && {borderColor: '#FF8C00', backgroundColor: '#4A3F3A'}]} onPress={() => handleEquipTitle(title)}>
                  <Text style={[styles.titleOptionText, equippedTitle === title && {color: '#FF8C00', fontWeight: 'bold'}]}>{title} {equippedTitle === title && "✓"}</Text>
                </TouchableOpacity>
              ))}
              <View style={[styles.titleOption, {opacity: 0.5}]}><Text style={styles.titleOptionText}>??? (비밀 조건 달성 시 해금) 🔒</Text></View>
            </ScrollView>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setTitleModalVisible(false)}><Text style={styles.closeModalBtnText}>닫기</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 📺 가상 광고 모달 */}
      <Modal visible={mockAdPlaying} transparent={false} animationType="slide">
        <View style={styles.mockAdContainer}>
          <Text style={styles.mockAdTitle}>📺 스폰서 광고 재생 중...</Text>
          <Text style={styles.mockAdTimer}>{adCountdown}초 후 버프가 발동됩니다</Text>
          <ActivityIndicator size="large" color="#FF8C00" style={{marginTop: 30}} />
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2A2421' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 40 : 20, paddingBottom: 15, backgroundColor: '#2A2421' },
  backBtn: { backgroundColor: '#4A3F3A', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 },
  backBtnText: { color: '#E8D5D0', fontSize: 13, fontWeight: 'bold' },
  pageTitle: { fontSize: 20, fontWeight: '900', color: '#FFFDF9' },
  scrollContent: { padding: 20, paddingBottom: 100 },
  
  profileCard: { backgroundColor: '#3A322F', borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#4A3F3A' },
  equippedTitleBadge: { backgroundColor: '#FF8C00', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginBottom: 8, fontSize: 12, fontWeight: 'bold', color: '#000' },
  userName: { fontSize: 22, fontWeight: 'bold', color: '#FFFDF9', marginBottom: 15 },
  changeTitleBtn: { backgroundColor: '#4A3F3A', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#5A4E49' },
  changeTitleBtnText: { color: '#FFB347', fontSize: 12, fontWeight: 'bold' },
  levelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  levelTitle: { fontSize: 16, fontWeight: 'bold', color: '#FF8C00' },
  expText: { fontSize: 13, fontWeight: 'bold', color: '#A89F9C' },
  progressBarBg: { width: '100%', height: 12, backgroundColor: '#4A3F3A', borderRadius: 6, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#FF8C00', borderRadius: 6 },

  buffAdBtn: { backgroundColor: '#3F2860', padding: 20, borderRadius: 20, marginBottom: 25, borderWidth: 1, borderColor: '#9C27B0', alignItems: 'center' },
  buffAdTitle: { color: '#E1BEE7', fontSize: 16, fontWeight: '900', marginBottom: 5 },
  buffAdSub: { color: '#CE93D8', fontSize: 12 },

  settingSection: { backgroundColor: '#3A322F', borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#4A3F3A' },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: '#FFFDF9', marginBottom: 5 },
  sectionSub: { fontSize: 12, color: '#A89F9C', marginBottom: 15 },
  missionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#2A2421', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#4A3F3A' },
  missionText: { color: '#FFFDF9', fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  missionExp: { color: '#FFB347', fontSize: 12, fontWeight: 'bold' },
  missionBtnClaim: { backgroundColor: '#4CAF50', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12 },
  missionBtnClaimText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  missionBtnLock: { backgroundColor: '#4A3F3A', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12 },
  missionBtnLockText: { color: '#A89F9C', fontWeight: 'bold', fontSize: 13 },
  missionBtnDone: { backgroundColor: 'transparent', paddingHorizontal: 15, paddingVertical: 10 },
  missionBtnDoneText: { color: '#8C7A76', fontWeight: 'bold', fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#2A2421', borderRadius: 24, padding: 25, borderWidth: 1, borderColor: '#FF8C00', width: '100%', alignItems: 'center' },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#FF8C00', marginBottom: 10 },
  modalSub: { fontSize: 14, color: '#FFFDF9', marginBottom: 20 },
  titleOption: { width: '100%', padding: 15, borderBottomWidth: 1, borderBottomColor: '#4A3F3A', borderRadius: 10, marginBottom: 5 },
  titleOptionText: { color: '#FFFDF9', fontSize: 16, textAlign: 'center' },
  closeModalBtn: { marginTop: 20, backgroundColor: '#4A3F3A', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 15 },
  closeModalBtnText: { color: '#FFFDF9', fontWeight: 'bold' },
  mockAdContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  mockAdTitle: { color: '#FFFDF9', fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  mockAdTimer: { color: '#FF8C00', fontSize: 40, fontWeight: '900' },

  rouletteMegaBtn: { backgroundColor: '#FF8C00', borderRadius: 20, padding: 20, marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#FF8C00', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  rouletteTextLayout: { flex: 1, paddingRight: 10 },
  rouletteMegaTitle: { fontSize: 18, fontWeight: '900', color: '#000', marginBottom: 5 },
  rouletteMegaSub: { fontSize: 12, fontWeight: 'bold', color: '#3A322F' },
  rouletteGoBtn: { backgroundColor: '#000', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  rouletteGoText: { color: '#FF8C00', fontSize: 16, fontWeight: '900' },
});