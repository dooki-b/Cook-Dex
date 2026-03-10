// app/(tabs)/index.tsx — 레시피 포털 홈 (스퀴시·글래스·차세대 트렌드)
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Dimensions, ImageBackground, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClayChipColors, Colors, GlassHighlight, Radius, Shadows } from '../../constants/design-tokens';
import { auth } from '../../firebaseConfig';

// 히어로 버튼 배경 — 로컬 이미지 (채소·재료)
const HERO_BG_IMAGE = require('../../assets/hero-bg-fresh-vegetables.png');

const SPRING_CONFIG = { damping: 14, stiffness: 400 };

function Squishable({
  onPress,
  style,
  fill,
  children,
}: { onPress: () => void; style?: object | object[]; fill?: boolean; children: React.ReactNode }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.97, SPRING_CONFIG); }}
      onPressOut={() => { scale.value = withSpring(1, SPRING_CONFIG); }}
      style={style}
    >
      <Animated.View style={[fill && { flex: 1 }, animatedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// 퀵 메뉴 칩 (클레이모피즘 아이콘 + 라벨)
const QUICK_MENU = [
  { id: 'mission', label: '미션', icon: 'flag-outline' as const, color: ClayChipColors.blue, onPress: 'quest' },
  { id: 'kitchen', label: '내 주방', icon: 'restaurant-outline' as const, color: ClayChipColors.yellow, onPress: 'recipes' },
  { id: 'sale', label: '할인정보', icon: 'pricetag-outline' as const, color: ClayChipColors.peach, onPress: 'benefits' },
];

// 테마 풀: 식단 목표·시간대에 따라 추천 조합용 + Unsplash 이미지
const THEME_POOL: { id: string; title: string; keyword: string; imageUri: string; dietTags?: string[]; timeSlot?: 'morning' | 'lunch' | 'dinner' | 'late' }[] = [
  { id: 'diet', title: '다이어트', keyword: '저칼로리 다이어트에 맞는', imageUri: 'https://images.unsplash.com/photo-1561043433-aaf687c4cf04?w=600', dietTags: ['다이어트(저칼로리)', '당뇨/혈당관리'] },
  { id: 'lowcarb', title: '저탄고지', keyword: '저탄수화물 고지방', imageUri: 'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=600&q=80', dietTags: ['저탄고지'] },
  { id: 'vegan', title: '비건', keyword: '채식 비건', imageUri: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600', dietTags: ['비건(채식)'] },
  { id: 'protein', title: '고단백', keyword: '고단백 벌크업', imageUri: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=600', dietTags: ['벌크업(고단백)'] },
  { id: 'morning', title: '간단 아침', keyword: '간단한 아침 식사', imageUri: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=600', timeSlot: 'morning' },
  { id: 'lunch', title: '점심 한그릇', keyword: '점심 한그릇 요리', imageUri: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600', timeSlot: 'lunch' },
  { id: 'dinner', title: '저녁 요리', keyword: '저녁 메인 요리', imageUri: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600', timeSlot: 'dinner' },
  { id: 'late', title: '가벼운 야식', keyword: '가벼운 야식', imageUri: 'https://images.unsplash.com/photo-1747228469541-f0e7f56e7ec7?w=600', timeSlot: 'late' },
  { id: '10min', title: '10분 요리', keyword: '10분 이내 간단 요리', imageUri: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600' },
  { id: 'onepot', title: '한 그릇', keyword: '한 그릇 요리', imageUri: 'https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=600' },
  { id: 'allergy', title: '알레르기 고려', keyword: '알레르기 유발 재료 제외', imageUri: 'https://images.unsplash.com/photo-1542814744-5f6b075c051c?w=600' },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const THEME_CARD_WIDTH = SCREEN_WIDTH * 0.38;
const THEME_CARD_MARGIN = 8;
const THEME_CARD_SNAP = THEME_CARD_WIDTH + THEME_CARD_MARGIN;

// 테마 모달용 재료 칩 (일부만 노출)
const THEME_MODAL_INGREDIENTS = ['감자', '양파', '대파', '마늘', '계란', '두부', '닭고기', '돼지고기', '김치', '소면', '치즈', '버섯', '당근', '콩나물', '베이컨', '참치캔'];

function getTimeSlot(): 'morning' | 'lunch' | 'dinner' | 'late' {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 14) return 'lunch';
  if (h >= 17 && h < 21) return 'dinner';
  return 'late';
}

type ThemeItem = (typeof THEME_POOL)[number];

// 홈 화면 전용 레벨 계산 — 상한선 없이 계속 올라가도록 설계
function calculateLevel(exp: number): { level: number; title: string; nextExp: number } {
  const safeExp = Number.isFinite(exp) && exp > 0 ? exp : 0;

  if (safeExp < 50) return { level: 1, title: '요리 초급', nextExp: 50 };
  if (safeExp < 150) return { level: 2, title: '견습 요리사', nextExp: 150 };
  if (safeExp < 500) return { level: 3, title: '수석 셰프', nextExp: 500 };

  // 500 EXP 이후에는 200 EXP마다 레벨이 1씩 올라가는 구조 (예: 500=4레벨 시작)
  const extraExp = safeExp - 500;
  const extraLevels = Math.floor(extraExp / 200) + 1; // 1부터 시작
  const level = 3 + extraLevels;
  const nextExp = 500 + extraLevels * 200;

  return { level, title: '마스터 셰프', nextExp };
}

export default function HomeScreen() {
  const router = useRouter();
  const [userName, setUserName] = useState('셰프');
  const [userExp, setUserExp] = useState(0);
  const [equippedTitle, setEquippedTitle] = useState<string | null>(null);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [recommendedThemes, setRecommendedThemes] = useState<typeof THEME_POOL>([]);
  // 테마 재료 입력 모달
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [selectedThemeForModal, setSelectedThemeForModal] = useState<ThemeItem | null>(null);
  const [themeModalIngredients, setThemeModalIngredients] = useState<string[]>([]);
  const [themeModalInput, setThemeModalInput] = useState('');
  const [useSettingsCondiments, setUseSettingsCondiments] = useState(true);
  const [savedCondiments, setSavedCondiments] = useState<string[]>([]);

  useEffect(() => {
    const checkLegalAgreement = async () => {
      try {
        const hasAgreed = await AsyncStorage.getItem('cookdex_legal_agreed');
        if (hasAgreed !== 'true') setShowLegalModal(true);
      } catch (e) {}
    };
    checkLegalAgreement();
  }, []);

  const handleAgreeLegal = async () => {
    try {
      await AsyncStorage.setItem('cookdex_legal_agreed', 'true');
      setShowLegalModal(false);
    } catch (e) {}
  };

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        try {
          const currentUser = auth.currentUser;
          if (currentUser?.displayName) setUserName(currentUser.displayName);
          else if (currentUser?.email) setUserName(currentUser.email.split('@')[0] || '셰프');

          const dietRaw = await AsyncStorage.getItem('cookdex_diet_goal');
          const allergiesRaw = await AsyncStorage.getItem('cookdex_allergies');
          let dietList: string[] = [];
          try {
            if (dietRaw && dietRaw !== '없음') dietList = JSON.parse(dietRaw);
          } catch (_) {}
          const hasAllergies = allergiesRaw && allergiesRaw !== '없음';
          const timeSlot = getTimeSlot();

          const scored = THEME_POOL.map((t) => {
            let score = 0;
            if (t.dietTags?.some((tag) => dietList.includes(tag))) score += 3;
            if (t.timeSlot === timeSlot) score += 2;
            if (t.id === 'allergy' && hasAllergies) score += 2;
            if (!t.dietTags && !t.timeSlot && t.id !== 'allergy') score += 1;
            return { ...t, score };
          });
          const sorted = scored.sort((a, b) => b.score - a.score);
          const top = sorted.slice(0, 6);
          setRecommendedThemes(top.length > 0 ? top : THEME_POOL.slice(0, 6));

          const expRaw = await AsyncStorage.getItem('cookdex_user_exp');
          const currentExp = expRaw ? parseInt(expRaw, 10) : 0;
          setUserExp(Number.isNaN(currentExp) ? 0 : currentExp);

          const savedTitle = await AsyncStorage.getItem('cookdex_equipped_title');
          setEquippedTitle(savedTitle || null);
        } catch (e) {}
      };
      load();
    }, [])
  );

  const goCreateRecipe = (theme?: string) => {
    if (theme) router.push({ pathname: '/create-recipe', params: { directStyle: theme } });
    else router.push('/create-recipe');
  };

  const openThemeModal = (theme: ThemeItem) => {
    setSelectedThemeForModal(theme);
    setThemeModalIngredients([]);
    setThemeModalInput('');
    setThemeModalVisible(true);
    AsyncStorage.getItem('cookdex_condiments')
      .then((raw) => {
        const list = raw ? JSON.parse(raw) : [];
        setSavedCondiments(Array.isArray(list) ? list : []);
      })
      .catch(() => setSavedCondiments([]));
  };

  const closeThemeModal = () => {
    setThemeModalVisible(false);
    setSelectedThemeForModal(null);
    setThemeModalIngredients([]);
    setThemeModalInput('');
  };

  const toggleThemeModalIngredient = (ing: string) => {
    if (themeModalIngredients.includes(ing)) {
      setThemeModalIngredients((prev) => prev.filter((i) => i !== ing));
    } else {
      setThemeModalIngredients((prev) => [...prev, ing]);
    }
  };

  const addThemeModalCustomIngredient = () => {
    const v = themeModalInput.trim();
    if (v && !themeModalIngredients.includes(v)) {
      setThemeModalIngredients((prev) => [...prev, v]);
      setThemeModalInput('');
    }
  };

  const submitThemeRecommend = () => {
    if (!selectedThemeForModal) return;
    const withSettings = useSettingsCondiments ? savedCondiments : [];
    const merged = [...new Set([...withSettings, ...themeModalIngredients])];
    if (merged.length === 0) {
      Alert.alert('알림', '재료를 1개 이상 추가하거나, 설정 재료를 포함해 주세요.');
      return;
    }
    closeThemeModal();
    router.push({
      pathname: '/create-recipe',
      params: { directStyle: selectedThemeForModal.keyword, directIngredients: merged.join(',') },
    });
    (async () => {
      try {
        const logRaw = await AsyncStorage.getItem('cookdex_theme_used_log');
        const log = logRaw ? JSON.parse(logRaw) : [];
        log.push({ themeId: selectedThemeForModal.id, ts: Date.now() });
        await AsyncStorage.setItem('cookdex_theme_used_log', JSON.stringify(log.slice(-100)));
      } catch (_) {}
    })();
  };

  const goToScannerForTheme = () => {
    if (!selectedThemeForModal) return;
    closeThemeModal();
    router.push({
      pathname: '/scanner',
      params: { themeKeyword: selectedThemeForModal.keyword, themeTitle: selectedThemeForModal.title },
    });
  };

  const goQuickMenu = (target: string) => {
    if (target === 'create') goCreateRecipe();
    else if (target === 'recipes') router.push('/(tabs)/recipes');
    else if (target === 'quest') router.push('/(tabs)/quest');
    else if (target === 'benefits') router.push('/(tabs)/benefits');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Modal visible={showLegalModal} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.legalOverlay}>
          <View style={styles.legalContent}>
            <Text style={styles.legalTitle}>쿡덱스 서비스 이용 동의</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.legalScroll}>
              <Text style={styles.legalIntro}>AI 셰프 쿡덱스를 이용하기 전, 아래 내용을 확인해 주세요.</Text>
              <View style={styles.legalPoint}>
                <Text style={styles.legalPointTitle}>1. 조리 및 위생 주의</Text>
                <Text style={styles.legalPointDesc}>AI가 제안하는 조리 시간·온도는 참고용입니다. 고기·해산물 등은 충분히 익혀 드세요.</Text>
              </View>
              <View style={styles.legalPoint}>
                <Text style={styles.legalPointTitle}>2. 알레르기 확인 의무</Text>
                <Text style={styles.legalPointDesc}>레시피에 알레르기 유발 재료가 없는지 조리 전에 반드시 확인하세요.</Text>
              </View>
              <View style={styles.legalPoint}>
                <Text style={styles.legalPointTitle}>3. AI 할루시네이션 주의</Text>
                <Text style={styles.legalPointDesc}>AI가 비식재료를 식재료로 착각할 수 있습니다. 비식재료는 절대 취식하지 마세요.</Text>
              </View>
              <Text style={styles.legalFooter}>위 사항 무시로 인한 피해에 대해 앱 개발자는 법적 책임을 지지 않습니다.</Text>
            </ScrollView>
            <TouchableOpacity style={styles.legalAgreeBtn} onPress={handleAgreeLegal}>
              <Text style={styles.legalAgreeBtnText}>동의합니다</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 테마 재료 입력 모달 — 설정(식재료·알레르기) 반영 후 N가지 추천 */}
      <Modal visible={themeModalVisible} transparent animationType="slide" onRequestClose={closeThemeModal}>
        <TouchableWithoutFeedback onPress={closeThemeModal}>
          <View style={styles.themeModalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.themeModalContent}>
            <View style={styles.themeModalHeader}>
              <TouchableOpacity onPress={closeThemeModal} hitSlop={12}>
                <Text style={styles.themeModalClose}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.themeModalTitle} numberOfLines={1}>
                {selectedThemeForModal?.title}으로 추천받기
              </Text>
              <View style={{ width: 28 }} />
            </View>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <ScrollView style={styles.themeModalScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.themeModalRow}>
                  <Text style={styles.themeModalLabel}>설정 재료 포함</Text>
                  <Switch
                    value={useSettingsCondiments}
                    onValueChange={setUseSettingsCondiments}
                    trackColor={{ false: Colors.border, true: Colors.primarySoft }}
                    thumbColor={useSettingsCondiments ? Colors.primary : Colors.textSub}
                  />
                </View>
                {useSettingsCondiments && savedCondiments.length > 0 && (
                  <Text style={styles.themeModalHint}>보유 양념/재료: {savedCondiments.slice(0, 5).join(', ')}{savedCondiments.length > 5 ? ' 외 ' + (savedCondiments.length - 5) + '개' : ''}</Text>
                )}
                <TouchableOpacity style={styles.themeModalCameraBtn} onPress={goToScannerForTheme}>
                  <Text style={styles.themeModalCameraText}>📷 카메라로 재료 스캔하기</Text>
                </TouchableOpacity>
                <Text style={styles.themeModalLabel}>직접 입력하여 레시피 만들기</Text>
                <View style={styles.themeModalChipWrap}>
                  {THEME_MODAL_INGREDIENTS.slice(0, 5).map((ing) => (
                    <TouchableOpacity
                      key={ing}
                      style={[styles.themeModalChip, themeModalIngredients.includes(ing) && styles.themeModalChipActive]}
                      onPress={() => toggleThemeModalIngredient(ing)}
                    >
                      <Text style={[styles.themeModalChipText, themeModalIngredients.includes(ing) && styles.themeModalChipTextActive]}>{ing}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.themeModalInputRow}>
                  <TextInput
                    style={styles.themeModalInput}
                    placeholder="재료 직접 입력 (예: 굴소스)"
                    placeholderTextColor={Colors.textSub}
                    value={themeModalInput}
                    onChangeText={setThemeModalInput}
                    onSubmitEditing={addThemeModalCustomIngredient}
                  />
                  <TouchableOpacity style={styles.themeModalAddBtn} onPress={addThemeModalCustomIngredient}>
                    <Text style={styles.themeModalAddBtnText}>추가</Text>
                  </TouchableOpacity>
                </View>
                {themeModalIngredients.length > 0 && (
                  <View style={styles.themeModalSelectedWrap}>
                    {themeModalIngredients.map((ing) => (
                      <TouchableOpacity key={ing} style={styles.themeModalSelectedChip} onPress={() => toggleThemeModalIngredient(ing)}>
                        <Text style={styles.themeModalSelectedText}>{ing} ✕</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <TouchableOpacity style={styles.themeModalSubmitBtn} onPress={submitThemeRecommend}>
                  <Text style={styles.themeModalSubmitText}>3가지 레시피 추천받기</Text>
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <View style={styles.screenWrap}>
        {/* 1층: 메인 그라데이션 (상단 오렌지 톤) */}
        <LinearGradient
          colors={[Colors.primarySoft, Colors.bgMain, Colors.bgMain]}
          locations={[0, 0.35, 1]}
          style={StyleSheet.absoluteFill}
        />
        {/* 2층: 메쉬 느낌 — 우하단 민트/피치 톤 */}
        <LinearGradient
          colors={[Colors.meshMint, 'transparent', Colors.meshPeach]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* 3층: 은은한 노이즈 질감 (배경 깊이감) */}
        <View style={styles.bgNoise} pointerEvents="none" />
        <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* 포털 헤더 */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.logo}>CookDex</Text>
                <View style={styles.greetingRow}>
                  <Text style={styles.greeting}>{userName}님 어서오세요!</Text>
                  {equippedTitle && (
                    <View style={styles.titlePill}>
                      <Text style={styles.titlePillText}>{equippedTitle}</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.headerRight}>
                {(() => {
                  const levelInfo = calculateLevel(userExp);
                  const progressPercent = Math.max(
                    0,
                    Math.min(100, Math.round((userExp / levelInfo.nextExp) * 100)),
                  );
                  return (
                    <View style={styles.levelBadgeWrap}>
                      <View style={styles.levelBadgeOuter}>
                        <View style={styles.levelBadgeRing} />
                        <View style={styles.levelBadgeInner}>
                          <Text style={styles.levelLabel}>Lv</Text>
                          <Text style={styles.levelNumber}>
                            {levelInfo.level}
                          </Text>
                        </View>
                        <View style={styles.levelCrown}>
                          <Text style={styles.levelCrownText}>👑</Text>
                        </View>
                      </View>
                    </View>
                  );
                })()}
              </View>
            </View>

            {/* 검색창 */}
            <TouchableOpacity style={[styles.searchBar, styles.glassCard]} activeOpacity={0.9} onPress={() => goCreateRecipe()}>
              <Text style={styles.searchPlaceholder}>재료나 요리명 검색 · AI 레시피 만들기</Text>
            </TouchableOpacity>

            {/* 오늘 냉장고 파먹기 (메인 CTA) — 배경 이미지 + 가독성 오버레이 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>오늘 냉장고 파먹기</Text>
              <View style={styles.heroCtaShadowDiffused}>
                <Squishable style={[styles.heroCtaTouch, styles.heroCtaShadowTight]} onPress={() => goCreateRecipe()}>
                  <View style={[styles.heroCtaInner, GlassHighlight]}>
                    <ImageBackground
                      source={HERO_BG_IMAGE}
                      style={StyleSheet.absoluteFill}
                      imageStyle={styles.heroCtaBgImage}
                      resizeMode="cover"
                    />
                    <View style={styles.heroCtaOverlay} />
                    <View style={styles.heroCta}>
                      <View style={styles.heroCtaIconWrap}>
                        <MaterialCommunityIcons name="fridge-outline" size={28} color={Colors.textInverse} />
                      </View>
                      <View style={styles.heroCtaTextWrap}>
                        <Text style={styles.heroCtaTitle}>냉장고 파먹기 시작!</Text>
                        <Text style={styles.heroCtaSub}>재료만 알려주면 AI가 레시피를 만들어요</Text>
                      </View>
                    </View>
                  </View>
                </Squishable>
              </View>
            </View>

            {/* 퀵 메뉴 — 스퀴시 + 글래스, 2개씩 2열 배치 */}
            <View style={styles.quickMenuUnderHero}>
              <View style={styles.quickMenuRow}>
                {QUICK_MENU.slice(0, 2).map((item) => (
                  <Squishable
                    key={item.id}
                    fill
                    style={[styles.heroCtaSmallTouch, styles.heroCtaSmallShadowTight]}
                    onPress={() => goQuickMenu(item.onPress)}
                  >
                    <View style={[styles.heroCtaSmallInner, GlassHighlight]}>
                      <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />
                      <LinearGradient
                        colors={[item.color, Colors.bgElevated]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.heroCtaSmall}>
                        <View style={[styles.heroCtaSmallIconWrap, styles.heroCtaSmallIconWrapTinted]}>
                          <Ionicons name={item.icon} size={20} color={Colors.textMain} />
                        </View>
                        <Text style={styles.heroCtaSmallTitleTinted} numberOfLines={2}>{item.label}</Text>
                      </View>
                    </View>
                  </Squishable>
                ))}
              </View>
              <View style={styles.quickMenuRow}>
                {QUICK_MENU.slice(2, 3).map((item) => (
                  <Squishable
                    key={item.id}
                    fill
                    style={[styles.heroCtaSmallTouch, styles.heroCtaSmallShadowTight]}
                    onPress={() => goQuickMenu(item.onPress)}
                  >
                    <View style={[styles.heroCtaSmallInner, GlassHighlight]}>
                      <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />
                      <LinearGradient
                        colors={[item.color, Colors.bgElevated]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.heroCtaSmall}>
                        <View style={[styles.heroCtaSmallIconWrap, styles.heroCtaSmallIconWrapTinted]}>
                          <Ionicons name={item.icon} size={20} color={Colors.textMain} />
                        </View>
                        <Text style={styles.heroCtaSmallTitleTinted} numberOfLines={2}>{item.label}</Text>
                      </View>
                    </View>
                  </Squishable>
                ))}
                <View style={styles.quickMenuPlaceholder} />
              </View>
            </View>

          {/* 테마별 레시피 — 카드형 좌우 슬라이드 + Unsplash 이미지 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>나에게 맞는 테마</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.themeCardScroll}
              snapToInterval={THEME_CARD_SNAP}
              snapToAlignment="start"
              decelerationRate="fast"
            >
              {recommendedThemes.slice(0, 6).map((theme) => (
                <TouchableOpacity
                  key={theme.id}
                  style={[styles.themeCard, { width: THEME_CARD_WIDTH, marginRight: THEME_CARD_MARGIN }]}
                  activeOpacity={0.95}
                  onPress={() => openThemeModal(theme)}
                >
                  <ImageBackground
                    source={{ uri: theme.imageUri }}
                    style={styles.themeCardImage}
                    imageStyle={styles.themeCardImageStyle}
                    resizeMode="cover"
                  >
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.7)']}
                      style={styles.themeCardGradient}
                    />
                    <Text style={styles.themeCardTitle}>{theme.title}</Text>
                  </ImageBackground>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgMain,
  },
  screenWrap: { flex: 1 },
  bgNoise: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 25, 23, 0.02)',
  },
  keyboardView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 48,
  },
  glassCard: {
    backgroundColor: Colors.glassBg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.glass,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerLeft: {
    flexShrink: 1,
    paddingRight: 12,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  logo: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.primary,
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  titlePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primarySoft,
  },
  titlePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  greeting: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textSub,
  },
  levelBadgeWrap: {
    alignItems: 'center',
    gap: 4,
  },
  levelBadgeOuter: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelBadgeRing: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 5,
    // EXP 바 트랙 — 옅은 주황
    borderColor: '#FED7AA',
  },
  levelBadgeInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    // 옅은 주황 배경
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: 'rgba(253,186,116,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 0,
    position: 'relative',
  },
  levelCrown: {
    position: 'absolute',
    top: -12,
    left: '50%',
    transform: [{ translateX: -10 }],
    zIndex: 2,
  },
  levelCrownText: {
    fontSize: 18,
  },
  levelNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
    position: 'absolute',
    bottom: 3,
  },
  levelLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
    opacity: 0.8,
    position: 'absolute',
    top: 4,
  },
  searchBar: {
    height: 52,
    borderRadius: Radius.lg,
    paddingHorizontal: 20,
    justifyContent: 'center',
    marginBottom: 24,
  },
  searchPlaceholder: {
    fontSize: 15,
    color: Colors.textSub,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textMain,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  clayChipWrap: {
    alignItems: 'center',
    minWidth: 72,
  },
  clayChipIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    ...Shadows.clay,
  },
  clayChipLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMain,
    textAlign: 'center',
    lineHeight: 14,
  },
  heroCtaShadowDiffused: {
    ...Shadows.glassDiffused,
  },
  heroCtaTouch: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  heroCtaShadowTight: {
    ...Shadows.glassTight,
  },
  heroCtaInner: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    minHeight: 88,
  },
  heroCtaBgImage: {
    borderRadius: Radius.lg,
  },
  heroCtaOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    borderRadius: Radius.lg,
  },
  heroCta: {
    borderRadius: Radius.lg,
    paddingVertical: 24,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  heroCtaIconWrap: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.clayInner,
  },
  heroCtaTextWrap: { flex: 1 },
  heroCtaTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textInverse,
    marginBottom: 6,
  },
  heroCtaSub: {
    fontSize: 14,
    color: Colors.textInverse,
    opacity: 0.95,
  },
  quickMenuUnderHero: {
    marginBottom: 24,
    gap: 10,
  },
  quickMenuRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickMenuPlaceholder: {
    flex: 1,
    minHeight: 60,
  },
  heroCtaSmallTouch: {
    flex: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  heroCtaSmallShadowTight: {
    ...Shadows.glassTight,
  },
  heroCtaSmallInner: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    minHeight: 60,
  },
  heroCtaSmall: {
    borderRadius: Radius.md,
    paddingVertical: 18,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 60,
  },
  heroCtaSmallIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCtaSmallIconWrapTinted: {
    backgroundColor: 'rgba(28, 25, 23, 0.06)',
  },
  heroCtaSmallTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textInverse,
    lineHeight: 18,
  },
  heroCtaSmallTitleTinted: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMain,
    lineHeight: 18,
  },
  themeCardScroll: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  themeCard: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...Shadows.glass,
  },
  themeCardImage: {
    width: '100%',
    aspectRatio: 1.22,
    justifyContent: 'flex-end',
  },
  themeCardImageStyle: {
    borderRadius: Radius.lg,
  },
  themeCardGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
    borderRadius: Radius.lg,
  },
  themeCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textInverse,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 24,
  },
  legalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  legalContent: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: Colors.bgModal,
    borderRadius: Radius.lg,
    padding: 24,
    ...Shadows.soft,
  },
  legalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.danger,
    textAlign: 'center',
    marginBottom: 16,
  },
  legalScroll: { marginBottom: 16 },
  legalIntro: {
    fontSize: 14,
    color: Colors.textMain,
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 20,
  },
  legalPoint: {
    backgroundColor: Colors.bgMuted,
    padding: 14,
    borderRadius: Radius.md,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  legalPointTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.danger,
    marginBottom: 6,
  },
  legalPointDesc: {
    fontSize: 13,
    color: Colors.textMain,
    lineHeight: 20,
  },
  legalFooter: {
    fontSize: 12,
    color: Colors.textSub,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  legalAgreeBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: Radius.md,
    alignItems: 'center',
    ...Shadows.glow,
  },
  legalAgreeBtnText: {
    color: Colors.textInverse,
    fontSize: 16,
    fontWeight: '800',
  },
  themeModalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
    justifyContent: 'flex-end',
  },
  themeModalContent: {
    backgroundColor: Colors.bgModal,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    height: '82%',
    maxHeight: '82%',
    paddingBottom: 24,
  },
  themeModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  themeModalClose: { fontSize: 22, color: Colors.textSub, padding: 4 },
  themeModalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textMain, flex: 1, textAlign: 'center' },
  themeModalScroll: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  themeModalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  themeModalLabel: { fontSize: 15, fontWeight: '700', color: Colors.textMain, marginBottom: 10 },
  themeModalHint: { fontSize: 12, color: Colors.textSub, marginBottom: 12 },
  themeModalCameraBtn: {
    backgroundColor: Colors.bgMuted,
    paddingVertical: 14,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  themeModalCameraText: { fontSize: 15, fontWeight: '600', color: Colors.textMain },
  themeModalChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  themeModalChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bgMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  themeModalChipActive: { backgroundColor: Colors.primarySoft, borderColor: Colors.primary },
  themeModalChipText: { fontSize: 13, fontWeight: '600', color: Colors.textMain },
  themeModalChipTextActive: { color: Colors.primary },
  themeModalInputRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  themeModalInput: {
    flex: 1,
    backgroundColor: Colors.bgMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.textMain,
  },
  themeModalAddBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    borderRadius: Radius.md,
    justifyContent: 'center',
  },
  themeModalAddBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: 14 },
  themeModalSelectedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  themeModalSelectedChip: {
    backgroundColor: Colors.primarySoft,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
  },
  themeModalSelectedText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  themeModalSubmitBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: Radius.lg,
    alignItems: 'center',
    ...Shadows.glow,
  },
  themeModalSubmitText: { color: Colors.textInverse, fontSize: 16, fontWeight: '800' },
});
