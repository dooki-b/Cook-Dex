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
  { id: 'ko', title: '한식 도감', icon: '🍚', unlocked: 8, total: 30, color: '#FFECB3' },
  { id: 'we', title: '양식 도감', icon: '🍝', unlocked: 3, total: 20, color: '#C8E6C9' },
  { id: 'jp', title: '일식 도감', icon: '🍣', unlocked: 2, total: 15, color: '#F8BBD0' },
  { id: 'survival', title: '자취 서바이벌 🥫', icon: '🔥', unlocked: 5, total: 10, color: '#D1C4E9', isHidden: true },
];

/**
 * [기획 가이드 반영] 데이터 수집/생성 시 브랜드명 및 인명 무단 사용 방지용 필터 뼈대
 * 백엔드 전송 전 혹은 화면 표시 전 레시피 타이틀을 정화하는 데 사용합니다.
 */
const filterTitleForSafety = (title: string): string => {
  if (!title) return title;
  let cleaned = title;
  
  // 1. 브랜드명 범용 대체 (예시)
  cleaned = cleaned.replace(/스팸/g, '프레스햄');
  cleaned = cleaned.replace(/너구리/g, '해물라면');
  
  // 2. 인명 무단 사용 방지 (예시)
  cleaned = cleaned.replace(/백종원의/g, '셰프의 초간단');
  cleaned = cleaned.replace(/백종원/g, '유명 셰프');

  // Regex 기반으로 더 고도화 할 수 있는 뼈대
  // const brandRegex = /(스팸|햇반|진라면|신라면)/g;
  // const personRegex = /(백종원|이연복)/g;
  
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

  // 셰프 카드 상점 모달 및 재화 상태
  const [designShopVisible, setDesignShopVisible] = useState(false);
  const [userCoins, setUserCoins] = useState(1500); // 인게임 재화 모형
  const [unlockedDesigns, setUnlockedDesigns] = useState<string[]>(['기본']);
  const [selectedDesign, setSelectedDesign] = useState('기본');

  // 식단, 알러지, 양념장 태그용 상태 (하단 섹션 C)
  const [userTags, setUserTags] = useState<string[]>([]);

  // 3D 플립 상태
  const flipProgress = useSharedValue(0);
  const [isFlippedState, setIsFlippedState] = useState(false);

  const toggleFlip = () => {
    setIsFlippedState(!isFlippedState);
    // withSpring으로 관성과 텐션을 주어 실제 튕기는 모션을 만듭니다.
    flipProgress.value = withSpring(flipProgress.value === 0 ? 1 : 0, { damping: 15, stiffness: 120 });
  };

  const currentLevelInfo = calculateLevel(userExp);
  const currentGrade = currentLevelInfo.grade as keyof typeof GRADE_COLORS;

  const getCardColors = (gradeColors: string[]) => {
    if (selectedDesign === '네온 사이버') return ['#0F2027', '#203A43', '#2C5364'];
    if (selectedDesign === '프리미엄 블랙') return ['#141414', '#242424', '#000000'];
    if (selectedDesign === '로즈 골드') return ['#FFF0F3', '#FFCCD5', '#FFF0F3'];
    return gradeColors;
  };

  const cardFrontFaceStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [0, 180]);
    const zIndex = flipProgress.value < 0.5 ? 2 : 0;
    const opacity = flipProgress.value < 0.5 ? 1 : 0;
    return {
      backfaceVisibility: 'hidden',
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
      zIndex,
      opacity,
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
    };
  });

  const cardBackFaceStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [-180, 0]);
    const zIndex = flipProgress.value >= 0.5 ? 2 : 0;
    const opacity = flipProgress.value >= 0.5 ? 1 : 0;
    return {
      backfaceVisibility: 'hidden',
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
      zIndex,
      opacity,
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
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}><Text style={styles.logoutBtnText}>로그아웃</Text></TouchableOpacity>
          </View>

          {/* 3D 홀로그램 셰프 카드 */}
          <View style={styles.cardContainer}>
            <TouchableOpacity activeOpacity={0.9} onPress={toggleFlip} style={{ height: 180 }}>
              {/* 앞면: 셰프 정보 */}
              <Animated.View 
                pointerEvents={isFlippedState ? 'none' : 'auto'}
                style={[styles.threeDCard, cardFrontFaceStyle]}
              >
                <LinearGradient
                  colors={getCardColors(GRADE_COLORS[currentGrade]) as [string, string, ...string[]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cardGradient}
                >
                  <View style={styles.cardGlassOverlay}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardGradeText}>{currentGrade} Grade</Text>
                      <TouchableOpacity onPress={() => setDesignShopVisible(true)} style={styles.cardShopBtn}>
                        <Ionicons name="sparkles" size={16} color="#B58268" style={styles.holoSparkle} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.cardBody}>
                      <View style={styles.modernAvatarWrap}>
                        <Text style={styles.modernAvatarText}>{(user?.email?.[0] || '?').toUpperCase()}</Text>
                        <View style={styles.modernAvatarBadge}>
                          <Text style={styles.modernAvatarBadgeText}>👑</Text>
                        </View>
                      </View>
                      <View style={{ flex: 1, marginLeft: 16 }}>
                        <Text style={styles.cardTitle}>{equippedTitle}</Text>
                        <Text style={styles.cardUserName}>{user?.email?.split('@')[0] || '익명'}</Text>
                        <Text style={styles.cardUserLevel}>Lv.{currentLevelInfo.level}</Text>
                      </View>
                    </View>
                    <Ionicons name="sync-circle" size={24} color="#8A5A44" style={styles.cardFlipIcon} />
                  </View>
                </LinearGradient>
              </Animated.View>

              {/* 뒷면: 성장 기록/통계 */}
              <Animated.View 
                pointerEvents={isFlippedState ? 'box-none' : 'none'}
                style={[styles.threeDCard, cardBackFaceStyle]}
              >
                <LinearGradient
                  colors={getCardColors(GRADE_COLORS[currentGrade]) as [string, string, ...string[]]}
                  start={{ x: 1, y: 1 }}
                  end={{ x: 0, y: 0 }}
                  style={styles.cardGradient}
                >
                  <View style={styles.cardGlassOverlay}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardGradeText}>{currentGrade} Grade</Text>
                    </View>
                    <View style={styles.cardBackStats}>
                      <Text style={styles.statsTitle}>📊 주방 활동 스탯</Text>
                      <View style={styles.statsRow}>
                        <Text style={styles.statsLabel}>총 경험치</Text>
                        <Text style={styles.statsValue}>{userExp} EXP</Text>
                      </View>
                      <View style={styles.statsRow}>
                        <Text style={styles.statsLabel}>해금 칭호</Text>
                        <Text style={styles.statsValue}>{unlockedTitles.length} 개</Text>
                      </View>
                      <View style={[styles.statsRow, { borderBottomWidth: 0 }]}>
                        <Text style={styles.statsLabel}>선호 테마</Text>
                        <Text style={styles.statsValue}>{userTags.length > 0 ? userTags[0] : '미설정'}</Text>
                      </View>
                    </View>
                    <Ionicons name="sync-circle" size={24} color="#8A5A44" style={styles.cardFlipIcon} />
                  </View>
                </LinearGradient>
              </Animated.View>
            </TouchableOpacity>
          </View>

          {/* 📊 미니 레벨 바 (셰프 카드와 자연스럽게 연결) */}
          <View style={styles.attachedLevelBar}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: 4 }}>
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

          {/* 🗄️ 도감 섹션 (나의 키친 아카이브) - 하단 배치 */}
          <View style={[styles.dashboardSection, { marginBottom: 60 }]}>
            <View style={styles.dashboardHeader}>
              <Text style={styles.dashboardTitle}>나의 키친 아카이브 (도감)</Text>
            </View>
            <View style={styles.archiveGrid}>
              {ARCHIVE_CATEGORIES.map((cat) => (
                <TouchableOpacity 
                  key={cat.id} 
                  style={[styles.archiveItem, { backgroundColor: cat.color }]}
                  activeOpacity={0.8}
                >
                  {cat.isHidden && (
                    <View style={styles.hiddenCategoryBadge}>
                      <Text style={styles.hiddenCategoryBadgeText}>Secret</Text>
                    </View>
                  )}
                  <Text style={styles.archiveIcon}>{cat.icon}</Text>
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Text style={styles.archiveTitle} numberOfLines={1}>{cat.title}</Text>
                    <Text style={styles.archiveCount}>{cat.unlocked} / {cat.total}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 🔮 셰프 카드 디자인 상점 모달 */}
      <Modal
        visible={designShopVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setDesignShopVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: '#FFFDF9', borderColor: '#DAA520' }]}>
            <Text style={[styles.modalTitle, { color: '#B45309' }]}>🎨 셰프 카드 디자인 상점</Text>
            <Text style={styles.shopCoinText}>소지 코인: {userCoins} 🍪</Text>
            
            <View style={styles.shopGrid}>
              {[
                { name: '기본', cost: 0, colors: GRADE_COLORS.Gold },
                { name: '네온 사이버', cost: 500, colors: ['#0F2027', '#203A43', '#2C5364'] },
                { name: '프리미엄 블랙', cost: 1000, colors: ['#141414', '#242424', '#000000'] },
                { name: '로즈 골드', cost: 1500, colors: ['#FFF0F3', '#FFCCD5', '#FFF0F3'] }
              ].map((item) => {
                const isUnlocked = unlockedDesigns.includes(item.name);
                const isSelected = selectedDesign === item.name;

                return (
                  <TouchableOpacity
                    key={item.name}
                    style={[styles.shopItem, isSelected && { borderWidth: 2, borderColor: '#B45309' }]}
                    onPress={() => {
                      if (isUnlocked) {
                        setSelectedDesign(item.name);
                        Alert.alert("알림", `${item.name} 디자인이 적용되었습니다.`);
                      } else {
                        if (userCoins >= item.cost) {
                          Alert.alert("구매 확인", `${item.cost} 코인으로 ${item.name}을 구매하시겠습니까?`, [
                            { text: "취소", style: "cancel" },
                            { text: "구매", onPress: () => {
                              setUserCoins(userCoins - item.cost);
                              setUnlockedDesigns([...unlockedDesigns, item.name]);
                              Alert.alert("구매 완료", `${item.name} 디자인이 해금되었습니다.`);
                            }}
                          ]);
                        } else {
                          Alert.alert("코인 부족", "가지고 있는 코인이 부족합니다.");
                        }
                      }
                    }}
                  >
                    <LinearGradient colors={item.colors as [string, string, ...string[]]} style={styles.shopItemPreview} />
                    <Text style={styles.shopItemName}>{item.name}</Text>
                    <Text style={styles.shopItemCost}>
                      {isUnlocked ? "해금됨" : `${item.cost} 🍪`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.modalBtn} onPress={() => setDesignShopVisible(false)}>
              <Text style={styles.modalBtnText}>닫기</Text>
            </TouchableOpacity>
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
  
  modernProfileCard: { backgroundColor: 'transparent', paddingVertical: 10, paddingHorizontal: 10, marginBottom: 20 },
  modernAvatarWrap: { position: 'relative' },
  modernAvatarText: { width: 68, height: 68, borderRadius: 34, backgroundColor: Colors.primary, color: Colors.textInverse, fontSize: 28, fontWeight: 'bold', textAlign: 'center', lineHeight: 68, overflow: 'hidden' },
  modernAvatarBadge: { position: 'absolute', right: -2, bottom: -2, backgroundColor: '#fff', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  modernAvatarBadgeText: { fontSize: 13 },
  modernUserName: { fontSize: 24, fontWeight: '900', color: Colors.textMain, marginBottom: 4 },
  modernUserSub: { fontSize: 15, color: Colors.textSub, fontWeight: '500' },
  modernEditBtn: { padding: 8 },

  // 3D Card Styles
  cardContainer: { height: 180, marginBottom: 0 },
  threeDCard: { width: '100%', height: 180, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)', ...Shadows.soft, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  attachedLevelBar: { marginTop: -1, marginBottom: 25, backgroundColor: '#FFF', paddingVertical: 10, paddingHorizontal: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.03)', ...Shadows.soft, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  attachedLevelText: { color: '#3E2723', fontSize: 13, fontWeight: '800', letterSpacing: -0.2 },
  attachedExpText: { color: '#E25822', fontSize: 12, fontWeight: '800' },
  attachedBarBg: { width: '100%', height: 6, backgroundColor: '#F0E7E0', borderRadius: 3, overflow: 'hidden' },
  attachedBarFill: { height: '100%', backgroundColor: '#E25822', borderRadius: 3 },
  cardGradient: { flex: 1 },
  cardGlassOverlay: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', padding: 18, justifyContent: 'space-between' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardGradeText: { color: '#8A5A44', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, opacity: 0.8 },
  holoSparkle: { opacity: 0.6 },
  cardBody: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardTitle: { color: '#8A5A44', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  cardUserName: { color: '#3E2723', fontSize: 23, fontWeight: '900', marginBottom: 6, letterSpacing: -0.5 },
  cardUserLevel: { color: '#E25822', fontSize: 12, fontWeight: '800', backgroundColor: '#FFFDF9', paddingVertical: 3, paddingHorizontal: 10, borderRadius: Radius.pill, alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(226, 88, 34, 0.15)' },
  cardShopBtn: { padding: 4, right: -4 },
  cardFlipIcon: { position: 'absolute', bottom: 14, right: 14, opacity: 0.6 },
  cardBackStats: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingLeft: 20, paddingRight: 38, width: '100%', transform: [{ translateY: -8 }] },
  statsTitle: { color: '#3E2723', fontSize: 15, fontWeight: '900', marginTop: 8, marginBottom: 18, textAlign: 'center', letterSpacing: 0.5 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  statsLabel: { color: '#5D4037', fontSize: 13, fontWeight: '700', letterSpacing: -0.2 },
  statsValue: { color: '#E25822', fontSize: 13, fontWeight: '800' },

  quickMenuCard: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: 18, marginBottom: 30, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
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

  // Archive Grid Styles
  archiveGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  archiveItem: { width: '48%', borderRadius: Radius.lg, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, ...Shadows.soft, elevation: 1 },
  archiveIcon: { fontSize: 32 },
  archiveTitle: { fontSize: 15, fontWeight: '800', color: '#333', marginBottom: 4 },
  archiveCount: { fontSize: 12, fontWeight: '700', color: '#666', backgroundColor: 'rgba(255,255,255,0.4)', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4, alignSelf: 'flex-start' },
  hiddenCategoryBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#E25822', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 },
  hiddenCategoryBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' },

  // Shop Modal Styles
  shopCoinText: { color: '#B45309', fontSize: 14, fontWeight: '800', marginBottom: 20, backgroundColor: 'rgba(218, 165, 32, 0.1)', paddingVertical: 6, paddingHorizontal: 16, borderRadius: Radius.pill },
  shopGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15, justifyContent: 'center' },
  shopItem: { width: '45%', backgroundColor: '#FFF', borderRadius: Radius.lg, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ECECEC', ...Shadows.soft },
  shopItemPreview: { width: '100%', height: 60, borderRadius: Radius.md, marginBottom: 8 },
  shopItemName: { color: '#3E2723', fontSize: 13, fontWeight: '800', marginBottom: 4 },
  shopItemCost: { color: '#D97706', fontSize: 11, fontWeight: '900' },

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