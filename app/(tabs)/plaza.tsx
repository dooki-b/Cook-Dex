import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { collection, doc, getDocs, increment, limit, orderBy, query, updateDoc, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { db } from '../../firebaseConfig';

const DAILY_PLAZA_LIMIT = 5;

export default function PlazaScreen() {
  const router = useRouter();
  const [globalRecipes, setGlobalRecipes] = useState([]);
  const [posts, setPosts] = useState([]);
  const [topRecipes, setTopRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  
  // 💬 댓글 시스템 상태
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [targetPost, setTargetPost] = useState(null);
  const [commentInput, setCommentInput] = useState("");

  // BM 및 열람 제한 상태
  const [isProUser, setIsProUser] = useState(false); 
  const [proModalVisible, setProModalVisible] = useState(false);
  const [plazaViewsLeft, setPlazaViewsLeft] = useState(DAILY_PLAZA_LIMIT);

  // 상태(State) 및 메모이제이션 추가:
  const [myCondiments, setMyCondiments] = useState([]);
  const [isFilterActive, setIsFilterActive] = useState(false);
  
  // 🔍 검색 및 태그 필터 상태 (New)
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("전체");
  const filterTags = ["전체", "다이어트", "야식", "초간단", "매콤한"];
  const [activeTab, setActiveTab] = useState('explore'); // 'explore' | 'custom'

  // TTS 조리 모드 상태
  const [isCookingMode, setIsCookingMode] = useState(false);
  const [cookingSteps, setCookingSteps] = useState([]);
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
      
      const recipes = [];
      querySnapshot.forEach((doc) => {
        recipes.push({ id: doc.id, ...doc.data() });
      });
      
      const sortedByLikes = [...recipes].sort((a, b) => (b.likes || 0) - (a.likes || 0));
      setTopRecipes(sortedByLikes.slice(0, 3));

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

  const handleLike = async (recipeId) => {
    try {
      setGlobalRecipes(prev => prev.map(recipe => recipe.id === recipeId ? { ...recipe, likes: (recipe.likes || 0) + 1 } : recipe));
      const recipeDocRef = doc(db, "global_recipes", recipeId);
      await updateDoc(recipeDocRef, { likes: increment(1) });
    } catch (error) {
      Alert.alert("에러", "좋아요를 반영하지 못했습니다.");
      fetchGlobalRecipes(); 
    }
  };

  // 열람 횟수 검사 후 레시피 열기
  const handleRecipeClick = async (recipe) => {
    if (isProUser) {
      setSelectedRecipe(recipe);
      setModalVisible(true);
      return;
    }

    if (plazaViewsLeft > 0) {
      const newCount = plazaViewsLeft - 1;
      setPlazaViewsLeft(newCount);
      await AsyncStorage.setItem('cookdex_plaza_daily_views', JSON.stringify({
        date: new Date().toLocaleDateString(),
        count: newCount
      }));
      setSelectedRecipe(recipe);
      setModalVisible(true);
    } else {
      setProModalVisible(true);
    }
  };

  // 내 주방으로 스크랩
  const handleScrap = async () => {
    if (!selectedRecipe) return;
    try {
      const existingData = await AsyncStorage.getItem('cookdex_saved_recipes');
      const savedRecipes = existingData ? JSON.parse(existingData) : [];
      
      if (savedRecipes.some(r => r.id === selectedRecipe.id)) {
        Alert.alert("알림", "이미 내 주방에 저장된 레시피입니다.");
        return;
      }
      
      const newRecipe = {
        id: selectedRecipe.id,
        date: new Date().toLocaleDateString(),
        content: selectedRecipe.content
      };
      
      savedRecipes.unshift(newRecipe);
      await AsyncStorage.setItem('cookdex_saved_recipes', JSON.stringify(savedRecipes));
      Alert.alert("스크랩 완료! 📥", "이 레시피가 내 주방에 안전하게 저장되었습니다.");
    } catch (error) {
      Alert.alert("에러", "스크랩에 실패했습니다.");
    }
  };

  // TTS 조리 모드 로직
  const startCookingMode = () => {
    if (!selectedRecipe) return;
    const extractedSteps = selectedRecipe.content.split('\n').filter(line => /^\d+\.\s/.test(line.trim())).map(line => line.replace(/^\d+\.\s/, '').replace(/\*\*/g, '').trim());
    if (extractedSteps.length === 0) { Alert.alert("알림", "조리 단계를 명확히 인식하지 못했습니다."); return; }
    setCookingSteps(extractedSteps); setCurrentStepIndex(0); setIsCookingMode(true);
    Speech.speak(extractedSteps[0], { language: 'ko-KR', rate: 0.95, pitch: 1.0 });
  };
  const handleNextStep = () => { if (currentStepIndex < cookingSteps.length - 1) { Speech.stop(); setCurrentStepIndex(prev => prev + 1); Speech.speak(cookingSteps[currentStepIndex + 1], { language: 'ko-KR', rate: 0.95 }); } };
  const handlePrevStep = () => { if (currentStepIndex > 0) { Speech.stop(); setCurrentStepIndex(prev => prev - 1); Speech.speak(cookingSteps[currentStepIndex - 1], { language: 'ko-KR', rate: 0.95 }); } };
  const handleReplayStep = () => { Speech.stop(); Speech.speak(cookingSteps[currentStepIndex], { language: 'ko-KR', rate: 0.95 }); };
  const handleExitCookingMode = () => { Speech.stop(); setIsCookingMode(false); };

  const extractTitle = (content) => { const match = content.match(/#\s+(.*)/); return match ? match[1] : "이름 없는 요리"; };
  const formatDate = (isoString) => { if (!isoString) return ""; const date = new Date(isoString); return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`; };

  const displayedRecipes = React.useMemo(() => {
    let result = [...globalRecipes];

    // 1. 태그 필터링 (DB에 태그가 없으므로 본문 내용으로 대체 검색)
    if (selectedTag !== "전체") {
      result = result.filter(p => p.content && p.content.includes(selectedTag));
    }

    // 2. 검색어 필터링
    if (searchQuery) {
      result = result.filter(p => (p.content && p.content.includes(searchQuery)) || (p.authorName && p.authorName.includes(searchQuery)));
    }

    // 3. 탭 필터 (내 맞춤일 경우, 유저가 주로 쓰는 기본 식재료 키워드가 포함된 게시물만 노출 - 임시 하드코딩 필터)
    if (activeTab === 'custom') {
      // 실제로는 유저 선호도 기반이지만, 기획 요청대로 하드코딩 필터 적용
      result = result.filter(p => p.content && (p.content.includes('감자') || p.content.includes('돼지고기') || p.content.includes('김치')));
    }
    
    // 4. 내 양념장 맞춤 정렬 (기존 로직 유지)
    if (isFilterActive && myCondiments.length > 0) {
      result.sort((a, b) => {
        const countA = myCondiments.filter(c => a.content.includes(c.split(' ')[0])).length;
        const countB = myCondiments.filter(c => b.content.includes(c.split(' ')[0])).length;
        return countB - countA;
      });
    }
    return result;
  }, [globalRecipes, isFilterActive, myCondiments, searchQuery, selectedTag, activeTab]);

  // 💬 댓글 모달 열기
  const handleOpenComments = (item) => {
    setTargetPost(item);
    setCommentModalVisible(true);
  };

  // 💬 댓글 등록 (로컬 상태 업데이트)
  const handleAddComment = () => {
    if (!commentInput.trim() || !targetPost) return;
    const newComment = commentInput.trim();
    
    setGlobalRecipes(prev => prev.map(recipe => {
      if (recipe.id === targetPost.id) {
        const updatedComments = recipe.comments ? [...recipe.comments, newComment] : [newComment];
        setTargetPost({ ...recipe, comments: updatedComments }); // 모달 내부 업데이트
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
        <View style={styles.limitBadge}>
          <Text style={styles.limitBadgeText}>오늘 열람: {isProUser ? '무제한' : `${plazaViewsLeft}회 남음`}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#FF8C00" />
          <Text style={styles.loadingText}>광장 소식을 불러오는 중...</Text>
        </View>
      ) : globalRecipes.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>아직 공유된 레시피가 없습니다.</Text>
          <Text style={styles.emptySubText}>첫 번째로 레시피를 공유해 보세요!</Text>
        </View>
      ) : (
        <FlatList
          data={displayedRecipes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* 🔍 검색 및 태그 필터 UI (New) */}
              <View style={{ padding: 15, backgroundColor: '#FFFDF9' }}>
                <TextInput 
                  style={{ backgroundColor: '#F9F5F3', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E8D5D0', marginBottom: 15, color: '#3A2E2B' }} 
                  placeholder="레시피 제목이나 셰프 검색" 
                  placeholderTextColor="#A89F9C" 
                  value={searchQuery} 
                  onChangeText={setSearchQuery} 
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {filterTags.map(tag => (
                    <TouchableOpacity 
                      key={tag} 
                      style={{ backgroundColor: selectedTag === tag ? '#FF8C00' : '#F5EBE7', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 }}
                      onPress={() => setSelectedTag(tag)}
                    >
                      <Text style={{ color: selectedTag === tag ? '#000' : '#8C7A76', fontWeight: 'bold' }}>{tag === '전체' ? '전체' : `#${tag}`}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* 탐색 / 내 맞춤 탭 버튼 */}
              <View style={{ flexDirection: 'row', paddingHorizontal: 15, paddingBottom: 10, backgroundColor: '#FFFDF9' }}>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: activeTab === 'explore' ? '#FF8C00' : 'transparent', alignItems: 'center' }} onPress={() => setActiveTab('explore')}>
                  <Text style={{ fontWeight: 'bold', color: activeTab === 'explore' ? '#3A2E2B' : '#A89F9C', fontSize: 16 }}>탐색</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: activeTab === 'custom' ? '#FF8C00' : 'transparent', alignItems: 'center' }} onPress={() => setActiveTab('custom')}>
                  <Text style={{ fontWeight: 'bold', color: activeTab === 'custom' ? '#3A2E2B' : '#A89F9C', fontSize: 16 }}>내 맞춤</Text>
                </TouchableOpacity>
              </View>

              {/* 이달의 랭킹 셰프 (명예의 전당) */}
              {topRecipes.length > 0 && (
                <View style={styles.rankingSection}>
                  <Text style={styles.rankingTitle}>이달의 명예의 전당 (Top 3)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rankingScroll}>
                    {topRecipes.map((item, index) => (
                      <TouchableOpacity 
                        key={`top-${item.id}`} 
                        style={styles.rankingCard}
                        activeOpacity={0.8}
                        onPress={() => handleRecipeClick(item)}
                      >
                        <View style={styles.rankingBadge}>
                          <Text style={styles.rankingBadgeText}>{index + 1}위</Text>
                        </View>
                        <Text style={styles.rankingAuthor}>{item.authorName} 셰프</Text>
                        <Text style={styles.rankingRecipeTitle} numberOfLines={1}>{extractTitle(item.content)}</Text>
                        <View style={styles.rankingLikeBox}>
                          <Text style={styles.rankingLikeIcon}>좋아요 {item.likes || 0}</Text>
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
            const matchCount = isFilterActive ? myCondiments.filter(c => item.content.includes(c.split(' ')[0])).length : 0;
            return (
              <View style={styles.feedCard}>
                <TouchableOpacity activeOpacity={0.8} onPress={() => handleRecipeClick(item)} style={styles.feedContent}>
                  <View style={styles.cardHeader}>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                      <View style={[styles.authorBox, item.likes >= 10 && { backgroundColor: '#FF8C00' }]}>
                        <Text style={styles.authorIcon}>{item.likes >= 10 ? "👑" : "👨‍🍳"}</Text>
                        <Text style={[styles.authorName, item.likes >= 10 && { color: '#000' }]}>{item.authorName}</Text>
                      </View>
                      {isFilterActive && matchCount > 0 && (
                        <View style={styles.matchBadge}>
                          <Text style={styles.matchBadgeText}>보유 재료 {matchCount}개 포함</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={2}>{extractTitle(item.content)}</Text>
                  <Text style={styles.cardPreview} numberOfLines={3}>{item.content.replace(/#/g, '').replace(/\*/g, '').trim()}</Text>
                </TouchableOpacity>
                
                <View style={styles.cardFooter}>
                  <TouchableOpacity style={styles.likeBtn} onPress={() => handleLike(item.id)}>
                    <Text style={styles.likeIcon}>좋아요</Text>
                    <Text style={styles.likeCount}>{item.likes || 0}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.commentBtn} onPress={() => handleOpenComments(item)}>
                    <Text style={styles.commentIcon}>댓글</Text>
                    <Text style={styles.commentCount}>{item.comments ? item.comments.length : 0}</Text>
                  </TouchableOpacity>
                  
                  {/* 🍴 릴레이 챌린지 (Fork) 버튼 */}
                  <TouchableOpacity 
                    style={{ paddingVertical: 5, flexDirection: 'row', alignItems: 'center', marginLeft: 15 }} 
                    onPress={() => Alert.alert("릴레이 레시피", `'${item.title || extractTitle(item.content)}' 레시피에 유저님의 비법을 더하시겠습니까?`, [
                      { text: "취소", style: "cancel" },
                      { text: "내 비법 더하기", onPress: () => router.push({ pathname: '/create-recipe', params: { forkFrom: item.title || extractTitle(item.content), baseIngredients: item.tags?.join(',') || '' } }) }
                    ])}
                  >
                    <Text style={{ fontWeight: 'bold', color: '#4CAF50' }}>릴레이 참여</Text>
                  </TouchableOpacity>

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
  body: { color: '#3A2E2B', fontSize: 15, lineHeight: 24 }, 
  heading1: { color: '#FF8C00', fontSize: 22, fontWeight: 'bold' }, 
  blockquote: { backgroundColor: '#F9F5F3', borderLeftWidth: 4, borderLeftColor: '#4CAF50', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5, marginVertical: 10 }
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2A2421' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'android' ? 50 : 20, marginBottom: 10 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#FFFDF9', marginBottom: 5 },
  headerSub: { fontSize: 14, color: '#A89F9C' },
  limitBadge: { backgroundColor: '#4A3F3A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#FF8C00' },
  limitBadgeText: { color: '#FFB347', fontSize: 12, fontWeight: 'bold' },
  
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#FF8C00', marginTop: 15, fontSize: 15, fontWeight: 'bold' },
  emptyEmoji: { fontSize: 50, marginBottom: 15 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#FFFDF9', marginBottom: 8 },
  emptySubText: { fontSize: 14, color: '#A89F9C', textAlign: 'center' },
  
  listContainer: { padding: 15, paddingBottom: 100 },
  feedCard: { backgroundColor: '#3A322F', borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: '#4A3F3A', shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 },
  feedContent: { padding: 20, paddingBottom: 15 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  authorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4A3F3A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  authorIcon: { fontSize: 14, marginRight: 5 },
  authorName: { fontSize: 13, color: '#FFFDF9', fontWeight: 'bold' },
  cardDate: { fontSize: 12, color: '#8C7A76', fontWeight: 'bold' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#FF8C00', marginBottom: 10, lineHeight: 24 },
  cardPreview: { fontSize: 13, color: '#A89F9C', lineHeight: 20 },
  
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderTopWidth: 1, borderTopColor: '#4A3F3A', backgroundColor: 'rgba(0,0,0,0.1)', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4A3F3A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
  likeIcon: { fontSize: 14, marginRight: 6 },
  likeCount: { color: '#FFFDF9', fontSize: 13, fontWeight: 'bold' },
  commentBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4A3F3A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, marginLeft: 10 },
  commentIcon: { fontSize: 14, marginRight: 6 },
  commentCount: { color: '#FFFDF9', fontSize: 13, fontWeight: 'bold' },
  readMoreText: { color: '#FF8C00', fontSize: 13, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { height: '85%', backgroundColor: '#FFFDF9', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#E8D5D0' },
  modalAuthor: { fontSize: 16, fontWeight: '900', color: '#8E24AA' },
  closeBtn: { backgroundColor: '#F5EBE7', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15 },
  closeBtnText: { color: '#3A2E2B', fontSize: 13, fontWeight: 'bold' },
  markdownScroll: { flex: 1 },
  
  ttsStartBtn: { backgroundColor: '#E3F2FD', paddingVertical: 15, borderRadius: 15, alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#CE93D8' }, 
  ttsStartBtnText: { color: '#8E24AA', fontSize: 15, fontWeight: '900' },
  scrapBtn: { backgroundColor: '#4CAF50', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 15 },
  scrapBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },

  proModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  proModalContent: { backgroundColor: '#2A2421', borderRadius: 24, padding: 25, borderWidth: 1, borderColor: '#FF8C00', alignItems: 'center', shadowColor: '#FF8C00', shadowOffset: {width:0, height:0}, shadowOpacity: 0.5, shadowRadius: 20, elevation: 15 },
  proTitle: { fontSize: 26, fontWeight: '900', color: '#FF8C00', marginBottom: 10 },
  proSubTitle: { fontSize: 14, color: '#FFFDF9', textAlign: 'center', marginBottom: 20, fontWeight: 'bold' },
  proBenefitBox: { backgroundColor: '#3A322F', padding: 15, borderRadius: 12, width: '100%', marginBottom: 25 },
  proBenefitText: { color: '#E8D5D0', fontSize: 13, marginBottom: 8, fontWeight: 'bold' },
  proSubscribeBtn: { backgroundColor: '#FF8C00', paddingVertical: 16, width: '100%', borderRadius: 16, alignItems: 'center', marginBottom: 12 },
  proSubscribeBtnText: { color: '#000', fontSize: 16, fontWeight: '900' },
  proCancelBtn: { paddingVertical: 10 },
  proCancelBtnText: { color: '#A89F9C', fontSize: 13, fontWeight: 'bold', textDecorationLine: 'underline' },

  ttsContainer: { flex: 1, backgroundColor: '#2A2421', padding: 20, justifyContent: 'space-between' }, 
  ttsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }, 
  ttsStepIndicator: { color: '#FFB347', fontSize: 18, fontWeight: 'bold' }, 
  ttsCloseBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20 }, 
  ttsCloseBtnText: { color: '#fff', fontWeight: 'bold' }, 
  ttsBody: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 }, 
  ttsBigText: { color: '#FFFDF9', fontSize: 32, fontWeight: '900', textAlign: 'center', lineHeight: 45 }, 
  ttsControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }, 
  ttsBtn: { backgroundColor: '#4A3F3A', paddingVertical: 20, flex: 1, borderRadius: 20, alignItems: 'center', marginHorizontal: 5 }, 
  ttsBtnText: { color: '#FFFDF9', fontSize: 16, fontWeight: 'bold' }, 
  ttsBtnMain: { backgroundColor: '#FF8C00', paddingVertical: 25, flex: 1.5, borderRadius: 25, alignItems: 'center', marginHorizontal: 5, shadowColor: '#FF8C00', shadowOpacity: 0.5, shadowRadius: 10, elevation: 5 }, 
  ttsBtnMainText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  filterContainer: { paddingHorizontal: 20, marginBottom: 15 },
  filterBtn: { backgroundColor: '#3A322F', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#5A4E49', alignSelf: 'flex-start' },
  filterBtnActive: { backgroundColor: '#FF8C00', borderColor: '#FF8C00' },
  filterBtnText: { color: '#A89F9C', fontSize: 13, fontWeight: 'bold' },
  filterBtnTextActive: { color: '#000', fontSize: 13, fontWeight: '900' },
  matchBadge: { backgroundColor: '#4CAF50', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginLeft: 10 },
  matchBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  shoppingBtn: { backgroundColor: '#0073E9', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  shoppingBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  shoppingModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  shoppingModalContent: { backgroundColor: '#3A322F', borderRadius: 24, padding: 25, borderWidth: 1, borderColor: '#0073E9', position: 'relative', width: '90%' },
  shoppingTitle: { fontSize: 22, fontWeight: '900', color: '#0073E9', marginBottom: 10, textAlign: 'center' },
  shoppingSub: { fontSize: 14, color: '#FFFDF9', textAlign: 'center', marginBottom: 20 },
  styleInput: { backgroundColor: '#2A2421', color: '#FFFDF9', borderRadius: 12, padding: 15, fontSize: 16, borderWidth: 1, borderColor: '#5A4E49', marginBottom: 20 },
  shoppingSubmitBtn: { backgroundColor: '#0073E9', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginBottom: 12 },
  shoppingSubmitBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  rankingSection: { marginBottom: 20, paddingTop: 10 },
  rankingTitle: { fontSize: 20, fontWeight: '900', color: '#FFD700', marginBottom: 15, paddingHorizontal: 20 },
  rankingScroll: { gap: 15, paddingHorizontal: 20, paddingBottom: 10 },
  rankingCard: { backgroundColor: '#3A322F', padding: 15, borderRadius: 16, width: 160, borderWidth: 1, borderColor: '#FFD700', shadowColor: '#FFD700', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 5, elevation: 6 },
  rankingBadge: { position: 'absolute', top: -10, left: 10, backgroundColor: '#000', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: '#FFD700' },
  rankingBadgeText: { color: '#FFD700', fontSize: 12, fontWeight: '900' },
  rankingAuthor: { color: '#FFFDF9', fontSize: 12, fontWeight: 'bold', marginTop: 10, marginBottom: 5 },
  rankingRecipeTitle: { color: '#FF8C00', fontSize: 16, fontWeight: '900', marginBottom: 10 },
  rankingLikeBox: { backgroundColor: '#2A2421', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  rankingLikeIcon: { color: '#E8D5D0', fontSize: 12, fontWeight: 'bold' },

  // 💬 댓글 스타일
  commentModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  commentModalContent: { height: '60%', backgroundColor: '#FFFDF9', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#E8D5D0' },
  commentTitle: { fontSize: 18, fontWeight: '900', color: '#3A2E2B' },
  commentRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5EBE7' },
  commentText: { fontSize: 14, color: '#3A2E2B', lineHeight: 20 },
  emptyCommentText: { textAlign: 'center', color: '#A89F9C', marginTop: 30, fontSize: 14 },
  commentInputRow: { flexDirection: 'row', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E8D5D0' },
  commentInput: { flex: 1, backgroundColor: '#F9F5F3', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E8D5D0', color: '#3A2E2B' },
  commentSubmitBtn: { backgroundColor: '#FF8C00', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 12 },
  commentSubmitText: { fontWeight: '900', color: '#000' }
});