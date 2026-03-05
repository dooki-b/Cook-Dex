// 파일 위치: app/(tabs)/index.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { doc, increment, setDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, ImageBackground, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadows } from '../../constants/design-tokens';
import { auth, db } from '../../firebaseConfig';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const DAILY_FREE_LIMIT = 5; 
const RECIPE_TYPES = ["메인 디쉬 🍛", "디저트 🍰", "음료/칵테일 🍹", "간단한 간식 🍟", "술안주 🍻", "샐러드/다이어트 🥗"];
const RECIPE_TASTES = ["매콤한 🔥", "단짠단짠 🍯🧂", "짭짤한 🧂", "자극적인 속세의 맛 😈", "담백하고 건강한 🌿", "따뜻한 국물 🍲"];
const COMMON_INGREDIENTS = ["감자", "고구마", "양파", "대파", "마늘", "돼지고기", "소고기", "닭고기", "생선", "계란", "두부", "김치", "통조림 햄", "소면", "치즈", "우유"];

const RECOMMENDED_THEMES = [
  { id: '1', title: '비 오는 날 파전 🌧️', desc: '바삭바삭한 식감' },
  { id: '2', title: '10분 컷 초간단 ⏱️', desc: '바쁜 아침에 딱!' },
  { id: '3', title: '단백질 폭발 🥩', desc: '운동 직후 필수' },
  { id: '4', title: '스트레스 킬러 🌶️', desc: '화끈하게 매운맛' },
  { id: '5', title: '심야식당 안주 🍺', desc: '맥주가 땡길 때' }
];

const windowHeight = Dimensions.get('window').height;

const calculateLevel = (exp) => {
  if (exp < 30) return { level: 1, title: "🍳 요리 쪼렙", nextExp: 30 };
  if (exp < 100) return { level: 2, title: "🔪 견습 요리사", nextExp: 100 };
  if (exp < 300) return { level: 3, title: "👨‍🍳 수석 셰프", nextExp: 300 };
  return { level: 'MAX', title: "👑 마스터 셰프", nextExp: exp };
};

const extractJSON = (rawText) => {
  try {
    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(rawText.substring(start, end + 1));
  } catch (e) { return null; }
};

export default function HomeScreen() {
  const router = useRouter();
  const scrollViewRef = useRef(null);
  const [inputBoxY, setInputBoxY] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [scansLeft, setScansLeft] = useState(DAILY_FREE_LIMIT);
  const [userExp, setUserExp] = useState(0);
  const [userName, setUserName] = useState("셰프");
  const [userLevel, setUserLevel] = useState("초보 요리사 🍳");

  const [ingredientSearch, setIngredientSearch] = useState("");
  const [selectedIngredients, setSelectedIngredients] = useState([]); 
  
  const [showBottomModal, setShowBottomModal] = useState(false);
  const [isCurating, setIsCurating] = useState(false);
  const [curationThemes, setCurationThemes] = useState(null); 
  const [isGeneratingRecipe, setIsGeneratingRecipe] = useState(false);
  const [textRecipeResult, setTextRecipeResult] = useState(null);
  const [shoppingList, setShoppingList] = useState([]);

  const [showStyleModal, setShowStyleModal] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [isCustomType, setIsCustomType] = useState(false);
  const [customTypeInput, setCustomTypeInput] = useState("");
  const [selectedTaste, setSelectedTaste] = useState("");
  const [isCustomTaste, setIsCustomTaste] = useState(false);
  const [customTasteInput, setCustomTasteInput] = useState("");

  // 희망 요리 스타일 사전 질문
  const [styleModalVisible, setStyleModalVisible] = useState(false);
  const [preferredStyle, setPreferredStyle] = useState("");

  // 🎁 행운의 룰렛 상태
  const [rouletteVisible, setRouletteVisible] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rouletteResult, setRouletteResult] = useState(null);
  const [canSpinFree, setCanSpinFree] = useState(true);

  // 무료 룰렛 가능 여부 체크
  useFocusEffect(
    useCallback(() => {
      const checkRoulette = async () => {
        try {
          const lastSpin = await AsyncStorage.getItem('cookdex_roulette_date');
          if (lastSpin === new Date().toLocaleDateString()) setCanSpinFree(false);
          else setCanSpinFree(true);
        } catch (e) {}
      };
      checkRoulette();
    }, [])
  );

  // 룰렛 돌리기 실행 함수
  const executeSpin = async () => {
    setIsSpinning(true);
    setRouletteResult(null);

    // 2.5초간 룰렛이 돌아가는 연출(대기)
    setTimeout(async () => {
      const rand = Math.random() * 100;
      let rewardName = "";
      let rewardType = "";

      if (rand < 1) { 
        rewardName = "👑 [환상의 대박]\nPRO 1일 체험권\n(추후 식재료 50% 할인 쿠폰 연동)"; 
        rewardType = "PRO"; 
      }
      else if (rand < 5) { 
        rewardName = "🍀 [특별한 행운]\n히든 칭호 획득!\n(추후 무료 배송 쿠폰 연동)"; 
        rewardType = "TITLE"; 
      }
      else if (rand < 20) { 
        rewardName = "📸 [기분좋은 당첨]\nAI 스캔 3회 충전권\n(추후 1,000원 할인권 연동)"; 
        rewardType = "SCAN"; 
      }
      else if (rand < 50) { 
        rewardName = "🌟 [쏠쏠한 보상]\n요리 경험치 +100 EXP"; 
        rewardType = "EXP_LARGE"; 
      }
      else { 
        rewardName = "🍬 [소소한 행복]\n요리 경험치 +15 EXP"; 
        rewardType = "EXP_SMALL"; 
      }

      // 보상 실제 지급(저장) 로직
      if (rewardType.includes("EXP")) {
        const expRaw = await AsyncStorage.getItem('cookdex_user_exp');
        const addExp = rewardType === "EXP_LARGE" ? 100 : 15;
        await AsyncStorage.setItem('cookdex_user_exp', ((expRaw ? parseInt(expRaw) : 0) + addExp).toString());
      } else if (rewardType === "TITLE") {
        const titlesRaw = await AsyncStorage.getItem('cookdex_unlocked_titles');
        const titles = titlesRaw ? JSON.parse(titlesRaw) : ["🍳 요리 쪼렙"];
        if (!titles.includes("🍀 행운의 셰프")) {
          titles.push("🍀 행운의 셰프");
          await AsyncStorage.setItem('cookdex_unlocked_titles', JSON.stringify(titles));
        }
      } else if (rewardType === "SCAN") {
        const scanRaw = await AsyncStorage.getItem('cookdex_daily_scans');
        const scans = scanRaw ? JSON.parse(scanRaw) : { count: 3 };
        await AsyncStorage.setItem('cookdex_daily_scans', JSON.stringify({ date: new Date().toLocaleDateString(), count: scans.count + 3 }));
      }

      setIsSpinning(false);
      setRouletteResult(rewardName);
      
      // 무료 기회였다면 오늘 날짜 저장
      if (canSpinFree) {
        setCanSpinFree(false);
        await AsyncStorage.setItem('cookdex_roulette_date', new Date().toLocaleDateString());
      }
    }, 2500);
  };

  const handleSpinClick = () => {
    if (canSpinFree) {
      executeSpin();
    } else {
      Alert.alert(
        "광고 시청 📺",
        "오늘의 무료 기회를 모두 사용했습니다.\n30초 스폰서 광고를 보고 한 번 더 돌리시겠습니까?",
        [
          { text: "취소", style: "cancel" },
          { text: "시청하기", onPress: () => {
              // 3초 가상 광고 대기 후 스핀
              setTimeout(() => executeSpin(), 3000); 
            }
          }
        ]
      );
    }
  };

  const [isCookingMode, setIsCookingMode] = useState(false);
  const [cookingSteps, setCookingSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // 🚨 [신규 추가] 법적 면책 조항 모달 상태
  const [showLegalModal, setShowLegalModal] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardHeight(0));
    
    // 🚨 앱 실행 시 법적 동의 여부 체크
    const checkLegalAgreement = async () => {
      try {
        const hasAgreed = await AsyncStorage.getItem('cookdex_legal_agreed');
        if (hasAgreed !== 'true') {
          setShowLegalModal(true); // 동의 기록이 없으면 팝업 띄움
        }
      } catch (e) {}
    };
    checkLegalAgreement();

    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // 🚨 동의 버튼 누를 때 실행되는 함수
  const handleAgreeLegal = async () => {
    try {
      await AsyncStorage.setItem('cookdex_legal_agreed', 'true');
      setShowLegalModal(false);
    } catch (e) {
      Alert.alert("에러", "동의 상태 저장에 실패했습니다.");
    }
  };

  useFocusEffect(
    useCallback(() => {
      const loadDashboardData = async () => {
        try {
          const exp = await AsyncStorage.getItem('cookdex_user_exp');
          const currentExp = exp ? parseInt(exp) : 0;
          setUserExp(currentExp);
          if (currentExp < 50) setUserLevel("초보 요리사 🍳");
          else if (currentExp < 150) setUserLevel("동네 맛집 사장님 🧑‍🍳");
          else setUserLevel("마스터 셰프 👑");

          const currentUser = auth.currentUser;
          if (currentUser) setUserName(currentUser.displayName || "셰프");

          const today = new Date().toLocaleDateString(); 
          const limitDataRaw = await AsyncStorage.getItem('cookdex_daily_limit');
          if (limitDataRaw) {
            const limitData = JSON.parse(limitDataRaw);
            if (limitData.date === today) setScansLeft(limitData.left);
            else { setScansLeft(DAILY_FREE_LIMIT); await AsyncStorage.setItem('cookdex_daily_limit', JSON.stringify({ date: today, left: DAILY_FREE_LIMIT })); }
          } else await AsyncStorage.setItem('cookdex_daily_limit', JSON.stringify({ date: today, left: DAILY_FREE_LIMIT }));
        } catch (error) {}
      };
      loadDashboardData();
    }, [])
  );

  const refillQA = async () => {
    try {
      await AsyncStorage.setItem('cookdex_daily_limit', JSON.stringify({ date: new Date().toLocaleDateString(), left: 9999 }));
      setScansLeft(9999);
      Alert.alert("🛠️ QA 모드 발동!", "AI 카메라 스캔 횟수가 무제한으로 충전되었습니다.");
    } catch (e) {}
  };

  // 테스트용: 동의 기록 초기화 버튼 (나중에 지울 수 있음)
  const resetLegal = async () => {
    await AsyncStorage.removeItem('cookdex_legal_agreed');
    Alert.alert("초기화", "법적 동의 기록이 초기화되었습니다. 앱을 껐다 켜보세요.");
  };

  const handleScanPress = () => {
    if (scansLeft > 0) {
      router.push('/scanner');
    } else {
      Alert.alert("💡 일일 스캔 완료!", "오늘의 무료 스캔을 모두 사용하셨습니다. QA 모드를 이용해 충전하세요!");
    }
  };

  const toggleIngredient = (ing) => {
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
  const forceScrollToInput = () => { setTimeout(() => { if (scrollViewRef.current && inputBoxY) scrollViewRef.current.scrollTo({ y: Math.max(0, inputBoxY - (windowHeight * 0.25)), animated: true }); }, 350); };

  const getCurationThemes = async (stylePreference = "") => {
    let finalIngredients = [...selectedIngredients];
    if (ingredientSearch.trim()) finalIngredients.push(ingredientSearch.trim());

    if (finalIngredients.length === 0) { Alert.alert("알림", "식재료를 먼저 추가해 주세요!"); return; }
    
    setIngredientSearch("");
    setShowBottomModal(true); setIsCurating(true); setCurationThemes(null); setTextRecipeResult(null); setShoppingList([]);
    
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      // --- [유저 맞춤 설정 불러오기] ---
      const savedDietRaw = await AsyncStorage.getItem('cookdex_diet_goal');
      let savedDiet = [];
      try { savedDiet = savedDietRaw ? JSON.parse(savedDietRaw) : []; } catch (e) { savedDiet = savedDietRaw && savedDietRaw !== "없음" ? [savedDietRaw] : []; }
      const savedAllergies = await AsyncStorage.getItem('cookdex_allergies');
      const savedCondimentsRaw = await AsyncStorage.getItem('cookdex_condiments');
      
      const dietText = savedDiet.length > 0 ? `[식단 목표: ${savedDiet.join(', ')}]에 맞춰서 요리해 줘.` : "";
      const allergyText = savedAllergies && savedAllergies !== "없음" ? `[🚨치명적 경고🚨 알레르기 및 기피 재료: ${savedAllergies}] 이 재료들은 레시피에 절대 포함시키지 마!` : "";
      const condimentsText = savedCondimentsRaw ? `[보유 중인 기본 양념/향신료: ${JSON.parse(savedCondimentsRaw).join(', ')}] 이 재료들은 이미 집에 있으니 '부족한 구매 리스트'에서 빼고 자유롭게 써 줘.` : "";

      const userContextPrompt = `\n\n--- 👨‍🍳 셰프 맞춤 설정 ---\n${dietText}\n${allergyText}\n${condimentsText}\n----------------------\n`;
      // ---------------------------------
      const currentTime = new Date().getHours() < 11 ? "아침" : new Date().getHours() < 16 ? "점심" : "저녁/야식";
      const stylePrompt = `[사용자가 희망한 요리 스타일: ${stylePreference ? stylePreference : "AI 알아서 추천"}]`;

      const systemPrompt = `너는 최고의 셰프 '쿡덱스'야. 식재료를 분석해 3가지 요리 테마를 제안해.\n[식재료]: ${finalIngredients.join(', ')}\n[상황]: 현재 시간은 ${currentTime}\n${stylePrompt}${userContextPrompt}\n반드시 JSON 형식으로만 대답해. 마크다운(\`\`\`json 등) 절대 금지.\n{ "curation_themes": [ { "theme_title": "요리 이름", "match_reason": "추천 이유 1줄", "badge_icon": "이모지 1개", "ui_accent_color": "#FF8C00" } ] }`;

      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] }) });
      const data = await response.json();
      
      if (!response.ok) throw new Error(`[${response.status}] ${data.error?.message}`);

      let rawText = data.candidates[0].content.parts[0].text.trim().replace(/```json/g, '').replace(/```/g, ''); 
      const parsedData = JSON.parse(rawText);
      setCurationThemes(parsedData.curation_themes.slice(0, 3));
    } catch (error) { 
      Alert.alert("안내", `테마를 불러오지 못했습니다.\n상세: ${error.message}`); 
      setShowBottomModal(false); 
    } finally { setIsCurating(false); }
  };

  const generateFinalRecipe = async (theme) => {
    setIsGeneratingRecipe(true);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      // --- [유저 맞춤 설정 불러오기] ---
      const savedDietRaw = await AsyncStorage.getItem('cookdex_diet_goal');
      let savedDiet = [];
      try { savedDiet = savedDietRaw ? JSON.parse(savedDietRaw) : []; } catch (e) { savedDiet = savedDietRaw && savedDietRaw !== "없음" ? [savedDietRaw] : []; }
      const savedAllergies = await AsyncStorage.getItem('cookdex_allergies');
      const savedCondimentsRaw = await AsyncStorage.getItem('cookdex_condiments');
      
      const dietText = savedDiet.length > 0 ? `[식단 목표: ${savedDiet.join(', ')}]에 맞춰서 요리해 줘.` : "";
      const allergyText = savedAllergies && savedAllergies !== "없음" ? `[🚨치명적 경고🚨 알레르기 및 기피 재료: ${savedAllergies}] 이 재료들은 레시피에 절대 포함시키지 마!` : "";
      const condimentsText = savedCondimentsRaw ? `[보유 중인 기본 양념/향신료: ${JSON.parse(savedCondimentsRaw).join(', ')}] 이 재료들은 이미 집에 있으니 '부족한 구매 리스트'에서 빼고 자유롭게 써 줘.` : "";

      const userContextPrompt = `\n\n--- 👨‍🍳 셰프 맞춤 설정 ---\n${dietText}\n${allergyText}\n${condimentsText}\n----------------------\n`;
      // ---------------------------------
      
      const systemPrompt = `너는 셰프야. 재료(${selectedIngredients.join(', ')})를 가지고 [${theme.theme_title}] 레시피를 작성해.${userContextPrompt}\n⚠️ 필수 지시사항: 각 식재료의 중량을 추정하여 1인분 기준 총 칼로리(kcal)와 핵심 영양성분(탄수화물, 단백질, 지방)을 근사치 100%에 가깝게 계산한 뒤, 레시피 제목 바로 밑에 눈에 띄게 표기해.\n반드시 아래 JSON 형식으로만 대답해. 마크다운(\`\`\`json 등) 절대 금지.\n{ "safety_warning": "위생 경고 필요시 작성, 없으면 null", "substitutions": [ { "original": "필요한데 유저가 입력 안한 재료", "substitute": "대체재", "reason": "대체 이유" } ], "shopping_list": ["대체불가 필수 마트 구매 재료"], "recipe_markdown": "무조건 첫 줄은 '# ${theme.theme_title}'. 조리 순서는 무조건 '1. ', '2. ' 같은 숫자로 시작할 것." }`;
      
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] }) });
      const data = await response.json();
      if (!response.ok) throw new Error(`[${response.status}] ${data.error?.message}`);

      let rawText = data.candidates[0].content.parts[0].text.trim().replace(/```json/g, '').replace(/```/g, ''); 
      const parsedData = JSON.parse(rawText);

      if (parsedData.safety_warning && parsedData.safety_warning !== "null") Alert.alert("🚨 쿡덱스 위생/안전 경고!", parsedData.safety_warning);
      setShoppingList(parsedData.shopping_list && Array.isArray(parsedData.shopping_list) ? parsedData.shopping_list : []);

      let finalMarkdown = parsedData.recipe_markdown;
      if (parsedData.substitutions && parsedData.substitutions.length > 0) {
          const titleMatch = finalMarkdown.match(/^(# .+?\n)/);
          let subText = "\n> **💡 쿡덱스 스마트 대체재 추천**\n";
          parsedData.substitutions.forEach(s => { subText += `> - ❌ ${s.original} ➡️ ⭕ **${s.substitute}** (${s.reason})\n`; });
          subText += "\n";
          if(titleMatch) finalMarkdown = finalMarkdown.replace(titleMatch[0], titleMatch[0] + subText);
          else finalMarkdown = subText + finalMarkdown;
      }
      finalMarkdown = finalMarkdown.replace(/\*\*'([^']+)'\*\*/g, '**$1**').replace(/'\*\*(.+?)\*\*'/g, '**$1**');   
      setTextRecipeResult(finalMarkdown);
      await AsyncStorage.setItem('cookdex_draft_recipe', JSON.stringify({ ingredients: selectedIngredients, recipe: finalMarkdown, shopping: parsedData.shopping_list }));
    } catch (error) { Alert.alert("에러", "레시피 생성 실패"); setShowBottomModal(false); } finally { setIsGeneratingRecipe(false); }
  };

  const startCookingMode = () => {
    if (!textRecipeResult) return;
    const extractedSteps = textRecipeResult.split('\n').filter(line => /^\d+\.\s/.test(line.trim())).map(line => line.replace(/^\d+\.\s/, '').replace(/\*\*/g, '').trim());
    if (extractedSteps.length === 0) { Alert.alert("알림", "조리 단계를 명확히 인식하지 못했습니다. 일반 텍스트 모드를 이용해주세요."); return; }
    setCookingSteps(extractedSteps); setCurrentStepIndex(0); setIsCookingMode(true);
    Speech.speak(extractedSteps[0], { language: 'ko-KR', rate: 0.95, pitch: 1.0 });
  };
  const handleNextStep = () => { if (currentStepIndex < cookingSteps.length - 1) { Speech.stop(); setCurrentStepIndex(prev => prev + 1); Speech.speak(cookingSteps[currentStepIndex + 1], { language: 'ko-KR', rate: 0.95 }); } };
  const handlePrevStep = () => { if (currentStepIndex > 0) { Speech.stop(); setCurrentStepIndex(prev => prev - 1); Speech.speak(cookingSteps[currentStepIndex - 1], { language: 'ko-KR', rate: 0.95 }); } };
  const handleReplayStep = () => { Speech.stop(); Speech.speak(cookingSteps[currentStepIndex], { language: 'ko-KR', rate: 0.95 }); };
  const handleExitCookingMode = () => { Speech.stop(); setIsCookingMode(false); };

  const handleCloseModal = () => {
    if (textRecipeResult || curationThemes) {
      Alert.alert("앗! 잠깐만요 🛑", "아직 레시피를 저장하지 않았어요. 창을 닫으시겠습니까?", [{ text: "취소", style: "cancel" }, { text: "닫기", style: "destructive", onPress: () => setShowBottomModal(false) }]);
    } else setShowBottomModal(false);
  };

  const handleRecipeSaveAndShare = async (isSharing) => {
    if (!textRecipeResult) return;
    try {
      const recipeId = Date.now().toString();
      const newRecipe = { id: recipeId, date: new Date().toLocaleDateString(), content: textRecipeResult };
      const existingData = await AsyncStorage.getItem('cookdex_saved_recipes');
      const savedRecipes = existingData ? JSON.parse(existingData) : [];
      savedRecipes.unshift(newRecipe);
      await AsyncStorage.setItem('cookdex_saved_recipes', JSON.stringify(savedRecipes));

      const earnedExp = isSharing ? 30 : 10;
      const currentExp = parseInt(await AsyncStorage.getItem('cookdex_user_exp') || '0');
      const newExp = currentExp + earnedExp;
      await AsyncStorage.setItem('cookdex_user_exp', newExp.toString());

      setUserExp(newExp); setSelectedIngredients([]); setShowBottomModal(false); setShoppingList([]);

      const currentUser = auth.currentUser;
      if (currentUser) {
        await setDoc(doc(db, "users", currentUser.uid), { totalExp: increment(earnedExp) }, { merge: true });
        if (isSharing) {
          await setDoc(doc(db, "global_recipes", recipeId), { id: recipeId, content: textRecipeResult, authorId: currentUser.uid, authorName: currentUser.displayName || "익명 셰프", createdAt: new Date().toISOString(), likes: 0 });
          Alert.alert("광장에 등록 완료! 🌍✨", `레시피를 공유하여 엄청난 보상을 받았습니다! (+${earnedExp} EXP)`);
        } else Alert.alert("내 주방 저장 완료! 🍳", `레시피가 조용히 저장되었습니다. (+${earnedExp} EXP)`);
      }
    } catch (error) { alert("저장 에러"); }
  };

  const handleShopping = (item) => {
    const coupangSearchUrl = `https://m.coupang.com/nm/search?q=${encodeURIComponent(item)}`;
    Linking.openURL(coupangSearchUrl).catch((err) => console.error('쇼핑몰 연결 실패', err));
  };

  const requestNewStyle = () => {
    let finalType = isCustomType && customTypeInput.trim() !== "" ? customTypeInput : selectedType;
    let finalTaste = isCustomTaste && customTasteInput.trim() !== "" ? customTasteInput : selectedTaste;
    let styleStr = "";
    if (finalType) styleStr += `요리 종류: ${finalType}, `;
    if (finalTaste) styleStr += `맛/분위기: ${finalTaste}`;
    if (!styleStr) { Alert.alert("알림", "원하시는 요리 종류나 맛을 선택해주세요!"); return; }
    setShowStyleModal(false); getCurationThemes(styleStr);
  };

  const currentLevelInfo = calculateLevel(userExp);
  const expProgress = currentLevelInfo.level === 'MAX' ? 100 : (userExp / currentLevelInfo.nextExp) * 100;

  return (
    <SafeAreaView style={styles.container}>
      
      {/* 🚨 법적 면책 조항 모달 (최초 1회 강제) */}
      <Modal visible={showLegalModal} transparent={true} animationType="fade" onRequestClose={() => {}}>
        <View style={styles.legalModalOverlay}>
          <View style={styles.legalModalContent}>
            <Text style={styles.legalModalTitle}>🚨 쿡덱스 서비스 이용 동의</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.legalScrollView}>
              <Text style={styles.legalMainText}>AI 셰프 쿡덱스를 이용하기 전, 사용자의 안전을 위해 반드시 아래 내용을 확인해 주세요.</Text>
              
              <View style={styles.legalPointBox}>
                <Text style={styles.legalPointTitle}>🥩 1. 조리 및 위생 주의</Text>
                <Text style={styles.legalPointDesc}>AI가 제안하는 조리 시간과 온도는 대략적인 참고용입니다. 고기, 해산물 등은 반드시 본인의 판단하에 속까지 안전하게 완전히 익혀 드셔야 합니다.</Text>
              </View>

              <View style={styles.legalPointBox}>
                <Text style={styles.legalPointTitle}>🥜 2. 알레르기 확인 의무</Text>
                <Text style={styles.legalPointDesc}>생성된 레시피에 본인에게 치명적인 알레르기 유발 물질이 포함되어 있는지, 조리 전에 유저 스스로 직접 교차 검증해야 합니다.</Text>
              </View>

              <View style={styles.legalPointBox}>
                <Text style={styles.legalPointTitle}>🤖 3. AI 할루시네이션(착각) 주의</Text>
                <Text style={styles.legalPointDesc}>AI는 시각적으로 완벽하지 않으며, 가끔 먹을 수 없는 물건(예: 모형, 화학제품 등)을 식재료로 착각하여 요리를 제안할 수 있습니다. 비식재료는 절대 취식하지 마십시오.</Text>
              </View>

              <Text style={styles.legalFooterText}>※ 위 사항을 무시하여 발생한 취식 상의 문제 및 신체적 피해에 대하여 앱 개발자는 어떠한 법적 책임도 지지 않음을 명시합니다.</Text>
            </ScrollView>

            <TouchableOpacity style={styles.legalAgreeButton} onPress={handleAgreeLegal}>
              <Text style={styles.legalAgreeButtonText}>위 모든 내용을 숙지하였으며, 동의합니다</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: keyboardHeight + 80 }} keyboardShouldPersistTaps="handled">
          
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>안녕하세요, {userName}님! 👋</Text>
              <Text style={styles.subGreeting}>오늘은 어떤 요리를 해볼까요?</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={styles.levelBadge}><Text style={styles.levelText}>{userLevel}</Text></View>
              <Text style={styles.expText}>EXP: {userExp}</Text>
            </View>
          </View>

          <View style={{flexDirection: 'row', gap: 10, marginBottom: 20}}>
            <TouchableOpacity style={[styles.qaButton, {flex: 1}]} onPress={refillQA}>
              <Text style={styles.qaButtonText}>🛠️ QA 모드 (999회 충전)</Text>
            </TouchableOpacity>
            {/* 테스트를 위해 언제든 면책 팝업을 다시 띄워볼 수 있는 버튼 */}
            <TouchableOpacity style={[styles.qaButton, {flex: 1, backgroundColor: '#5A4E49'}]} onPress={resetLegal}>
              <Text style={styles.qaButtonText}>🔄 동의 기록 초기화</Text>
            </TouchableOpacity>
          </View>

          {/* 🚀 슈퍼앱 히어로 배너 (Hero Banner) */}
          <TouchableOpacity 
            style={styles.heroBanner} 
            activeOpacity={0.9}
            onPress={() => router.push('/create-recipe')}
          >
            <ImageBackground 
              source={{uri: 'https://images.unsplash.com/photo-1495195129352-aeb325a55b65?q=80&w=2076&auto=format&fit=crop'}} 
              style={styles.heroBackground}
            >
              <View style={styles.heroOverlay}>
                <Text style={styles.heroTitle}>냉장고 파먹기 시작! 🥩🥬</Text>
                <Text style={styles.heroSub}>카메라로 찍기만 하면 AI가 레시피를 뚝딱</Text>
              </View>
            </ImageBackground>
          </TouchableOpacity>

          {/* 📱 모던 벤토 박스 그리드 (Modern Quick Menu) */}
          <View style={styles.modernGrid}>
            {/* 첫 번째 줄 */}
            <View style={styles.gridRow}>
              <TouchableOpacity style={styles.modernGridCard} activeOpacity={0.8} onPress={() => router.push('/(tabs)/recipes')}>
                <Text style={styles.modernGridIcon}>🍳</Text>
                <Text style={styles.modernGridTitle}>내 주방</Text>
                <Text style={styles.modernGridSub}>나만의 레시피</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.modernGridCard} activeOpacity={0.8} onPress={() => router.push('/(tabs)/plaza')}>
                <Text style={styles.modernGridIcon}>🌍</Text>
                <Text style={styles.modernGridTitle}>요리 광장</Text>
                <Text style={styles.modernGridSub}>모두의 레시피</Text>
              </TouchableOpacity>
            </View>
            
            {/* 두 번째 줄 */}
            <View style={styles.gridRow}>
              <TouchableOpacity style={styles.modernGridCard} activeOpacity={0.8} onPress={() => router.push('/(tabs)/quest')}>
                <Text style={styles.modernGridIcon}>📜</Text>
                <Text style={styles.modernGridTitle}>도파민 퀘스트</Text>
                <Text style={styles.modernGridSub}>경험치 & 보상</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.modernGridCard} activeOpacity={0.8} onPress={() => router.push('/(tabs)/profile')}>
                <Text style={styles.modernGridIcon}>⚙️</Text>
                <Text style={styles.modernGridTitle}>내 정보</Text>
                <Text style={styles.modernGridSub}>맞춤 설정</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 🔥 오늘의 셰프 추천 테마 */}
          <View style={styles.themeSection}>
            <Text style={styles.themeSectionTitle}>🔥 오늘의 셰프 추천 테마</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              contentContainerStyle={styles.themeScroll}
              decelerationRate="fast"
              overScrollMode="never"
              keyboardShouldPersistTaps="handled"
            >
              {RECOMMENDED_THEMES.map(theme => (
                <TouchableOpacity 
                  key={theme.id} 
                  style={styles.themeCard}
                  activeOpacity={0.7}
                  onPress={() => {
                    setPreferredStyle(theme.title);
                    setStyleModalVisible(true);
                  }}
                >
                  <Text style={styles.themeCardTitle}>{theme.title}</Text>
                  <Text style={styles.themeCardDesc}>{theme.desc}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.categorySection}>
            <Text style={styles.categoryHeader}>💡 이런 상황엔 어때요?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
              <TouchableOpacity style={styles.categoryCard}><Text style={styles.categoryEmoji}>🏃‍♂️</Text><Text style={styles.categoryText}>바쁜 아침 10분컷</Text></TouchableOpacity>
              <TouchableOpacity style={styles.categoryCard}><Text style={styles.categoryEmoji}>🍻</Text><Text style={styles.categoryText}>퇴근 후 맥주 안주</Text></TouchableOpacity>
              <TouchableOpacity style={styles.categoryCard}><Text style={styles.categoryEmoji}>🥗</Text><Text style={styles.categoryText}>다이어트 식단</Text></TouchableOpacity>
              <TouchableOpacity style={styles.categoryCard}><Text style={styles.categoryEmoji}>🤧</Text><Text style={styles.categoryText}>감기 기운 있을 때</Text></TouchableOpacity>
            </ScrollView>
          </View>
          
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 🚨 요리 스타일 질문 모달 */}
      <Modal visible={styleModalVisible} transparent={true} animationType="fade" onRequestClose={() => setStyleModalVisible(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlayCenter}
        >
          {/* 빈 공간 터치 시 닫기 위한 투명 배경 버튼 */}
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setStyleModalVisible(false)} />
          
          <View style={styles.modalContent}>
            {/* 우측 상단 닫기(X) 버튼 */}
            <TouchableOpacity style={styles.closeIconBtn} onPress={() => setStyleModalVisible(false)}>
              <Text style={styles.closeIconText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.modalTitle}>오늘 끌리는 요리 스타일 🍳</Text>
            <Text style={styles.modalSub}>어떤 형태의 요리를 원하시나요?</Text>
            
            <TextInput 
              style={styles.styleInput} 
              placeholder="예: 볶음밥, 얼큰한 찌개, 오븐 구이 등" 
              placeholderTextColor="#A89F9C"
              value={preferredStyle}
              onChangeText={setPreferredStyle}
            />
            
            <TouchableOpacity 
              style={styles.generateBtn} 
              onPress={() => {
                setStyleModalVisible(false);
                getCurationThemes(preferredStyle); 
              }}
            >
              <Text style={styles.generateBtnText}>이 스타일로 AI 추천받기 ✨</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.skipBtn} 
              onPress={() => {
                setPreferredStyle("");
                setStyleModalVisible(false);
                getCurationThemes("");
              }}
            >
              <Text style={styles.skipBtnText}>건너뛰고 알아서 추천받기</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 🎡 행운의 룰렛 모달 */}
      <Modal visible={rouletteVisible} transparent={true} animationType="slide" onRequestClose={() => !isSpinning && setRouletteVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => !isSpinning && setRouletteVisible(false)} />
          <View style={styles.rouletteModalContent}>
            {!isSpinning && (
              <TouchableOpacity style={styles.closeIconBtn} onPress={() => setRouletteVisible(false)}>
                <Text style={styles.closeIconText}>✕</Text>
              </TouchableOpacity>
            )}
            
            <Text style={styles.rouletteTitle}>🍀 오늘의 행운 룰렛</Text>
            <Text style={styles.rouletteSub}>매일 1회 무료! 꽝 없는 100% 당첨!</Text>
            
            <View style={styles.rouletteWheelBox}>
              {isSpinning ? (
                <>
                  <ActivityIndicator size="large" color="#FF8C00" style={{marginBottom: 15}} />
                  <Text style={styles.spinningText}>두구두구두구... 🥁</Text>
                </>
              ) : rouletteResult ? (
                <View style={{alignItems: 'center'}}>
                  <Text style={styles.resultLabel}>🎉 당첨 🎉</Text>
                  <Text style={styles.resultText}>{rouletteResult}</Text>
                </View>
              ) : (
                <Text style={styles.readyText}>버튼을 눌러 룰렛을 돌려보세요!</Text>
              )}
            </View>

            <TouchableOpacity style={[styles.spinBtn, isSpinning && {opacity: 0.5}]} onPress={handleSpinClick} disabled={isSpinning}>
              <Text style={styles.spinBtnText}>{canSpinFree ? "🆓 무료로 1회 돌리기" : "📺 광고 보고 한 번 더 돌리기"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 바텀 모달 스튜디오 */}
      <Modal visible={showBottomModal} transparent={true} animationType="slide" onRequestClose={handleCloseModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheetContainer}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitleText}>{textRecipeResult ? "✨ AI 텍스트 레시피" : "🎯 맞춤 요리 제안"}</Text>
              <TouchableOpacity onPress={handleCloseModal} style={styles.closeButton}><Text style={styles.closeButtonText}>닫기 ✕</Text></TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              {isCurating && (<View style={styles.loadingBox}><ActivityIndicator size="large" color="#FF8C00" /><Text style={styles.loadingText}>최적의 메뉴를 고민 중입니다...</Text></View>)}
              
              {!isCurating && curationThemes && !isGeneratingRecipe && !textRecipeResult && (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={{color: '#8C7A76', marginBottom: 15, fontWeight: 'bold'}}>이런 요리는 어떠신가요?</Text>
                  {curationThemes.map((theme, index) => (
                    <TouchableOpacity key={index} style={[styles.themeCard, {borderColor: theme.ui_accent_color}]} onPress={() => generateFinalRecipe(theme)}>
                      <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 5}}><Text style={{fontSize: 22, marginRight: 8}}>{theme.badge_icon}</Text><Text style={{fontSize: 16, fontWeight: 'bold', color: '#3A2E2B', flex: 1}}>{theme.theme_title}</Text></View>
                      <Text style={{fontSize: 13, color: '#8C7A76', marginTop: 5}}>{theme.match_reason}</Text>
                      <View style={{alignSelf: 'flex-end', marginTop: 10, backgroundColor: theme.ui_accent_color, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10}}><Text style={{color: '#fff', fontSize: 12, fontWeight: 'bold'}}>이 레시피 만들기 →</Text></View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {isGeneratingRecipe && (<View style={styles.loadingBox}><ActivityIndicator size="large" color="#4CAF50" /><Text style={styles.loadingText}>선택하신 요리의 레시피를 작성 중입니다...</Text></View>)}

              {!isGeneratingRecipe && textRecipeResult && (
                <ScrollView style={styles.recipeScroll} showsVerticalScrollIndicator={false}>
                  <TouchableOpacity style={styles.ttsStartBtn} onPress={startCookingMode}><Text style={styles.ttsStartBtnText}>🔊 화면 안 보고 귀로 듣기 (조리 모드)</Text></TouchableOpacity>
                  <Markdown style={markdownStyles}>{textRecipeResult}</Markdown>
                  {shoppingList && shoppingList.length > 0 && (
                    <View style={styles.commerceSection}>
                      <Text style={styles.commerceTitle}>🛒 부족한 필수 재료 바로 구매하기</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 10}}>
                        {shoppingList.map((item, idx) => (
                          <TouchableOpacity key={idx} style={styles.commerceBtn} onPress={() => handleShopping(item)}><Text style={styles.commerceBtnText}>{item} 검색 🔍</Text></TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                  <View style={{height: 40}} /> 
                </ScrollView>
              )}
            </View>

            {!isGeneratingRecipe && textRecipeResult && (
              <View style={styles.resultButtonsGrid}>
                <TouchableOpacity style={[styles.gridBtn, {backgroundColor: '#FF6B6B', flex: 0.8}]} onPress={() => handleRecipeSaveAndShare(false)}><Text style={styles.gridBtnText}>저장</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.gridBtn, {backgroundColor: '#4CAF50', flex: 1.1}]} onPress={() => handleRecipeSaveAndShare(true)}><Text style={styles.gridBtnText}>광장 공유 🌍</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.gridBtn, {backgroundColor: '#8E24AA', flex: 1.4}]} onPress={() => { setShowStyleModal(true); }}><Text style={styles.gridBtnText}>레시피 수정 🎲</Text></TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* 스타일 모달 */}
      <Modal visible={showStyleModal} transparent={true} animationType="fade" onRequestClose={() => setShowStyleModal(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={[styles.bottomSheetContainer, {height: 'auto', maxHeight: '80%', paddingBottom: 30, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderRadius: 20}]}>
            <View style={styles.dragHandle} />
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
                <TouchableOpacity style={styles.styleModalSave} onPress={requestNewStyle}><Text style={styles.styleModalBtnTextWhite}>추천받기 ✨</Text></TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

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

const markdownStyles = StyleSheet.create({ body: { color: '#3A2E2B', fontSize: 15, lineHeight: 24 }, heading1: { color: '#FF8C00', fontSize: 22, fontWeight: 'bold' }, blockquote: { backgroundColor: '#F9F5F3', borderLeftWidth: 4, borderLeftColor: '#4CAF50', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5, marginVertical: 10 }});
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgMain }, 
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, marginBottom: 15 },
  greeting: { fontSize: 22, fontWeight: '900', color: Colors.textMain, marginBottom: 5 },
  subGreeting: { fontSize: 14, color: Colors.textSub },
  levelBadge: { backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 15, marginBottom: 5 },
  levelText: { color: Colors.textMain, fontSize: 12, fontWeight: 'bold' },
  expText: { color: Colors.primary, fontSize: 12, fontWeight: 'bold' },
  
  qaButton: { backgroundColor: Colors.bgCard, padding: 12, borderRadius: Radius.sm, alignItems: 'center' },
  qaButtonText: { color: Colors.textMain, fontWeight: 'bold', fontSize: 13 },

  banner: { width: '100%', height: 160, borderRadius: Radius.lg, marginBottom: 25, overflow: 'hidden' },
  bannerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  bannerTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 5 },
  bannerSub: { color: Colors.textMain, fontSize: 14, opacity: 0.9 },
  
  scanSection: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: Colors.border },
  scanInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  scanTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textMain },
  quotaBadge: { backgroundColor: Colors.bgMain, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
  quotaText: { color: Colors.primary, fontSize: 12, fontWeight: 'bold' },
  scanButton: { backgroundColor: Colors.primary, paddingVertical: 18, borderRadius: Radius.md, alignItems: 'center', ...Shadows.glow },
  scanButtonText: { color: Colors.textMain, fontSize: 18, fontWeight: '900' },

  manualInputContainer: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 20, marginBottom: 30, borderWidth: 1, borderColor: Colors.border, shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  manualInputTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textMain, marginBottom: 15 }, 
  sectionLabel: { fontSize: 13, fontWeight: 'bold', color: Colors.textSub, marginBottom: 8 },
  quickTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 15 },
  quickTag: { backgroundColor: Colors.bgMain, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: Colors.border },
  quickTagText: { color: Colors.textSub, fontSize: 12, fontWeight: 'bold' },
  selectedTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  tagBadgeActive: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: Colors.primary, borderRadius: 20 },
  tagTextActive: { color: Colors.textMain, fontSize: 13, fontWeight: 'bold' },
  inlineInputRow: { flexDirection: 'row', gap: 10, marginBottom: 10, alignItems: 'center' },
  manualInputBox: { flex: 1, backgroundColor: Colors.bgMain, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, fontSize: 15, color: Colors.textMain, borderWidth: 1, borderColor: Colors.border },
  addBtn: { backgroundColor: Colors.bgMain, paddingHorizontal: 20, paddingVertical: 14, justifyContent: 'center', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: Colors.border },
  addBtnText: { color: Colors.textMain, fontSize: 14, fontWeight: 'bold' },
  autocompleteContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15, padding: 10, backgroundColor: Colors.bgMain, borderRadius: 10 },
  tagBadge: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: Colors.bgCard, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
  tagText: { color: Colors.textMain, fontSize: 13, fontWeight: 'bold' },
  customAddBadge: { paddingVertical: 10, paddingHorizontal: 15, backgroundColor: Colors.primary, borderRadius: 10, borderWidth: 1, borderColor: Colors.primary, width: '100%', alignItems: 'center' },
  customAddText: { color: Colors.textMain, fontSize: 14, fontWeight: 'bold' },
  manualSubmitBtn: { backgroundColor: '#4CAF50', paddingVertical: 16, alignItems: 'center', borderRadius: 14, marginTop: 10 }, // Keep specific color for success action
  manualSubmitText: { color: Colors.textMain, fontSize: 16, fontWeight: '900' },
  
  categorySection: { marginBottom: 20 },
  categoryHeader: { fontSize: 18, fontWeight: 'bold', color: Colors.textMain, marginBottom: 15 },
  categoryScroll: { gap: 12 },
  categoryCard: { backgroundColor: Colors.bgCard, padding: 15, borderRadius: 15, alignItems: 'center', width: 110, borderWidth: 1, borderColor: Colors.border },
  categoryEmoji: { fontSize: 30, marginBottom: 8 },
  categoryText: { color: Colors.textSub, fontSize: 12, fontWeight: 'bold', textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }, 
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  bottomSheetContainer: { height: '88%', backgroundColor: Colors.bgModal, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 }, 
  bottomSheetContainerWrapper: { width: '100%', justifyContent: 'flex-end' }, 
  dragHandle: { width: 50, height: 5, backgroundColor: '#E8D5D0', borderRadius: 3, alignSelf: 'center', marginTop: 12, marginBottom: 15 }, 
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#E8D5D0', marginBottom: 15 }, 
  modalTitleText: { fontSize: 18, color: Colors.textInverse, fontWeight: '900' }, 
  closeButton: { backgroundColor: '#F5EBE7', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20 }, 
  closeButtonText: { color: Colors.textInverse, fontSize: 14, fontWeight: 'bold' }, 
  modalBody: { flex: 1, justifyContent: 'center' }, 
  loadingBox: { alignItems: 'center', paddingVertical: 50 }, 
  loadingText: { color: Colors.primary, marginTop: 15, fontSize: 15, fontWeight: 'bold' }, 
  recipeScroll: { flex: 1 }, 
  resultButtonsGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginTop: 15 }, 
  gridBtn: { paddingVertical: 14, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' }, 
  gridBtnText: { color: Colors.textMain, fontSize: 14, fontWeight: 'bold' }, 
  themeCard: { backgroundColor: Colors.bgModal, borderRadius: Radius.md, padding: 20, marginBottom: 15, borderWidth: 1, shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }, 
  commerceSection: { marginTop: 20, paddingVertical: 15, borderTopWidth: 1, borderTopColor: '#E8D5D0' }, 
  commerceTitle: { fontSize: 15, fontWeight: '900', color: '#8E24AA', marginBottom: 12 }, 
  commerceBtn: { backgroundColor: '#fff', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: '#E8D5D0', shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 }, 
  commerceBtnText: { color: Colors.textInverse, fontSize: 13, fontWeight: 'bold' },
  
  ttsStartBtn: { backgroundColor: '#E3F2FD', paddingVertical: 15, borderRadius: 15, alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#CE93D8' }, ttsStartBtnText: { color: '#8E24AA', fontSize: 15, fontWeight: '900' }, ttsContainer: { flex: 1, backgroundColor: '#2A2421', padding: 20, justifyContent: 'space-between' }, ttsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }, ttsStepIndicator: { color: '#FFB347', fontSize: 18, fontWeight: 'bold' }, ttsCloseBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20 }, ttsCloseBtnText: { color: '#fff', fontWeight: 'bold' }, ttsBody: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 }, ttsBigText: { color: '#FFFDF9', fontSize: 32, fontWeight: '900', textAlign: 'center', lineHeight: 45 }, ttsControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }, ttsBtn: { backgroundColor: '#4A3F3A', paddingVertical: 20, flex: 1, borderRadius: 20, alignItems: 'center', marginHorizontal: 5 }, ttsBtnText: { color: '#FFFDF9', fontSize: 16, fontWeight: 'bold' }, ttsBtnMain: { backgroundColor: '#FF8C00', paddingVertical: 25, flex: 1.5, borderRadius: 25, alignItems: 'center', marginHorizontal: 5, shadowColor: '#FF8C00', shadowOpacity: 0.5, shadowRadius: 10, elevation: 5 }, ttsBtnMainText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  
  styleModalTitle: { color: '#8E24AA', fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' }, styleInputLabel: { color: '#3A2E2B', fontSize: 14, fontWeight: 'bold', marginBottom: 8, marginTop: 10 }, styleTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 }, styleTag: { paddingVertical: 10, paddingHorizontal: 15, backgroundColor: '#F9F5F3', borderRadius: 20, borderWidth: 1, borderColor: '#E8D5D0' }, styleTagActive: { backgroundColor: '#8E24AA', borderColor: '#AB47BC' }, styleTagText: { color: '#8C7A76', fontSize: 13, fontWeight: 'bold' }, styleTagTextActive: { color: '#fff', fontSize: 13, fontWeight: 'bold' }, customTextInput: { backgroundColor: '#FFFDF9', color: '#3A2E2B', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 10, fontSize: 14, borderWidth: 1, borderColor: '#8E24AA', marginTop: 10 }, styleModalButtons: { flexDirection: 'row', justifyContent: 'center', gap: 15, width: '100%', marginTop: 25 }, styleModalCancel: { backgroundColor: '#F5EBE7', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flex: 1 }, styleModalSave: { backgroundColor: '#8E24AA', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flex: 1.5 }, styleModalBtnText: { color: '#8C7A76', fontWeight: 'bold', fontSize: 15, textAlign: 'center' }, styleModalBtnTextWhite: { color: '#fff', fontWeight: 'bold', fontSize: 15, textAlign: 'center' },

  // 🚨 [신규 추가] 법적 면책 팝업 전용 스타일
  legalModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  legalModalContent: { width: '100%', maxHeight: '85%', backgroundColor: Colors.bgModal, borderRadius: Radius.lg, padding: 25, shadowColor: '#000', shadowOffset: {width:0, height:10}, shadowOpacity: 0.3, shadowRadius: 20, elevation: 15 },
  legalModalTitle: { fontSize: 22, fontWeight: '900', color: '#D32F2F', textAlign: 'center', marginBottom: 20 },
  legalScrollView: { marginBottom: 20 },
  legalMainText: { fontSize: 15, color: Colors.textInverse, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', lineHeight: 22 },
  legalPointBox: { backgroundColor: '#FFEBEE', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#FFCDD2' },
  legalPointTitle: { fontSize: 16, fontWeight: '900', color: '#C62828', marginBottom: 6 },
  legalPointDesc: { fontSize: 14, color: Colors.textInverse, lineHeight: 20 },
  legalFooterText: { fontSize: 12, color: '#8C7A76', textAlign: 'center', marginTop: 10, fontWeight: 'bold' },
  legalAgreeButton: { backgroundColor: '#4CAF50', paddingVertical: 18, borderRadius: Radius.md, alignItems: 'center', shadowColor: '#4CAF50', shadowOpacity: 0.4, shadowRadius: 8, elevation: 5 },
  legalAgreeButtonText: { color: Colors.textMain, fontSize: 16, fontWeight: '900' },
  modalContent: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 25, borderWidth: 1, borderColor: Colors.primary, position: 'relative', width: '90%' },
  modalTitle: { fontSize: 22, fontWeight: '900', color: Colors.primary, marginBottom: 10, textAlign: 'center' },
  modalSub: { fontSize: 14, color: Colors.textMain, textAlign: 'center', marginBottom: 20 },
  styleInput: { backgroundColor: Colors.bgMain, color: Colors.textMain, borderRadius: 12, padding: 15, fontSize: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 20 },
  generateBtn: { backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: Radius.md, alignItems: 'center', marginBottom: 12 },
  generateBtnText: { color: Colors.textInverse, fontSize: 16, fontWeight: '900' },
  skipBtn: { paddingVertical: 10, alignItems: 'center' },
  skipBtnText: { color: Colors.textSub, fontSize: 14, fontWeight: 'bold', textDecorationLine: 'underline' },
  themeSection: { marginTop: 30, marginBottom: 20 },
  themeSectionTitle: { fontSize: 18, fontWeight: '900', color: Colors.textMain, marginBottom: 15, marginLeft: 5 },
  themeScroll: { gap: 12, paddingHorizontal: 5, paddingBottom: 10, paddingRight: 20 },
  themeCard: { backgroundColor: Colors.bgCard, padding: 16, borderRadius: Radius.md, width: 140, borderWidth: 1, borderColor: Colors.border, shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  themeCardTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.primary, marginBottom: 5 },
  themeCardDesc: { fontSize: 12, color: Colors.textSub },
  closeIconBtn: { position: 'absolute', top: 15, right: 15, padding: 5, zIndex: 10 },
  closeIconText: { color: Colors.textSub, fontSize: 18, fontWeight: 'bold' },
  rouletteFab: { position: 'absolute', top: 50, right: 20, backgroundColor: Colors.bgCard, padding: 12, borderRadius: 30, borderWidth: 1, borderColor: Colors.primary, zIndex: 10, shadowColor: Colors.primary, shadowOpacity: 0.5, shadowRadius: 8, elevation: 5 },
  rouletteFabIcon: { fontSize: 24 },
  rouletteRedDot: { position: 'absolute', top: 0, right: 0, width: 12, height: 12, backgroundColor: '#E53935', borderRadius: 6, borderWidth: 2, borderColor: Colors.bgMain },
  rouletteModalContent: { backgroundColor: Colors.bgMain, borderRadius: Radius.lg, padding: 25, borderWidth: 2, borderColor: '#4CAF50', position: 'relative', width: '90%', alignItems: 'center', shadowColor: '#4CAF50', shadowOpacity: 0.3, shadowRadius: 20, elevation: 15 },
  rouletteTitle: { fontSize: 24, fontWeight: '900', color: '#4CAF50', marginBottom: 5 },
  rouletteSub: { fontSize: 13, color: Colors.textSub, marginBottom: 20 },
  rouletteWheelBox: { width: '100%', height: 150, backgroundColor: Colors.bgCard, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: Colors.border, padding: 20 },
  spinningText: { color: Colors.primary, fontSize: 18, fontWeight: 'bold', fontStyle: 'italic' },
  readyText: { color: Colors.textMain, fontSize: 16, fontWeight: 'bold' },
  resultLabel: { color: Colors.primary, fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
  resultText: { color: Colors.textMain, fontSize: 18, fontWeight: '900', textAlign: 'center', lineHeight: 28 },
  spinBtn: { backgroundColor: Colors.primary, paddingVertical: 16, width: '100%', borderRadius: Radius.md, alignItems: 'center' },
  spinBtnText: { color: Colors.textInverse, fontSize: 16, fontWeight: '900' },

  heroBanner: { borderRadius: Radius.lg, marginTop: 10, marginBottom: 25, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 10, overflow: 'hidden', backgroundColor: Colors.bgCard },
  heroBackground: { width: '100%', height: 150, justifyContent: 'center' },
  heroOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 25 },
  heroTitle: { fontSize: 26, fontWeight: '900', color: Colors.textMain, marginBottom: 10 },
  heroSub: { fontSize: 14, color: Colors.textMain, fontWeight: 'bold', opacity: 0.9 },
  
  modernGrid: { gap: 12, marginBottom: 35, paddingHorizontal: 5 },
  gridRow: { flexDirection: 'row', gap: 12 },
  modernGridCard: { 
    flex: 1, 
    // 🚨 1. 히어로 배너와 동일한 모던 배경색 및 테두리 적용
    backgroundColor: Colors.bgCard, 
    borderWidth: 1, 
    borderColor: Colors.border, 
    borderRadius: Radius.lg, 
    // 🚨 2. 가로가 더 긴 2x1 형태의 비율(Aspect Ratio) 강제 적용
    aspectRatio: 1.8, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 5, 
    elevation: 5,
    // 🚨 3. 내부 요소 완벽한 정 중앙 정렬
    justifyContent: 'center',
    alignItems: 'center', 
    paddingHorizontal: 10,
  },
  modernGridIcon: { fontSize: 32, marginBottom: 6 },
  modernGridTitle: { fontSize: 16, fontWeight: '900', color: Colors.textMain, marginBottom: 4, textAlign: 'center' },
  modernGridSub: { fontSize: 11, color: Colors.textSub, fontWeight: 'bold', textAlign: 'center' },
});