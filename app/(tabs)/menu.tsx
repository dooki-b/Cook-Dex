import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Shadows } from '../../constants/design-tokens';
import { auth } from '../../firebaseConfig';

const DIET_GOALS = ["다이어트(저칼로리)", "벌크업(고단백)", "비건(채식)", "저탄고지", "당뇨/혈당관리"];
const COMMON_ALLERGIES = ["갑각류", "견과류", "우유/유제품", "계란", "밀가루", "복숭아"];
const BASIC_CONDIMENTS = ["소금", "설탕", "간장", "고추장", "된장", "후추", "참기름", "식용유", "다진마늘", "고춧가루"];

export default function SettingsScreen() {
  const router = useRouter();
  const [isInitializing, setIsInitializing] = useState(true);
  const [user, setUser] = useState(() => auth.currentUser);

  // 설정 상태
  const [selectedDiet, setSelectedDiet] = useState<string[]>([]);
  const [customDiet, setCustomDiet] = useState("");
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
  const [customAllergy, setCustomAllergy] = useState("");
  const [selectedCondiments, setSelectedCondiments] = useState<string[]>([]);
  const [customCondiment, setCustomCondiment] = useState("");
  const [isVoiceControlEnabled, setIsVoiceControlEnabled] = useState(false);
  const [isWakeLockEnabled, setIsWakeLockEnabled] = useState(false);
  const [ttsVoice, setTtsVoice] = useState<'A' | 'B' | 'C'>('A');

  // 모달 제어 상태
  const [plusModalVisible, setPlusModalVisible] = useState(false);
  const [ttsModalVisible, setTtsModalVisible] = useState(false);
  const [settingsSubView, setSettingsSubView] = useState<'custom_settings' | 'profile' | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (isInitializing) setIsInitializing(false);
    });
    return unsubscribe;
  }, [isInitializing]);

  useFocusEffect(
    useCallback(() => {
      const loadSettings = async () => {
        try {
          const savedDiet = await AsyncStorage.getItem('cookdex_diet_goal');
          if (savedDiet && savedDiet !== "없음") setSelectedDiet(JSON.parse(savedDiet));

          const savedAllergies = await AsyncStorage.getItem('cookdex_allergies');
          if (savedAllergies && savedAllergies !== "없음") setSelectedAllergies(savedAllergies.split(', '));

          const savedCondiments = await AsyncStorage.getItem('cookdex_condiments');
          if (savedCondiments) setSelectedCondiments(JSON.parse(savedCondiments));

          const voice = await AsyncStorage.getItem('cookdex_setting_voice');
          const wakelock = await AsyncStorage.getItem('cookdex_setting_wakelock');
          const savedTts = await AsyncStorage.getItem('cookdex_setting_tts');

          if (voice === 'true') setIsVoiceControlEnabled(true);
          if (wakelock === 'true') setIsWakeLockEnabled(true);
          if (savedTts) setTtsVoice(savedTts as 'A' | 'B' | 'C');
        } catch (error) {}
      };
      loadSettings();
    }, [])
  );

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

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace('/(tabs)');
    } catch (e) {}
  };

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

  const handleTtsSelect = async (val: 'A' | 'B' | 'C') => {
    setTtsVoice(val);
    setTtsModalVisible(false);
    await AsyncStorage.setItem('cookdex_setting_tts', val);
  };

  const toggleDiet = (diet: string) => setSelectedDiet(prev => prev.includes(diet) ? prev.filter(d => d !== diet) : [...prev, diet]);
  const applyCustomDiet = () => { const diet = customDiet.trim(); if (diet && !selectedDiet.includes(diet)) setSelectedDiet(prev => [...prev, diet]); setCustomDiet(""); };
  const toggleAllergy = (allergy: string) => setSelectedAllergies(prev => prev.includes(allergy) ? prev.filter(a => a !== allergy) : [...prev, allergy]);
  const addCustomAllergy = () => { const newA = customAllergy.trim(); if (newA && !selectedAllergies.includes(newA)) setSelectedAllergies(prev => [...prev, newA]); setCustomAllergy(""); };
  const toggleCondiment = (item: string) => setSelectedCondiments(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]);
  const addCustomCondiment = () => { const newC = customCondiment.trim(); if (newC && !selectedCondiments.includes(newC)) setSelectedCondiments(prev => [...prev, newC]); setCustomCondiment(""); };

  const saveProfileSettings = async () => {
    try {
      await AsyncStorage.setItem('cookdex_diet_goal', JSON.stringify(selectedDiet));
      const allergyStr = selectedAllergies.length > 0 ? selectedAllergies.join(', ') : "없음";
      await AsyncStorage.setItem('cookdex_allergies', allergyStr);
      await AsyncStorage.setItem('cookdex_condiments', JSON.stringify(selectedCondiments));
      Alert.alert("저장 완료", "맞춤 설정이 AI 셰프에게 업데이트되었습니다.");
    } catch (error) {}
  };

  if (isInitializing) return <View style={[styles.container, {justifyContent: 'center'}]}><ActivityIndicator size="large" color="#FF8C00" /></View>;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          {settingsSubView === null ? (
            <Text style={styles.kakaoPageTitle}>전체 메뉴</Text>
          ) : (
            <TouchableOpacity onPress={() => setSettingsSubView(null)} style={styles.backBtn}>
              <Text style={styles.backBtnText}>‹ 이전</Text>
            </TouchableOpacity>
          )}
          {settingsSubView !== null && <Text style={styles.pageTitle}>통합 설정</Text>}
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {settingsSubView === null ? (
            <>
              {/* 카카오T 스타일 최상단 통합 박스 (프로필 + 퀵메뉴) */}
              <View style={styles.kakaoProfileContainer}>
                <TouchableOpacity activeOpacity={0.9} onPress={() => setSettingsSubView('profile')} style={styles.kakaoProfileArea}>
                  <View style={styles.kakaoProfileAvatar}>
                    <Text style={styles.kakaoProfileAvatarText}>{(user?.email?.[0] || '?').toUpperCase()}</Text>
                    <View style={styles.kakaoProfileEditBadge}><Text style={styles.kakaoProfileEditIcon}>✎</Text></View>
                  </View>
                  <View style={styles.kakaoProfileInfo}>
                    <Text style={styles.kakaoProfileName}>{user?.email?.split('@')[0] || '익명'} 셰프</Text>
                    <Text style={styles.kakaoProfilePhone}>{user?.email ?? '로그인 필요'}</Text>
                  </View>
                  <Text style={styles.kakaoProfileArrow}>›</Text>
                </TouchableOpacity>

                {/* 3분할 퀵메뉴 (포인트, 쿠폰함, Pro 구독) */}
                <View style={styles.kakaoQuickMenu}>
                  <TouchableOpacity style={styles.kakaoQuickItem}>
                    <View style={[styles.kakaoQuickIconBg, { backgroundColor: '#FEF08A' }]}>
                      <Text style={[styles.kakaoQuickIconText, { color: '#B45309' }]}>P</Text>
                    </View>
                    <Text style={styles.kakaoQuickText}>포인트</Text>
                  </TouchableOpacity>
                  <View style={styles.kakaoQuickDivider} />
                  <TouchableOpacity style={styles.kakaoQuickItem}>
                     <View style={[styles.kakaoQuickIconBg, { backgroundColor: '#E2E8F0' }]}>
                       <MaterialCommunityIcons name="ticket-percent-outline" size={16} color="#475569" />
                     </View>
                    <Text style={styles.kakaoQuickText}>쿠폰함</Text>
                  </TouchableOpacity>
                  <View style={styles.kakaoQuickDivider} />
                  <TouchableOpacity style={styles.kakaoQuickItem} onPress={() => setPlusModalVisible(true)}>
                    <View style={[styles.kakaoQuickIconBg, { backgroundColor: '#EBF5FF' }]}>
                      <Ionicons name="storefront" size={16} color="#3B82F6" />
                    </View>
                    <Text style={styles.kakaoQuickText}>구독 혜택</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.kakaoSectionDivider} />

              {/* 하위 통합 라우팅 리스트 (핵심 탭 메뉴) */}
              <View style={styles.kakaoMenuList}>
                <TouchableOpacity style={styles.kakaoMenuRow} onPress={() => router.push('/(tabs)/benefits')}>
                  <Ionicons name="pricetag-outline" size={22} color={Colors.actionShop} style={styles.kakaoMenuIcon} />
                  <Text style={styles.kakaoMenuLabel}>혜택 상점</Text>
                  <Text style={styles.kakaoMenuArrow}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.kakaoMenuRow} onPress={() => router.push('/(tabs)/recipes')}>
                  <Ionicons name="restaurant-outline" size={22} color={Colors.primary} style={styles.kakaoMenuIcon} />
                  <Text style={styles.kakaoMenuLabel}>내 주방 (레시피 북)</Text>
                  <Text style={styles.kakaoMenuArrow}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.kakaoMenuRow} onPress={() => router.push('/(tabs)/quest')}>
                  <Ionicons name="game-controller-outline" size={22} color={Colors.warning} style={styles.kakaoMenuIcon} />
                  <Text style={styles.kakaoMenuLabel}>도파민 퀘스트</Text>
                  <Text style={styles.kakaoMenuArrow}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.kakaoMenuRow, { borderBottomWidth: 0 }]} onPress={() => router.push('/(tabs)/plaza')}>
                  <Ionicons name="people-outline" size={22} color="#8B5CF6" style={styles.kakaoMenuIcon} />
                  <Text style={styles.kakaoMenuLabel}>요리 광장</Text>
                  <Text style={styles.kakaoMenuArrow}>›</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.kakaoSectionDivider} />

              {/* 하위 설정 리스트 메뉴 */}
              <View style={styles.kakaoMenuList}>
                <TouchableOpacity style={styles.kakaoMenuRow} onPress={() => setSettingsSubView('custom_settings')}>
                  <Ionicons name="nutrition-outline" size={22} color={Colors.textMain} style={styles.kakaoMenuIcon} />
                  <Text style={styles.kakaoMenuLabel}>내 향신료&식단 관리</Text>
                  <Text style={styles.kakaoMenuArrow}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.kakaoMenuRow}>
                  <Ionicons name="time-outline" size={22} color={Colors.textMain} style={styles.kakaoMenuIcon} />
                  <Text style={styles.kakaoMenuLabel}>이용기록</Text>
                  <Text style={styles.kakaoMenuArrow}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.kakaoMenuRow}>
                  <Ionicons name="card-outline" size={22} color={Colors.textMain} style={styles.kakaoMenuIcon} />
                  <Text style={styles.kakaoMenuLabel}>결제수단 관리</Text>
                  <Text style={styles.kakaoMenuArrow}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.kakaoMenuRow}>
                  <Ionicons name="star-outline" size={22} color={Colors.textMain} style={styles.kakaoMenuIcon} />
                  <Text style={styles.kakaoMenuLabel}>나의 배지</Text>
                  <View style={styles.kakaoRedDot} />
                  <Text style={styles.kakaoMenuArrow}>›</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.kakaoSectionDivider} />

              <View style={styles.kakaoMenuList}>
                <View style={styles.kakaoMenuRowNoTouch}>
                  <Ionicons name="mic-outline" size={22} color={Colors.textMain} style={styles.kakaoMenuIcon} />
                  <Text style={styles.kakaoMenuLabel}>음성 제어 (핸즈프리)</Text>
                  <Switch value={isVoiceControlEnabled} onValueChange={toggleVoice} trackColor={{ false: '#E2E8F0', true: Colors.primary }} thumbColor="#fff" />
                </View>
                <TouchableOpacity style={styles.kakaoMenuRowNoTouch} onPress={() => setTtsModalVisible(true)}>
                  <Ionicons name="volume-high-outline" size={22} color={Colors.textMain} style={styles.kakaoMenuIcon} />
                  <Text style={styles.kakaoMenuLabel}>TTS 목소리 타입 설정</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: Colors.textSub, marginRight: 8, fontSize: 13, fontWeight: 'bold' }}>
                      {ttsVoice === 'A' ? '차분한 여성' : ttsVoice === 'B' ? '활기찬 남성' : '부드러운 AI 여음'}
                    </Text>
                    <Text style={[styles.kakaoMenuArrow, { paddingLeft: 0 }]}>›</Text>
                  </View>
                </TouchableOpacity>
                <View style={[styles.kakaoMenuRowNoTouch, { borderBottomWidth: 0 }]}>
                  <Ionicons name="sunny-outline" size={22} color={Colors.textMain} style={styles.kakaoMenuIcon} />
                  <Text style={styles.kakaoMenuLabel}>화면 꺼짐 방지</Text>
                  <Switch value={isWakeLockEnabled} onValueChange={toggleWakeLock} trackColor={{ false: '#E2E8F0', true: Colors.primary }} thumbColor="#fff" />
                </View>
              </View>

              <View style={styles.kakaoSectionDivider} />

              <View style={styles.kakaoMenuList}>
                <TouchableOpacity style={styles.kakaoMenuRow} onPress={() => router.push('/tutorial')}>
                  <Ionicons name="help-circle-outline" size={22} color={Colors.textMain} style={styles.kakaoMenuIcon} />
                  <Text style={styles.kakaoMenuLabel}>앱 튜토리얼 다시 보기</Text>
                  <Text style={styles.kakaoMenuArrow}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.kakaoMenuRow, { borderBottomWidth: 0 }]} onPress={handleLogout}>
                  <Ionicons name="log-out-outline" size={22} color={Colors.danger} style={styles.kakaoMenuIcon} />
                  <Text style={[styles.kakaoMenuLabel, { color: Colors.danger }]}>로그아웃</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            /* 서브뷰 렌더링 영역 */
            <View>
              <Text style={styles.subViewTitle}>
                {settingsSubView === 'custom_settings' && '맞춤 설정 통합 관리'}
                {settingsSubView === 'profile' && '개인정보 관리'}
              </Text>

              {settingsSubView === 'profile' && (
                <View style={styles.profileInfoScroll}>
                  <View style={styles.profileInfoPhotoSection}>
                    <View style={[styles.kakaoProfileAvatar, { width: 80, height: 80, borderRadius: 40 }]}><Text style={[styles.kakaoProfileAvatarText, { fontSize: 32 }]}>{(user?.email?.[0] || '?').toUpperCase()}</Text></View>
                    <Text style={styles.profileInfoDisplayName}>{user?.email?.split('@')[0] || '익명'} 셰프</Text>
                  </View>
                  <Text style={styles.listSectionTitle}>기본정보</Text>
                  <View style={styles.listGroup}>
                    <View style={styles.listRow}>
                      <Text style={styles.listRowLabel}>이메일</Text>
                      <Text style={styles.listRowValue}>{user?.email ?? '미입력'}</Text>
                    </View>
                    <View style={[styles.listRow, styles.listRowBorderTop, { borderBottomWidth: 0 }]}>
                      <Text style={styles.listRowLabel}>휴대폰</Text>
                      <Text style={[styles.listRowValue, { color: Colors.textSub }]}>미입력</Text>
                      <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '600', marginLeft: 10 }}>변경</Text>
                    </View>
                  </View>
                  <Text style={styles.listSectionTitle}>부가정보</Text>
                  <View style={styles.listGroup}>
                    <View style={styles.listRow}>
                      <Text style={styles.listRowLabel}>생년월일</Text>
                      <Text style={[styles.listRowValue, { color: Colors.textSub }]}>미입력</Text>
                      <Text style={styles.listRowArrow}>›</Text>
                    </View>
                    <View style={[styles.listRow, styles.listRowBorderTop, { borderBottomWidth: 0 }]}>
                      <Text style={styles.listRowLabel}>성별</Text>
                      <Text style={[styles.listRowValue, { color: Colors.textSub }]}>미입력</Text>
                      <Text style={styles.listRowArrow}>›</Text>
                    </View>
                  </View>
                </View>
              )}

              {settingsSubView === 'custom_settings' && (
                <View>
                  <Text style={[styles.listSectionTitle, { marginTop: 0 }]}>집에 있는 기본 양념장</Text>
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

                  <Text style={styles.listSectionTitle}>나의 식단 목표</Text>
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

                  <Text style={styles.listSectionTitle}>알레르기 / 기피 식재료</Text>
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
                </View>
              )}

              {settingsSubView !== 'profile' && (
                <TouchableOpacity style={styles.saveButton} onPress={() => { saveProfileSettings(); setSettingsSubView(null); }}>
                  <Text style={styles.saveButtonText}>저장하고 설정 메인으로 돌아가기</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={plusModalVisible} transparent={true} animationType="slide" onRequestClose={() => setPlusModalVisible(false)}>
        <View style={styles.proModalOverlay}>
          <View style={styles.proModalContent}>
            <View style={styles.proModalHandle} />
            <View style={styles.proModalHeader}>
              <View style={[styles.kakaoQuickIconBg, { backgroundColor: '#EBF5FF', width: 44, height: 44, borderRadius: 22, marginBottom: 16 }]}>
                <Ionicons name="storefront" size={22} color="#3B82F6" />
              </View>
              <Text style={styles.proModalTitle}>CookDex Pro 멤버십</Text>
              <Text style={styles.proModalSub}>한 차원 높은 요리 라이프를 시작하세요</Text>
            </View>
            
            <View style={styles.proBenefitList}>
              <View style={styles.proBenefitItem}>
                <Ionicons name="shield-checkmark" size={24} color="#2563EB" />
                <View style={styles.proBenefitTextWrap}>
                   <Text style={styles.proBenefitTitle}>광고 완벽 제거</Text>
                   <Text style={styles.proBenefitDesc}>레시피 시청 중 끊김 없는 쾌적한 환경</Text>
                </View>
              </View>
              <View style={styles.proBenefitItem}>
                <Ionicons name="pie-chart" size={24} color="#2563EB" />
                <View style={styles.proBenefitTextWrap}>
                   <Text style={styles.proBenefitTitle}>초정밀 성분 리포트</Text>
                   <Text style={styles.proBenefitDesc}>셰프 수준의 영양 성분 데이터 무제한 열람</Text>
                </View>
              </View>
              <View style={styles.proBenefitItem}>
                <Ionicons name="gift" size={24} color="#2563EB" />
                <View style={styles.proBenefitTextWrap}>
                   <Text style={styles.proBenefitTitle}>매월 1,000 포인트 즉시 지급</Text>
                   <Text style={styles.proBenefitDesc}>멤버십 요금 이상의 쇼핑 혜택으로 페이백</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.proSubscribeBtn} onPress={() => { Alert.alert("안내", "출시 준비 중입니다."); setPlusModalVisible(false); }}>
              <Text style={styles.proSubscribeBtnText}>출시 알림 받기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.proCloseBtn} onPress={() => setPlusModalVisible(false)}>
              <Text style={styles.proCloseBtnText}>나중에 하기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* TTS 보이스 선택 모달 */}
      <Modal visible={ttsModalVisible} transparent={true} animationType="fade" onRequestClose={() => setTtsModalVisible(false)}>
        <View style={styles.proModalOverlay}>
          <View style={[styles.proModalContent, { paddingBottom: Platform.OS === 'ios' ? 40 : 24 }]}>
            <View style={styles.proModalHandle} />
            <Text style={[styles.proModalTitle, { marginBottom: 24 }]}>TTS 목소리 선택</Text>
            
            <TouchableOpacity style={styles.ttsOptionItem} onPress={() => handleTtsSelect('A')}>
              <Text style={styles.ttsOptionText}>차분하고 친절한 여성 셰프 (Type A)</Text>
              {ttsVoice === 'A' && <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />}
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.ttsOptionItem} onPress={() => handleTtsSelect('B')}>
              <Text style={styles.ttsOptionText}>에너지 넘치는 활기찬 남성 셰프 (Type B)</Text>
              {ttsVoice === 'B' && <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />}
            </TouchableOpacity>

            <TouchableOpacity style={styles.ttsOptionItem} onPress={() => handleTtsSelect('C')}>
              <Text style={styles.ttsOptionText}>부드럽고 신뢰감 있는 AI 여음 (Type C)</Text>
              {ttsVoice === 'C' && <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.proCloseBtn, { marginTop: 12 }]} onPress={() => setTtsModalVisible(false)}>
              <Text style={styles.proCloseBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgMain },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 24 : 10, paddingBottom: 16 },
  backBtn: { padding: 8 },
  backBtnText: { color: Colors.primary, fontSize: 16, fontWeight: 'bold' },
  pageTitle: { fontSize: 20, fontWeight: '900', color: Colors.textMain },
  kakaoPageTitle: { fontSize: 22, fontWeight: '800', color: Colors.textMain, paddingLeft: 8 },
  scrollContent: { paddingBottom: 60 },
  // 카카오T 스타일 통합 프로필 / 퀵메뉴 컨테이너
  kakaoProfileContainer: {
    backgroundColor: Colors.bgElevated,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 24,
    borderRadius: Radius.xl,
    paddingTop: 4,
    ...Shadows.glass,
  },
  kakaoProfileArea: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18 },
  kakaoProfileAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.primarySoft, justifyContent: 'center', alignItems: 'center', marginRight: 16, position: 'relative' },
  kakaoProfileAvatarText: { color: Colors.primary, fontSize: 24, fontWeight: '900' },
  kakaoProfileEditBadge: { position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.bgMain, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  kakaoProfileEditIcon: { fontSize: 13, color: Colors.textMain },
  kakaoProfileInfo: { flex: 1, justifyContent: 'center' },
  kakaoProfileName: { fontSize: 19, fontWeight: '800', color: Colors.textMain, marginBottom: 4 },
  kakaoProfilePhone: { fontSize: 14, color: Colors.textSub, fontWeight: '500' },
  kakaoProfileArrow: { fontSize: 24, color: Colors.textSub, fontWeight: '300', paddingLeft: 10 },

  // 3분할 퀵메뉴
  kakaoQuickMenu: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', paddingVertical: 16 },
  kakaoQuickItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  kakaoQuickDivider: { width: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginVertical: 4 },
  kakaoQuickIconBg: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  kakaoQuickIconText: { fontSize: 14, fontWeight: '800' },
  kakaoQuickText: { fontSize: 13, color: Colors.textMain, fontWeight: '600' },

  // 모던 사이 여백
  kakaoSectionDivider: { height: 10, backgroundColor: '#F3F4F6' },

  // 카카오T 스타일 리스트
  kakaoMenuList: { backgroundColor: Colors.bgMain, paddingLeft: 20 },
  kakaoMenuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, paddingRight: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  kakaoMenuRowNoTouch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingRight: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  kakaoMenuIcon: { marginRight: 14 },
  kakaoMenuLabel: { flex: 1, fontSize: 16, color: Colors.textMain, fontWeight: '500' },
  kakaoMenuArrow: { fontSize: 20, color: Colors.textSub, fontWeight: '300' },
  kakaoRedDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.danger, marginRight: 8 },

  // 서브 뷰 (설정 통합, 프로필 등)
  listSectionTitle: { fontSize: 13, fontWeight: 'bold', color: Colors.textSub, marginBottom: 8, marginTop: 12, paddingHorizontal: 20 },
  listGroup: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, overflow: 'hidden', marginBottom: 16, marginHorizontal: 20 },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
  listRowLabel: { fontSize: 16, color: Colors.textMain, fontWeight: '600' },
  listRowValue: { fontSize: 15, color: Colors.actionShop, fontWeight: '600' },
  listRowSub: { fontSize: 12, color: Colors.textSub, marginTop: 2 },
  listRowArrow: { fontSize: 20, color: Colors.textSub, fontWeight: '300' },
  listRowBorderTop: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' },

  subViewTitle: { fontSize: 24, fontWeight: '900', color: Colors.textMain, marginBottom: 20, marginTop: 10, paddingHorizontal: 20 },
  settingSection: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: Colors.border, marginHorizontal: 20 },
  sectionSub: { fontSize: 12, color: Colors.textSub, marginBottom: 15 },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  chip: { backgroundColor: Colors.bgMuted, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primarySoft, borderColor: Colors.primary },
  chipDangerActive: { backgroundColor: '#FEE2E2', borderColor: Colors.danger },
  chipText: { color: Colors.textSub, fontSize: 13, fontWeight: 'bold' },
  chipTextActive: { color: Colors.textMain, fontSize: 13, fontWeight: 'bold' },
  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  customInput: { flex: 1, backgroundColor: Colors.bgMuted, color: Colors.textMain, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12, fontSize: 14 },
  addBtn: { backgroundColor: Colors.textMain, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  addBtnText: { color: Colors.textInverse, fontSize: 14, fontWeight: 'bold' },
  selectedTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5, padding: 10, backgroundColor: Colors.bgMain, borderRadius: 12 },
  tagBadgeDanger: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: Colors.danger, borderRadius: 15 },
  tagBadgeActive: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: Colors.primary, borderRadius: 15 },
  tagTextActive: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  saveButton: { backgroundColor: Colors.primary, paddingVertical: 18, borderRadius: Radius.lg, alignItems: 'center', marginTop: 10, marginHorizontal: 20 },
  saveButtonText: { color: Colors.textInverse, fontSize: 16, fontWeight: '900' },
  
  profileInfoScroll: { paddingBottom: 32 },
  profileInfoPhotoSection: { alignItems: 'center', paddingVertical: 24 },
  profileInfoDisplayName: { fontSize: 20, fontWeight: 'bold', color: Colors.textMain, marginTop: 12 },

  // Pro 모달 스타일
  proModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlayDark },
  proModalContent: { backgroundColor: Colors.bgElevated, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, alignItems: 'center' },
  proModalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', marginBottom: 24 },
  proModalHeader: { alignItems: 'center', marginBottom: 32 },
  proModalTitle: { fontSize: 24, fontWeight: '900', color: Colors.textMain, marginBottom: 8 },
  proModalSub: { fontSize: 15, color: Colors.textSub, fontWeight: '500' },
  proBenefitList: { width: '100%', marginBottom: 32 },
  proBenefitItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, backgroundColor: '#F8FAFC', padding: 16, borderRadius: Radius.lg },
  proBenefitTextWrap: { marginLeft: 16, flex: 1 },
  proBenefitTitle: { fontSize: 16, fontWeight: '800', color: Colors.textMain, marginBottom: 4 },
  proBenefitDesc: { fontSize: 13, color: Colors.textSub, lineHeight: 18 },
  proSubscribeBtn: { backgroundColor: '#2563EB', width: '100%', paddingVertical: 18, borderRadius: Radius.lg, alignItems: 'center', marginBottom: 12, ...Shadows.soft },
  proSubscribeBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  proCloseBtn: { paddingVertical: 12, paddingHorizontal: 20 },
  proCloseBtnText: { color: Colors.textSub, fontSize: 14, fontWeight: '600' },

  ttsOptionItem: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18, paddingHorizontal: 16, backgroundColor: Colors.bgMuted, borderRadius: Radius.md, marginBottom: 12 },
  ttsOptionText: { fontSize: 15, fontWeight: 'bold', color: Colors.textMain },
});

