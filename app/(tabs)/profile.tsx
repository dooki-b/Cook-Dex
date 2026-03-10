// ---------------- 아래부터 전체 코드 ----------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';
import { Colors, Radius } from '../../constants/design-tokens';

const DIET_GOALS = ["다이어트(저칼로리)", "벌크업(고단백)", "비건(채식)", "저탄고지", "당뇨/혈당관리"];
const COMMON_ALLERGIES = ["갑각류", "견과류", "우유/유제품", "계란", "밀가루", "복숭아"];
const BASIC_CONDIMENTS = ["소금", "설탕", "간장", "고추장", "된장", "후추", "참기름", "식용유", "다진마늘", "고춧가루"];

const calculateLevel = (exp) => {
  if (exp < 50) return { level: 1, title: "🍳 요리 쪼렙", nextExp: 50 };
  if (exp < 150) return { level: 2, title: "🔪 견습 요리사", nextExp: 150 };
  if (exp < 500) return { level: 3, title: "👨‍🍳 수석 셰프", nextExp: 500 };
  return { level: 'MAX', title: "👑 마스터 셰프", nextExp: exp };
};

export default function ProfileScreen() {
  const router = useRouter();
  const [isInitializing, setIsInitializing] = useState(true);
  const [user, setUser] = useState(() => auth.currentUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoginLoading, setIsLoginLoading] = useState(false);

  // 프로필 세팅 상태
  const [userExp, setUserExp] = useState(0);
  const [selectedDiet, setSelectedDiet] = useState([]);
  const [customDiet, setCustomDiet] = useState("");
  const [selectedAllergies, setSelectedAllergies] = useState([]);
  const [customAllergy, setCustomAllergy] = useState("");
  const [selectedCondiments, setSelectedCondiments] = useState([]);
  const [customCondiment, setCustomCondiment] = useState("");

  // 🎮 게이미피케이션 상태
  const [equippedTitle, setEquippedTitle] = useState("요리 초급");
  const [unlockedTitles, setUnlockedTitles] = useState(["요리 초급"]);
  const [titleModalVisible, setTitleModalVisible] = useState(false);
  const [isExpBuffActive, setIsExpBuffActive] = useState(false);
  const [mockAdPlaying, setMockAdPlaying] = useState(false);
  const [adCountdown, setAdCountdown] = useState(3);

  // ⚙️ 설정 상태 (New)
  const [isVoiceControlEnabled, setIsVoiceControlEnabled] = useState(false);
  const [isWakeLockEnabled, setIsWakeLockEnabled] = useState(false);

  // 구독 모델 상태
  const [plusModalVisible, setPlusModalVisible] = useState(false);

  // 설정 탭 리스트 → 서브뷰 (null: 메인 리스트, 'condiments'|'diet'|'allergies': 해당 설정 화면)
  const [settingsSubView, setSettingsSubView] = useState<'condiments' | 'diet' | 'allergies' | null>(null);
  // 개인 정보 관리 모달 (칭호 장착함은 이 모달 안에서 진입)
  const [profileInfoModalVisible, setProfileInfoModalVisible] = useState(false);

  const toggleVoice = async () => {
    const newValue = !isVoiceControlEnabled;
    setIsVoiceControlEnabled(newValue);
    await AsyncStorage.setItem('cookdex_setting_voice', newValue ? 'true' : 'false');
  };
  const toggleWakeLock = async () => {
    const newValue = !isWakeLockEnabled;
    setIsWakeLockEnabled(newValue);
    await AsyncStorage.setItem('cookdex_setting_wakelock', newValue ? 'true' : 'false');
  };

  // 🏅 티어 계산 함수 (New)
  const getTier = (exp) => {
    if (exp < 100) return "요리 입문";
    if (exp < 500) return "동네 요리왕";
    if (exp < 1000) return "수석 셰프";
    return "미슐랭 마스터";
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (isInitializing) setIsInitializing(false);
    });
    return unsubscribe;
  }, [isInitializing]);

  const checkAndUnlockTitles = useCallback(async (newTitle, currentUnlocked) => {
    if (Array.isArray(currentUnlocked) && !currentUnlocked.includes(newTitle)) {
      const updatedTitles = [...currentUnlocked, newTitle];
      setUnlockedTitles(updatedTitles);
      await AsyncStorage.setItem('cookdex_unlocked_titles', JSON.stringify(updatedTitles));
      Alert.alert("새로운 칭호 획득", `[${newTitle}] 칭호가 해금되었습니다. 장착해보세요.`);
    }
  }, []);

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

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      const loadProfileData = async () => {
        try {
          // 기본 세팅 로드
          const expRaw = await AsyncStorage.getItem('cookdex_user_exp');
          const currentExp = expRaw ? parseInt(expRaw) : 0;
          setUserExp(currentExp);

          const savedDiet = await AsyncStorage.getItem('cookdex_diet_goal');
          if (savedDiet && savedDiet !== "없음") setSelectedDiet(JSON.parse(savedDiet));

          const savedAllergies = await AsyncStorage.getItem('cookdex_allergies');
          if (savedAllergies && savedAllergies !== "없음") setSelectedAllergies(savedAllergies.split(', '));

          const savedCondiments = await AsyncStorage.getItem('cookdex_condiments');
          if (savedCondiments) setSelectedCondiments(JSON.parse(savedCondiments));

          // 🎮 게임 데이터 로드
          const savedTitle = await AsyncStorage.getItem('cookdex_equipped_title');
          if (savedTitle) setEquippedTitle(savedTitle);

          const savedUnlocked = await AsyncStorage.getItem('cookdex_unlocked_titles');
          if (savedUnlocked) setUnlockedTitles(JSON.parse(savedUnlocked));

          const buffData = await AsyncStorage.getItem('cookdex_exp_buff_date');
          if (buffData === new Date().toLocaleDateString()) setIsExpBuffActive(true);

          // 레벨업 칭호 체크
          const levelInfo = calculateLevel(currentExp);
          checkAndUnlockTitles(levelInfo.title, savedUnlocked ? JSON.parse(savedUnlocked) : ["🍳 요리 쪼렙"]);

          // ⚙️ 설정값 로드
          const voice = await AsyncStorage.getItem('cookdex_setting_voice');
          const wakelock = await AsyncStorage.getItem('cookdex_setting_wakelock');
          if (voice === 'true') setIsVoiceControlEnabled(true);
          if (wakelock === 'true') setIsWakeLockEnabled(true);
        } catch (error) {}
      };
      loadProfileData();
    }, [user])
  );

  // Android OS 뒤로가기: 서브뷰(양념장/식단/알레르기) 열려 있으면 설정 메인으로만 복귀
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBack = () => {
      if (settingsSubView !== null) {
        setSettingsSubView(null);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [settingsSubView]);

  // Auth 함수들
  const handleLogin = async () => { if (!email || !password) return; setIsLoginLoading(true); try { await signInWithEmailAndPassword(auth, email, password); } catch (e) { Alert.alert("로그인 실패", "확인해주세요."); } finally { setIsLoginLoading(false); } };
  const handleSignUp = async () => { if (!email || !password) return; setIsLoginLoading(true); try { await createUserWithEmailAndPassword(auth, email, password); } catch (e) { Alert.alert("실패", e.message); } finally { setIsLoginLoading(false); } };
  const handleLogout = async () => { try { await signOut(auth); setEmail(""); setPassword(""); } catch (e) {} };
  const handleSocialMock = (provider) => Alert.alert("준비 중", `${provider} 로그인은 앱스토어 심사 시점에 연동됩니다.`);

  // 설정 함수들
  const toggleDiet = (diet) => { setSelectedDiet(prev => prev.includes(diet) ? prev.filter(d => d !== diet) : [...prev, diet]); };
  const applyCustomDiet = () => { const diet = customDiet.trim(); if (diet && !selectedDiet.includes(diet)) setSelectedDiet(prev => [...prev, diet]); setCustomDiet(""); };
  const toggleAllergy = (allergy) => { setSelectedAllergies(prev => prev.includes(allergy) ? prev.filter(a => a !== allergy) : [...prev, allergy]); };
  const addCustomAllergy = () => { const newA = customAllergy.trim(); if (newA && !selectedAllergies.includes(newA)) setSelectedAllergies(prev => [...prev, newA]); setCustomAllergy(""); };
  const toggleCondiment = (item) => { setSelectedCondiments(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]); };
  const addCustomCondiment = () => { const newC = customCondiment.trim(); if (newC && !selectedCondiments.includes(newC)) setSelectedCondiments(prev => [...prev, newC]); setCustomCondiment(""); };

  const saveProfileSettings = async () => {
    try {
      await AsyncStorage.setItem('cookdex_diet_goal', JSON.stringify(selectedDiet));
      const allergyStr = selectedAllergies.length > 0 ? selectedAllergies.join(', ') : "없음";
      await AsyncStorage.setItem('cookdex_allergies', allergyStr);
      await AsyncStorage.setItem('cookdex_condiments', JSON.stringify(selectedCondiments));
      Alert.alert("저장 완료", "맞춤 설정이 AI 셰프에게 전달되었습니다.");
    } catch (error) {}
  };

  if (isInitializing) return <View style={[styles.container, {justifyContent: 'center'}]}><ActivityIndicator size="large" color="#FF8C00" /></View>;

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.authContainer}>
          <Text style={styles.authTitle}>Cookdex</Text>
          <Text style={styles.authSubTitle}>나만의 AI 셰프 유니버스에 접속하세요</Text>
          <View style={styles.authInputBox}>
            <TextInput style={styles.authInput} placeholder="이메일 주소" placeholderTextColor="#A89F9C" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <TextInput style={styles.authInput} placeholder="비밀번호 (6자리 이상)" placeholderTextColor="#A89F9C" secureTextEntry value={password} onChangeText={setPassword} />
            {isLoginLoading ? <ActivityIndicator size="large" color="#FF8C00" style={{marginVertical: 15}} /> : (
              <View style={styles.authBtnRow}>
                <TouchableOpacity style={[styles.authBtn, {backgroundColor: '#5A4E49'}]} onPress={handleSignUp}><Text style={styles.authBtnText}>가입</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.authBtn, {backgroundColor: '#FF8C00'}]} onPress={handleLogin}><Text style={styles.authBtnText}>로그인</Text></TouchableOpacity>
              </View>
            )}
          </View>
          <View style={styles.dividerBox}><View style={styles.dividerLine} /><Text style={styles.dividerText}>또는 간편 로그인</Text><View style={styles.dividerLine} /></View>
          <TouchableOpacity style={[styles.socialBtn, {backgroundColor: '#fff'}]} onPress={() => handleSocialMock("Google")}><Text style={[styles.socialBtnText, {color: '#000'}]}>Google로 계속하기</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.socialBtn, {backgroundColor: '#FEE500'}]} onPress={() => handleSocialMock("Kakao")}><Text style={[styles.socialBtnText, {color: '#000'}]}>카카오로 계속하기</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentLevelInfo = calculateLevel(userExp);
  const expProgress = currentLevelInfo.level === 'MAX' ? 100 : (userExp / currentLevelInfo.nextExp) * 100;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView 
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={styles.scrollContent} 
          keyboardShouldPersistTaps="handled"
        >
          
          {/* ——— 설정 메인: 탭 리스트 형식 (레퍼런스) ——— */}
          {settingsSubView === null ? (
            <>
              <View style={styles.pageHeaderRow}>
                <Text style={styles.pageTitle}>설정</Text>
                <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}><Text style={styles.logoutBtnText}>로그아웃</Text></TouchableOpacity>
              </View>

              {/* 개인 정보 행 (레퍼런스: 프로필 사진 + 이름 + 연락처 + 화살표) */}
              <TouchableOpacity activeOpacity={0.9} onPress={() => setProfileInfoModalVisible(true)} style={styles.profileCardCompact}>
                <View style={styles.profileCardCompactLeft}>
                  <View style={styles.avatarWrapper}>
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarText}>{(user?.email?.[0] || '?').toUpperCase()}</Text>
                    </View>
                    <View style={styles.avatarEditBadge}><Text style={styles.avatarEditIcon}>✎</Text></View>
                  </View>
                  <View>
                    <Text style={styles.profileCardName}>{user?.email?.split('@')[0] || '익명'} 셰프</Text>
                    <Text style={styles.profileCardMeta}>{user?.email ?? '연락처 미입력'}</Text>
                  </View>
                </View>
                <Text style={styles.listRowArrow}>›</Text>
              </TouchableOpacity>

              {/* 퀵 카드 3개: 레시피 | 스크랩 | 포인트 (레퍼런스: 포인트/쿠폰/멤버스) */}
              <View style={styles.quickCardsRow}>
                <TouchableOpacity style={styles.quickCard} onPress={() => router.push('/(tabs)/recipes')} activeOpacity={0.8}>
                  <View style={[styles.quickCardIcon, { backgroundColor: Colors.primarySoft }]}><Text style={[styles.quickCardIconText, { color: Colors.primary }]}>R</Text></View>
                  <Text style={styles.quickCardLabel}>레시피</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickCard} onPress={() => router.push('/(tabs)/recipes')} activeOpacity={0.8}>
                  <View style={[styles.quickCardIcon, { backgroundColor: '#FFF3E0' }]}><Text style={[styles.quickCardIconText, { color: '#E65100' }]}>S</Text></View>
                  <Text style={styles.quickCardLabel}>스크랩</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickCard} onPress={() => router.push('/benefits')} activeOpacity={0.8}>
                  <View style={[styles.quickCardIcon, { backgroundColor: '#E3F2FD' }]}><Text style={[styles.quickCardIconText, { color: Colors.actionShop }]}>P</Text></View>
                  <Text style={styles.quickCardLabel}>포인트</Text>
                </TouchableOpacity>
              </View>

              {/* CookDex Plus 퀵 카드 */}
              <TouchableOpacity style={styles.plusCard} onPress={() => setPlusModalVisible(true)}>
                <View style={styles.plusCardLeft}>
                  <View style={styles.plusIconBox}><Text style={styles.plusIconText}>+</Text></View>
                  <View>
                    <Text style={styles.plusCardTitle}>CookDex Plus</Text>
                    <Text style={styles.plusCardSub}>광고 제거 · 프리미엄 리포트</Text>
                  </View>
                </View>
                <Text style={styles.listRowArrow}>›</Text>
              </TouchableOpacity>

              {/* 섹션: 맞춤 설정 — 탭 시 해당 서브뷰로 */}
              <Text style={styles.listSectionTitle}>맞춤 설정</Text>
              <View style={styles.listGroup}>
                <TouchableOpacity style={styles.listRow} onPress={() => setSettingsSubView('condiments')} activeOpacity={0.7}>
                  <Text style={styles.listRowLabel}>우리 집 기본 양념장</Text>
                  <Text style={styles.listRowArrow}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.listRow} onPress={() => setSettingsSubView('diet')} activeOpacity={0.7}>
                  <Text style={styles.listRowLabel}>내 식단 목표</Text>
                  <Text style={styles.listRowArrow}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.listRow} onPress={() => setSettingsSubView('allergies')} activeOpacity={0.7}>
                  <Text style={styles.listRowLabel}>알레르기 및 기피 식재료</Text>
                  <Text style={styles.listRowArrow}>›</Text>
                </TouchableOpacity>
              </View>

              {/* 섹션: 요리 모드 */}
              <Text style={styles.listSectionTitle}>요리 모드</Text>
              <View style={styles.listGroup}>
                <View style={styles.listRowWithSwitch}>
                  <View>
                    <Text style={styles.listRowLabel}>음성 제어 (핸즈프리)</Text>
                    <Text style={styles.listRowSub}>"다음", "이전" 음성으로 레시피 넘기기</Text>
                  </View>
                  <Switch value={isVoiceControlEnabled} onValueChange={toggleVoice} trackColor={{ false: '#E0E0E0', true: Colors.primary }} thumbColor="#fff" />
                </View>
                <View style={[styles.listRowWithSwitch, styles.listRowBorderTop]}>
                  <View>
                    <Text style={styles.listRowLabel}>화면 꺼짐 방지</Text>
                    <Text style={styles.listRowSub}>조리 모드 중 화면 유지</Text>
                  </View>
                  <Switch value={isWakeLockEnabled} onValueChange={toggleWakeLock} trackColor={{ false: '#E0E0E0', true: Colors.primary }} thumbColor="#fff" />
                </View>
              </View>

              {/* 섹션: 기타 */}
              <Text style={styles.listSectionTitle}>기타</Text>
              <View style={styles.listGroup}>
                <TouchableOpacity style={styles.listRow} onPress={() => router.push('/benefits')} activeOpacity={0.7}>
                  <Text style={styles.listRowLabel}>마이 포인트 혜택 상점</Text>
                  <Text style={styles.listRowArrow}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.listRow} onPress={() => router.push('/tutorial')} activeOpacity={0.7}>
                  <Text style={styles.listRowLabel}>앱 튜토리얼 및 법적 고지</Text>
                  <Text style={styles.listRowArrow}>›</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            /* ——— 서브뷰: 양념장 / 식단 목표 / 알레르기 (탭 시에만 노출) ——— */
            <>
              <View style={styles.subViewHeader}>
                <TouchableOpacity onPress={() => setSettingsSubView(null)} style={styles.subViewBack}>
                  <Text style={styles.subViewBackText}>‹ 설정</Text>
                </TouchableOpacity>
                <Text style={styles.subViewTitle}>
                  {settingsSubView === 'condiments' && '우리 집 기본 양념장'}
                  {settingsSubView === 'diet' && '내 식단 목표'}
                  {settingsSubView === 'allergies' && '알레르기 및 기피 식재료'}
                </Text>
                <View style={{ width: 70 }} />
              </View>

              {settingsSubView === 'condiments' && (
                <View style={styles.settingSection}>
                  <Text style={styles.sectionSub}>AI가 레시피 추천 시 집에 있는 재료로 간주합니다.</Text>
                  <View style={styles.chipContainer}>
                    {BASIC_CONDIMENTS.map(item => (<TouchableOpacity key={item} style={[styles.chip, selectedCondiments.includes(item) && styles.chipActive]} onPress={() => toggleCondiment(item)}><Text style={[styles.chipText, selectedCondiments.includes(item) && styles.chipTextActive]}>{item}</Text></TouchableOpacity>))}
                  </View>
                  <View style={styles.inputRow}>
                    <TextInput style={styles.customInput} placeholder="예: 굴소스, 마요네즈" placeholderTextColor={Colors.textSub} value={customCondiment} onChangeText={setCustomCondiment} onSubmitEditing={addCustomCondiment} />
                    <TouchableOpacity style={styles.addBtn} onPress={addCustomCondiment}><Text style={styles.addBtnText}>추가</Text></TouchableOpacity>
                  </View>
                  {selectedCondiments.length > 0 && (
                    <View style={styles.selectedTagsContainer}>
                      {selectedCondiments.map(a => (<TouchableOpacity key={a} style={styles.tagBadgeActive} onPress={() => toggleCondiment(a)}><Text style={styles.tagTextActive}>{a} ✕</Text></TouchableOpacity>))}
                    </View>
                  )}
                </View>
              )}

              {settingsSubView === 'diet' && (
                <View style={styles.settingSection}>
                  <View style={styles.chipContainer}>
                    {DIET_GOALS.map(diet => (<TouchableOpacity key={diet} style={[styles.chip, selectedDiet.includes(diet) && styles.chipActive]} onPress={() => toggleDiet(diet)}><Text style={[styles.chipText, selectedDiet.includes(diet) && styles.chipTextActive]}>{diet}</Text></TouchableOpacity>))}
                  </View>
                  <View style={styles.inputRow}>
                    <TextInput style={styles.customInput} placeholder="예: 저염식, 간헐적단식" placeholderTextColor={Colors.textSub} value={customDiet} onChangeText={setCustomDiet} onSubmitEditing={applyCustomDiet} />
                    <TouchableOpacity style={styles.addBtn} onPress={applyCustomDiet}><Text style={styles.addBtnText}>적용</Text></TouchableOpacity>
                  </View>
                  {selectedDiet.length > 0 && (
                    <View style={styles.selectedTagsContainer}>
                      {selectedDiet.map(d => (<TouchableOpacity key={d} style={styles.tagBadgeActive} onPress={() => toggleDiet(d)}><Text style={styles.tagTextActive}>{d} ✕</Text></TouchableOpacity>))}
                    </View>
                  )}
                </View>
              )}

              {settingsSubView === 'allergies' && (
                <View style={styles.settingSection}>
                  <View style={styles.chipContainer}>
                    {COMMON_ALLERGIES.map(allergy => (<TouchableOpacity key={allergy} style={[styles.chip, selectedAllergies.includes(allergy) && styles.chipDangerActive]} onPress={() => toggleAllergy(allergy)}><Text style={[styles.chipText, selectedAllergies.includes(allergy) && styles.chipTextActive]}>{allergy}</Text></TouchableOpacity>))}
                  </View>
                  <View style={styles.inputRow}>
                    <TextInput style={styles.customInput} placeholder="예: 오이, 고수" placeholderTextColor={Colors.textSub} value={customAllergy} onChangeText={setCustomAllergy} onSubmitEditing={addCustomAllergy} />
                    <TouchableOpacity style={styles.addBtn} onPress={addCustomAllergy}><Text style={styles.addBtnText}>추가</Text></TouchableOpacity>
                  </View>
                  {selectedAllergies.length > 0 && (
                    <View style={styles.selectedTagsContainer}>
                      {selectedAllergies.map(a => (<TouchableOpacity key={a} style={styles.tagBadgeDanger} onPress={() => toggleAllergy(a)}><Text style={styles.tagTextActive}>{a} ✕</Text></TouchableOpacity>))}
                    </View>
                  )}
                </View>
              )}

              <TouchableOpacity style={styles.saveButton} onPress={() => { saveProfileSettings(); setSettingsSubView(null); }}>
                <Text style={styles.saveButtonText}>저장하고 설정으로 돌아가기</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 내 정보 관리 모달 (레퍼런스: 개인정보 설정 화면) */}
      <Modal visible={profileInfoModalVisible} transparent={true} animationType="slide" onRequestClose={() => setProfileInfoModalVisible(false)}>
        <View style={styles.profileInfoModalOverlay}>
          <View style={styles.profileInfoModalContent}>
            <View style={styles.profileInfoHeader}>
              <TouchableOpacity onPress={() => setProfileInfoModalVisible(false)} style={styles.profileInfoBackBtn}>
                <Text style={styles.profileInfoBackText}>‹ 뒤로</Text>
              </TouchableOpacity>
              <Text style={styles.profileInfoTitle}>내 정보 관리</Text>
              <View style={{ width: 56 }} />
            </View>
            <ScrollView style={styles.profileInfoScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.profileInfoPhotoSection}>
                <View style={styles.profileInfoAvatarWrap}>
                  <View style={[styles.avatarPlaceholder, styles.profileInfoAvatar]}>
                    <Text style={styles.avatarText}>{(user?.email?.[0] || '?').toUpperCase()}</Text>
                  </View>
                  <View style={[styles.avatarEditBadge, styles.profileInfoEditBadge]}><Text style={styles.avatarEditIcon}>✎</Text></View>
                </View>
                <Text style={styles.profileInfoDisplayName}>{user?.email?.split('@')[0] || '익명'} 셰프</Text>
              </View>
              <Text style={styles.profileInfoSectionTitle}>기본정보</Text>
              <View style={styles.profileInfoListGroup}>
                <View style={styles.profileInfoRow}>
                  <Text style={styles.profileInfoRowLabel}>이메일</Text>
                  <Text style={styles.profileInfoRowValue}>{user?.email ?? '미입력'}</Text>
                </View>
                <View style={styles.profileInfoRow}>
                  <Text style={styles.profileInfoRowLabel}>휴대폰</Text>
                  <Text style={styles.profileInfoRowValueMuted}>미입력</Text>
                  <Text style={styles.profileInfoRowAction}>변경</Text>
                </View>
              </View>
              <Text style={styles.profileInfoSectionTitle}>부가정보</Text>
              <View style={styles.profileInfoListGroup}>
                <View style={styles.profileInfoRow}>
                  <Text style={styles.profileInfoRowLabel}>생년월일</Text>
                  <Text style={styles.profileInfoRowValueMuted}>미입력</Text>
                  <Text style={styles.listRowArrow}>›</Text>
                </View>
                <View style={styles.profileInfoRow}>
                  <Text style={styles.profileInfoRowLabel}>성별</Text>
                  <Text style={styles.profileInfoRowValueMuted}>미입력</Text>
                  <Text style={styles.listRowArrow}>›</Text>
                </View>
              </View>
              <Text style={styles.profileInfoSectionTitle}>칭호</Text>
              <View style={styles.profileInfoListGroup}>
                <TouchableOpacity style={styles.profileInfoRow} onPress={() => { setProfileInfoModalVisible(false); setTitleModalVisible(true); }}>
                  <Text style={styles.profileInfoRowLabel}>칭호 변경</Text>
                  <Text style={styles.profileInfoRowValue}>{equippedTitle}</Text>
                  <Text style={styles.listRowArrow}>›</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 🏅 칭호 변경 모달 */}
      <Modal visible={titleModalVisible} transparent={true} animationType="slide" onRequestClose={() => setTitleModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>내 칭호 장착함</Text>
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
          <Text style={styles.mockAdTitle}>스폰서 광고 재생 중...</Text>
          <Text style={styles.mockAdTimer}>{adCountdown}초 후 버프가 발동됩니다</Text>
          <ActivityIndicator size="large" color="#FF8C00" style={{marginTop: 30}} />
        </View>
      </Modal>

      {/* 👑 구독 안내 모달 */}
      <Modal visible={plusModalVisible} transparent={true} animationType="slide" onRequestClose={() => setPlusModalVisible(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <View style={{ backgroundColor: '#2A2421', padding: 30, borderTopLeftRadius: 25, borderTopRightRadius: 25, alignItems: 'center' }}>
            <Text style={{ color: '#FFD700', fontSize: 24, fontWeight: '900', marginBottom: 15 }}>CookDex Plus</Text>
            <Text style={{ color: '#FFFDF9', fontSize: 16, textAlign: 'center', marginBottom: 20, lineHeight: 24 }}>1. 전면/배너 광고 완벽 제거{'\n'}2. 셰프 수준의 초정밀 영양/성분 리포트{'\n'}3. 매월 혜택 상점 1,000P 즉시 지급</Text>
            <TouchableOpacity style={{ backgroundColor: '#FFD700', width: '100%', padding: 16, borderRadius: 16, alignItems: 'center', marginBottom: 10 }} onPress={() => { Alert.alert("안내", "현재 정식 출시 전으로 무료 개방 중입니다!"); setPlusModalVisible(false); }}>
              <Text style={{ color: '#000', fontSize: 18, fontWeight: 'bold' }}>월 ￦4,900 구독하기 (첫 달 무료)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ padding: 10 }} onPress={() => setPlusModalVisible(false)}>
              <Text style={{ color: '#A89F9C', fontWeight: 'bold' }}>나중에 할게요</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgMain },
  scrollContent: { padding: 20, paddingBottom: 150 },
  pageHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Platform.OS === 'android' ? 40 : 20, marginBottom: 20 },
  pageTitle: { fontSize: 24, fontWeight: '900', color: Colors.textMain, margin: 0 },
  logoutBtn: { backgroundColor: Colors.bgElevated, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  logoutBtnText: { color: Colors.textSub, fontSize: 12, fontWeight: 'bold' },
  
  // Auth
  authContainer: { flex: 1, justifyContent: 'center', padding: 30 },
  authTitle: { fontSize: 40, fontWeight: '900', color: '#FF8C00', textAlign: 'center', marginBottom: 10 },
  authSubTitle: { fontSize: 16, color: '#FFFDF9', textAlign: 'center', marginBottom: 40, fontWeight: 'bold' },
  authInputBox: { marginBottom: 30 },
  authInput: { backgroundColor: '#3A322F', color: '#FFFDF9', borderWidth: 1, borderColor: '#4A3F3A', borderRadius: 12, paddingHorizontal: 15, paddingVertical: 16, fontSize: 16, marginBottom: 12 },
  authBtnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  authBtn: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  authBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  dividerBox: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#4A3F3A' },
  dividerText: { color: '#8C7A76', paddingHorizontal: 15, fontSize: 13, fontWeight: 'bold' },
  socialBtn: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  socialBtnText: { fontSize: 16, fontWeight: 'bold' },

  // Profile
  profileCard: { backgroundColor: '#3A322F', borderRadius: 20, padding: 20, marginBottom: 30, borderWidth: 1, borderColor: '#4A3F3A' },
  equippedTitleBadge: { backgroundColor: '#FF8C00', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginBottom: 8, fontSize: 12, fontWeight: 'bold', color: '#000' },
  userName: { fontSize: 22, fontWeight: 'bold', color: '#FFFDF9', marginBottom: 15 },
  changeTitleBtn: { backgroundColor: '#4A3F3A', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#5A4E49' },
  changeTitleBtnText: { color: '#FFB347', fontSize: 12, fontWeight: 'bold' },
  levelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  levelTitle: { fontSize: 16, fontWeight: 'bold', color: '#FF8C00' },
  expText: { fontSize: 13, fontWeight: 'bold', color: '#A89F9C' },
  progressBarBg: { width: '100%', height: 12, backgroundColor: '#4A3F3A', borderRadius: 6, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#FF8C00', borderRadius: 6 },

  // 설정 탭 리스트 (메인)
  profileCardCompact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bgElevated, padding: 16, borderRadius: Radius.lg, marginBottom: 12 },
  profileCardCompactLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarWrapper: { position: 'relative', marginRight: 14 },
  avatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarEditBadge: { position: 'absolute', right: -4, bottom: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.actionShop, justifyContent: 'center', alignItems: 'center' },
  avatarEditIcon: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  profileCardName: { fontSize: 17, fontWeight: 'bold', color: Colors.textMain },
  profileCardMeta: { fontSize: 13, color: Colors.textSub, marginTop: 2 },
  quickCardsRow: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  quickCard: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  quickCardIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  quickCardIconText: { fontSize: 18, fontWeight: 'bold' },
  quickCardLabel: { fontSize: 13, color: Colors.textMain, fontWeight: '600' },
  plusCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1E1A18', padding: 16, borderRadius: Radius.lg, marginBottom: 24, borderWidth: 1, borderColor: '#FFD700' },
  plusCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  plusIconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  plusIconText: { color: '#000', fontSize: 20, fontWeight: 'bold' },
  plusCardTitle: { color: '#FFD700', fontSize: 16, fontWeight: 'bold' },
  plusCardSub: { color: '#A89F9C', fontSize: 12, marginTop: 2 },
  listSectionTitle: { fontSize: 13, fontWeight: 'bold', color: Colors.textSub, marginBottom: 8, marginTop: 4, paddingHorizontal: 4 },
  listGroup: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, overflow: 'hidden', marginBottom: 20 },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
  listRowLabel: { fontSize: 16, color: Colors.textMain, fontWeight: '600' },
  listRowSub: { fontSize: 12, color: Colors.textSub, marginTop: 2 },
  listRowArrow: { fontSize: 20, color: Colors.textSub, fontWeight: '300' },
  listRowWithSwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
  listRowBorderTop: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' },
  subViewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Platform.OS === 'android' ? 40 : 20, marginBottom: 16, paddingHorizontal: 4 },
  subViewBack: { paddingVertical: 8, paddingRight: 12 },
  subViewBackText: { fontSize: 17, color: Colors.primary, fontWeight: '600' },
  subViewTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textMain, flex: 1, textAlign: 'center' },

  buffAdBtn: { backgroundColor: '#3F2860', padding: 20, borderRadius: 20, marginBottom: 25, borderWidth: 1, borderColor: '#9C27B0', alignItems: 'center' },
  buffAdTitle: { color: '#E1BEE7', fontSize: 16, fontWeight: '900', marginBottom: 5 },
  buffAdSub: { color: '#CE93D8', fontSize: 12 },

  settingSection: { backgroundColor: '#3A322F', borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#4A3F3A' },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: '#FFFDF9', marginBottom: 5 },
  sectionSub: { fontSize: 12, color: '#A89F9C', marginBottom: 15 },
  
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  chip: { backgroundColor: '#4A3F3A', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#5A4E49' },
  chipActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  chipDangerActive: { backgroundColor: '#E53935', borderColor: '#E53935' },
  chipText: { color: '#E8D5D0', fontSize: 13, fontWeight: 'bold' },
  chipTextActive: { color: '#fff', fontSize: 13, fontWeight: 'bold' },

  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  customInput: { flex: 1, backgroundColor: '#4A3F3A', color: '#FFFDF9', borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12, fontSize: 14, borderWidth: 1, borderColor: '#5A4E49' },
  addBtn: { backgroundColor: '#5A4E49', paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  selectedTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5, padding: 10, backgroundColor: '#4A3F3A', borderRadius: 12 },
  tagBadgeDanger: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#E53935', borderRadius: 15 },
  tagBadgeActive: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#4CAF50', borderRadius: 15 },
  tagTextActive: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  saveButton: { backgroundColor: '#FF8C00', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginTop: 10, shadowColor: '#FF8C00' },
  saveButtonText: { color: '#000', fontSize: 16, fontWeight: '900' },

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

  tutorialReplayBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3A322F', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#4A3F3A', marginTop: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  tutorialReplayIcon: { fontSize: 24, marginRight: 15 },
  tutorialReplayTitle: { color: '#FFFDF9', fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
  tutorialReplaySub: { color: '#A89F9C', fontSize: 12 },

  // 내 정보 관리 모달
  profileInfoModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  profileInfoModalContent: { backgroundColor: Colors.bgModal, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, maxHeight: '90%' },
  profileInfoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  profileInfoBackBtn: { paddingVertical: 8, paddingRight: 8 },
  profileInfoBackText: { fontSize: 16, color: Colors.primary, fontWeight: '600' },
  profileInfoTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textMain },
  profileInfoScroll: { paddingHorizontal: 20, paddingBottom: 32 },
  profileInfoPhotoSection: { alignItems: 'center', paddingVertical: 24 },
  profileInfoAvatarWrap: { position: 'relative', marginBottom: 12 },
  profileInfoAvatar: { width: 80, height: 80, borderRadius: 40, marginRight: 0 },
  profileInfoEditBadge: { width: 28, height: 28, borderRadius: 14, right: -2, bottom: -2 },
  profileInfoDisplayName: { fontSize: 20, fontWeight: 'bold', color: Colors.textMain },
  profileInfoSectionTitle: { fontSize: 13, fontWeight: 'bold', color: Colors.textSub, marginTop: 20, marginBottom: 8, paddingHorizontal: 4 },
  profileInfoListGroup: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, overflow: 'hidden', marginBottom: 4 },
  profileInfoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  profileInfoRowLabel: { fontSize: 15, color: Colors.textMain, flex: 1 },
  profileInfoRowValue: { fontSize: 15, color: Colors.actionShop, fontWeight: '500' },
  profileInfoRowValueMuted: { fontSize: 15, color: Colors.textSub, marginRight: 8 },
  profileInfoRowAction: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
});