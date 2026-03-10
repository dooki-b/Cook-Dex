import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "../../firebaseConfig";

// 🚨 기본 양념장 리스트 추가
const DEFAULT_CONDIMENTS = [
  "소금",
  "설탕",
  "후추",
  "간장",
  "된장",
  "고추장",
  "식초",
  "참기름",
  "들기름",
  "식용유",
  "고춧가루",
  "다진 마늘",
  "깨",
];

const DEFAULT_DIETS = [
  "다이어트",
  "고단백",
  "저탄고지",
  "비건",
  "저염식",
  "키토제닉",
  "글루텐프리",
  "당뇨식",
];

const DEFAULT_ALLERGIES = [
  "땅콩",
  "우유",
  "계란",
  "밀가루",
  "갑각류",
  "생선",
  "복숭아",
  "대두",
  "메밀",
];

const TAB_CONFIG = {
  pantry: {
    title: "🧂 양념장",
    placeholder:
      "집에 항상 구비해두는 기본 양념이나 재료를 등록하세요. (예: 간장, 소금, 참기름)",
  },
  diet: {
    title: "🥗 식단",
    placeholder:
      "추구하는 식단 스타일을 등록하세요. (예: 저탄고지, 비건, 고단백)",
  },
  allergy: {
    title: "🤧 알레르기",
    placeholder:
      "절대 먹으면 안 되는 재료를 등록하세요. (예: 땅콩, 오이, 갑각류)",
  },
};

export default function ProfileScreen() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [userNickname, setUserNickname] = useState("");

  // 설정 모달 상태
  const [modalVisible, setModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState("pantry"); // 'pantry' | 'diet' | 'allergy'
  const [inputText, setInputText] = useState("");

  const [dietGoal, setDietGoal] = useState([]);
  const [allergies, setAllergies] = useState([]); // 🚨 배열로 변경
  const [condiments, setCondiments] = useState([]); // 🚨 양념장 추가

  // 🚨 신규 설정 상태
  const [pushEnabled, setPushEnabled] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        setUserEmail(currentUser.email);
        setUserNickname(currentUser.displayName || "셰프");
      }

      const savedDiet = await AsyncStorage.getItem("cookdex_diet_goal");
      if (savedDiet) setDietGoal(JSON.parse(savedDiet));

      const savedAllergies = await AsyncStorage.getItem("cookdex_allergies");
      if (savedAllergies) {
        try {
          // 기존 문자열 데이터 호환 처리
          const parsed = JSON.parse(savedAllergies);
          if (Array.isArray(parsed)) setAllergies(parsed);
          else setAllergies([savedAllergies]);
        } catch {
          setAllergies(
            savedAllergies
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s),
          );
        }
      }

      const savedCondiments = await AsyncStorage.getItem("cookdex_condiments");
      if (savedCondiments) {
        try {
          setCondiments(JSON.parse(savedCondiments));
        } catch {}
      }

      // 🚨 설정 로드
      const savedPush = await AsyncStorage.getItem("cookdex_push_enabled");
      if (savedPush !== null) setPushEnabled(JSON.parse(savedPush));

      const savedTheme = await AsyncStorage.getItem("cookdex_dark_mode");
      if (savedTheme !== null) setIsDarkMode(JSON.parse(savedTheme));
    };
    loadProfile();
  }, []);

  const handleLogout = async () => {
    Alert.alert("로그아웃", "정말 로그아웃 하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "로그아웃",
        style: "destructive",
        onPress: async () => {
          await signOut(auth);
          await AsyncStorage.removeItem("cookdex_auto_login");
          router.replace("/login");
        },
      },
    ]);
  };

  const openModal = (tab) => {
    setActiveTab(tab);
    setInputText("");
    setModalVisible(true);
  };

  const addItem = async () => {
    if (!inputText.trim()) return;
    const newItem = inputText.trim();

    let updatedList = [];
    let storageKey = "";
    let setFunction = null;
    let currentList = [];

    if (activeTab === "pantry") {
      currentList = condiments;
      storageKey = "cookdex_condiments";
      setFunction = setCondiments;
    } else if (activeTab === "diet") {
      currentList = dietGoal;
      storageKey = "cookdex_diet_goal";
      setFunction = setDietGoal;
    } else {
      currentList = allergies;
      storageKey = "cookdex_allergies";
      setFunction = setAllergies;
    }

    if (currentList.includes(newItem)) {
      Alert.alert("알림", "이미 등록된 항목입니다.");
      return;
    }

    updatedList = [...currentList, newItem];
    setFunction(updatedList);
    await AsyncStorage.setItem(storageKey, JSON.stringify(updatedList));
    setInputText("");
  };

  const removeItem = async (itemToRemove) => {
    let updatedList = [];
    let storageKey = "";
    let setFunction = null;
    let currentList = [];

    if (activeTab === "pantry") {
      currentList = condiments;
      storageKey = "cookdex_condiments";
      setFunction = setCondiments;
    } else if (activeTab === "diet") {
      currentList = dietGoal;
      storageKey = "cookdex_diet_goal";
      setFunction = setDietGoal;
    } else {
      currentList = allergies;
      storageKey = "cookdex_allergies";
      setFunction = setAllergies;
    }

    updatedList = currentList.filter((item) => item !== itemToRemove);
    setFunction(updatedList);
    await AsyncStorage.setItem(storageKey, JSON.stringify(updatedList));
  };

  const replayTutorial = () => {
    Alert.alert("튜토리얼", "앱 사용 가이드를 다시 보시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "다시보기", onPress: () => router.push("/tutorial") },
    ]);
  };

  const getCurrentList = () => {
    if (activeTab === "pantry") return condiments;
    if (activeTab === "diet") return dietGoal;
    return allergies;
  };

  const togglePush = async () => {
    const newValue = !pushEnabled;
    setPushEnabled(newValue);
    await AsyncStorage.setItem(
      "cookdex_push_enabled",
      JSON.stringify(newValue),
    );
  };

  const toggleTheme = async () => {
    const newValue = !isDarkMode;
    setIsDarkMode(newValue);
    await AsyncStorage.setItem("cookdex_dark_mode", JSON.stringify(newValue));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>내 정보 ⚙️</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 프로필 카드 */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={{ fontSize: 30 }}>👨‍🍳</Text>
          </View>
          <View>
            <Text style={styles.nickname}>{userNickname}</Text>
            <Text style={styles.email}>{userEmail}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>앱 설정</Text>

        {/* 🚨 다크 모드 & 알림 설정 */}
        <View style={styles.settingGroup}>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>🌙 다크 모드</Text>
            <Switch
              trackColor={{ false: "#E8D5D0", true: "#FF8C00" }}
              thumbColor={isDarkMode ? "#fff" : "#f4f3f4"}
              onValueChange={toggleTheme}
              value={isDarkMode}
            />
          </View>

          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>🔔 기념일 Push 알림</Text>
              <Text style={styles.settingSubLabel}>
                특별한 날 레시피 추천 받기
              </Text>
            </View>
            <Switch
              trackColor={{ false: "#E8D5D0", true: "#FF8C00" }}
              thumbColor={pushEnabled ? "#fff" : "#f4f3f4"}
              onValueChange={togglePush}
              value={pushEnabled}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>맞춤 요리 설정</Text>

        {/* 🚨 통합 설정 버튼 */}
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => openModal("pantry")}
        >
          <View>
            <Text style={styles.settingLabel}>🍳 맞춤 요리 설정</Text>
            <Text style={styles.settingValue} numberOfLines={1}>
              나의 양념장, 식단, 알레르기 정보를 관리합니다.
            </Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem} onPress={replayTutorial}>
          <Text style={styles.settingLabel}>📖 튜토리얼 다시보기</Text>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingItem, { borderBottomWidth: 0 }]}
          onPress={handleLogout}
        >
          <Text style={[styles.settingLabel, { color: "#FF6B6B" }]}>
            🚪 로그아웃
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 🚨 통합 설정 모달 */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* 탭 헤더 */}
            <View style={styles.tabHeader}>
              <TouchableOpacity
                style={[
                  styles.tabBtn,
                  activeTab === "pantry" && styles.tabBtnActive,
                ]}
                onPress={() => {
                  setActiveTab("pantry");
                  setInputText("");
                }}
              >
                <Text
                  style={[
                    styles.tabBtnText,
                    activeTab === "pantry" && styles.tabBtnTextActive,
                  ]}
                >
                  {TAB_CONFIG.pantry.title}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tabBtn,
                  activeTab === "diet" && styles.tabBtnActive,
                ]}
                onPress={() => {
                  setActiveTab("diet");
                  setInputText("");
                }}
              >
                <Text
                  style={[
                    styles.tabBtnText,
                    activeTab === "diet" && styles.tabBtnTextActive,
                  ]}
                >
                  {TAB_CONFIG.diet.title}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tabBtn,
                  activeTab === "allergy" && styles.tabBtnActive,
                ]}
                onPress={() => {
                  setActiveTab("allergy");
                  setInputText("");
                }}
              >
                <Text
                  style={[
                    styles.tabBtnText,
                    activeTab === "allergy" && styles.tabBtnTextActive,
                  ]}
                >
                  {TAB_CONFIG.allergy.title}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              {TAB_CONFIG[activeTab].placeholder}
            </Text>

            {/* 태그 리스트 영역 */}
            <View style={styles.tagListContainer}>
              {getCurrentList().map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.tagBadge}
                  onPress={() => removeItem(item)}
                >
                  <Text style={styles.tagText}>{item} ✕</Text>
                </TouchableOpacity>
              ))}
              {getCurrentList().length === 0 && (
                <Text style={styles.emptyText}>등록된 항목이 없습니다.</Text>
              )}
            </View>

            {/* 🚨 추천 태그 영역 (양념장, 식단, 알레르기 모두 적용) */}
            {(activeTab === "pantry" ||
              activeTab === "diet" ||
              activeTab === "allergy") && (
              <View style={styles.suggestionContainer}>
                <Text style={styles.suggestionTitle}>
                  {activeTab === "pantry"
                    ? "기본 양념 빠른 추가"
                    : activeTab === "diet"
                      ? "인기 식단 목표"
                      : "주요 알레르기 유발 식품"}
                </Text>
                <View style={styles.tagListContainer}>
                  {(activeTab === "pantry"
                    ? DEFAULT_CONDIMENTS
                    : activeTab === "diet"
                      ? DEFAULT_DIETS
                      : DEFAULT_ALLERGIES
                  )
                    .filter((c) => !getCurrentList().includes(c))
                    .map((item, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.suggestionTag}
                        onPress={() => {
                          setInputText(item);
                          addItem();
                        }}
                      >
                        <Text style={styles.suggestionTagText}>{item} +</Text>
                      </TouchableOpacity>
                    ))}
                </View>
              </View>
            )}

            {/* 입력 영역 */}
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={inputText}
                onChangeText={setInputText}
                placeholder="항목 입력"
                placeholderTextColor="#A89F9C"
                onSubmitEditing={addItem}
              />
              <TouchableOpacity style={styles.addBtn} onPress={addItem}>
                <Text style={styles.addBtnText}>추가</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFDF9" },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: "#E8D5D0" },
  headerTitle: { fontSize: 22, fontWeight: "900", color: "#3A2E2B" },
  content: { padding: 20 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 20,
    borderRadius: 16,
    marginBottom: 30,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#E8D5D0",
  },

  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#F5EBE7",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  nickname: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#3A2E2B",
    marginBottom: 4,
  },
  email: { fontSize: 14, color: "#8C7A76" },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#A89F9C",
    marginBottom: 10,
    marginTop: 10,
  },
  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#F5EBE7",
  },
  settingLabel: {
    fontSize: 16,
    color: "#3A2E2B",
    fontWeight: "600",
    marginBottom: 4,
  },
  settingSubLabel: { fontSize: 12, color: "#8C7A76" },
  settingValue: { fontSize: 13, color: "#8C7A76", maxWidth: 250 },
  arrow: { fontSize: 20, color: "#D7CCC8" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 20,
    maxHeight: "80%",
  },

  // 🚨 탭 스타일
  tabHeader: {
    flexDirection: "row",
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#F5EBE7",
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBtnActive: { borderBottomColor: "#FF8C00" },
  tabBtnText: { fontSize: 14, color: "#A89F9C", fontWeight: "bold" },
  tabBtnTextActive: { color: "#FF8C00", fontWeight: "900" },

  modalSub: {
    fontSize: 13,
    color: "#8C7A76",
    marginBottom: 15,
    textAlign: "center",
  },

  tagListContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
    minHeight: 50,
  },
  tagBadge: {
    backgroundColor: "#F9F5F3",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E8D5D0",
  },
  tagText: { color: "#3A2E2B", fontSize: 14, fontWeight: "bold" },
  emptyText: {
    color: "#D7CCC8",
    fontSize: 14,
    width: "100%",
    textAlign: "center",
    marginTop: 10,
  },
  suggestionContainer: {
    marginTop: 10,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "#F5EBE7",
  },
  suggestionTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#A89F9C",
    marginBottom: 10,
  },
  suggestionTag: {
    backgroundColor: "#fff",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E8D5D0",
  },
  suggestionTagText: { color: "#8C7A76", fontSize: 14 },

  inputRow: { flexDirection: "row", gap: 10, marginBottom: 15 },
  input: {
    flex: 1,
    backgroundColor: "#F9F5F3",
    padding: 15,
    borderRadius: 12,
    fontSize: 16,
    color: "#3A2E2B",
    borderWidth: 1,
    borderColor: "#E8D5D0",
  },
  addBtn: {
    backgroundColor: "#FF8C00",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  addBtnText: { color: "#fff", fontWeight: "bold" },

  closeBtn: {
    backgroundColor: "#F5EBE7",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  closeBtnText: { color: "#8C7A76", fontWeight: "bold" },
  settingGroup: { marginBottom: 20 },
});
