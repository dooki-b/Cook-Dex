import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { doc, increment, setDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebaseConfig';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const COMMON_INGREDIENTS = ["감자", "고구마", "양파", "대파", "마늘", "돼지고기", "소고기", "닭고기", "생선", "계란", "두부", "김치", "통조림 햄", "소면", "치즈", "우유"];
const RECIPE_TYPES = ["메인 디쉬 🍛", "디저트 🍰", "음료/칵테일 🍹", "간단한 간식 🍟", "술안주 🍻", "샐러드/다이어트 🥗"];
const RECIPE_TASTES = ["매콤한 🔥", "단짠단짠 🍯🧂", "짭짤한 🧂", "자극적인 속세의 맛 😈", "담백하고 건강한 🌿", "따뜻한 국물 🍲"];

export default function CreateRecipeScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'select' | 'input'>('select');
  
  // 텍스트 입력 관련 상태
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  
  // 🚨 [신규] 텍스트 직접 입력 모드 상태
  const [inputText, setInputText] = useState("");
  const [isInputMode, setIsInputMode] = useState(false); // 텍스트 입력 모드 토글용
  
  // 생성 결과 관련 상태
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [recipeResult, setRecipeResult] = useState<string | null>(null);
  const [shoppingList, setShoppingList] = useState<string[]>([]);

  // 🚨 스타일 추천(수정) 관련 상태
  const [showStyleModal, setShowStyleModal] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [isCustomType, setIsCustomType] = useState(false);
  const [customTypeInput, setCustomTypeInput] = useState("");
  const [selectedTaste, setSelectedTaste] = useState("");
  const [isCustomTaste, setIsCustomTaste] = useState(false);
  const [customTasteInput, setCustomTasteInput] = useState("");

  // 🚨 TTS 조리 모드 상태
  const [isCookingMode, setIsCookingMode] = useState(false);
  const [cookingSteps, setCookingSteps] = useState<string[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const toggleIngredient = (ing: string) => {
    if (selectedIngredients.includes(ing)) setSelectedIngredients(prev => prev.filter(i => i !== ing));
    else setSelectedIngredients(prev => [...prev, ing]);
    setIngredientSearch(""); 
  };

  const addCustomIngredient = () => {
    const newIng = ingredientSearch.trim();
    if (newIng && !selectedIngredients.includes(newIng)) setSelectedIngredients(prev => [...prev, newIng]);
    setIngredientSearch("");
  };

  const filteredIngredients = COMMON_INGREDIENTS.filter(i => i.includes(ingredientSearch) && !selectedIngredients.includes(i));

  const generateTextRecipe = async (customStyleStr = "") => {
    if (selectedIngredients.length === 0) {
      Alert.alert("알림", "최소 1개 이상의 재료를 선택해주세요!");
      return;
    }

    setIsGenerating(true);
    setResultModalVisible(true);
    setRecipeResult(null);
    setShowStyleModal(false); // 스타일 모달 닫기

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      
      // 유저 맞춤 설정 로드
      const savedDietRaw = await AsyncStorage.getItem('cookdex_diet_goal');
      let savedDiet = [];
      try { savedDiet = savedDietRaw ? JSON.parse(savedDietRaw) : []; } catch (e) { savedDiet = savedDietRaw && savedDietRaw !== "없음" ? [savedDietRaw] : []; }
      const savedAllergies = await AsyncStorage.getItem('cookdex_allergies');
      
      const dietText = savedDiet.length > 0 ? `[식단 목표: ${savedDiet.join(', ')}]에 맞춰서 요리해 줘.` : "";
      const allergyText = savedAllergies && savedAllergies !== "없음" ? `[🚨치명적 경고🚨 알레르기 및 기피 재료: ${savedAllergies}] 이 재료들은 레시피에 절대 포함시키지 마!` : "";

      // 🚨 스타일 프롬프트 추가
      const stylePrompt = customStyleStr ? `[희망 요리 스타일: ${customStyleStr}]` : "";

      // 🚨 영양성분 및 칼로리 표기 지시사항 추가
      const systemPrompt = `너는 최고의 셰프 '쿡덱스'야. 사용자가 가진 재료(${selectedIngredients.join(', ')})를 활용해서 만들 수 있는 최고의 요리 레시피 1개를 추천해줘.
      ${dietText} ${allergyText} ${stylePrompt}
      
      ⚠️ 필수 지시사항: 1인분 기준 총 칼로리(kcal)와 탄단지(탄수화물, 단백질, 지방) 영양성분을 계산하여 레시피 제목 바로 아래에 표기해줘.

      반드시 아래 JSON 형식으로만 응답해. 마크다운(\`\`\`json) 절대 금지.
      { 
        "recipe_title": "요리 이름",
        "shopping_list": ["없어서 아쉬운 필수 재료 1", "없어서 아쉬운 필수 재료 2"], 
        "recipe_markdown": "# 요리 이름\n\n## 📊 영양 정보\n- 칼로리: 000kcal\n- 탄수화물: 0g, 단백질: 0g, 지방: 0g\n\n## 📝 재료\n- ...\n\n## 🍳 조리 순서\n1. ...\n2. ..." 
      }`;

      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] }) });
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error?.message || "API Error");

      let rawText = data.candidates[0].content.parts[0].text.trim().replace(/```json/g, '').replace(/```/g, ''); 
      const parsedData = JSON.parse(rawText);

      setRecipeResult(parsedData.recipe_markdown);
      setShoppingList(parsedData.shopping_list || []);

    } catch (error: any) {
      Alert.alert("생성 실패", "레시피를 만들지 못했습니다. 다시 시도해주세요.");
      setResultModalVisible(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const requestNewStyle = () => {
    let finalType = isCustomType && customTypeInput.trim() !== "" ? customTypeInput : selectedType;
    let finalTaste = isCustomTaste && customTasteInput.trim() !== "" ? customTasteInput : selectedTaste;
    let styleStr = "";
    if (finalType) styleStr += `요리 종류: ${finalType}, `;
    if (finalTaste) styleStr += `맛/분위기: ${finalTaste}`;
    
    if (!styleStr) { Alert.alert("알림", "원하시는 요리 종류나 맛을 선택해주세요!"); return; }
    
    generateTextRecipe(styleStr);
  };

  // 🚨 TTS 조리 모드 함수
  const startCookingMode = () => {
    if (!recipeResult) return;
    const extractedSteps = recipeResult.split('\n').filter(line => /^\d+\.\s/.test(line.trim())).map(line => line.replace(/^\d+\.\s/, '').replace(/\*\*/g, '').trim());
    if (extractedSteps.length === 0) { Alert.alert("알림", "조리 단계를 인식하지 못했습니다."); return; }
    setCookingSteps(extractedSteps); setCurrentStepIndex(0); setIsCookingMode(true);
    Speech.speak(extractedSteps[0], { language: 'ko-KR', rate: 0.95, pitch: 1.0 });
  };
  const handleNextStep = () => { if (currentStepIndex < cookingSteps.length - 1) { Speech.stop(); setCurrentStepIndex(prev => prev + 1); Speech.speak(cookingSteps[currentStepIndex + 1], { language: 'ko-KR', rate: 0.95 }); } };
  const handlePrevStep = () => { if (currentStepIndex > 0) { Speech.stop(); setCurrentStepIndex(prev => prev - 1); Speech.speak(cookingSteps[currentStepIndex - 1], { language: 'ko-KR', rate: 0.95 }); } };
  const handleReplayStep = () => { Speech.stop(); Speech.speak(cookingSteps[currentStepIndex], { language: 'ko-KR', rate: 0.95 }); };
  const handleExitCookingMode = () => { Speech.stop(); setIsCookingMode(false); };

  const handleShopping = (item: string) => {
    const coupangSearchUrl = `https://m.coupang.com/nm/search?q=${encodeURIComponent(item)}`;
    Linking.openURL(coupangSearchUrl).catch((err) => console.error('쇼핑몰 연결 실패', err));
  };

  const handleSave = async (isSharing: boolean) => {
    if (!recipeResult) return;
    try {
      const recipeId = Date.now().toString();
      const newRecipe = { id: recipeId, date: new Date().toLocaleDateString(), content: recipeResult };
      
      const existingData = await AsyncStorage.getItem('cookdex_saved_recipes');
      const savedRecipes = existingData ? JSON.parse(existingData) : [];
      savedRecipes.unshift(newRecipe);
      await AsyncStorage.setItem('cookdex_saved_recipes', JSON.stringify(savedRecipes));

      const earnedExp = isSharing ? 30 : 10;
      const currentExp = parseInt(await AsyncStorage.getItem('cookdex_user_exp') || '0');
      await AsyncStorage.setItem('cookdex_user_exp', (currentExp + earnedExp).toString());

      const currentUser = auth.currentUser;
      if (currentUser) {
        await setDoc(doc(db, "users", currentUser.uid), { totalExp: increment(earnedExp) }, { merge: true });
        if (isSharing) {
          await setDoc(doc(db, "global_recipes", recipeId), { 
            id: recipeId, content: recipeResult, authorId: currentUser.uid, authorName: currentUser.displayName || "익명", createdAt: new Date().toISOString(), likes: 0 
          });
          Alert.alert("공유 완료! 🌍", `광장에 레시피를 자랑했습니다! (+${earnedExp} EXP)`);
        } else {
          Alert.alert("저장 완료! 🍳", `내 주방에 레시피를 저장했습니다. (+${earnedExp} EXP)`);
        }
      }
      router.push('/(tabs)/recipes');
    } catch (e) {
      Alert.alert("오류", "저장 중 문제가 발생했습니다.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView 
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* 🔙 헤더 (뒤로가기) */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
                <Text style={styles.backBtnText}>✕ 닫기</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>레시피 생성 스튜디오</Text>
            </View>

            <View style={styles.inputContainer}>
              {!isInputMode ? (
                <>
                  {/* 1. 카메라 스캔 카드 */}
                  <TouchableOpacity style={styles.cameraBanner} onPress={() => router.push('/scanner')} activeOpacity={0.9}>
                    <Text style={styles.cameraBannerIcon}>📸</Text>
                    <View>
                        <Text style={styles.cameraBannerTitle}>카메라로 재료 스캔하기</Text>
                        <Text style={styles.cameraBannerSub}>냉장고를 찍으면 AI가 재료를 인식해요</Text>
                    </View>
                  </TouchableOpacity>

                  {/* 2. 텍스트 입력 카드 (진입 버튼) */}
                  <TouchableOpacity style={[styles.cameraBanner, {backgroundColor: '#5A4E49', marginTop: 10}]} onPress={() => setIsInputMode(true)} activeOpacity={0.9}>
                    <Text style={styles.cameraBannerIcon}>✏️</Text>
                    <View>
                        <Text style={[styles.cameraBannerTitle, {color: '#fff'}]}>텍스트로 직접 입력하기</Text>
                        <Text style={[styles.cameraBannerSub, {color: '#E8D5D0'}]}>먹고 싶은 요리나 재료를 자유롭게 적어주세요</Text>
                    </View>
                  </TouchableOpacity>
                </>
              ) : (
                /* 🚨 [신규] 텍스트 입력 모드 UI */
                <View style={styles.inputFormContainer}>
                  <Text style={styles.inputFormTitle}>어떤 재료가 있나요? (또는 먹고 싶은 요리)</Text>
                  <TextInput 
                    style={styles.textInputArea}
                    placeholder="예: 돼지고기, 양파, 김치 / 또는 '매콤한 파스타'"
                    placeholderTextColor="#A89F9C"
                    multiline
                    value={inputText}
                    onChangeText={setInputText}
                  />

                  <TouchableOpacity 
                    style={styles.generateBtn} 
                    onPress={() => {
                      if (!inputText.trim()) { Alert.alert("알림", "내용을 입력해주세요."); return; }
                      router.push({ pathname: '/scanner', params: { manualInput: inputText } });
                    }}
                  >
                    <Text style={styles.generateBtnText}>다음 단계로 (요리 스타일 선택) ▶</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* 결과 모달 */}
      <Modal visible={resultModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>✨ AI 셰프의 제안</Text>
            {!isGenerating && (
              <TouchableOpacity onPress={() => setResultModalVisible(false)} style={styles.closeModalBtn}>
                <Text style={styles.closeModalText}>닫기</Text>
              </TouchableOpacity>
            )}
          </View>

          {isGenerating ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#FF8C00" />
              <Text style={styles.loadingText}>최고의 레시피를 작성 중입니다...</Text>
            </View>
          ) : (
            <View style={{flex: 1}}>
              {/* 🚨 TTS 시작 버튼 (스크롤 밖으로 이동하여 상단 고정) */}
              <TouchableOpacity style={styles.ttsStartBtn} onPress={startCookingMode}>
                <Text style={styles.ttsStartBtnText}>🔊 소리로 조리 과정 듣기!(TTS)</Text>
              </TouchableOpacity>
              <ScrollView style={styles.resultScroll} contentContainerStyle={{paddingBottom: 40}}>
                <Markdown style={markdownStyles}>{recipeResult || ""}</Markdown>
                
                {shoppingList.length > 0 && (
                  <View style={styles.shoppingBox}>
                    <Text style={styles.shoppingTitle}>🛒 부족한 재료가 있나요?</Text>
                    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                      {shoppingList.map((item, idx) => (
                        <TouchableOpacity key={idx} style={styles.shoppingTag} onPress={() => handleShopping(item)}>
                          <Text style={styles.shoppingTagText}>{item}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </ScrollView>

              <View style={styles.actionButtons}>
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#FF6B6B', flex: 0.8}]} onPress={() => handleSave(false)}>
                  <Text style={styles.actionBtnText}>저장</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#4CAF50', flex: 1}]} onPress={() => handleSave(true)}>
                  <Text style={styles.actionBtnText}>공유 🌍</Text>
                </TouchableOpacity>
                {/* 🚨 스타일 수정 버튼 추가 */}
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#8E24AA', flex: 1.2}]} onPress={() => setShowStyleModal(true)}>
                  <Text style={styles.actionBtnText}>다른 스타일 🎲</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* 🚨 스타일 추천 모달 (index.tsx와 동일 디자인) */}
      <Modal visible={showStyleModal} transparent={true} animationType="fade" onRequestClose={() => setShowStyleModal(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={[styles.bottomSheetContainer, {height: 'auto', maxHeight: '80%', paddingBottom: 30, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderRadius: 20}]}>
            <Text style={styles.styleModalTitle}>🎲 어떤 스타일로 바꿀까요?</Text>
            <ScrollView>
              <Text style={styles.styleInputLabel}>1. 요리 종류 선택</Text>
              <View style={styles.styleTagsContainer}>
                {RECIPE_TYPES.map(type => (<TouchableOpacity key={type} style={[styles.styleTag, selectedType === type && !isCustomType && styles.styleTagActive]} onPress={() => { setIsCustomType(false); setSelectedType(type === selectedType ? "" : type); }}><Text style={[styles.styleTagText, selectedType === type && !isCustomType && styles.styleTagTextActive]}>{type}</Text></TouchableOpacity>))}
                <TouchableOpacity style={[styles.styleTag, isCustomType && styles.styleTagActive]} onPress={() => { setIsCustomType(true); setSelectedType(""); }}><Text style={[styles.styleTagText, isCustomType && styles.styleTagTextActive]}>+ 직접 입력</Text></TouchableOpacity>
              </View>
              {isCustomType && (<TextInput style={styles.customTextInput} placeholder="예: 비건식, 중식 코스요리" maxLength={15} value={customTypeInput} onChangeText={setCustomTypeInput} />)}
              
              <Text style={[styles.styleInputLabel, {marginTop: 20}]}>2. 맛 / 분위기 선택 (선택사항)</Text>
              <View style={styles.styleTagsContainer}>
                {RECIPE_TASTES.map(taste => (<TouchableOpacity key={taste} style={[styles.styleTag, selectedTaste === taste && !isCustomTaste && styles.styleTagActive]} onPress={() => { setIsCustomTaste(false); setSelectedTaste(taste === selectedTaste ? "" : taste); }}><Text style={[styles.styleTagText, selectedTaste === taste && !isCustomTaste && styles.styleTagTextActive]}>{taste}</Text></TouchableOpacity>))}
                <TouchableOpacity style={[styles.styleTag, isCustomTaste && styles.styleTagActive]} onPress={() => { setIsCustomTaste(true); setSelectedTaste(""); }}><Text style={[styles.styleTagText, isCustomTaste && styles.styleTagTextActive]}>+ 직접 입력</Text></TouchableOpacity>
              </View>
              {isCustomTaste && (<TextInput style={styles.customTextInput} placeholder="예: 미슐랭 3스타 느낌" maxLength={15} value={customTasteInput} onChangeText={setCustomTasteInput} />)}
              
              <View style={styles.styleModalButtons}>
                <TouchableOpacity style={styles.styleModalCancel} onPress={() => setShowStyleModal(false)}><Text style={styles.styleModalBtnText}>취소</Text></TouchableOpacity>
                <TouchableOpacity style={styles.styleModalSave} onPress={requestNewStyle}><Text style={styles.styleModalBtnTextWhite}>다시 만들기 ✨</Text></TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 🚨 TTS 전체화면 모달 */}
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
    </SafeAreaView>
  );
}

const markdownStyles = StyleSheet.create({
  body: { color: '#3A2E2B', fontSize: 16, lineHeight: 26 },
  heading1: { color: '#FF8C00', fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  heading2: { color: '#3A2E2B', fontSize: 20, fontWeight: 'bold', marginTop: 20, marginBottom: 10 },
  list_item: { marginBottom: 5 },
});

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#2A2421',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtn: {
    position: 'absolute',
    left: 20,
    zIndex: 1,
    backgroundColor: '#4A3F3A',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  backBtnText: {
    color: '#E8D5D0',
    fontSize: 14,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFDF9',
  },
  titleSection: {
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 40,
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFDF9',
    marginBottom: 10,
  },
  subTitle: {
    fontSize: 16,
    color: '#A89F9C',
    fontWeight: 'bold',
  },
  cardContainer: {
    paddingHorizontal: 20,
    gap: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 25,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  cardIcon: {
    fontSize: 45,
    marginRight: 20,
  },
  cardTextWrapper: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 6,
  },
  cardSub: {
    fontSize: 13,
    fontWeight: 'bold',
    lineHeight: 18,
  },

  // Input Mode Styles
  inputContainer: { padding: 20 },
  cameraBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF8C00', padding: 20, borderRadius: 20, marginBottom: 15, shadowColor: '#FF8C00', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  cameraBannerIcon: { fontSize: 32, marginRight: 15 },
  cameraBannerTitle: { fontSize: 18, fontWeight: '900', color: '#000', marginBottom: 4 },
  cameraBannerSub: { fontSize: 13, fontWeight: 'bold', color: '#3A2E2B' },
  inputTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFFDF9', marginBottom: 5 },
  inputSub: { fontSize: 14, color: '#A89F9C', marginBottom: 20 },
  selectedTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20, minHeight: 40 },
  tagBadgeActive: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#FF8C00', borderRadius: 20 },
  tagTextActive: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 25 },
  textInput: { flex: 1, backgroundColor: '#3A322F', borderRadius: 12, padding: 15, color: '#FFFDF9', fontSize: 16, borderWidth: 1, borderColor: '#5A4E49' },
  addBtn: { backgroundColor: '#5A4E49', paddingHorizontal: 20, justifyContent: 'center', borderRadius: 12 },
  addBtnText: { color: '#fff', fontWeight: 'bold' },
  sectionLabel: { color: '#FF8C00', fontWeight: 'bold', marginBottom: 10 },
  quickTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 30 },
  quickTag: { backgroundColor: '#3A322F', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#5A4E49' },
  quickTagText: { color: '#E8D5D0', fontWeight: 'bold' },
  customAddBadge: { backgroundColor: '#FF8C00', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  customAddText: { color: '#000', fontWeight: 'bold' },
  
  inputFormContainer: { paddingHorizontal: 0, marginTop: 10, paddingBottom: 40 },
  inputFormTitle: { fontSize: 16, fontWeight: '900', color: '#FFFDF9', marginBottom: 10, marginTop: 20 },
  textInputArea: { backgroundColor: '#3A322F', color: '#FFFDF9', borderRadius: 16, padding: 20, minHeight: 100, fontSize: 16, textAlignVertical: 'top', borderWidth: 1, borderColor: '#5A4E49' },
  generateBtn: { backgroundColor: '#FF8C00', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginTop: 30, shadowColor: '#FF8C00', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  generateBtnText: { color: '#000', fontSize: 18, fontWeight: '900' },

  // Modal Styles
  modalContainer: { flex: 1, backgroundColor: '#FFFDF9', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#E8D5D0' },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#3A2E2B' },
  closeModalBtn: { padding: 5 },
  closeModalText: { color: '#8C7A76', fontWeight: 'bold', fontSize: 16 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 20, fontSize: 16, color: '#FF8C00', fontWeight: 'bold' },
  resultScroll: { flex: 1 },
  shoppingBox: { marginTop: 30, padding: 15, backgroundColor: '#F9F5F3', borderRadius: 12 },
  shoppingTitle: { fontSize: 16, fontWeight: 'bold', color: '#3A2E2B', marginBottom: 10 },
  shoppingTag: { backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#E8D5D0' },
  shoppingTagText: { color: '#8C7A76', fontSize: 12 },
  actionButtons: { flexDirection: 'row', gap: 10, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#E8D5D0' },
  actionBtn: { flex: 1, paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  // Style Modal Styles
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  bottomSheetContainer: { width: '100%', backgroundColor: '#FFFDF9', padding: 20 },
  styleModalTitle: { color: '#8E24AA', fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  styleInputLabel: { color: '#3A2E2B', fontSize: 14, fontWeight: 'bold', marginBottom: 8, marginTop: 10 },
  styleTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 },
  styleTag: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#F9F5F3', borderRadius: 20, borderWidth: 1, borderColor: '#E8D5D0' },
  styleTagActive: { backgroundColor: '#8E24AA', borderColor: '#AB47BC' },
  styleTagText: { color: '#8C7A76', fontSize: 13, fontWeight: 'bold' },
  styleTagTextActive: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  customTextInput: { backgroundColor: '#F9F5F3', color: '#3A2E2B', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 10, fontSize: 14, borderWidth: 1, borderColor: '#E8D5D0', marginTop: 10 },
  styleModalButtons: { flexDirection: 'row', justifyContent: 'center', gap: 15, width: '100%', marginTop: 25 },
  styleModalCancel: { backgroundColor: '#F5EBE7', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flex: 1 },
  styleModalSave: { backgroundColor: '#8E24AA', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flex: 1.5 },
  styleModalBtnText: { color: '#8C7A76', fontWeight: 'bold', fontSize: 15, textAlign: 'center' },
  styleModalBtnTextWhite: { color: '#fff', fontWeight: 'bold', fontSize: 15, textAlign: 'center' },

  // 🚨 TTS Styles
  ttsStartBtn: { backgroundColor: '#E3F2FD', paddingVertical: 15, borderRadius: 15, alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#CE93D8' }, 
  ttsStartBtnText: { color: '#8E24AA', fontSize: 15, fontWeight: '900' }, 
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
});