import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadows } from '../../constants/design-tokens';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../firebaseConfig';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, interpolate } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const calculateLevel = (exp: number) => {
  if (exp < 50) return { level: 1, title: "🍳 요리 쪼렙", nextExp: 50, grade: 'Bronze' };
  if (exp < 150) return { level: 2, title: "🔪 견습 요리사", nextExp: 150, grade: 'Silver' };
  if (exp < 500) return { level: 3, title: "👨‍🍳 수석 셰프", nextExp: 500, grade: 'Gold' };
  return { level: 'MAX', title: "👑 마스터 셰프", nextExp: exp, grade: 'Holo' };
};

const GRADE_COLORS = {
  Bronze: ['#FDF9F6', '#EFE5DD', '#E5D5C9'],
  Silver: ['#F8F9FA', '#E9EDF2', '#DEE4EA'],
  Gold: ['#FFFCF5', '#F8EAC9', '#F2DBA7'],
  Holo: ['#FCF8FF', '#F3E8FE', '#E6F0FF']
};

const ARCHIVE_CATEGORIES = [
  { id: 'category_kr', title: '한식', icon: '🍚', unlocked: 8, total: 30, accentColor: '#FF8C00' },
  { id: 'category_cn', title: '중식', icon: '🥢', unlocked: 3, total: 25, accentColor: '#E53935' },
  { id: 'category_wt', title: '양식', icon: '🍝', unlocked: 5, total: 20, accentColor: '#43A047' },
  { id: 'category_jp', title: '일식', icon: '🍣', unlocked: 2, total: 15, accentColor: '#F44336' },
  { id: 'category_bk', title: '베이킹', icon: '🍰', unlocked: 1, total: 12, accentColor: '#AB47BC' },
];

// 환형 도넷 차트 컴포넌트 (react-native-svg)
function DonutChart({ unlocked, total, accentColor, size = 56 }: { unlocked: number; total: number; accentColor: string; size?: number }) {
  const radius = size / 2 - 6;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? unlocked / total : 0;
  const strokeDashoffset = circumference * (1 - progress);
  return (
    <View style={{ width: size, height: size, ...Shadows.soft }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* 배경 트랙 */}
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          strokeWidth={6} stroke={Colors.primarySoft} fill="none"
          strokeLinecap="round"
        />
        {/* 활성 스트로크 */}
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          strokeWidth={6} stroke={accentColor} fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 9, fontWeight: '800', color: accentColor }}>{Math.round(progress * 100)}%</Text>
      </View>
    </View>
  );
}

// ====================================================================
// 🛍️ 별사탁 경제 시스템 — 스킨 카탈로그
// ====================================================================
export const SKIN_CATALOG = [
  {
    id: 'skin_default',
    name: '퓨어 화이트',
    price: 0,
    colors: ['#FFFFFF', '#F5F5F7'] as [string, string, ...string[]],
    condition: null, // 모두 무료
  },
  {
    id: 'skin_midnight',
    name: '미드나이트 블랙',
    price: 800,
    colors: ['#1A1A2E', '#16213E', '#0F3460'] as [string, string, ...string[]],
    condition: null,
  },
  {
    id: 'skin_golden',
    name: '골든아워',
    price: 2500,
    colors: ['#F7971E', '#FFD200', '#F7971E'] as [string, string, ...string[]],
    condition: '미라클 모닝 셰프', // 원래 칭호 조건
  },
] as const;

export type SkinId = typeof SKIN_CATALOG[number]['id'];

/**
 * 배경색 밝기(YIQ 공식)를 계산하여 텍스트를 기본 흑/흰으로 자동 스위칭합니다.
 * YIQ 공식 참고: https://www.w3.org/TR/AERT/#color-contrast
 */
export function getContrastYIQ(hexColor: string): '#1C1917' | '#FFFFFF' {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#1C1917' : '#FFFFFF';
}

/**
 * [기획 가이드 반영] 데이터 수집/생성 시 브랜드명 및 인명 무단 사용 방지용 필터 뼈대
 */
const filterTitleForSafety = (title: string): string => {
  if (!title) return title;
  let cleaned = title;
  cleaned = cleaned.replace(/스팸/g, '프레스햄');
  cleaned = cleaned.replace(/너구리/g, '해물라면');
  cleaned = cleaned.replace(/백종원의/g, '셰프의 초간단');
  cleaned = cleaned.replace(/백종원/g, '유명 셰프');
  return cleaned;
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

  // 🎮 게이미피케이션 상태
  const [equippedTitle, setEquippedTitle] = useState("요리 초급");
  const [unlockedTitles, setUnlockedTitles] = useState(["요리 초급"]);
  const [titleModalVisible, setTitleModalVisible] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isExpBuffActive, setIsExpBuffActive] = useState(false);
  const [mockAdPlaying, setMockAdPlaying] = useState(false);
  const [adCountdown, setAdCountdown] = useState(3);

  // 구독 모델 상태
  const [plusModalVisible, setPlusModalVisible] = useState(false);

  // 셰프 카드 상점 모달 및 별사탕 경제 상태
  const [skinShopVisible, setSkinShopVisible] = useState(false);
  // 🍬 별사탕: 일일 출석+50, 레시피 광장 공유+100, 레벨업 시 레벨*20 지급 (뼈대)
  const [starCandy, setStarCandy] = useState(1500); // Mock 초기값
  const [ownedSkins, setOwnedSkins] = useState<SkinId[]>(['skin_default']);
  const [equippedSkin, setEquippedSkin] = useState<SkinId>('skin_default');
  const [previewSkin, setPreviewSkin] = useState<SkinId>('skin_default'); // 상점 내 미리보기 스킨

  // 식단, 알러지, 양념장 태그용 상태 (하단 섹션 C)
  const [userTags, setUserTags] = useState<string[]>([]);

  // 3D 플립 상태
  const flipProgress = useSharedValue(0);
  const [isFlippedState, setIsFlippedState] = useState(false);

  const toggleFlip = () => {
    const nextState = !isFlippedState;
    setIsFlippedState(nextState);
    // withSpring은 물리 엔진 특성상 소수점 정착 오차가 있을 수 있으므로 상태 불리언을 주축으로 타겟을 지정합니다.
    flipProgress.value = withSpring(nextState ? 1 : 0, { damping: 15, stiffness: 120 });
  };

  const currentLevelInfo = calculateLevel(userExp);
  const currentGrade = currentLevelInfo.grade as keyof typeof GRADE_COLORS;

  // 현재 장착된 스킨의 그라데이션 컬러 반환
  const getSkinColors = (skinId: SkinId): [string, string, ...string[]] => {
    const skin = SKIN_CATALOG.find(s => s.id === skinId);
    return skin ? skin.colors as [string, string, ...string[]] : SKIN_CATALOG[0].colors as [string, string, ...string[]];
  };

  // YIQ 기반 텍스트 대비 색 (장착 스킨 기준)
  const cardTextColor = getContrastYIQ(getSkinColors(equippedSkin)[0]);
  // 상점 미리보기 텍스트 대비 색
  const previewTextColor = getContrastYIQ(getSkinColors(previewSkin)[0]);

  // 🍬 별사탕 구매 트랜잭션
  const handlePurchaseSkin = async (skin: typeof SKIN_CATALOG[number]) => {
    if (ownedSkins.includes(skin.id as SkinId)) {
      // 이미 보유 → 장착
      setEquippedSkin(skin.id as SkinId);
      setPreviewSkin(skin.id as SkinId);
      await AsyncStorage.setItem('cookdex_equipped_skin', skin.id);
      setSkinShopVisible(false);
      return;
    }
    if (skin.price === 0) {
      setOwnedSkins(prev => [...prev, skin.id as SkinId]);
      setEquippedSkin(skin.id as SkinId);
      setPreviewSkin(skin.id as SkinId);
      await AsyncStorage.setItem('cookdex_equipped_skin', skin.id);
      setSkinShopVisible(false);
      return;
    }
    if (starCandy < skin.price) {
      Alert.alert('별사탕 부족 🍬', `별사탕 잔액이 부족합니다!\n필요: ${skin.price}🍬, 보유: ${starCandy}🍬`);
      return;
    }
    Alert.alert(
      '구매 확인',
      `${skin.name}을 ${skin.price}🍬으로 구매하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        { text: '구매', onPress: async () => {
          const newCandy = starCandy - skin.price;
          setStarCandy(newCandy);
          setOwnedSkins(prev => [...prev, skin.id as SkinId]);
          setEquippedSkin(skin.id as SkinId);
          setPreviewSkin(skin.id as SkinId);
          // AsyncStorage 저장 (뼈대 — Firestore economy.star_candy 연동 예정)
          await AsyncStorage.setItem('cookdex_star_candy', newCandy.toString());
          await AsyncStorage.setItem('cookdex_equipped_skin', skin.id);
          await AsyncStorage.setItem('cookdex_owned_skins', JSON.stringify([...ownedSkins, skin.id]));
          setSkinShopVisible(false);
        }},
      ]
    );
  };

  const cardFrontFaceStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [0, 180]);
    const zIndex = flipProgress.value < 0.5 ? 2 : 0;
    return {
      backfaceVisibility: 'hidden',
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
      zIndex,
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
    };
  });

  const cardBackFaceStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [-180, 0]);
    const zIndex = flipProgress.value >= 0.5 ? 2 : 0;
    return {
      backfaceVisibility: 'hidden',
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
      zIndex,
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
    };
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (isInitializing) setIsInitializing(false);
    });
    return unsubscribe;
  }, [isInitializing]);

  const checkAndUnlockTitles = useCallback(async (newTitle: string, currentUnlocked: string[]) => {
    if (Array.isArray(currentUnlocked) && !currentUnlocked.includes(newTitle)) {
      const updatedTitles = [...currentUnlocked, newTitle];
      setUnlockedTitles(updatedTitles);
      await AsyncStorage.setItem('cookdex_unlocked_titles', JSON.stringify(updatedTitles));
      Alert.alert("새로운 칭호 획득", `[${newTitle}] 칭호가 해금되었습니다. 장착해보세요.`);
    }
  }, []); // <-- This was missing, closing the useCallback and its dependency array.

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  const handleEquipTitle = async (title: string) => {
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

          // ⚙️ 설정값 로드 (하단 태그 섹션용)
          const allTags: string[] = [];
          const savedDiet = await AsyncStorage.getItem('cookdex_diet_goal');
          if (savedDiet && savedDiet !== "없음" && savedDiet !== "[]") {
            allTags.push(...JSON.parse(savedDiet));
          }
          const savedAllergies = await AsyncStorage.getItem('cookdex_allergies');
          if (savedAllergies && savedAllergies !== "없음") {
            allTags.push(...savedAllergies.split(', '));
          }
          setUserTags(allTags.slice(0, 5)); // 최대 5개까지만 축약 표시
        } catch (error) {}
      };
      loadProfileData();
    }, [user, checkAndUnlockTitles])
  );

  const handleLogin = async () => { if (!email || !password) return; setIsLoginLoading(true); try { await signInWithEmailAndPassword(auth, email, password); } catch (e: unknown) { Alert.alert("로그인 실패", "확인해주세요."); } finally { setIsLoginLoading(false); } };
  
  const handleSignUp = async () => { 
    if (!email || !password) return; 
    
    // 이메일에 비속어/욕설이 포함되어 있는지 간이 검사 (닉네임 대용)
    const BAD_WORDS = ["시발", "씨발", "병신", "개새끼", "좆", "지랄", "애미", "창녀", "새끼", "미친", "존나", "졸라"];
    const hasBadWord = BAD_WORDS.some(word => email.includes(word));
    if (hasBadWord) {
      Alert.alert("알림", "사용할 수 없는 단어가 포함되어 있습니다. 건전한 정보를 입력해주세요.");
      return;
    }

    setIsLoginLoading(true); 
    try { 
      await createUserWithEmailAndPassword(auth, email, password); 
    } catch (e: unknown) { 
      Alert.alert("실패", (e as Error).message); 
    } finally { 
      setIsLoginLoading(false); 
    } 
  };
  
  const handleLogout = async () => { try { await signOut(auth); setEmail(""); setPassword(""); } catch (e: unknown) {} };
  const handleSocialMock = (provider: string) => Alert.alert("준비 중", `${provider} 로그인은 앱스토어 심사 시점에 연동됩니다.`);

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

  const expProgress = currentLevelInfo.level === 'MAX' ? 100 : (userExp / currentLevelInfo.nextExp) * 100;

  // Mock 레시피 데이터 (하단 스크랩 섹션용)
  const MOCK_SCRAPS = [
    { id: '1', title: '황금 계란볶음밥', thumb: '🥚', likes: 1208 },
    { id: '2', title: '5분 컷 햄치즈토스트', thumb: '🥪', likes: 450 },
    { id: '3', title: '가라아게 마요덮밥', thumb: '🍗', likes: 89 },
    { id: '4', title: '매콤 달콤 라볶이', thumb: '🍜', likes: 2199 },
  ];

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
          <View style={styles.pageHeaderRow}>
            <Text style={styles.pageTitle}>내 정보</Text>
          </View>

          {/* 🎛️ 통합 대시보드 스택 (단일 구조 그림자) */}
          <View style={styles.dashboardWrapper}>
            {/* 3D 홀로그램 셰프 카드 */}
            <View style={styles.cardContainer}>
              <TouchableOpacity activeOpacity={0.9} onPress={toggleFlip} style={{ height: 180 }}>
              {/* 앞면: 셰프 정보 */}
              <Animated.View 
                pointerEvents={isFlippedState ? 'none' : 'auto'}
                style={[styles.threeDCard, cardFrontFaceStyle]}
              >
                <LinearGradient
                  colors={getSkinColors(equippedSkin)}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cardGradient}
                >
                  <View style={styles.cardGlassOverlay}>
                    {/* 카드 헤더: 좌측 빈 공간 + 우측 팔레트 버튼 */}
                    <View style={[styles.cardHeader, { justifyContent: 'flex-end' }]}>
                      <TouchableOpacity onPress={() => setSkinShopVisible(true)} style={styles.cardShopBtn}>
                        <Ionicons name="bag-handle-outline" size={22} color={cardTextColor} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.cardBody}>
                      <View style={styles.modernAvatarWrap}>
                        <Text style={[styles.modernAvatarText, { color: cardTextColor }]}>{(user?.email?.[0] || '?').toUpperCase()}</Text>
                        <View style={styles.modernAvatarBadge}>
                          <Text style={styles.modernAvatarBadgeText}>👑</Text>
                        </View>
                      </View>
                      <View style={{ flex: 1, marginLeft: 16 }}>
                        <Text style={[styles.cardTitle, { color: cardTextColor, opacity: 0.7 }]}>{equippedTitle}</Text>
                        <Text style={[styles.cardUserName, { color: cardTextColor }]}>{user?.email?.split('@')[0] || '익명'}</Text>
                        <Text style={[styles.cardUserLevel, { color: cardTextColor, opacity: 0.8 }]}>Lv.{currentLevelInfo.level}</Text>
                      </View>
                    </View>
                    <Ionicons name="sync-circle" size={24} color={cardTextColor} style={[styles.cardFlipIcon, { opacity: 0.4 }]} />
                  </View>
                </LinearGradient>
              </Animated.View>

              {/* 뒷면: 성장 기록/통계 */}
              <Animated.View 
                pointerEvents={isFlippedState ? 'box-none' : 'none'}
                style={[styles.threeDCard, cardBackFaceStyle]}
              >
                <LinearGradient
                  colors={getSkinColors(equippedSkin)}
                  start={{ x: 1, y: 1 }}
                  end={{ x: 0, y: 0 }}
                  style={styles.cardGradient}
                >
                  <View style={styles.cardGlassOverlay}>
                    {/* 뒷면: 헤더 아이콘 없음 */}
                    <View style={styles.cardHeader} />
                    <View style={styles.cardBackStats}>
                      <Text style={[styles.statsTitle, { color: cardTextColor }]}>📊 주방 활동 스탯</Text>
                      <View style={styles.statsRow}>
                        <Text style={[styles.statsLabel, { color: cardTextColor, opacity: 0.7 }]}>총 경험치</Text>
                        <Text style={[styles.statsValue, { color: cardTextColor }]}>{userExp} EXP</Text>
                      </View>
                      <View style={styles.statsRow}>
                        <Text style={[styles.statsLabel, { color: cardTextColor, opacity: 0.7 }]}>해금 칭호</Text>
                        <Text style={[styles.statsValue, { color: cardTextColor }]}>{unlockedTitles.length} 개</Text>
                      </View>
                      <View style={[styles.statsRow, { borderBottomWidth: 0 }]}>
                        <Text style={[styles.statsLabel, { color: cardTextColor, opacity: 0.7 }]}>선호 테마</Text>
                        <Text style={[styles.statsValue, { color: cardTextColor }]}>{userTags.length > 0 ? userTags[0] : '미설정'}</Text>
                      </View>
                    </View>
                    <Ionicons name="sync-circle" size={24} color={cardTextColor} style={[styles.cardFlipIcon, { opacity: 0.4 }]} />
                  </View>
                </LinearGradient>
              </Animated.View>
            </TouchableOpacity>
          </View>

          {/* 📊 미니 레벨 바 (셰프 카드와 자연스럽게 연결) */}
          <View style={styles.attachedLevelBar}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: 4, zIndex: 2 }}>
              <Text style={styles.attachedLevelText}>Lv.{currentLevelInfo.level} {currentLevelInfo.title.substring(2)}</Text>
              <Text style={styles.attachedExpText}>{expProgress.toFixed(0)}%</Text>
            </View>
            <View style={styles.attachedBarBg}>
              <View style={[styles.attachedBarFill, { width: `${expProgress}%` }]} />
            </View>
          </View>

          {/* 통합 퀵 메뉴 카드 (제작 / 후기 / 멤버스 포인트 느낌) */}
          <View style={styles.quickMenuCard}>
            <TouchableOpacity 
              style={styles.quickMenuItem} 
              onPress={() => router.push('/(tabs)/recipes')} 
              activeOpacity={0.7}
            >
              <View style={[styles.quickMenuIconBg, { backgroundColor: '#FFF5E5' }]}>
                <Ionicons name="restaurant" size={24} color="#FF9800" />
              </View>
              <Text style={styles.quickMenuLabel}>제작 레시피</Text>
            </TouchableOpacity>

            <View style={styles.quickMenuDivider} />

            <TouchableOpacity 
              style={styles.quickMenuItem} 
              onPress={() => Alert.alert("준비 중", "후기 남긴 레시피 목록은 추후 지원됩니다.")} 
              activeOpacity={0.7}
            >
              <View style={[styles.quickMenuIconBg, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="chatbubble-ellipses" size={24} color="#4CAF50" />
              </View>
              <Text style={styles.quickMenuLabel}>나의 후기</Text>
            </TouchableOpacity>

            <View style={styles.quickMenuDivider} />

            <TouchableOpacity 
              style={styles.quickMenuItem} 
              onPress={() => Alert.alert("준비 중", "보유 업적 및 뱃지 기능은 곧 업데이트 될 예정입니다!")} 
              activeOpacity={0.7}
            >
              <View style={[styles.quickMenuIconBg, { backgroundColor: '#E3F2FD' }]}>
                <Ionicons name="medal" size={24} color="#2196F3" />
              </View>
              <Text style={styles.quickMenuLabel}>칭호/뱃지</Text>
            </TouchableOpacity>
          </View>
          </View>


          {/* 섹션 B: 스크랩한 AI 레시피 (가로 스크롤 캐러셀) */}
          <View style={styles.dashboardSection}>
            <View style={styles.dashboardHeader}>
              <Text style={styles.dashboardTitle}>북마크한 레시피</Text>
              <TouchableOpacity><Text style={styles.dashboardActionText}>전체보기 ›</Text></TouchableOpacity>
            </View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingRight: 20 }}
            >
              {MOCK_SCRAPS.map((item) => (
                <TouchableOpacity key={item.id} style={styles.recipeCardItem} activeOpacity={0.8}>
                  <View style={styles.recipeCardThumb}>
                    <Text style={{ fontSize: 40 }}>{item.thumb}</Text>
                  </View>
                  <Text style={styles.recipeCardTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.recipeCardLikes}>❤️ {item.likes.toLocaleString()}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.recipeCardMoreItem}>
                <Ionicons name="add-circle" size={36} color={Colors.border} />
                <Text style={styles.recipeCardMoreText}>더 찾아보기</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* 섹션 C: 나의 주방 아이덴티티 태그 */}
          <View style={styles.dashboardSection}>
            <View style={styles.dashboardHeader}>
              <Text style={styles.dashboardTitle}>나의 주방 관심사</Text>
              <TouchableOpacity onPress={() => router.push('/settings')}><Text style={styles.dashboardActionText}>수정 ›</Text></TouchableOpacity>
            </View>
            <View style={styles.tagsContainer}>
              {userTags.length > 0 ? (
                userTags.map((tag, idx) => (
                  <View key={idx} style={styles.identityTag}>
                    <Text style={styles.identityTagText}>#{tag}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.identityTagEmpty}>
                  <Text style={styles.identityTagEmptyText}>아직 설정된 관심사가 없어요. 식단/알레르기 등을 등록해보세요!</Text>
                </View>
              )}
            </View>
          </View>

          {/* 🗄️ 도감 섹션 - SVG 도넷 차트 */}
          <View style={[styles.dashboardSection, { marginBottom: 60 }]}>
            <View style={styles.dashboardHeader}>
              <Text style={styles.dashboardTitle}>🗄️ 키친 도감</Text>
              <Text style={styles.dashboardActionText}>보유 {ARCHIVE_CATEGORIES.reduce((s, c) => s + c.unlocked, 0)} / {ARCHIVE_CATEGORIES.reduce((s, c) => s + c.total, 0)}</Text>
            </View>
            <View style={styles.donutGrid}>
              {ARCHIVE_CATEGORIES.map(cat => (
                <View key={cat.id} style={styles.donutCard}>
                  <DonutChart unlocked={cat.unlocked} total={cat.total} accentColor={cat.accentColor} size={80} />
                  <Text style={styles.donutCatIcon}>{cat.icon}</Text>
                  <Text style={styles.donutCatTitle}>{cat.title}</Text>
                  <Text style={styles.donutCatCount}>{cat.unlocked} / {cat.total}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 🎨 셰프 카드 코디미기 상점 바텀 시트 */}
      <Modal
        visible={skinShopVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setSkinShopVisible(false); setPreviewSkin(equippedSkin); }}
      >
        <TouchableOpacity
          style={styles.skinShopOverlay}
          activeOpacity={1}
          onPress={() => { setSkinShopVisible(false); setPreviewSkin(equippedSkin); }}
        >
          <View style={styles.skinShopSheet}>
            {/* 타이틀 및 별사탕 */}
            <View style={styles.skinShopHeader}>
              <Text style={styles.skinShopTitle}>🎨 셰프 카드 꽃디미기 상점</Text>
              <View style={styles.starCandyBadge}>
                <Text style={styles.starCandyText}>🍬 {starCandy.toLocaleString()}개</Text>
              </View>
            </View>

            {/* 3D 미리보기 카드 */}
            <View style={styles.skinPreviewWrap}>
              <LinearGradient
                colors={getSkinColors(previewSkin)}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.skinPreviewCard}
              >
                <View style={styles.skinPreviewInner}>
                  <Text style={[styles.skinPreviewName, { color: previewTextColor }]}>
                    {user?.email?.split('@')[0] ?? '셀프'} 셰프
                  </Text>
                  <Text style={[styles.skinPreviewSub, { color: previewTextColor, opacity: 0.7 }]}>
                    {SKIN_CATALOG.find(s => s.id === previewSkin)?.name ?? ''} 스킨
                  </Text>
                </View>
              </LinearGradient>
            </View>

            {/* 스킨 리스트 가로 스크롤 */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.skinListContainer}>
              {SKIN_CATALOG.map(skin => {
                const isOwned = ownedSkins.includes(skin.id as SkinId);
                const isEquipped = equippedSkin === skin.id;
                const isPreviewing = previewSkin === skin.id;
                return (
                  <TouchableOpacity
                    key={skin.id}
                    style={[styles.skinListItem, isPreviewing && styles.skinListItemActive]}
                    activeOpacity={0.85}
                    onPress={() => setPreviewSkin(skin.id as SkinId)}
                  >
                    <LinearGradient
                      colors={skin.colors as [string, string, ...string[]]}
                      style={styles.skinListPreview}
                    />
                    <Text style={styles.skinListName} numberOfLines={1}>{skin.name}</Text>
                    <Text style={styles.skinListPrice}>
                      {isOwned ? (isEquipped ? '✅ 장착중' : '장착하기') : skin.price === 0 ? '무료' : `${skin.price}🍬`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 구매/장착 버튼 */}
            <TouchableOpacity
              style={styles.skinActionBtn}
              activeOpacity={0.85}
              onPress={() => {
                const skin = SKIN_CATALOG.find(s => s.id === previewSkin);
                if (skin) handlePurchaseSkin(skin);
              }}
            >
              <Text style={styles.skinActionBtnText}>
                {ownedSkins.includes(previewSkin) ? '💋 이 스킨 장착하기' : `🛒 ${SKIN_CATALOG.find(s => s.id === previewSkin)?.price ?? 0}🍬으로 구매하기`}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
  
  modernProfileCard: { backgroundColor: 'transparent', paddingVertical: 10, paddingHorizontal: 10, marginBottom: 20 },
  modernAvatarWrap: { position: 'relative' },
  modernAvatarText: { width: 68, height: 68, borderRadius: 34, backgroundColor: Colors.primary, color: Colors.textInverse, fontSize: 28, fontWeight: 'bold', textAlign: 'center', lineHeight: 68, overflow: 'hidden' },
  modernAvatarBadge: { position: 'absolute', right: -2, bottom: -2, backgroundColor: '#fff', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  modernAvatarBadgeText: { fontSize: 13 },
  modernUserName: { fontSize: 24, fontWeight: '900', color: Colors.textMain, marginBottom: 4 },
  modernUserSub: { fontSize: 15, color: Colors.textSub, fontWeight: '500' },
  modernEditBtn: { padding: 8 },

  // 3D Card Styles
  dashboardWrapper: { width: '100%', backgroundColor: '#FFF', borderRadius: Radius.lg, ...Shadows.soft, marginBottom: 30 },
  cardContainer: { height: 180, marginBottom: 0, zIndex: 2 },
  threeDCard: { width: '100%', height: 180, borderRadius: Radius.lg, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  attachedLevelBar: { marginTop: -22, marginBottom: 0, backgroundColor: '#FFF', paddingTop: 32, paddingBottom: 11, paddingHorizontal: 16, borderTopWidth: 0, borderBottomWidth: 0, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)', zIndex: 1 },
  attachedLevelText: { color: '#3E2723', fontSize: 13, fontWeight: '800', letterSpacing: -0.2 },
  attachedExpText: { color: '#E25822', fontSize: 12, fontWeight: '800' },
  attachedBarBg: { width: '100%', height: 6, backgroundColor: '#F0E7E0', borderRadius: 3, overflow: 'hidden' },
  attachedBarFill: { height: '100%', backgroundColor: '#E25822', borderRadius: 3 },
  cardGradient: { flex: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  cardGlassOverlay: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', padding: 18, justifyContent: 'space-between' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardGradeText: { color: '#8A5A44', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, opacity: 0.8 },
  holoSparkle: { opacity: 0.6 },
  cardBody: { flexDirection: 'row', alignItems: 'center', flex: 1, marginBottom: 14 },
  cardTitle: { color: '#8A5A44', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  cardUserName: { color: '#3E2723', fontSize: 23, fontWeight: '900', marginBottom: 6, letterSpacing: -0.5 },
  cardUserLevel: { color: '#E25822', fontSize: 12, fontWeight: '800', backgroundColor: '#FFFDF9', paddingVertical: 3, paddingHorizontal: 10, borderRadius: Radius.pill, alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(226, 88, 34, 0.15)' },
  cardShopBtn: { padding: 4, right: -4 },
  cardFlipIcon: { position: 'absolute', bottom: 14, right: 14, opacity: 0.6 },
  cardBackStats: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingLeft: 20, paddingRight: 38, width: '100%', transform: [{ translateY: -8 }] },
  statsTitle: { color: '#3E2723', fontSize: 15, fontWeight: '900', marginTop: 22, marginBottom: 14, textAlign: 'center', letterSpacing: 0.5 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  statsLabel: { color: '#5D4037', fontSize: 13, fontWeight: '700', letterSpacing: -0.2 },
  statsValue: { color: '#E25822', fontSize: 13, fontWeight: '800' },

  quickMenuCard: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderBottomLeftRadius: Radius.lg, borderBottomRightRadius: Radius.lg, paddingVertical: 18, marginBottom: 0, borderWidth: 1, borderTopWidth: 0, borderColor: 'rgba(0,0,0,0.04)', marginTop: -1 },
  quickMenuItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  quickMenuIconBg: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  quickMenuLabel: { fontSize: 14, fontWeight: '700', color: Colors.textMain },
  quickMenuDivider: { width: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginVertical: 8 },

  // 하단 대시보드 공통 스타일
  dashboardSection: { marginBottom: 35 },
  dashboardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14, paddingHorizontal: 4 },
  dashboardTitle: { fontSize: 18, fontWeight: '800', color: Colors.textMain },
  dashboardActionText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  // 섹션 A: EXP 위젯
  expWidgetBox: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  expWidgetLevel: { fontSize: 15, fontWeight: 'bold', color: Colors.textMain },
  expWidgetValue: { fontSize: 13, fontWeight: '600', color: Colors.textSub },
  expWidgetBarBg: { width: '100%', height: 12, backgroundColor: '#F0EBE9', borderRadius: 6, overflow: 'hidden' },
  expWidgetBarFill: { height: '100%', backgroundColor: '#FF8C00', borderRadius: 6 },

  // 섹션 B: 레시피 캐러셀
  recipeCardItem: { width: 130 },
  recipeCardThumb: { width: 130, height: 130, borderRadius: 16, backgroundColor: '#FFF5F0', justifyContent: 'center', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)' },
  recipeCardTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textMain, marginBottom: 4 },
  recipeCardLikes: { fontSize: 12, fontWeight: '600', color: Colors.textSub },
  recipeCardMoreItem: { width: 130, height: 130, borderRadius: 16, backgroundColor: Colors.bgElevated, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  recipeCardMoreText: { fontSize: 13, fontWeight: '600', color: Colors.textSub, marginTop: 8 },

  // 섹션 C: 아이덴티티 태그
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  identityTag: { backgroundColor: 'rgba(255, 140, 0, 0.08)', paddingVertical: 8, paddingHorizontal: 16, borderRadius: Radius.pill, borderWidth: 1, borderColor: 'rgba(255, 140, 0, 0.15)' },
  identityTagText: { fontSize: 13, fontWeight: '700', color: '#E67E22' },
  identityTagEmpty: { backgroundColor: Colors.bgElevated, padding: 16, borderRadius: Radius.lg, width: '100%', alignItems: 'center' },
  identityTagEmptyText: { fontSize: 13, color: Colors.textSub },

  // Archive Grid Styles (기존 호환 유지)
  archiveGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  archiveItem: { width: '48%', borderRadius: Radius.lg, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, ...Shadows.soft, elevation: 1 },
  archiveIcon: { fontSize: 32 },
  archiveTitle: { fontSize: 15, fontWeight: '800', color: '#333', marginBottom: 4 },
  archiveCount: { fontSize: 12, fontWeight: '700', color: '#666', backgroundColor: 'rgba(255,255,255,0.4)', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4, alignSelf: 'flex-start' },
  hiddenCategoryBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#E25822', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 },
  hiddenCategoryBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' },

  // 도넛 차트 도감 카드
  donutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  donutCard: { width: '28%', flex: 1, minWidth: 90, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Colors.border, ...Shadows.soft },
  donutCatIcon: { fontSize: 24, marginTop: 2 },
  donutCatTitle: { fontSize: 13, fontWeight: '800', color: Colors.textMain, textAlign: 'center' },
  donutCatCount: { fontSize: 11, fontWeight: '700', color: Colors.textSub },

  // Shop Modal Styles (레거시 호환)
  shopCoinText: { color: '#B45309', fontSize: 14, fontWeight: '800', marginBottom: 20, backgroundColor: 'rgba(218, 165, 32, 0.1)', paddingVertical: 6, paddingHorizontal: 16, borderRadius: Radius.pill },
  shopGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15, justifyContent: 'center' },
  shopItem: { width: '45%', backgroundColor: '#FFF', borderRadius: Radius.lg, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ECECEC', ...Shadows.soft },
  shopItemPreview: { width: '100%', height: 60, borderRadius: Radius.md, marginBottom: 8 },
  shopItemName: { color: '#3E2723', fontSize: 13, fontWeight: '800', marginBottom: 4 },
  shopItemCost: { color: '#D97706', fontSize: 11, fontWeight: '900' },

  // 🎨 신규 스킨 상점 바텀 시트
  skinShopOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  skinShopSheet: { backgroundColor: Colors.bgElevated, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 24, paddingHorizontal: 20, paddingBottom: 40, borderWidth: 1, borderColor: Colors.border },
  skinShopHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  skinShopTitle: { fontSize: 18, fontWeight: '900', color: Colors.textMain },
  starCandyBadge: { backgroundColor: Colors.primarySoft, paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border },
  starCandyText: { color: Colors.primary, fontWeight: '800', fontSize: 14 },
  skinPreviewWrap: { width: '100%', height: 120, borderRadius: Radius.xl, overflow: 'hidden', marginBottom: 20, ...Shadows.soft },
  skinPreviewCard: { flex: 1, padding: 18, justifyContent: 'flex-end' },
  skinPreviewInner: {},
  skinPreviewName: { fontSize: 18, fontWeight: '900' },
  skinPreviewSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  skinListContainer: { paddingVertical: 4, paddingHorizontal: 2, gap: 12 },
  skinListItem: { width: 90, borderRadius: Radius.lg, padding: 8, alignItems: 'center', backgroundColor: Colors.bgMain, borderWidth: 1.5, borderColor: Colors.border, gap: 6 },
  skinListItemActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft, ...Shadows.glow },
  skinListPreview: { width: '100%', height: 52, borderRadius: Radius.md },
  skinListName: { fontSize: 11, fontWeight: '700', color: Colors.textMain, textAlign: 'center' },
  skinListPrice: { fontSize: 10, fontWeight: '800', color: Colors.primary },
  skinActionBtn: { width: '100%', backgroundColor: Colors.primary, paddingVertical: 15, borderRadius: Radius.pill, alignItems: 'center', marginTop: 18, ...Shadows.glow },
  skinActionBtnText: { color: Colors.textInverse, fontWeight: '900', fontSize: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#2A2421', borderRadius: 24, padding: 25, borderWidth: 1, borderColor: '#FF8C00', width: '100%', alignItems: 'center' },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#FF8C00', marginBottom: 10 },
  modalSub: { fontSize: 14, color: '#FFFDF9', marginBottom: 20 },
  titleOption: { width: '100%', padding: 15, borderBottomWidth: 1, borderBottomColor: '#4A3F3A', borderRadius: 10, marginBottom: 5 },
  titleOptionText: { color: '#FFFDF9', fontSize: 16, textAlign: 'center' },
  closeModalBtn: { marginTop: 20, backgroundColor: '#4A3F3A', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 15 },
  closeModalBtnText: { color: '#FFFDF9', fontWeight: 'bold' },
  modalBtn: { backgroundColor: '#B45309', paddingVertical: 12, paddingHorizontal: 30, borderRadius: Radius.pill, width: '100%', alignItems: 'center' },
  modalBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  mockAdContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  mockAdTitle: { color: '#FFFDF9', fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  mockAdTimer: { color: '#FF8C00', fontSize: 40, fontWeight: '900' },

  tutorialReplayBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3A322F', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#4A3F3A', marginTop: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  tutorialReplayIcon: { fontSize: 24, marginRight: 15 },
  tutorialReplayTitle: { color: '#FFFDF9', fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
  tutorialReplaySub: { color: '#A89F9C', fontSize: 12 },



  // Auth (로그인) 화면 스타일
  authContainer: { flex: 1, paddingHorizontal: 30, justifyContent: 'center' },
  authTitle: { fontSize: 42, fontWeight: '900', color: Colors.primary, marginBottom: 10, textAlign: 'center' },
  authSubTitle: { fontSize: 16, color: Colors.textSub, textAlign: 'center', marginBottom: 40 },
  authInputBox: { width: '100%', marginBottom: 20 },
  authInput: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: 16, fontSize: 16, color: Colors.textMain, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  authBtnRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 10 },
  authBtn: { flex: 1, paddingVertical: 16, borderRadius: Radius.md, alignItems: 'center' },
  authBtnText: { color: Colors.textInverse, fontSize: 16, fontWeight: 'bold' },
  dividerBox: { flexDirection: 'row', alignItems: 'center', marginVertical: 30 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.textSub, paddingHorizontal: 15, fontSize: 14 },
  socialBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: Radius.md, marginBottom: 12, elevation: 1 },
  socialBtnText: { fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
  
  // 편집 배지 및 리스트 화살표
  avatarEditBadge: { position: 'absolute', backgroundColor: Colors.primary, borderWidth: 2, borderColor: Colors.bgModal, justifyContent: 'center', alignItems: 'center' },
  avatarEditIcon: { color: Colors.textInverse, fontSize: 14, fontWeight: 'bold' },
  listRowArrow: { fontSize: 20, color: Colors.textSub, marginLeft: 8 },
});