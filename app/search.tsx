import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";
import { Colors, Radius, Shadows } from "../constants/design-tokens";

type RecipeItem = {
  id: string;
  content: string;
  source?: string;
  isLocal?: boolean;
  authorName?: string;
  likes?: number;
  createdAt?: string;
};

// 인기 검색어 목록 정의
const POPULAR_KEYWORDS = [
  "김치찌개",
  "파스타",
  "다이어트",
  "계란말이",
  "볶음밥",
  "떡볶이",
  "된장찌개",
  "샐러드",
  "스테이크",
  "비빔밥",
];

// 테스트용 더미 데이터 (Plaza와 동일하게 맞춤)
const DUMMY_RECIPES: RecipeItem[] = [
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

export default function SearchPortalScreen() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<RecipeItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [recentChefs, setRecentChefs] = useState<string[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const [isCookingMode, setIsCookingMode] = useState(false);
  const [cookingSteps, setCookingSteps] = useState<string[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const [applyProfileFilter, setApplyProfileFilter] = useState(true);
  const [myDiet, setMyDiet] = useState<string[]>([]);
  const [myAllergies, setMyAllergies] = useState<string[]>([]);

  useEffect(() => {
    const loadData = async () => {
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
      const historyRaw = await AsyncStorage.getItem("cookdex_search_history");
      if (historyRaw) {
        setSearchHistory(JSON.parse(historyRaw));
      }
      const chefsRaw = await AsyncStorage.getItem("cookdex_recent_chefs");
      if (chefsRaw) {
        setRecentChefs(JSON.parse(chefsRaw));
      }
    };
    loadData();
  }, []);

  const saveSearchKeyword = async (term: string) => {
    if (!term) return;
    let newHistory = [term, ...searchHistory.filter((t) => t !== term)];
    if (newHistory.length > 10) newHistory = newHistory.slice(0, 10);
    setSearchHistory(newHistory);
    await AsyncStorage.setItem(
      "cookdex_search_history",
      JSON.stringify(newHistory),
    );
  };

  const removeHistoryItem = async (term: string) => {
    const newHistory = searchHistory.filter((t) => t !== term);
    setSearchHistory(newHistory);
    await AsyncStorage.setItem(
      "cookdex_search_history",
      JSON.stringify(newHistory),
    );
  };

  const clearAllHistory = async () => {
    setSearchHistory([]);
    await AsyncStorage.removeItem("cookdex_search_history");
  };

  const saveViewedChef = async (name?: string) => {
    if (!name) return;
    let updated = [name, ...recentChefs.filter((c) => c !== name)];
    if (updated.length > 10) updated = updated.slice(0, 10);
    setRecentChefs(updated);
    await AsyncStorage.setItem("cookdex_recent_chefs", JSON.stringify(updated));
  };

  const handleSearch = async (searchTerm = keyword) => {
    const term = searchTerm.trim();
    if (!term) return;

    setKeyword(term);
    saveSearchKeyword(term);
    Keyboard.dismiss();
    setIsLoading(true);
    setResults([]);
    setHasSearched(true);

    try {
      let combinedResults: RecipeItem[] = [];

      // 내 주방에서 검색
      const savedRaw = await AsyncStorage.getItem("cookdex_saved_recipes");
      const savedRecipes = savedRaw ? JSON.parse(savedRaw) : [];
      const filteredSaved = savedRecipes.filter((r: { content?: string }) =>
        r.content?.includes(term),
      );
      combinedResults = [
        ...combinedResults,
        ...filteredSaved.map((r: RecipeItem) => ({
          ...r,
          source: "내 주방 🍳",
          isLocal: true,
        })),
      ];

      // 요리 광장(실제 + 더미)에서 검색
      let globalData: RecipeItem[] = [];
      try {
        const recipesRef = collection(db, "global_recipes");
        const q = query(recipesRef, orderBy("createdAt", "desc"), limit(50));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.content?.includes(term)) {
            globalData.push({
              id: doc.id,
              ...data,
              source: "요리 광장 🌍",
              isLocal: false,
            } as RecipeItem);
          }
        });
      } catch (e) {
        console.log("DB 검색 실패 (오프라인 또는 권한 문제)");
      }

      const dummyResults = DUMMY_RECIPES.filter((r) =>
        r.content.includes(term),
      ).map((r) => ({
        ...r,
        source: "요리 광장 🌍 (테스트)",
        isLocal: false,
      }));

      const existingIds = new Set(globalData.map((r) => r.id));
      dummyResults.forEach((r) => {
        if (!existingIds.has(r.id)) globalData.push(r);
      });
      combinedResults = [...combinedResults, ...globalData];

      if (applyProfileFilter) {
        combinedResults = combinedResults.sort((a, b) => {
          let scoreA = 0;
          let scoreB = 0;
          if (myAllergies.some((alg) => a.content.includes(alg)))
            scoreA -= 1000;
          if (myAllergies.some((alg) => b.content.includes(alg)))
            scoreB -= 1000;
          if (myDiet.some((d) => a.content.includes(d))) scoreA += 10;
          if (myDiet.some((d) => b.content.includes(d))) scoreB += 10;
          return scoreB - scoreA;
        });
      }

      setResults(combinedResults);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const extractTitle = (content: string) => {
    const match = content.match(/#\s+(.*)/);
    return match ? match[1] : "이름 없는 요리";
  };

  const openRecipeDetail = (recipe: RecipeItem) => {
    setSelectedRecipe(recipe);
    setModalVisible(true);
    if (recipe.authorName) {
      saveViewedChef(recipe.authorName);
    }
  };

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
    if (extractedSteps.length === 0) return;
    setCookingSteps(extractedSteps);
    setCurrentStepIndex(0);
    setIsCookingMode(true);
    Speech.speak(extractedSteps[0], { language: "ko-KR", rate: 0.95 });
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

  const handleShoppingSearch = () => {
    const title = extractTitle(selectedRecipe?.content || "");
    const coupangUrl = `https://m.coupang.com/nm/search?q=${encodeURIComponent(title + " 밀키트")}`;
    Linking.openURL(coupangUrl);
  };

  const handleRequestRecipe = async () => {
    if (!keyword.trim()) return;
    try {
      const currentUser = auth.currentUser;
      await addDoc(collection(db, "global_recipes"), {
        content: `# [요청] ${keyword}\n\n이 요리의 레시피를 찾고 있어요! 🥺\n맛있는 레시피를 아시는 셰프님들은 댓글이나 새 레시피로 공유해주세요! 🙏`,
        authorId: currentUser?.uid || "anonymous",
        authorName: currentUser?.displayName || "배고픈 셰프",
        createdAt: new Date().toISOString(),
        likes: 0,
        type: "request",
      });
      Alert.alert(
        "요청 완료 ✅",
        `"${keyword}" 레시피 요청이 요리 광장에 등록되었습니다!\n(다른 셰프님들이 곧 레시피를 올려줄 거예요)`,
      );
      router.push("/(tabs)/plaza");
    } catch (error) {
      Alert.alert("오류", "요청 등록에 실패했습니다.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.searchBarWrapper}>
          <TextInput
            style={styles.searchInput}
            placeholder="레시피, 재료 검색..."
            placeholderTextColor="#A89F9C"
            value={keyword}
            onChangeText={(text) => {
              setKeyword(text);
              if (text === "") setHasSearched(false);
            }}
            onSubmitEditing={() => handleSearch(keyword)}
            returnKeyType="search"
            autoFocus
          />
          {keyword.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setKeyword("");
                setHasSearched(false);
              }}
              style={styles.clearSearchBtn}
            >
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => handleSearch(keyword)}
        >
          <Text style={styles.searchBtnText}>검색</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[
            styles.profileFilterBtn,
            applyProfileFilter && styles.profileFilterBtnActive,
          ]}
          onPress={() => setApplyProfileFilter(!applyProfileFilter)}
        >
          <Text
            style={[
              styles.profileFilterText,
              applyProfileFilter && styles.profileFilterTextActive,
            ]}
          >
            안심 필터 {applyProfileFilter ? "ON" : "OFF"}
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#FF8C00" />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item, index) => item.id + index}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.centerBox}>
              {!hasSearched ? (
                <>
                  {searchHistory.length > 0 && (
                    <View style={styles.historyContainer}>
                      <View style={styles.historyHeader}>
                        <Text style={styles.historyTitle}>🕒 최근 검색어</Text>
                        <TouchableOpacity onPress={clearAllHistory}>
                          <Text style={styles.clearHistoryText}>전체 삭제</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.historyTags}>
                        {searchHistory.map((term, index) => (
                          <View key={index} style={styles.historyTag}>
                            <TouchableOpacity
                              onPress={() => handleSearch(term)}
                            >
                              <Text style={styles.historyTagText}>{term}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => removeHistoryItem(term)}
                              style={styles.deleteHistoryBtn}
                            >
                              <Text style={styles.deleteHistoryText}>✕</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  {recentChefs.length > 0 && (
                    <View style={styles.recentChefContainer}>
                      <View style={styles.recentChefHeader}>
                        <Text style={styles.recentChefTitle}>👨‍🍳 최근 본 셰프</Text>
                      </View>
                      <View style={styles.recentChefTags}>
                        {recentChefs.map((name, index) => (
                          <TouchableOpacity
                            key={index}
                            style={styles.recentChefTag}
                            onPress={() => handleSearch(name)}
                          >
                            <Text style={styles.recentChefTagText}>{name} 셰프</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                  <View style={styles.popularContainer}>
                    <Text style={styles.popularTitle}>
                      🔥 요즘 인기있는 검색어
                    </Text>
                    <View style={styles.popularTags}>
                      {POPULAR_KEYWORDS.map((term, index) => (
                        <TouchableOpacity
                          key={index}
                          style={styles.popularTag}
                          onPress={() => handleSearch(term)}
                        >
                          <Text style={styles.popularTagText}>{term}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </>
              ) : (
                <Text style={styles.emptyText}>검색 결과가 없습니다.</Text>
              )}
              {applyProfileFilter && myAllergies.length > 0 && (
                <Text style={styles.filterInfo}>
                  🛡️ 알레르기 유발 레시피는 후순위로 밀려납니다.
                </Text>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const hasAllergy = myAllergies.some((alg) =>
              item.content.includes(alg),
            );
            return (
              <TouchableOpacity
                style={[styles.resultCard, hasAllergy && { opacity: 0.6 }]}
                onPress={() => openRecipeDetail(item)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.sourceBadge}>{item.source}</Text>
                  {hasAllergy && (
                    <Text style={styles.allergyWarning}>⚠️ 알레르기 주의</Text>
                  )}
                </View>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {extractTitle(item.content)}
                </Text>
                <Text style={styles.cardPreview} numberOfLines={2}>
                  {item.content.replace(/#/g, "").replace(/\*/g, "").trim()}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedRecipe
                  ? extractTitle(selectedRecipe.content)
                  : "레시피"}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeModalBtn}
              >
                <Text style={styles.closeModalText}>닫기 ✕</Text>
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
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
            >
              {selectedRecipe && (
                <Markdown style={markdownStyles}>
                  {selectedRecipe.content}
                </Markdown>
              )}
              <View style={{ height: 20 }} />
            </ScrollView>
            <TouchableOpacity
              style={styles.shoppingBtn}
              onPress={handleShoppingSearch}
            >
              <Text style={styles.shoppingBtnText}>
                🛒 관련 재료/밀키트 검색
              </Text>
            </TouchableOpacity>
            <View style={{ height: 20 }} />
          </View>
        </View>
      </Modal>

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
    </SafeAreaView>
  );
}

const markdownStyles = StyleSheet.create({
  body: { color: "#3A2E2B", fontSize: 15, lineHeight: 24 },
  heading1: { color: "#FF8C00", fontSize: 22, fontWeight: "bold" },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgMain },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: Colors.bgMain,
  },
  backBtn: { padding: 10 },
  backBtnText: { color: Colors.textMain, fontSize: 20 },
  searchBarWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingRight: 10,
    ...Shadows.soft,
  },
  searchInput: {
    flex: 1,
    color: Colors.textMain,
    padding: 12,
    fontSize: 16,
  },
  searchBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  searchBtnText: { color: Colors.textInverse, fontWeight: "bold" },
  clearSearchBtn: { padding: 5 },
  clearSearchText: { color: Colors.textSub, fontSize: 16, fontWeight: "bold" },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    alignItems: "center",
    backgroundColor: Colors.bgMain,
  },
  profileFilterBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    minWidth: 120,
    alignItems: "center",
  },
  profileFilterBtnActive: {},
  profileFilterText: { color: Colors.primary, fontSize: 12, fontWeight: "bold" },
  profileFilterTextActive: { color: Colors.primary },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  centerBox: { flex: 1, alignItems: "center", marginTop: 20, paddingHorizontal: 16 },
  emptyText: {
    color: Colors.textSub,
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 30,
  },
  filterInfo: { color: Colors.success, fontSize: 12, marginTop: 10 },
  historyContainer: { width: "100%", paddingHorizontal: 4, marginBottom: 24 },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  historyTitle: { color: Colors.textSub, fontSize: 14, fontWeight: "bold" },
  clearHistoryText: { color: Colors.actionDelete, fontSize: 12 },
  historyTags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  historyTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgElevated,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  historyTagText: { color: Colors.textMain, fontSize: 13, marginRight: 5 },
  deleteHistoryBtn: { padding: 4 },
  deleteHistoryText: { color: Colors.textSub, fontSize: 12 },
  popularContainer: { width: "100%", paddingHorizontal: 4, marginBottom: 24 },
  popularTitle: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },
  popularTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  popularTag: {
    backgroundColor: Colors.bgElevated,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  popularTagText: { color: Colors.textMain, fontSize: 14 },
  resultCard: {
    backgroundColor: Colors.bgElevated,
    padding: 15,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sourceBadge: { color: Colors.primary, fontSize: 12, fontWeight: "bold" },
  allergyWarning: { color: Colors.danger, fontSize: 12, fontWeight: "bold" },
  cardTitle: {
    color: Colors.textMain,
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  cardPreview: { color: Colors.textSub, fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
    justifyContent: "flex-end",
  },
  modalContent: {
    height: "85%",
    backgroundColor: Colors.bgModal,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: Colors.primary, flex: 1 },
  closeModalBtn: { padding: 5 },
  closeModalText: { color: Colors.textMain, fontWeight: "bold" },
  ttsStartBtn: {
    backgroundColor: Colors.primarySoft,
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: "center",
    marginBottom: 15,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  ttsStartBtnText: { color: Colors.primary, fontSize: 15, fontWeight: "900" },
  shoppingBtn: {
    backgroundColor: Colors.actionShop,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 10,
  },
  shoppingBtnText: { color: Colors.textInverse, fontSize: 16, fontWeight: "900" },
  ttsContainer: {
    flex: 1,
    backgroundColor: Colors.bgMain,
    padding: 20,
    justifyContent: "space-between",
  },
  ttsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
  },
  ttsStepIndicator: { color: Colors.primary, fontSize: 18, fontWeight: "bold" },
  ttsCloseBtn: {
    backgroundColor: Colors.bgElevated,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  ttsCloseBtnText: { color: Colors.textMain, fontWeight: "bold" },
  ttsBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  ttsBigText: {
    color: Colors.textMain,
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
    backgroundColor: Colors.bgElevated,
    paddingVertical: 20,
    flex: 1,
    borderRadius: 20,
    alignItems: "center",
    marginHorizontal: 5,
  },
  ttsBtnText: { color: Colors.textMain, fontSize: 16, fontWeight: "bold" },
  ttsBtnMain: {
    backgroundColor: Colors.primary,
    paddingVertical: 25,
    flex: 1.5,
    borderRadius: 25,
    alignItems: "center",
    marginHorizontal: 5,
    ...Shadows.glassTight,
  },
  ttsBtnMainText: { color: Colors.textInverse, fontSize: 18, fontWeight: "900" },
});
