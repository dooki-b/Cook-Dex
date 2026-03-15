import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { collection, doc, getDocs, increment, limit, orderBy, query, updateDoc, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { db } from '../../firebaseConfig';
import { Colors, Radius, Shadows } from '../../constants/design-tokens';

const DAILY_PLAZA_LIMIT = 5;

type PlazaRecipe = {
  id: string;
  content?: string;
  authorName?: string;
  createdAt?: string;
  likes?: number;
  comments?: string[];
  recipeKey?: string;
  photoUrl?: string;
  recipePhotoUrl?: string;
  servings?: number;
  estimatedMinutes?: number;
  difficulty?: string;
  ratingAvg?: number;
  reviewCount?: number;
  authorTitle?: string;
  relayFromId?: string;
  relayRootId?: string;
  relayDepth?: number;
};

export default function PlazaScreen() {
  const router = useRouter();
  const [globalRecipes, setGlobalRecipes] = useState<PlazaRecipe[]>([]);
  const [posts, setPosts] = useState<PlazaRecipe[]>([]);
  const [topRecipes, setTopRecipes] = useState<PlazaRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState<PlazaRecipe | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [targetPost, setTargetPost] = useState<PlazaRecipe | null>(null);
  const [commentInput, setCommentInput] = useState("");

  // BM 및 열람 제한 상태
  const [isProUser, setIsProUser] = useState(false); 
  const [proModalVisible, setProModalVisible] = useState(false);
  const [plazaViewsLeft, setPlazaViewsLeft] = useState(DAILY_PLAZA_LIMIT);

  // 상태(State) 및 메모이제이션 추가:
  const [myCondiments, setMyCondiments] = useState<string[]>([]);
  const [isFilterActive, setIsFilterActive] = useState(false);

  const [isCookingMode, setIsCookingMode] = useState(false);
  const [cookingSteps, setCookingSteps] = useState<string[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const [shoppingModalVisible, setShoppingModalVisible] = useState(false);
  const [searchIngredient, setSearchIngredient] = useState("");

  const handleShoppingSearch = () => {
    if (!searchIngredient.trim()) {
      Alert.alert("알림", "검색할 식재료를 입력해주세요.");
      return;
    }
    const coupangUrl = `https://m.coupang.com/nm/search?q=${encodeURIComponent(searchIngredient.trim())}`;
    Linking.openURL(coupangUrl);
    setShoppingModalVisible(false);
    setSearchIngredient("");
  };

  useEffect(() => {
    const fetchPlazaRecipes = async () => {
      try {
        // isPublic이 true인 레시피만 광장에 노출
        const q = query(collection(db, "recipes"), where("isPublic", "==", true));
        const querySnapshot = await getDocs(q);
        const fetchedPosts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPosts(fetchedPosts.length > 0 ? fetchedPosts : []); // 데이터가 없으면 빈 배열
      } catch(e) { console.log("광장 DB 연동 대기 중...", e); }
    };
    fetchPlazaRecipes();
  }, []);

  // 화면 진입 시 DB 피드와 일일 열람 횟수 로드
  useFocusEffect(
    useCallback(() => {
      fetchGlobalRecipes();
      loadDailyViews();
      const loadMyCondiments = async () => {
        try {
          const savedRaw = await AsyncStorage.getItem('cookdex_condiments');
          if (savedRaw) setMyCondiments(JSON.parse(savedRaw));
        } catch (e) {}
      };
      loadMyCondiments();
    }, [])
  );

  const fetchGlobalRecipes = async () => {
    setLoading(true);
    try {
      const recipesRef = collection(db, "global_recipes");
      const q = query(recipesRef, orderBy("createdAt", "desc"), limit(30));
      const querySnapshot = await getDocs(q);
      
      const recipes: PlazaRecipe[] = [];
      querySnapshot.forEach((d) => {
        recipes.push({ id: d.id, ...d.data() } as PlazaRecipe);
      });

      const trendScore = (r: PlazaRecipe) => (r.likes || 0) + (r.comments?.length || 0) * 2;
      const sortedTrending = [...recipes].sort((a, b) => trendScore(b) - trendScore(a));
      setTopRecipes(sortedTrending.slice(0, 5));
      setGlobalRecipes(recipes);
    } catch (error) {
      console.error("광장 레시피 로드 에러:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadDailyViews = async () => {
    try {
      const today = new Date().toLocaleDateString();
      const limitDataRaw = await AsyncStorage.getItem('cookdex_plaza_daily_views');
      if (limitDataRaw) {
        const limitData = JSON.parse(limitDataRaw);
        if (limitData.date === today) {
          setPlazaViewsLeft(limitData.count);
        } else {
          setPlazaViewsLeft(DAILY_PLAZA_LIMIT);
          await AsyncStorage.setItem('cookdex_plaza_daily_views', JSON.stringify({ date: today, count: DAILY_PLAZA_LIMIT }));
        }
      } else {
        await AsyncStorage.setItem('cookdex_plaza_daily_views', JSON.stringify({ date: today, count: DAILY_PLAZA_LIMIT }));
      }
    } catch (error) {}
  };

  const handleLike = async (recipeId: string) => {
    try {
      setGlobalRecipes(prev => prev.map(recipe => recipe.id === recipeId ? { ...recipe, likes: (recipe.likes || 0) + 1 } : recipe));
      const recipeDocRef = doc(db, "global_recipes", recipeId);
      await updateDoc(recipeDocRef, { likes: increment(1) });
    } catch (error) {
      Alert.alert("에러", "좋아요를 반영하지 못했습니다.");
      fetchGlobalRecipes(); 
    }
  };

  const handleRecipeClick = async (recipe: PlazaRecipe) => {
    // PRO 유저는 무제한
    if (!isProUser) {
      if (plazaViewsLeft <= 0) {
        setProModalVisible(true);
        return;
      }

      const newCount = plazaViewsLeft - 1;
      setPlazaViewsLeft(newCount);
      await AsyncStorage.setItem('cookdex_plaza_daily_views', JSON.stringify({
        date: new Date().toLocaleDateString(),
        count: newCount
      }));
    }

    // 공통 레시피 상세 페이지로 이동
    router.push({
      pathname: '/recipe-detail',
      params: { source: 'plaza', id: recipe.id },
    });
  };

  // 내 주방으로 스크랩
  const handleScrap = async () => {
    if (!selectedRecipe) return;
    try {
      const existingData = await AsyncStorage.getItem('cookdex_saved_recipes');
      const savedRecipes = existingData ? JSON.parse(existingData) : [];
      
      if (savedRecipes.some((r: { id: string }) => r.id === selectedRecipe.id)) {
        Alert.alert("알림", "이미 내 주방에 저장된 레시피입니다.");
        return;
      }
      
      const newRecipe = {
        id: selectedRecipe.id,
        date: new Date().toLocaleDateString(),
        content: selectedRecipe.content
      };
      
        savedRecipes.unshift(newRecipe as any);
      await AsyncStorage.setItem('cookdex_saved_recipes', JSON.stringify(savedRecipes));
      Alert.alert("스크랩 완료! 📥", "이 레시피가 내 주방에 안전하게 저장되었습니다.");
    } catch (error) {
      Alert.alert("에러", "스크랩에 실패했습니다.");
    }
  };

  // TTS 조리 모드 로직
  const startCookingMode = () => {
    if (!selectedRecipe?.content) return;
    const extractedSteps = selectedRecipe.content.split('\n').filter((line: string) => /^\d+\.\s/.test(line.trim())).map((line: string) => line.replace(/^\d+\.\s/, '').replace(/\*\*/g, '').trim());
    if (extractedSteps.length === 0) { Alert.alert("알림", "조리 단계를 명확히 인식하지 못했습니다."); return; }
    setCookingSteps(extractedSteps); setCurrentStepIndex(0); setIsCookingMode(true);
    Speech.speak(extractedSteps[0], { language: 'ko-KR', rate: 0.95, pitch: 1.0 });
  };
  const handleNextStep = () => { if (currentStepIndex < cookingSteps.length - 1) { Speech.stop(); setCurrentStepIndex(prev => prev + 1); Speech.speak(cookingSteps[currentStepIndex + 1], { language: 'ko-KR', rate: 0.95 }); } };
  const handlePrevStep = () => { if (currentStepIndex > 0) { Speech.stop(); setCurrentStepIndex(prev => prev - 1); Speech.speak(cookingSteps[currentStepIndex - 1], { language: 'ko-KR', rate: 0.95 }); } };
  const handleReplayStep = () => { Speech.stop(); Speech.speak(cookingSteps[currentStepIndex], { language: 'ko-KR', rate: 0.95 }); };
  const handleExitCookingMode = () => { Speech.stop(); setIsCookingMode(false); };

  const extractTitle = (content: string) => { const match = content.match(/#\s+(.*)/); return match ? match[1] : '이름 없는 요리'; };
  const formatDate = (isoString?: string) => { if (!isoString) return ''; const date = new Date(isoString); return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`; };

  const displayedRecipes = useMemo(() => {
    let result = [...globalRecipes];

    // 1. 내 양념장 맞춤 정렬 (옵션)
    if (isFilterActive && myCondiments.length > 0) {
      result.sort((a, b) => {
        const countA = myCondiments.filter((c: string) => a.content?.includes(c.split(' ')[0])).length;
        const countB = myCondiments.filter((c: string) => b.content?.includes(c.split(' ')[0])).length;
        return countB - countA;
      });
    }
    return result;
  }, [globalRecipes, isFilterActive, myCondiments]);

  const handleOpenComments = (item: PlazaRecipe) => {
    setTargetPost(item);
    setCommentModalVisible(true);
  };

  // 💬 댓글 등록 (로컬 상태 업데이트)
  const handleAddComment = () => {
    if (!commentInput.trim() || !targetPost) return;
    const newComment = commentInput.trim();
    
    setGlobalRecipes(prev => prev.map(recipe => {
      if (targetPost && recipe.id === targetPost.id) {
        const updatedComments = recipe.comments ? [...recipe.comments, newComment] : [newComment];
        setTargetPost({ ...recipe, comments: updatedComments });
        return { ...recipe, comments: updatedComments };
      }
      return recipe;
    }));
    setCommentInput("");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>요리 광장</Text>
          <Text style={styles.headerSub}>셰프들의 AI 레시피 피드</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={() => router.push('/search_user')} style={{ padding: 4 }}>
            <Ionicons name="search" size={24} color={Colors.textMain} />
          </TouchableOpacity>
          <View style={styles.limitBadge}>
            <Text style={styles.limitBadgeText}>오늘 열람: {isProUser ? '무제한' : `${plazaViewsLeft}회 남음`}</Text>
          </View>
        </View>
      </View>

      {/* 홈 화면과 통일된 스타일의 검색바 - 전체 검색 포털로 이동 */}
      <View style={styles.searchBarContainer}>
        <TouchableOpacity
          style={styles.searchBar}
          activeOpacity={0.9}
          onPress={() =>
            router.push({
              pathname: '/search',
              params: { tab: 'global' },
            })
          }
        >
          <Text style={styles.searchPlaceholder}>레시피 제목이나 셰프 검색</Text>
        </TouchableOpacity>
      </View>

      {/* 명예의 전당 / 랭킹 / 레시피 분류 아이콘 그리드 */}
      <View style={styles.iconGridSection}>
        <TouchableOpacity style={styles.iconGridItem} onPress={() => router.push('/plaza-hof')} activeOpacity={0.8}>
          <View style={[styles.iconGridIconWrap, { backgroundColor: Colors.primarySoft }]}>
            <Ionicons name="trophy" size={28} color={Colors.primary} />
          </View>
          <Text style={styles.iconGridLabel}>명예의 전당</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconGridItem} onPress={() => router.push('/plaza-ranking')} activeOpacity={0.8}>
          <View style={[styles.iconGridIconWrap, { backgroundColor: Colors.primarySoft }]}>
            <Ionicons name="podium" size={28} color={Colors.primary} />
          </View>
          <Text style={styles.iconGridLabel}>랭킹</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconGridItem} onPress={() => router.push('/categories')} activeOpacity={0.8}>
          <View style={[styles.iconGridIconWrap, { backgroundColor: Colors.primarySoft }]}>
            <Ionicons name="book" size={28} color={Colors.primary} />
          </View>
          <Text style={styles.iconGridLabel}>레시피 분류</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#FF8C00" />
          <Text style={styles.loadingText}>광장 소식을 불러오는 중...</Text>
        </View>
      ) : globalRecipes.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyEmoji}>🍽️</Text>
          <Text style={styles.emptyText}>현재 작성된 레시피가 없습니다.</Text>
          <Text style={styles.emptySubText}>첫 번째로 요리 광장을 채워줄 셰프가 되어 보세요.</Text>
        </View>
      ) : (
        <FlatList
          data={displayedRecipes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* 실시간 급상승 레시피 (열람 제한 적용) */}
              {topRecipes.length > 0 && (
                <View style={styles.rankingSection}>
                  <Text style={styles.rankingTitle}>실시간 급상승 레시피</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rankingScroll}>
                    {topRecipes.map((item, index) => (
                      <TouchableOpacity 
                        key={`top-${item.id}`} 
                        style={styles.rankingCard}
                        activeOpacity={0.8}
                        onPress={() => handleRecipeClick(item)}
                      >
                        <View style={styles.rankingBadge}>
                          <Text style={styles.rankingBadgeText}>{index + 1}</Text>
                        </View>
                        <Text style={styles.rankingAuthor}>{item.authorName} 셰프</Text>
                        <Text style={styles.rankingRecipeTitle} numberOfLines={1}>{extractTitle(item.content ?? '')}</Text>
                        <View style={styles.rankingLikeBox}>
                          <Text style={styles.rankingLikeIcon}>★ {(item.ratingAvg ?? 0) || '-'} ({(item.reviewCount ?? item.comments?.length ?? 0)})</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* 🧂 내 양념장 맞춤 정렬 토글 */}
              <View style={styles.filterContainer}>
                <TouchableOpacity 
                  style={[styles.filterBtn, isFilterActive && styles.filterBtnActive]} 
                  onPress={() => {
                    if (myCondiments.length === 0) {
                      Alert.alert("알림", "프로필 탭에서 '우리 집 기본 양념장'을 먼저 설정해주세요!");
                      return;
                    }
                    setIsFilterActive(!isFilterActive);
                  }}
                >
                  <Text style={[styles.filterBtnText, isFilterActive && styles.filterBtnTextActive]}>
                    🧂 내 양념장 맞춤 정렬 {isFilterActive ? 'ON' : 'OFF'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          }
          renderItem={({ item }) => {
            const matchCount = isFilterActive ? myCondiments.filter((c: string) => item.content?.includes(c.split(' ')[0])).length : 0;
            const ratingAvg = item.ratingAvg ?? 0;
            const reviewCount = item.reviewCount ?? item.comments?.length ?? 0;
            const displayRating = ratingAvg > 0 ? ratingAvg.toFixed(1) : ((item.likes ?? 0) > 0 ? '4.0' : '-');
            const hasPhoto = !!item.photoUrl || !!item.recipePhotoUrl;
            const photoUri = item.photoUrl || item.recipePhotoUrl;
            return (
              <View style={styles.feedCard}>
                <TouchableOpacity activeOpacity={0.8} onPress={() => handleRecipeClick(item)} style={styles.feedCardInner}>
                  {/* 썸네일: 포토 인증 시 완성 사진으로 카드 상단 전체 덮기 */}
                  <View style={styles.cardThumbWrap}>
                    {hasPhoto && photoUri ? (
                      <Image source={{ uri: photoUri }} style={styles.cardThumbImage} resizeMode="cover" />
                    ) : (
                      <View style={styles.cardThumbPlaceholder} />
                    )}
                    {hasPhoto && (
                      <View style={styles.photoVerifiedBadge}>
                        <Text style={styles.photoVerifiedText}>📷 사진 인증</Text>
                      </View>
                    )}
                    {/* 썸네일 위 오버레이: 인분 / 시간 / 난이도 */}
                    <View style={styles.cardThumbMeta}>
                      <Text style={styles.cardThumbMetaText}>
                        {item.servings ? `👥 ${item.servings}인분` : ''}
                        {item.servings && (item.estimatedMinutes || item.difficulty) ? '  ' : ''}
                        {item.estimatedMinutes ? `⏱ ${item.estimatedMinutes}분 이내` : ''}
                        {item.estimatedMinutes && item.difficulty ? '  ' : ''}
                        {item.difficulty ? `★ ${item.difficulty}` : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.feedContent}>
                    <View style={styles.cardHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={[styles.authorBox, ((item.likes ?? 0) >= 10) && { backgroundColor: Colors.primary }]}>
                          <Text style={styles.authorIcon}>{item.authorTitle ? '🏅' : ((item.likes ?? 0) >= 10 ? '👑' : '👨‍🍳')}</Text>
                          <Text style={[styles.authorName, (item.likes ?? 0) >= 10 && { color: Colors.textInverse }]}>{item.authorName}</Text>
                        </View>
                        {item.authorTitle && (
                          <View style={styles.authorBadgeModern}>
                            <Text style={styles.authorBadgeTextModern}>{item.authorTitle}</Text>
                          </View>
                        )}
                        {isFilterActive && matchCount > 0 && (
                          <View style={styles.matchBadge}>
                            <Text style={styles.matchBadgeText}>보유 {matchCount}개</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={2}>{extractTitle(item.content ?? '')}</Text>
                    {!hasPhoto && item.content && (
                      <Text style={styles.cardPreview} numberOfLines={2}>{item.content.replace(/#/g, '').replace(/\*/g, '').trim()}</Text>
                    )}
                  </View>
                </TouchableOpacity>
                <View style={styles.cardFooter}>
                  <View style={styles.cardFooterLeft}>
                    <View style={styles.ratingChip}>
                      <Text style={styles.ratingChipStar}>★</Text>
                      <Text style={styles.ratingChipText}>{displayRating} ({reviewCount})</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleRecipeClick(item)}>
                    <Text style={styles.readMoreText}>레시피 보기 →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* 레시피 상세 & 스크랩/TTS 모달 */}
      <Modal visible={modalVisible} transparent={true} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalAuthor}>{selectedRecipe?.authorName} 님의 레시피</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>닫기 ✕</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity style={styles.ttsStartBtn} onPress={startCookingMode}>
              <Text style={styles.ttsStartBtnText}>조리 모드로 듣기</Text>
            </TouchableOpacity>
            
            <ScrollView showsVerticalScrollIndicator={false} style={styles.markdownScroll}>
              {selectedRecipe && <Markdown style={markdownStyles}>{selectedRecipe.content}</Markdown>}
              <View style={{height: 20}}/>
            </ScrollView>
            
            <TouchableOpacity style={styles.scrapBtn} onPress={handleScrap}>
              <Text style={styles.scrapBtnText}>내 주방으로 스크랩하기</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shoppingBtn} onPress={() => setShoppingModalVisible(true)}>
              <Text style={styles.shoppingBtnText}>부족한 재료 온라인 검색</Text>
            </TouchableOpacity>
            <View style={{height: 40}}/>
          </View>
        </View>
      </Modal>

      {/* PRO 결제 유도 모달 */}
      <Modal visible={proModalVisible} transparent animationType="fade">
        <View style={styles.proModalOverlay}>
          <View style={styles.proModalContent}>
            <Text style={styles.proTitle}>Cookdex PRO</Text>
            <Text style={styles.proSubTitle}>오늘의 광장 열람 횟수를 모두 사용하셨습니다!</Text>
            <View style={styles.proBenefitBox}>
              <Text style={styles.proBenefitText}>✅ 전 세계 레시피 무제한 열람</Text>
              <Text style={styles.proBenefitText}>✅ AI 식재료 스캐너 무제한 사용</Text>
              <Text style={styles.proBenefitText}>✅ 앱 내 모든 광고 완벽 제거</Text>
            </View>
            <TouchableOpacity style={styles.proSubscribeBtn} onPress={() => { Alert.alert("결제 연동 필요", "추후 인앱 결제 모듈이 연동됩니다."); setIsProUser(true); setProModalVisible(false); setPlazaViewsLeft(999); }}>
              <Text style={styles.proSubscribeBtnText}>월 4,900원으로 무제한 즐기기</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setProModalVisible(false)} style={styles.proCancelBtn}>
              <Text style={styles.proCancelBtnText}>내일 다시 올게요</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* TTS 전체화면 모달 */}
      <Modal visible={isCookingMode} transparent={false} animationType="slide">
        <SafeAreaView style={styles.ttsContainer}>
          <View style={styles.ttsHeader}>
            <Text style={styles.ttsStepIndicator}>조리 단계 {currentStepIndex + 1} / {cookingSteps.length}</Text>
            <TouchableOpacity onPress={handleExitCookingMode} style={styles.ttsCloseBtn}><Text style={styles.ttsCloseBtnText}>종료 ✕</Text></TouchableOpacity>
          </View>
          <View style={styles.ttsBody}><Text style={styles.ttsBigText}>{cookingSteps[currentStepIndex]}</Text></View>
          <View style={styles.ttsControls}>
            <TouchableOpacity style={[styles.ttsBtn, currentStepIndex === 0 && {opacity: 0.3}]} onPress={handlePrevStep} disabled={currentStepIndex === 0}><Text style={styles.ttsBtnText}>⬅️ 이전</Text></TouchableOpacity>
            <TouchableOpacity style={styles.ttsBtnMain} onPress={handleReplayStep}><Text style={styles.ttsBtnMainText}>🔊 다시 듣기</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.ttsBtn, currentStepIndex === cookingSteps.length - 1 && {opacity: 0.3}]} onPress={handleNextStep} disabled={currentStepIndex === cookingSteps.length - 1}><Text style={styles.ttsBtnText}>다음 ➡️</Text></TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* 🛒 쇼핑 검색 모달 */}
      <Modal visible={shoppingModalVisible} transparent={true} animationType="fade" onRequestClose={() => setShoppingModalVisible(false)}>
        <View style={styles.shoppingModalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShoppingModalVisible(false)} />
          <View style={styles.shoppingModalContent}>
            <Text style={styles.shoppingTitle}>🛒 온라인 장보기</Text>
            <Text style={styles.shoppingSub}>부족한 식재료를 온라인에서 바로 검색해 보세요.</Text>
            
            <TextInput 
              style={styles.styleInput} 
              placeholder="예: 대파, 양파, 돼지고기" 
              placeholderTextColor="#A89F9C"
              value={searchIngredient}
              onChangeText={setSearchIngredient}
              onSubmitEditing={handleShoppingSearch}
            />
            
            <TouchableOpacity style={styles.shoppingSubmitBtn} onPress={handleShoppingSearch}>
              <Text style={styles.shoppingSubmitBtnText}>온라인 마트 최저가 검색 🔍</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 💬 댓글 모달 (Bottom Sheet) */}
      <Modal visible={commentModalVisible} transparent={true} animationType="slide" onRequestClose={() => setCommentModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.commentModalOverlay}>
          <View style={styles.commentModalContent}>
            <View style={styles.commentHeader}>
              <Text style={styles.commentTitle}>💬 댓글 ({targetPost?.comments?.length || 0})</Text>
              <TouchableOpacity onPress={() => setCommentModalVisible(false)}>
                <Text style={styles.closeBtnText}>닫기 ✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={targetPost?.comments || []}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => <View style={styles.commentRow}><Text style={styles.commentText}>👤 {item}</Text></View>}
              ListEmptyComponent={<Text style={styles.emptyCommentText}>첫 번째 댓글을 남겨보세요! 👋</Text>}
              style={{ marginBottom: 10 }}
            />
            <View style={styles.commentInputRow}>
              <TextInput style={styles.commentInput} placeholder="따뜻한 댓글을 남겨주세요..." placeholderTextColor="#A89F9C" value={commentInput} onChangeText={setCommentInput} />
              <TouchableOpacity style={styles.commentSubmitBtn} onPress={handleAddComment}><Text style={styles.commentSubmitText}>등록</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const markdownStyles = StyleSheet.create({ 
  body: { color: Colors.textMain, fontSize: 15, lineHeight: 24 }, 
  heading1: { color: Colors.primary, fontSize: 22, fontWeight: 'bold' }, 
  blockquote: {
    backgroundColor: Colors.primarySoft,
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginVertical: 10,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgMain,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 32 : 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.textMain,
    marginBottom: 4,
  },
  headerSub: {
    fontSize: 13,
    color: Colors.textSub,
  },
  limitBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  limitBadgeText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },

  // 홈 화면 검색 UI와 톤을 맞춘 광장 상단 검색바
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: Colors.bgMain,
  },
  searchBar: {
    height: 48,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  searchPlaceholder: {
    fontSize: 14,
    color: Colors.textSub,
  },

  iconGridSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: Colors.bgMain,
  },
  iconGridItem: {
    alignItems: 'center',
    minWidth: 90,
  },
  iconGridIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    ...Shadows.soft,
  },
  iconGridLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMain,
    textAlign: 'center',
  },

  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: Colors.primary,
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyEmoji: {
    fontSize: 42,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textMain,
    marginBottom: 6,
  },
  emptySubText: {
    fontSize: 13,
    color: Colors.textSub,
    textAlign: 'center',
  },

  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 96,
  },
  feedCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.xl,
    marginBottom: 18,
    borderLeftWidth: 5,
    borderLeftColor: Colors.primary,
    overflow: 'hidden',
    ...Shadows.soft,
  },
  feedCardInner: {},
  cardThumbWrap: {
    height: 160,
    width: '100%',
    backgroundColor: Colors.bgMuted,
    position: 'relative',
  },
  cardThumbImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  cardThumbPlaceholder: {
    flex: 1,
    backgroundColor: Colors.bgMuted,
  },
  photoVerifiedBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  photoVerifiedText: {
    color: Colors.textInverse,
    fontSize: 11,
    fontWeight: '700',
  },
  cardThumbMeta: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    right: 10,
  },
  cardThumbMetaText: {
    fontSize: 11,
    color: Colors.textInverse,
    fontWeight: '600',
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  feedContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
  },
  authorBadgeModern: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#FFF7ED', // 옅은 주황 바탕
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: '#FED7AA', // 주황색 얇은 테두리
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorBadgeTextModern: {
    fontSize: 11,
    color: '#EA580C', // 진한 주황 텍스트
    fontWeight: '800',
  },
  ratingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primarySoft,
  },
  ratingChipStar: {
    fontSize: 12,
    color: Colors.primary,
    marginRight: 4,
  },
  ratingChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMain,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  authorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primarySoft,
  },
  authorIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  authorName: {
    fontSize: 13,
    color: Colors.textMain,
    fontWeight: '600',
  },
  cardDate: {
    fontSize: 12,
    color: Colors.textSub,
    fontWeight: '500',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textMain,
    marginBottom: 6,
    lineHeight: 23,
  },
  cardPreview: {
    fontSize: 13,
    color: Colors.textSub,
    lineHeight: 20,
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cardFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  relayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.primary,
    marginLeft: 8,
  },
  relayBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  readMoreText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '85%',
    backgroundColor: Colors.bgModal,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: 20,
    ...Shadows.glassDiffused,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalAuthor: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textMain,
  },
  closeBtn: {
    backgroundColor: Colors.bgMuted,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
  },
  closeBtnText: {
    color: Colors.textMain,
    fontSize: 13,
    fontWeight: '600',
  },
  markdownScroll: {
    flex: 1,
  },

  ttsStartBtn: {
    backgroundColor: Colors.primarySoft,
    paddingVertical: 14,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  ttsStartBtnText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  scrapBtn: {
    backgroundColor: Colors.success,
    paddingVertical: 15,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginTop: 14,
  },
  scrapBtnText: {
    color: Colors.textInverse,
    fontSize: 15,
    fontWeight: '800',
  },

  proModalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
    justifyContent: 'center',
    padding: 20,
  },
  proModalContent: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.xl,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.primarySoft,
    alignItems: 'center',
    ...Shadows.glassDiffused,
  },
  proTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.primary,
    marginBottom: 8,
  },
  proSubTitle: {
    fontSize: 13,
    color: Colors.textMain,
    textAlign: 'center',
    marginBottom: 18,
    fontWeight: '600',
  },
  proBenefitBox: {
    backgroundColor: Colors.primarySoft,
    padding: 14,
    borderRadius: Radius.md,
    width: '100%',
    marginBottom: 22,
  },
  proBenefitText: {
    color: Colors.textMain,
    fontSize: 13,
    marginBottom: 6,
    fontWeight: '500',
  },
  proSubscribeBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    width: '100%',
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginBottom: 8,
  },
  proSubscribeBtnText: {
    color: Colors.textInverse,
    fontSize: 15,
    fontWeight: '800',
  },
  proCancelBtn: {
    paddingVertical: 8,
  },
  proCancelBtnText: {
    color: Colors.textSub,
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  ttsContainer: {
    flex: 1,
    backgroundColor: Colors.bgMain,
    padding: 20,
    justifyContent: 'space-between',
  },
  ttsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  ttsStepIndicator: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  ttsCloseBtn: {
    backgroundColor: Colors.bgElevated,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
  },
  ttsCloseBtnText: {
    color: Colors.textMain,
    fontWeight: '600',
  },
  ttsBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  ttsBigText: {
    color: Colors.textMain,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 40,
  },
  ttsControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  ttsBtn: {
    backgroundColor: Colors.bgMuted,
    paddingVertical: 18,
    flex: 1,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  ttsBtnText: {
    color: Colors.textMain,
    fontSize: 15,
    fontWeight: '700',
  },
  ttsBtnMain: {
    backgroundColor: Colors.primary,
    paddingVertical: 20,
    flex: 1.3,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginHorizontal: 5,
    ...Shadows.glassTight,
  },
  ttsBtnMainText: {
    color: Colors.textInverse,
    fontSize: 16,
    fontWeight: '900',
  },

  filterContainer: {
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  filterBtn: {
    backgroundColor: Colors.bgMuted,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'flex-start',
  },
  filterBtnActive: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
  filterBtnText: {
    color: Colors.textSub,
    fontSize: 12,
    fontWeight: '600',
  },
  filterBtnTextActive: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  matchBadge: {
    backgroundColor: Colors.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    marginLeft: 8,
  },
  matchBadgeText: {
    color: Colors.textInverse,
    fontSize: 11,
    fontWeight: '600',
  },

  shoppingBtn: {
    backgroundColor: Colors.actionShop,
    paddingVertical: 16,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginTop: 10,
  },
  shoppingBtnText: {
    color: Colors.textInverse,
    fontSize: 15,
    fontWeight: '800',
  },
  shoppingModalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  shoppingModalContent: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.xl,
    padding: 22,
    borderWidth: 1,
    borderColor: Colors.actionShop,
    width: '90%',
  },
  shoppingTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.actionShop,
    marginBottom: 8,
    textAlign: 'center',
  },
  shoppingSub: {
    fontSize: 13,
    color: Colors.textSub,
    textAlign: 'center',
    marginBottom: 18,
  },
  styleInput: {
    backgroundColor: Colors.bgMuted,
    color: Colors.textMain,
    borderRadius: Radius.md,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 18,
  },
  shoppingSubmitBtn: {
    backgroundColor: Colors.actionShop,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginBottom: 6,
  },
  shoppingSubmitBtnText: {
    color: Colors.textInverse,
    fontSize: 15,
    fontWeight: '800',
  },

  rankingSection: {
    marginBottom: 18,
    paddingTop: 20,
  },
  rankingTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.textMain,
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  rankingScroll: {
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  rankingCard: {
    backgroundColor: Colors.bgElevated,
    padding: 14,
    borderRadius: Radius.lg,
    width: 160,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    ...Shadows.glass,
  },
  rankingBadge: {
    position: 'absolute',
    top: 0,
    left: 10,
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  rankingBadgeText: {
    color: Colors.textInverse,
    fontSize: 12,
    fontWeight: '900',
  },
  rankingAuthor: {
    color: Colors.textSub,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 4,
  },
  rankingRecipeTitle: {
    color: Colors.textMain,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  rankingLikeBox: {
    backgroundColor: Colors.bgMuted,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  rankingLikeIcon: {
    color: Colors.textSub,
    fontSize: 11,
    fontWeight: '600',
  },

  // 💬 댓글 스타일
  commentModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlayDark,
  },
  commentModalContent: {
    height: '60%',
    backgroundColor: Colors.bgModal,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: 20,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  commentTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.textMain,
  },
  commentRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  commentText: {
    fontSize: 14,
    color: Colors.textMain,
    lineHeight: 20,
  },
  emptyCommentText: {
    textAlign: 'center',
    color: Colors.textSub,
    marginTop: 24,
    fontSize: 13,
  },
  commentInputRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  commentInput: {
    flex: 1,
    backgroundColor: Colors.bgMuted,
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textMain,
    fontSize: 14,
  },
  commentSubmitBtn: {
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: Radius.md,
  },
  commentSubmitText: {
    fontWeight: '800',
    color: Colors.textInverse,
    fontSize: 13,
  },

});