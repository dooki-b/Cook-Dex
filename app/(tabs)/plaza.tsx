import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import {
  collection,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { db } from "../../firebaseConfig";

const DAILY_PLAZA_LIMIT = 5;

// 🚨 테스트용 더미 데이터 (API 미연결 시 사용)
const DUMMY_RECIPES = [
  {
    id: "d1",
    authorName: "김치마스터",
    content:
      "# 돼지고기 김치찌개\n\n## 재료\n- 김치 1/4포기\n- 돼지고기 200g\n- 두부 반모\n\n## 조리법\n1. 김치와 고기를 볶습니다.\n2. 물을 넣고 끓입니다.\n3. 두부를 넣고 마무리!",
    likes: 120,
    createdAt: new Date().toISOString(),
  },
  {
    id: "d2",
    authorName: "파스타장인",
    content:
      "# 알리오 올리오\n\n## 재료\n- 파스타면\n- 마늘 10쪽\n- 올리브유\n\n## 조리법\n1. 마늘을 편으로 썹니다.\n2. 올리브유에 마늘을 볶습니다.\n3. 면을 넣고 볶아줍니다.",
    likes: 85,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "d3",
    authorName: "자취생1",
    content:
      "# 초간단 계란말이\n\n## 재료\n- 계란 3개\n- 소금\n\n## 조리법\n1. 계란을 풉니다.\n2. 팬에 붓고 맙니다.",
    likes: 45,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: "d4",
    authorName: "고기러버",
    content:
      "# 제육볶음 황금레시피\n\n매콤달콤 제육볶음입니다. 고추장 2큰술이 포인트!",
    likes: 210,
    createdAt: new Date(Date.now() - 200000000).toISOString(),
  },
  {
    id: "d5",
    authorName: "떡볶이덕후",
    content: "# 학교 앞 떡볶이\n\n추억의 그 맛! 설탕 대신 올리고당을 써보세요.",
    likes: 150,
    createdAt: new Date(Date.now() - 250000000).toISOString(),
  },
  {
    id: "d6",
    authorName: "건강식단",
    content: "# 닭가슴살 샐러드\n\n다이어트에 최고입니다. 드레싱은 오리엔탈로!",
    likes: 60,
    createdAt: new Date(Date.now() - 300000000).toISOString(),
  },
  {
    id: "d7",
    authorName: "집밥선생",
    content: "# 차돌 된장찌개\n\n차돌박이의 기름진 맛이 일품입니다.",
    likes: 95,
    createdAt: new Date(Date.now() - 350000000).toISOString(),
  },
  {
    id: "d8",
    authorName: "양식조리사",
    content: "# 집에서 굽는 스테이크\n\n시즈닝 후 30분 상온 보관이 중요합니다.",
    likes: 300,
    createdAt: new Date(Date.now() - 400000000).toISOString(),
  },
  {
    id: "d9",
    authorName: "볶음밥왕",
    content: "# 김치볶음밥\n\n마지막에 참기름 한 바퀴 잊지 마세요.",
    likes: 77,
    createdAt: new Date(Date.now() - 450000000).toISOString(),
  },
  {
    id: "d10",
    authorName: "라면박사",
    content: "# 해장 라면\n\n콩나물과 대파를 듬뿍 넣어 시원하게!",
    likes: 112,
    createdAt: new Date(Date.now() - 500000000).toISOString(),
  },
];

export default function PlazaScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [globalRecipes, setGlobalRecipes] = useState([]);
  const [topRecipes, setTopRecipes] = useState([]);
  const [plazaViewsLeft, setPlazaViewsLeft] = useState(DAILY_PLAZA_LIMIT);
  const [isProUser, setIsProUser] = useState(false);

  const [myCondiments, setMyCondiments] = useState([]);
  const [myDiet, setMyDiet] = useState([]);
  const [myAllergies, setMyAllergies] = useState([]);
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState([]);

  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [proModalVisible, setProModalVisible] = useState(false);

  const [cookingSteps, setCookingSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isCookingMode, setIsCookingMode] = useState(false);

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

  const handleShopping = (item) => {
    const coupangSearchUrl = `https://m.coupang.com/nm/search?q=${encodeURIComponent(item)}`;
    Linking.openURL(coupangSearchUrl).catch((err) =>
      console.error("쇼핑몰 연결 실패", err),
    );
  };

  // 화면 진입 시 DB 피드와 일일 열람 횟수 로드
  useFocusEffect(
    useCallback(() => {
      fetchGlobalRecipes();
      loadDailyViews();
      const loadMyProfile = async () => {
        try {
          const condimentsRaw =
            await AsyncStorage.getItem("cookdex_condiments");
          if (condimentsRaw) setMyCondiments(JSON.parse(condimentsRaw));

          const dietRaw = await AsyncStorage.getItem("cookdex_diet_goal");
          if (dietRaw) {
            try {
              setMyDiet(JSON.parse(dietRaw));
            } catch {
              setMyDiet([dietRaw]);
            }
          }

          const allergyRaw = await AsyncStorage.getItem("cookdex_allergies");
          if (allergyRaw) {
            try {
              const parsed = JSON.parse(allergyRaw);
              setMyAllergies(Array.isArray(parsed) ? parsed : [allergyRaw]);
            } catch {
              setMyAllergies(allergyRaw.split(",").map((s) => s.trim()));
            }
          }

          const favoritesRaw = await AsyncStorage.getItem(
            "cookdex_favorite_recipes",
          );
          if (favoritesRaw) {
            const favorites = JSON.parse(favoritesRaw);
            setFavoriteIds(favorites.map((r) => r.id));
          }
        } catch (e) {}
      };
      loadMyProfile();
    }, []),
  );

  const fetchGlobalRecipes = async () => {
    setLoading(true);
    try {
      const recipesRef = collection(db, "global_recipes");
      const q = query(recipesRef, orderBy("createdAt", "desc"), limit(30));
      const querySnapshot = await getDocs(q);

      let recipes = []; // 🚨 const -> let 변경 (재할당 허용)
      querySnapshot.forEach((doc) => {
        recipes.push({ id: doc.id, ...doc.data() });
      });

      // 🚨 데이터가 없으면 더미 데이터 사용
      if (recipes.length === 0) {
        recipes = DUMMY_RECIPES;
      }

      const sortedByLikes = [...recipes].sort(
        (a, b) => (b.likes || 0) - (a.likes || 0),
      );
      setTopRecipes(sortedByLikes.slice(0, 3));

      setGlobalRecipes(recipes);
    } catch (error) {
      console.error("광장 레시피 로드 에러:", error);
      // 에러 발생 시에도 더미 데이터 로드 (테스트용)
      setGlobalRecipes(DUMMY_RECIPES);
      setTopRecipes(
        [...DUMMY_RECIPES].sort((a, b) => b.likes - a.likes).slice(0, 3),
      );
    } finally {
      setLoading(false);
    }
  };

  const loadDailyViews = async () => {
    try {
      const today = new Date().toLocaleDateString();
      const limitDataRaw = await AsyncStorage.getItem(
        "cookdex_plaza_daily_views",
      );
      if (limitDataRaw) {
        const limitData = JSON.parse(limitDataRaw);
        if (limitData.date === today) {
          setPlazaViewsLeft(limitData.count);
        } else {
          setPlazaViewsLeft(DAILY_PLAZA_LIMIT);
          await AsyncStorage.setItem(
            "cookdex_plaza_daily_views",
            JSON.stringify({ date: today, count: DAILY_PLAZA_LIMIT }),
          );
        }
      } else {
        await AsyncStorage.setItem(
          "cookdex_plaza_daily_views",
          JSON.stringify({ date: today, count: DAILY_PLAZA_LIMIT }),
        );
      }
    } catch (error) {}
  };

  const handleLike = async (recipeId) => {
    try {
      setGlobalRecipes((prev) =>
        prev.map((recipe) =>
          recipe.id === recipeId
            ? { ...recipe, likes: (recipe.likes || 0) + 1 }
            : recipe,
        ),
      );
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
      await AsyncStorage.setItem(
        "cookdex_plaza_daily_views",
        JSON.stringify({
          date: new Date().toLocaleDateString(),
          count: newCount,
        }),
      );
      setSelectedRecipe(recipe);

      // 🚨 [신규] 최근 본 레시피 로컬 저장
      try {
        const recentRaw = await AsyncStorage.getItem("cookdex_recent_recipes");
        let recent = recentRaw ? JSON.parse(recentRaw) : [];
        recent = recent.filter((r) => r.id !== recipe.id); // 중복 제거 (상단으로 이동)
        recent.unshift({ ...recipe, date: new Date().toLocaleDateString() });
        if (recent.length > 20) recent.pop(); // 최대 20개 유지
        await AsyncStorage.setItem(
          "cookdex_recent_recipes",
          JSON.stringify(recent),
        );
      } catch (e) {}

      setModalVisible(true);
    } else {
      setProModalVisible(true);
    }
  };

  // 내 주방으로 스크랩
  const handleScrap = async () => {
    if (!selectedRecipe) return;
    try {
      const existingData = await AsyncStorage.getItem("cookdex_saved_recipes");
      const savedRecipes = existingData ? JSON.parse(existingData) : [];

      if (savedRecipes.some((r) => r.id === selectedRecipe.id)) {
        Alert.alert("알림", "이미 내 주방에 저장된 레시피입니다.");
        return;
      }

      const newRecipe = {
        id: selectedRecipe.id,
        date: new Date().toLocaleDateString(),
        content: selectedRecipe.content,
      };

      savedRecipes.unshift(newRecipe);
      await AsyncStorage.setItem(
        "cookdex_saved_recipes",
        JSON.stringify(savedRecipes),
      );
      Alert.alert(
        "스크랩 완료! 📥",
        "이 레시피가 내 주방에 안전하게 저장되었습니다.",
      );
    } catch (error) {
      Alert.alert("에러", "스크랩에 실패했습니다.");
    }
  };

  // 🚨 [신규] 즐겨찾기 추가 함수
  const handleFavorite = async () => {
    if (!selectedRecipe) return;
    try {
      const favoriteRaw = await AsyncStorage.getItem(
        "cookdex_favorite_recipes",
      );
      let favorites = favoriteRaw ? JSON.parse(favoriteRaw) : [];

      if (favorites.some((r) => r.id === selectedRecipe.id)) {
        Alert.alert("알림", "이미 즐겨찾기에 추가된 레시피입니다.");
        return;
      }

      favorites.unshift({
        ...selectedRecipe,
        date: new Date().toLocaleDateString(),
      });
      await AsyncStorage.setItem(
        "cookdex_favorite_recipes",
        JSON.stringify(favorites),
      );
      setFavoriteIds((prev) => [...prev, selectedRecipe.id]);
      Alert.alert("즐겨찾기 추가 ⭐", "내 주방 > 즐겨찾기에 저장되었습니다.");
    } catch (e) {
      console.error(e);
    }
  };

  // TTS 조리 모드 로직
  const startCookingMode = () => {
    if (!selectedRecipe) return;
    const extractedSteps = selectedRecipe.content
      .split("\n")
      .filter((line) => /^\d+\.\s/.test(line.trim()))
      .map((line) =>
        line
          .replace(/^\d+\.\s/, "")
          .replace(/\*\*/g, "")
          .trim(),
      );
    if (extractedSteps.length === 0) {
      Alert.alert("알림", "조리 단계를 명확히 인식하지 못했습니다.");
      return;
    }
    setCookingSteps(extractedSteps);
    setCurrentStepIndex(0);
    setIsCookingMode(true);
    Speech.speak(extractedSteps[0], {
      language: "ko-KR",
      rate: 0.95,
      pitch: 1.0,
    });
  };
  const handleNextStep = () => {
    if (currentStepIndex < cookingSteps.length - 1) {
      Speech.stop();
      setCurrentStepIndex((prev) => prev + 1);
      Speech.speak(cookingSteps[currentStepIndex + 1], {
        language: "ko-KR",
        rate: 0.95,
      });
    }
  };
  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      Speech.stop();
      setCurrentStepIndex((prev) => prev - 1);
      Speech.speak(cookingSteps[currentStepIndex - 1], {
        language: "ko-KR",
        rate: 0.95,
      });
    }
  };
  const handleReplayStep = () => {
    Speech.stop();
    Speech.speak(cookingSteps[currentStepIndex], {
      language: "ko-KR",
      rate: 0.95,
    });
  };
  const handleExitCookingMode = () => {
    Speech.stop();
    setIsCookingMode(false);
  };

  const extractTitle = (content) => {
    const match = content.match(/#\s+(.*)/);
    return match ? match[1] : "이름 없는 요리";
  };
  const formatDate = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  };

  const displayedRecipes = React.useMemo(() => {
    if (!isFilterActive) return globalRecipes;

    // 1. 알레르기 필터링 (포함된 레시피 아예 제외)
    const safeRecipes = globalRecipes.filter((recipe) => {
      if (myAllergies.length === 0) return true;
      // 알레르기 유발 재료가 하나라도 포함되어 있으면 제외 (예외 처리)
      return !myAllergies.some((alg) => recipe.content.includes(alg));
    });

    return safeRecipes.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // 2. 식단 목표 보너스
      const dietA = myDiet.some((d) => a.content.includes(d));
      const dietB = myDiet.some((d) => b.content.includes(d));
      if (dietA) scoreA += 20;
      if (dietB) scoreB += 20;

      // 3. 보유 양념장 매칭 보너스
      const countA = myCondiments.filter((c) =>
        a.content.includes(c.split(" ")[0]),
      ).length;
      const countB = myCondiments.filter((c) =>
        b.content.includes(c.split(" ")[0]),
      ).length;
      return scoreB + countB - (scoreA + countA);
    });
  }, [globalRecipes, isFilterActive, myCondiments, myDiet, myAllergies]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>요리 광장 🌍</Text>
          <Text style={styles.headerSub}>전 세계 셰프들의 AI 레시피 피드</Text>
        </View>
        {/* 🚨 검색 포털 버튼 추가 */}
        <TouchableOpacity
          style={styles.searchIconBtn}
          onPress={() => router.push("/search")}
        >
          <Text style={{ fontSize: 24 }}>🔍</Text>
        </TouchableOpacity>
        <View style={styles.limitBadge}>
          <Text style={styles.limitBadgeText}>
            오늘 열람: {isProUser ? "무제한" : `${plazaViewsLeft}회 남음`}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#FF8C00" />
          <Text style={styles.loadingText}>광장 소식을 불러오는 중...</Text>
        </View>
      ) : globalRecipes.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyEmoji}>🌬️</Text>
          <Text style={styles.emptyText}>아직 공유된 레시피가 없습니다.</Text>
          <Text style={styles.emptySubText}>
            첫 번째로 레시피를 공유해 보세요!
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayedRecipes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* 👑 이달의 랭킹 셰프 (명예의 전당) */}
              {topRecipes.length > 0 && (
                <View style={styles.rankingSection}>
                  <Text style={styles.rankingTitle}>
                    🏆 이달의 명예의 전당 (Top 3)
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.rankingScroll}
                  >
                    {topRecipes.map((item, index) => (
                      <TouchableOpacity
                        key={`top-${item.id}`}
                        style={styles.rankingCard}
                        activeOpacity={0.8}
                        onPress={() => handleRecipeClick(item)}
                      >
                        <View style={styles.rankingBadge}>
                          <Text style={styles.rankingBadgeText}>
                            {index === 0
                              ? "🥇 1위"
                              : index === 1
                                ? "🥈 2위"
                                : "🥉 3위"}
                          </Text>
                        </View>
                        <Text style={styles.rankingAuthor}>
                          {item.authorName} 셰프
                        </Text>
                        <Text
                          style={styles.rankingRecipeTitle}
                          numberOfLines={1}
                        >
                          {extractTitle(item.content)}
                        </Text>
                        <View style={styles.rankingLikeBox}>
                          <Text style={styles.rankingLikeIcon}>
                            ❤️ {item.likes || 0}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* 🧂 내 양념장 맞춤 정렬 토글 */}
              <View style={styles.filterContainer}>
                <TouchableOpacity
                  style={[
                    styles.filterBtn,
                    isFilterActive && styles.filterBtnActive,
                  ]}
                  onPress={() => {
                    if (
                      myCondiments.length === 0 &&
                      myDiet.length === 0 &&
                      myAllergies.length === 0
                    )
                      Alert.alert(
                        "알림",
                        "프로필에서 맞춤 설정을 먼저 등록해주세요!",
                      );
                    setIsFilterActive(!isFilterActive);
                  }}
                >
                  <Text
                    style={[
                      styles.filterBtnText,
                      isFilterActive && styles.filterBtnTextActive,
                    ]}
                  >
                    ✨ 내 식단/알러지/양념 맞춤 정렬{" "}
                    {isFilterActive ? "ON" : "OFF"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          }
          renderItem={({ item }) => {
            const matchCount = isFilterActive
              ? myCondiments.filter((c) =>
                  item.content.includes(c.split(" ")[0]),
                ).length
              : 0;
            const isFavorite = favoriteIds.includes(item.id);
            return (
              <View style={styles.feedCard}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => handleRecipeClick(item)}
                  style={styles.feedContent}
                >
                  <View style={styles.cardHeader}>
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <View
                        style={[
                          styles.authorBox,
                          item.likes >= 10 && { backgroundColor: "#FF8C00" },
                        ]}
                      >
                        <Text style={styles.authorIcon}>
                          {item.likes >= 10 ? "👑" : "👨‍🍳"}
                        </Text>
                        <Text
                          style={[
                            styles.authorName,
                            item.likes >= 10 && { color: "#000" },
                          ]}
                        >
                          {item.authorName}
                        </Text>
                      </View>
                      {isFavorite && (
                        <View style={styles.favoriteBadge}>
                          <Text style={{ fontSize: 12 }}>⭐</Text>
                        </View>
                      )}
                      {isFilterActive && matchCount > 0 && (
                        <View style={styles.matchBadge}>
                          <Text style={styles.matchBadgeText}>
                            보유 재료 {matchCount}개 포함
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.cardDate}>
                      {formatDate(item.createdAt)}
                    </Text>
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {extractTitle(item.content)}
                  </Text>
                  <Text style={styles.cardPreview} numberOfLines={3}>
                    {item.content.replace(/#/g, "").replace(/\*/g, "").trim()}
                  </Text>
                </TouchableOpacity>

                <View style={styles.cardFooter}>
                  <TouchableOpacity
                    style={styles.likeBtn}
                    onPress={() => handleLike(item.id)}
                  >
                    <Text style={styles.likeIcon}>❤️</Text>
                    <Text style={styles.likeCount}>{item.likes || 0}</Text>
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
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalAuthor}>
                {selectedRecipe?.authorName} 님의 레시피
              </Text>
              {/* 🚨 즐겨찾기 별표 버튼 추가 */}
              <TouchableOpacity onPress={handleFavorite} style={styles.starBtn}>
                <Text style={styles.starBtnText}>⭐ 즐겨찾기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeBtn}
              >
                <Text style={styles.closeBtnText}>닫기 ✕</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.ttsStartBtn}
              onPress={startCookingMode}
            >
              <Text style={styles.ttsStartBtnText}>
                🔊 화면 안 보고 귀로 듣기 (조리 모드)
              </Text>
            </TouchableOpacity>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.markdownScroll}
            >
              {selectedRecipe && (
                <Markdown style={markdownStyles}>
                  {selectedRecipe.content}
                </Markdown>
              )}
              <View style={{ height: 20 }} />
            </ScrollView>

            <TouchableOpacity style={styles.scrapBtn} onPress={handleScrap}>
              <Text style={styles.scrapBtnText}>📥 내 주방으로 스크랩하기</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shoppingBtn}
              onPress={() => setShoppingModalVisible(true)}
            >
              <Text style={styles.shoppingBtnText}>
                🛒 부족한 재료 온라인 검색
              </Text>
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </View>
        </View>
      </Modal>

      {/* PRO 결제 유도 모달 */}
      <Modal visible={proModalVisible} transparent={true} animationType="fade">
        <View style={styles.proModalOverlay}>
          <View style={styles.proModalContent}>
            <Text style={styles.proTitle}>Cookdex PRO 👑</Text>
            <Text style={styles.proSubTitle}>
              오늘의 광장 열람 횟수를 모두 사용하셨습니다!
            </Text>
            <View style={styles.proBenefitBox}>
              <Text style={styles.proBenefitText}>
                ✅ 전 세계 레시피 무제한 열람
              </Text>
              <Text style={styles.proBenefitText}>
                ✅ AI 식재료 스캐너 무제한 사용
              </Text>
              <Text style={styles.proBenefitText}>
                ✅ 앱 내 모든 광고 완벽 제거
              </Text>
            </View>
            <TouchableOpacity
              style={styles.proSubscribeBtn}
              onPress={() => {
                Alert.alert(
                  "결제 연동 필요",
                  "추후 인앱 결제 모듈이 연동됩니다.",
                );
                setIsProUser(true);
                setProModalVisible(false);
                setPlazaViewsLeft(999);
              }}
            >
              <Text style={styles.proSubscribeBtnText}>
                월 4,900원으로 무제한 즐기기
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setProModalVisible(false)}
              style={styles.proCancelBtn}
            >
              <Text style={styles.proCancelBtnText}>내일 다시 올게요</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* TTS 전체화면 모달 */}
      <Modal visible={isCookingMode} transparent={false} animationType="slide">
        <SafeAreaView style={styles.ttsContainer}>
          <View style={styles.ttsHeader}>
            <Text style={styles.ttsStepIndicator}>
              조리 단계 {currentStepIndex + 1} / {cookingSteps.length}
            </Text>
            <TouchableOpacity
              onPress={handleExitCookingMode}
              style={styles.ttsCloseBtn}
            >
              <Text style={styles.ttsCloseBtnText}>종료 ✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.ttsBody}>
            <Text style={styles.ttsBigText}>
              {cookingSteps[currentStepIndex]}
            </Text>
          </View>
          <View style={styles.ttsControls}>
            <TouchableOpacity
              style={[
                styles.ttsBtn,
                currentStepIndex === 0 && { opacity: 0.3 },
              ]}
              onPress={handlePrevStep}
              disabled={currentStepIndex === 0}
            >
              <Text style={styles.ttsBtnText}>⬅️ 이전</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ttsBtnMain}
              onPress={handleReplayStep}
            >
              <Text style={styles.ttsBtnMainText}>🔊 다시 듣기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.ttsBtn,
                currentStepIndex === cookingSteps.length - 1 && {
                  opacity: 0.3,
                },
              ]}
              onPress={handleNextStep}
              disabled={currentStepIndex === cookingSteps.length - 1}
            >
              <Text style={styles.ttsBtnText}>다음 ➡️</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* 🛒 쇼핑 검색 모달 */}
      <Modal
        visible={shoppingModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShoppingModalVisible(false)}
      >
        <View style={styles.shoppingModalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShoppingModalVisible(false)}
          />
          <View style={styles.shoppingModalContent}>
            <Text style={styles.shoppingTitle}>🛒 온라인 장보기</Text>
            <Text style={styles.shoppingSub}>
              부족한 식재료를 온라인에서 바로 검색해 보세요.
            </Text>

            <TextInput
              style={styles.styleInput}
              placeholder="예: 대파, 양파, 돼지고기"
              placeholderTextColor="#A89F9C"
              value={searchIngredient}
              onChangeText={setSearchIngredient}
              onSubmitEditing={handleShoppingSearch}
            />

            <TouchableOpacity
              style={styles.shoppingSubmitBtn}
              onPress={handleShoppingSearch}
            >
              <Text style={styles.shoppingSubmitBtnText}>
                온라인 마트 최저가 검색 🔍
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const markdownStyles = StyleSheet.create({
  body: { color: "#3A2E2B", fontSize: 15, lineHeight: 24 },
  heading1: { color: "#FF8C00", fontSize: 22, fontWeight: "bold" },
  blockquote: {
    backgroundColor: "#F9F5F3",
    borderLeftWidth: 4,
    borderLeftColor: "#4CAF50",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    marginVertical: 10,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#2A2421" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: Platform.OS === "android" ? 50 : 20,
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#FFFDF9",
    marginBottom: 5,
  },
  headerSub: { fontSize: 14, color: "#A89F9C" },
  limitBadge: {
    backgroundColor: "#4A3F3A",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FF8C00",
  },
  searchIconBtn: {
    padding: 10,
    backgroundColor: "#3A322F",
    borderRadius: 20,
    marginRight: 10,
  },
  limitBadgeText: { color: "#FFB347", fontSize: 12, fontWeight: "bold" },

  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    color: "#FF8C00",
    marginTop: 15,
    fontSize: 15,
    fontWeight: "bold",
  },
  emptyEmoji: { fontSize: 50, marginBottom: 15 },
  emptyText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFDF9",
    marginBottom: 8,
  },
  emptySubText: { fontSize: 14, color: "#A89F9C", textAlign: "center" },

  listContainer: { padding: 15, paddingBottom: 100 },
  feedCard: {
    backgroundColor: "#3A322F",
    borderRadius: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#4A3F3A",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  feedContent: { padding: 20, paddingBottom: 15 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  authorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4A3F3A",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  authorIcon: { fontSize: 14, marginRight: 5 },
  authorName: { fontSize: 13, color: "#FFFDF9", fontWeight: "bold" },
  cardDate: { fontSize: 12, color: "#8C7A76", fontWeight: "bold" },
  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FF8C00",
    marginBottom: 10,
    lineHeight: 24,
  },
  cardPreview: { fontSize: 13, color: "#A89F9C", lineHeight: 20 },

  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: "#4A3F3A",
    backgroundColor: "rgba(0,0,0,0.1)",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  likeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4A3F3A",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  likeIcon: { fontSize: 14, marginRight: 6 },
  likeCount: { color: "#FFFDF9", fontSize: 13, fontWeight: "bold" },
  readMoreText: { color: "#FF8C00", fontSize: 13, fontWeight: "bold" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    height: "85%",
    backgroundColor: "#FFFDF9",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#E8D5D0",
  },
  starBtn: {
    backgroundColor: "#FFF3E0",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginRight: 10,
  },
  starBtnText: { color: "#FF8C00", fontSize: 12, fontWeight: "bold" },
  modalAuthor: { fontSize: 16, fontWeight: "900", color: "#8E24AA" },
  closeBtn: {
    backgroundColor: "#F5EBE7",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  closeBtnText: { color: "#3A2E2B", fontSize: 13, fontWeight: "bold" },
  markdownScroll: { flex: 1 },

  ttsStartBtn: {
    backgroundColor: "#E3F2FD",
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: "center",
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#CE93D8",
  },
  ttsStartBtnText: { color: "#8E24AA", fontSize: 15, fontWeight: "900" },
  scrapBtn: {
    backgroundColor: "#4CAF50",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 15,
  },
  scrapBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  proModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    padding: 20,
  },
  proModalContent: {
    backgroundColor: "#2A2421",
    borderRadius: 24,
    padding: 25,
    borderWidth: 1,
    borderColor: "#FF8C00",
    alignItems: "center",
    shadowColor: "#FF8C00",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 15,
  },
  proTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#FF8C00",
    marginBottom: 10,
  },
  proSubTitle: {
    fontSize: 14,
    color: "#FFFDF9",
    textAlign: "center",
    marginBottom: 20,
    fontWeight: "bold",
  },
  proBenefitBox: {
    backgroundColor: "#3A322F",
    padding: 15,
    borderRadius: 12,
    width: "100%",
    marginBottom: 25,
  },
  proBenefitText: {
    color: "#E8D5D0",
    fontSize: 13,
    marginBottom: 8,
    fontWeight: "bold",
  },
  proSubscribeBtn: {
    backgroundColor: "#FF8C00",
    paddingVertical: 16,
    width: "100%",
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  proSubscribeBtnText: { color: "#000", fontSize: 16, fontWeight: "900" },
  proCancelBtn: { paddingVertical: 10 },
  proCancelBtnText: {
    color: "#A89F9C",
    fontSize: 13,
    fontWeight: "bold",
    textDecorationLine: "underline",
  },

  ttsContainer: {
    flex: 1,
    backgroundColor: "#2A2421",
    padding: 20,
    justifyContent: "space-between",
  },
  ttsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
  },
  ttsStepIndicator: { color: "#FFB347", fontSize: 18, fontWeight: "bold" },
  ttsCloseBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  ttsCloseBtnText: { color: "#fff", fontWeight: "bold" },
  ttsBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  ttsBigText: {
    color: "#FFFDF9",
    fontSize: 32,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 45,
  },
  ttsControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 40,
  },
  ttsBtn: {
    backgroundColor: "#4A3F3A",
    paddingVertical: 20,
    flex: 1,
    borderRadius: 20,
    alignItems: "center",
    marginHorizontal: 5,
  },
  ttsBtnText: { color: "#FFFDF9", fontSize: 16, fontWeight: "bold" },
  ttsBtnMain: {
    backgroundColor: "#FF8C00",
    paddingVertical: 25,
    flex: 1.5,
    borderRadius: 25,
    alignItems: "center",
    marginHorizontal: 5,
    shadowColor: "#FF8C00",
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  ttsBtnMainText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  filterContainer: { paddingHorizontal: 20, marginBottom: 15 },
  filterBtn: {
    backgroundColor: "#3A322F",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#5A4E49",
    alignSelf: "flex-start",
  },
  filterBtnActive: { backgroundColor: "#4CAF50", borderColor: "#4CAF50" },
  filterBtnText: { color: "#A89F9C", fontSize: 13, fontWeight: "bold" },
  filterBtnTextActive: { color: "#FFF", fontSize: 13, fontWeight: "900" },
  favoriteBadge: {
    marginLeft: 8,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  matchBadge: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 10,
  },
  matchBadgeText: { color: "#fff", fontSize: 11, fontWeight: "bold" },
  shoppingBtn: {
    backgroundColor: "#0073E9",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 10,
  },
  shoppingBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  shoppingModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  shoppingModalContent: {
    backgroundColor: "#3A322F",
    borderRadius: 24,
    padding: 25,
    borderWidth: 1,
    borderColor: "#0073E9",
    position: "relative",
    width: "90%",
  },
  shoppingTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0073E9",
    marginBottom: 10,
    textAlign: "center",
  },
  shoppingSub: {
    fontSize: 14,
    color: "#FFFDF9",
    textAlign: "center",
    marginBottom: 20,
  },
  styleInput: {
    backgroundColor: "#2A2421",
    color: "#FFFDF9",
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#5A4E49",
    marginBottom: 20,
  },
  shoppingSubmitBtn: {
    backgroundColor: "#0073E9",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  shoppingSubmitBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  rankingSection: { marginBottom: 20, paddingTop: 10 },
  rankingTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFD700",
    marginBottom: 15,
    paddingHorizontal: 20,
  },
  rankingScroll: { gap: 15, paddingHorizontal: 20, paddingBottom: 10 },
  rankingCard: {
    backgroundColor: "#3A322F",
    padding: 15,
    borderRadius: 16,
    width: 160,
    borderWidth: 1,
    borderColor: "#FFD700",
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  rankingBadge: {
    position: "absolute",
    top: -10,
    left: 10,
    backgroundColor: "#000",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  rankingBadgeText: { color: "#FFD700", fontSize: 12, fontWeight: "900" },
  rankingAuthor: {
    color: "#FFFDF9",
    fontSize: 12,
    fontWeight: "bold",
    marginTop: 10,
    marginBottom: 5,
  },
  rankingRecipeTitle: {
    color: "#FF8C00",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 10,
  },
  rankingLikeBox: {
    backgroundColor: "#2A2421",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rankingLikeIcon: { color: "#E8D5D0", fontSize: 12, fontWeight: "bold" },
});
