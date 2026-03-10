// 파일 위치: app/create-recipe.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Markdown from 'react-native-markdown-display';
import { doc, setDoc } from 'firebase/firestore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadows } from '../constants/design-tokens';
import { auth, db } from '../firebaseConfig';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const RECIPE_TYPES = ["메인 디쉬", "디저트", "음료/칵테일", "간단한 간식", "술안주", "샐러드/다이어트"];
const RECIPE_TASTES = ["매콤한", "단짠단짠", "짭짤한", "자극적인 맛", "담백하고 건강한", "따뜻한 국물"];
const COMMON_INGREDIENTS = [
  "감자", "고구마", "양파", "대파", "마늘", "돼지고기", "소고기", "닭고기", "생선", "계란", "두부", "김치", "통조림 햄", "소면", "치즈", "우유",
  "콩나물", "버섯", "당근", "애호박", "오이", "시금치", "양배추", "브로콜리", "새우", "오징어", "참치캔", "베이컨", "파스타면", "떡국떡"
];
const FREQUENT_INGREDIENTS = ["계란", "양파", "대파", "마늘", "감자", "두부"];

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CURATION_CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.72, 320);
const CURATION_CARD_GAP = 8;
const CURATION_SNAP = CURATION_CARD_WIDTH + CURATION_CARD_GAP;
const CURATION_CARD_HEIGHT = Math.min(SCREEN_WIDTH * 0.9, 380);

const extractJSON = (rawText) => {
  try {
    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(rawText.substring(start, end + 1));
  } catch (e) { return null; }
};

// 3가지 추천 카드용 카피 템플릿: 요리 이름 패턴에 따라 어울리는 한 줄 문구를 붙여서 카드가 휑해 보이지 않도록 함
const THEME_COPY_TEMPLATES: { [key: string]: string[] } = {
  riceBowl: [
    '한 그릇으로 든든하게 채워봐요',
    '바쁜 날엔 접시 하나로 해결해요',
    '밥 위에 툭툭 올려 간단하게 완성해요',
  ],
  stew: [
    '국물 한 숟갈이 필요한 날이에요',
    '속까지 뜨끈하게 달래주는 한 그릇',
    '밥이 절로 들어가는 국물 요리예요',
  ],
  salad: [
    '속은 가볍게, 기분은 상큼하게 채워줘요',
    '다이어트 중에도 안 질리는 선택이에요',
    '냉장고 채소만으로도 충분히 멋진 한 접시예요',
  ],
  noodle: [
    '후루룩 호로록, 금방 비워지는 한 그릇',
    '면치기하고 싶을 때 딱 어울려요',
    '면과 소스가 잘 어울리는 조합이에요',
  ],
  grill: [
    '노릇노릇 구워서 향까지 맛있게 즐겨봐요',
    '겉은 바삭, 속은 촉촉한 구이 요리예요',
    '불맛이 당기는 순간에 잘 어울리는 선택이에요',
  ],
  dessert: [
    '식사 후 달콤하게 마무리해 보세요',
    '기분 전환이 필요할 때 어울리는 간식이에요',
    '티타임에 곁들이기 좋은 달콤한 메뉴예요',
  ],
  snack: [
    '티비 보면서 집어 먹기 좋은 간식이에요',
    '가볍게 한 입씩 즐기기 좋아요',
    '야금야금 먹다 보면 접시가 금방 비워질 거예요',
  ],
  generic: [
    '냉장고 속 재료와 가장 잘 어울리는 한 접시예요',
    '오늘 식탁을 조금 더 특별하게 만들어 줄 거예요',
    '지금 있는 재료만으로도 충분히 근사하게 완성돼요',
  ],
};

const pickThemeCopyForTitle = (title: string | undefined): string => {
  if (!title) return THEME_COPY_TEMPLATES.generic[0];
  const t = title.trim();
  const lower = t.toLowerCase();

  let key: keyof typeof THEME_COPY_TEMPLATES = 'generic';

  if (t.includes('덮밥') || t.includes('비빔') || t.includes('볶음밥') || t.includes('카레')) {
    key = 'riceBowl';
  } else if (t.includes('찌개') || t.includes('탕') || t.includes('국') || t.includes('전골') || t.includes('스튜')) {
    key = 'stew';
  } else if (t.includes('샐러드') || t.includes('샐럿') || t.includes('볼') || t.includes('샌드위치')) {
    key = 'salad';
  } else if (t.includes('면') || t.includes('파스타') || t.includes('라면') || t.includes('우동') || t.includes('국수')) {
    key = 'noodle';
  } else if (t.includes('구이') || t.includes('볶음') || t.includes('스테이크') || t.includes('구운')) {
    key = 'grill';
  } else if (t.includes('케이크') || t.includes('쿠키') || t.includes('디저트') || t.includes('토스트') || lower.includes('dessert')) {
    key = 'dessert';
  } else if (t.includes('주먹밥') || t.includes('간식') || t.includes('야식') || t.includes('스낵')) {
    key = 'snack';
  }

  const list = THEME_COPY_TEMPLATES[key];
  if (!list || list.length === 0) return THEME_COPY_TEMPLATES.generic[0];

  // 항상 같은 제목에 대해 같은 카피가 선택되도록 간단한 해시 사용
  let hash = 0;
  for (let i = 0; i < t.length; i++) {
    hash = (hash + t.charCodeAt(i) * 31) >>> 0;
  }
  const idx = hash % list.length;
  return list[idx];
};

const callGeminiAPI = async (systemPrompt, imageParts = []) => {
  // 개발 환경에서는 실제 API 호출 대신 목업 응답을 사용해 UI/플로우를 빠르게 테스트한다.
  if (__DEV__) {
    // 3가지 추천 테마용 목업
    if (systemPrompt.includes('curation_themes')) {
      return {
        curation_themes: [
          {
            theme_title: '불고기덮밥',
            match_reason: '재료와 찰떡',
            badge_icon: '🍚',
            ui_accent_color: '#F97316',
          },
          {
            theme_title: '얼큰김치찌개',
            match_reason: '따뜻한 국물',
            badge_icon: '🍲',
            ui_accent_color: '#EF4444',
          },
          {
            theme_title: '상큼샐러드',
            match_reason: '가벼운 한 끼',
            badge_icon: '🥗',
            ui_accent_color: '#22C55E',
          },
        ],
      };
    }

    // 최종 레시피 생성용 목업
    if (systemPrompt.includes('recipe_markdown')) {
      return {
        safety_warning: null,
        substitutions: [],
        shopping_list: ['대파', '참기름', '깨소금'],
        recipe_markdown: `# 불고기덮밥

1인분 기준 불고기덮밥 예시 레시피입니다. 실제 조리와 영양 정보는 참고용으로만 사용하세요.

1. 소고기와 양파를 기름에 볶아 불고기 양념으로 간을 맞춥니다.
2. 그릇에 뜨거운 밥을 담고, 볶은 불고기를 올립니다.
3. 대파와 깨소금을 뿌려 마무리합니다.`,
      };
    }
  }

  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.5-pro'];
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }, ...imageParts] }],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        lastError = new Error(`[${response.status}] ${model}: ${data.error?.message || '통신 에러'}`);
        if (response.status === 404 || response.status === 403) continue;
        throw lastError;
      }

      if (!data.candidates || data.candidates.length === 0) throw new Error('API_EMPTY');

      const rawText = data.candidates[0].content.parts[0].text;
      const extracted = extractJSON(rawText);
      if (extracted) return extracted;

      return JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, ''));
    } catch (error) {
      lastError = error;
      if (error.message && error.message.includes('404')) continue;
      throw error;
    }
  }
  throw lastError;
};

export default function CreateRecipeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [ingredientSearch, setIngredientSearch] = useState("");
  const [selectedIngredients, setSelectedIngredients] = useState([]); 
  
  const [showBottomModal, setShowBottomModal] = useState(false);
  const [isCurating, setIsCurating] = useState(false);
  const [curationThemes, setCurationThemes] = useState(null);
  const [currentCurationIndex, setCurrentCurationIndex] = useState(0);
  const [curationScrollX, setCurationScrollX] = useState(0);
  const [curationCarouselWidth, setCurationCarouselWidth] = useState(SCREEN_WIDTH);
  const curationScrollRef = useRef(null); 
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

  const [styleModalVisible, setStyleModalVisible] = useState(false);
  const [preferredStyle, setPreferredStyle] = useState("");

  const [isCookingMode, setIsCookingMode] = useState(false);
  const [cookingSteps, setCookingSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  // 🍴 릴레이 레시피 상태 (New)
  const [isRelayMode, setIsRelayMode] = useState(false);
  const [relayBaseRecipe, setRelayBaseRecipe] = useState("");

  // 배경 파도 애니메이션 (Reanimated)
  const wave1Opacity = useSharedValue(0.3);
  const wave2Translate = useSharedValue(0);
  const wave3Scale = useSharedValue(1);
  useEffect(() => {
    wave1Opacity.value = withRepeat(withTiming(0.5, { duration: 4000 }), -1, true);
    wave2Translate.value = withRepeat(withTiming(14, { duration: 5000 }), -1, true);
    wave3Scale.value = withRepeat(withTiming(1.06, { duration: 6000 }), -1, true);
  }, []);
  const wave1AnimatedStyle = useAnimatedStyle(() => ({ opacity: wave1Opacity.value }));
  const wave2AnimatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: wave2Translate.value }] }));
  const wave3AnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: wave3Scale.value }] }));

  useEffect(() => {
    if (params.preferredStyle) {
      setPreferredStyle(params.preferredStyle);
      setStyleModalVisible(true);
    }
  }, [params]);

  useEffect(() => {
    if (params.autoTheme) {
      const themeWord = Array.isArray(params.autoTheme) ? params.autoTheme[0] : params.autoTheme;
      if (themeWord && !selectedIngredients.includes(themeWord)) {
        setSelectedIngredients(prev => [...prev, themeWord]);
      }
    }
  }, [params.autoTheme, selectedIngredients]);

  useEffect(() => {
    if (params.directIngredients && params.directStyle) {
      const directIngs = (Array.isArray(params.directIngredients) ? params.directIngredients[0] : params.directIngredients).split(',');
      const directSty = Array.isArray(params.directStyle) ? params.directStyle[0] : params.directStyle;
      
      // Set state for UI consistency, though the function will use the direct param
      setSelectedIngredients(directIngs);
      
      getCurationThemes(directSty, directIngs); 
    }
  }, [params.directIngredients, params.directStyle]);

  // 🍴 릴레이 모드 감지 (New)
  useEffect(() => {
    if (params.forkFrom) {
      setIsRelayMode(true);
      setRelayBaseRecipe(Array.isArray(params.forkFrom) ? params.forkFrom[0] : params.forkFrom);
      Alert.alert("릴레이 모드", `[${params.forkFrom}] 레시피를 바탕으로 나만의 어레인지를 만듭니다.`);
    }
  }, [params.forkFrom]);

  const toggleIngredient = (ing) => {
    if (selectedIngredients.includes(ing)) {
      setSelectedIngredients(prev => prev.filter(i => i !== ing));
    } else {
      setSelectedIngredients(prev => [...prev, ing]);
    }
    setIngredientSearch(""); 
  };

  const addCustomIngredient = () => {
    const newIng = ingredientSearch.trim();
    if (newIng && !selectedIngredients.includes(newIng)) {
      setSelectedIngredients(prev => [...prev, newIng]);
    }
    setIngredientSearch("");
  };

  const handleStartTextRecipe = () => {
    if (selectedIngredients.length === 0) {
      Alert.alert("알림", "식재료를 최소 1개 이상 입력해주세요!");
      return;
    }
    setStyleModalVisible(true);
  };

  const filteredIngredients = COMMON_INGREDIENTS.filter(i => i.toLowerCase().includes(ingredientSearch.toLowerCase()) && !selectedIngredients.includes(i));

  const getCurationThemes = async (stylePreference = "", customIngredients = null) => {
    const targetIngredients = customIngredients || selectedIngredients;

    let finalIngredients = [...targetIngredients];
    if (!customIngredients && ingredientSearch.trim()) {
      finalIngredients.push(ingredientSearch.trim());
    }
    
    if (finalIngredients.length === 0) {
      Alert.alert("알림", "식재료를 먼저 추가해 주세요!");
      return;
    }
    
    setIngredientSearch("");
    Keyboard.dismiss();
    setShowBottomModal(true);
    setIsCurating(true);
    setCurationThemes(null);
    setTextRecipeResult(null);
    setShoppingList([]);
    
    try {
      const savedDietRaw = await AsyncStorage.getItem('cookdex_diet_goal');
      let savedDiet = [];
      try { savedDiet = savedDietRaw ? JSON.parse(savedDietRaw) : []; } catch (e) { savedDiet = savedDietRaw && savedDietRaw !== "없음" ? [savedDietRaw] : []; }
      const savedAllergies = await AsyncStorage.getItem('cookdex_allergies');
      const savedCondimentsRaw = await AsyncStorage.getItem('cookdex_condiments');
      
      const dietText = savedDiet.length > 0 ? `[🎯 유저 식단 목표]: ${savedDiet.join(', ')} (이 목표에 부합하는 요리를 추천해)` : "";
      const allergyText = savedAllergies && savedAllergies !== "없음" ? `[🚨 알레르기/기피 재료]: ${savedAllergies} (절대 포함 금지!)` : "";
      const condimentsText = savedCondimentsRaw ? `[🧂 보유 중인 양념장(Pantry)]: ${JSON.parse(savedCondimentsRaw).join(', ')} (이 재료들은 이미 집에 있으니 적극 활용해)` : "";

      const userContextPrompt = `\n\n--- 👨‍🍳 셰프 맞춤 정보 ---\n[🥕 입력된 메인 식재료]: ${finalIngredients.join(', ')}\n${condimentsText}\n${dietText}\n${allergyText}\n----------------------\n`;
      const currentTime = new Date().getHours() < 11 ? "아침" : new Date().getHours() < 16 ? "점심" : "저녁/야식";
      const stylePrompt = `[👨‍🍳 희망 요리 스타일]: ${stylePreference ? stylePreference : "AI가 판단하여 최적의 메뉴 추천"}`;

      const systemPrompt = `너는 최고의 셰프 '쿡덱스'야. 위 정보를 바탕으로 매우 창의적이고 흥미로운 3가지 요리 테마를 제안해.\n[상황]: 현재 시간은 ${currentTime}\n${stylePrompt}${userContextPrompt}\n[규칙] theme_title은 요리 이름만 4~8글자로 짧게 (예: 김치찌개, 간장불고기). match_reason은 10글자 이내로 한 줄 (예: 재료와 찰떡, 몸에 좋아요).\n반드시 JSON 형식으로만 대답해. 마크다운(\`\`\`json 등) 절대 금지.\n{ "curation_themes": [ { "theme_title": "요리 이름 4~8글자", "match_reason": "10글자 이내", "badge_icon": "이모지 1개", "ui_accent_color": "#FF8C00" } ] }`;

      const parsedData = await callGeminiAPI(systemPrompt);
      setCurationThemes(parsedData.curation_themes.slice(0, 3));
      setCurrentCurationIndex(0);
    } catch (error) { 
      Alert.alert("안내", `테마를 불러오지 못했습니다.\n상세: ${error.message}`); 
      setShowBottomModal(false); 
    } finally {
      setIsCurating(false);
    }
  };

  const generateFinalRecipe = async (theme) => {
    setIsGeneratingRecipe(true);
    try {
      const savedDietRaw = await AsyncStorage.getItem('cookdex_diet_goal');
      let savedDiet = [];
      try { savedDiet = savedDietRaw ? JSON.parse(savedDietRaw) : []; } catch (e) { savedDiet = savedDietRaw && savedDietRaw !== "없음" ? [savedDietRaw] : []; }
      const savedAllergies = await AsyncStorage.getItem('cookdex_allergies');
      const savedCondimentsRaw = await AsyncStorage.getItem('cookdex_condiments');
      
      const dietText = savedDiet.length > 0 ? `[식단 목표: ${savedDiet.join(', ')}]에 맞춰서 요리해 줘.` : "";
      const allergyText = savedAllergies && savedAllergies !== "없음" ? `[🚨치명적 경고🚨 알레르기 및 기피 재료: ${savedAllergies}] 이 재료들은 레시피에 절대 포함시키지 마!` : "";
      const condimentsText = savedCondimentsRaw ? `[보유 중인 기본 양념/향신료: ${JSON.parse(savedCondimentsRaw).join(', ')}] 이 재료들은 이미 집에 있으니 '부족한 구매 리스트'에서 빼고 자유롭게 써 줘.` : "";

      const userContextPrompt = `\n\n--- 👨‍🍳 셰프 맞춤 설정 ---\n${dietText}\n${allergyText}\n${condimentsText}\n----------------------\n`;
      // 🍴 릴레이 모드 프롬프트 주입
      const relayInstruction = isRelayMode ? `\n[🔥 릴레이 챌린지 모드]: 이 레시피는 기존의 '${relayBaseRecipe}' 레시피를 유저만의 방식으로 재해석(Fork)하는 것입니다. 원본의 특징을 살리되, 추가된 재료를 활용해 창의적으로 변형하세요.` : "";

      const systemPrompt = `너는 셰프야. 재료(${selectedIngredients.join(', ')})를 가지고 [${theme.theme_title}] 레시피를 작성해.${userContextPrompt}${relayInstruction}\n⚠️ 필수 지시사항: 각 식재료의 중량을 추정하여 1인분 기준 총 칼로리(kcal)와 핵심 영양성분(탄수화물, 단백질, 지방)을 근사치 100%에 가깝게 계산한 뒤, 레시피 제목 바로 밑에 눈에 띄게 표기해.
      
      ⚠️ 중요: 상표권 방어를 위해 레시피 내에 특정 기업의 브랜드명(예: 스팸, 오뚜기 카레 등)은 절대 사용하지 말고, 반드시 '통조림 햄', '카레 가루' 등 일반 명사로 대체할 것.
      ⚠️ 중요: 마크다운 최하단에는 반드시 다음 안내 문구를 정확히 포함시킬 것: "\n\n---\n*※ 본 레시피의 영양 정보 및 조리법은 AI가 추정한 결과로, 실제 식재료의 상태나 조리 환경에 따라 다를 수 있습니다. 위생 및 안전에 유의하여 조리해 주십시오.*"
      
      반드시 아래 JSON 형식으로만 대답해. 마크다운(\`\`\`json 등) 절대 금지.\n{ "safety_warning": "위생 경고 필요시 작성, 없으면 null", "substitutions": [ { "original": "필요한데 유저가 입력 안한 재료", "substitute": "대체재", "reason": "대체 이유" } ], "shopping_list": ["대체불가 필수 마트 구매 재료"], "recipe_markdown": "무조건 첫 줄은 '# ${theme.theme_title}'. 조리 순서는 무조건 '1. ', '2. ' 같은 숫자로 시작할 것." }`;
      
      const parsedData = await callGeminiAPI(systemPrompt);

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

    const checkSettings = async () => {
      const wakelock = await AsyncStorage.getItem('cookdex_setting_wakelock');
      const voice = await AsyncStorage.getItem('cookdex_setting_voice');
      if (wakelock === 'true') { try { await activateKeepAwakeAsync(); } catch(e){} }
      if (voice === 'true') { setIsVoiceActive(true); }
    };
    checkSettings();
  };
  const handleNextStep = () => { if (currentStepIndex < cookingSteps.length - 1) { Speech.stop(); setCurrentStepIndex(prev => prev + 1); Speech.speak(cookingSteps[currentStepIndex + 1], { language: 'ko-KR', rate: 0.95 }); } };
  const handlePrevStep = () => { if (currentStepIndex > 0) { Speech.stop(); setCurrentStepIndex(prev => prev - 1); Speech.speak(cookingSteps[currentStepIndex - 1], { language: 'ko-KR', rate: 0.95 }); } };
  const handleReplayStep = () => { Speech.stop(); Speech.speak(cookingSteps[currentStepIndex], { language: 'ko-KR', rate: 0.95 }); };
  const handleExitCookingMode = () => { 
    Speech.stop(); setIsCookingMode(false); 
    try { deactivateKeepAwake(); } catch(e){}
    setIsVoiceActive(false);
  };

  const isFromThemeFlow = !!(params.directStyle && params.directIngredients);

  const handleCloseModal = () => {
    if (textRecipeResult || curationThemes) {
      Alert.alert("앗! 잠깐만요 🛑", "아직 레시피를 저장하지 않았어요. 창을 닫으시겠습니까?", [
        { text: "취소", style: "cancel" },
        { text: "닫기", style: "destructive", onPress: () => {
          setShowBottomModal(false);
          if (isFromThemeFlow) router.replace('/(tabs)');
        } },
      ]);
    } else {
      setShowBottomModal(false);
      if (isFromThemeFlow) router.replace('/(tabs)');
    }
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

      if (isSharing) {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          Alert.alert('로그인 필요', '요리 광장에 공유하려면 로그인해 주세요.');
          return;
        }
        try {
          await setDoc(doc(db, 'global_recipes', recipeId), {
            id: recipeId,
            content: textRecipeResult,
            authorId: currentUser.uid,
            authorName: currentUser.displayName || currentUser.email?.split('@')[0] || '익명',
            createdAt: new Date().toISOString(),
            likes: 0,
          });
          Alert.alert('광장에 등록 완료! 🌍', '요리 광장 피드에 레시피가 공유되었습니다.', [
            { text: '확인', onPress: () => router.push('/(tabs)/plaza') },
          ]);
        } catch (err) {
          Alert.alert('공유 실패', '광장 등록에 실패했습니다. 네트워크를 확인해 주세요.');
        }
        return;
      }
      Alert.alert('저장됨', '레시피가 저장되었습니다.');
    } catch (error) { Alert.alert('오류', '저장에 실패했습니다.'); }
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.pageHeader}>
        <TouchableOpacity onPress={() => (isFromThemeFlow ? router.replace('/(tabs)') : router.back())} style={styles.backBtn}>
          <Text style={styles.backBtnText}>뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>AI 레시피 생성</Text>
        <View style={{width: 70}} />
      </View>

      <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={{flex: 1}} contentContainerStyle={{paddingBottom: 100}} keyboardShouldPersistTaps="handled">
          
          {/* --- 1. 카메라 스캔 섹션 --- */}
          <TouchableOpacity style={styles.cameraSection} onPress={() => router.push('/scanner')}>
            <View>
              <Text style={styles.cameraTitle}>카메라로 재료 스캔하기</Text>
              <Text style={styles.cameraSub}>냉장고 속 재료를 찍어서 한 번에 인식!</Text>
            </View>
            <Text style={styles.cameraArrow}>▶</Text>
          </TouchableOpacity>

          <View style={styles.dividerBox}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>또는</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* --- 2. 텍스트 입력 스튜디오 --- */}
          <View style={styles.studioContainer}>
            <Text style={styles.studioTitle}>직접 입력하여 레시피 만들기</Text>
            <Text style={styles.studioSub}>냉장고 속 재료를 타이핑해서 알려주세요.</Text>
            
            <View style={styles.studioInputBox}>
              <TextInput 
                style={styles.studioInput}
                placeholder="예: 돼지고기, 김치, 두부"
                placeholderTextColor="#A89F9C"
                value={ingredientSearch}
                onChangeText={setIngredientSearch}
                onSubmitEditing={addCustomIngredient}
              />
              <TouchableOpacity style={styles.studioAddBtn} onPress={addCustomIngredient}>
                <Text style={styles.studioAddBtnText}>추가</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.suggestionArea}>
              <Text style={styles.suggestionLabel}>
                {ingredientSearch ? "AI가 인식하는 자동 완성 식재료" : "자주 쓰는 식재료 (터치 가능)"}
              </Text>
              <View style={styles.suggestionTags}>
                {(ingredientSearch ? filteredIngredients : FREQUENT_INGREDIENTS).slice(0, 6).map((ing) => (
                  <TouchableOpacity key={ing} style={styles.suggestionTag} onPress={() => toggleIngredient(ing)}>
                    <Text style={styles.suggestionTagText}>+ {ing}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {selectedIngredients.length > 0 && (
              <View style={styles.selectedArea}>
                {selectedIngredients.map((ing) => (
                  <TouchableOpacity key={ing} style={styles.selectedTag} onPress={() => toggleIngredient(ing)}>
                    <Text style={styles.selectedTagText}>{ing} ✕</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.studioGenerateBtn} onPress={handleStartTextRecipe}>
              <Text style={styles.studioGenerateBtnText}>AI 레시피 제작!</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* 요리 스타일 질문 모달 */}
      <Modal visible={styleModalVisible} transparent={true} animationType="fade" onRequestClose={() => setStyleModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlayCenter}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setStyleModalVisible(false)} />
          <View style={styles.styleModalView}>
            <TouchableOpacity style={styles.closeIconBtn} onPress={() => setStyleModalVisible(false)}>
              <Text style={styles.closeIconText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>어떤 스타일로 요리할까요? 🍳</Text>
            <Text style={styles.modalSub}>원하는 맛이나 분위기를 알려주세요.</Text>
            <TextInput 
              style={styles.styleInput} 
              placeholder="예: 볶음밥, 얼큰한 찌개, 오븐 구이 등" 
              placeholderTextColor="#A89F9C"
              value={preferredStyle}
              onChangeText={setPreferredStyle}
            />
            <TouchableOpacity style={styles.generateBtn} onPress={() => { setStyleModalVisible(false); getCurationThemes(preferredStyle); }}>
              <Text style={styles.generateBtnText}>이 스타일로 추천받기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipBtn} onPress={() => { setPreferredStyle(""); setStyleModalVisible(false); getCurationThemes(""); }}>
              <Text style={styles.skipBtnText}>건너뛰고 알아서 추천받기</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 🚨 [UI 개선] 추천/결과 표시 — 로딩·카드 모두 같은 꽉 찬 페이지 배경 */}
      <Modal visible={showBottomModal} transparent={true} animationType="slide" onRequestClose={handleCloseModal}>
        {(() => {
          const showCurationPhase = isCurating || (curationThemes && !textRecipeResult) || isGeneratingRecipe || !!textRecipeResult;
          return (
            <View style={[styles.modalOverlay, showCurationPhase && styles.modalOverlayCuration]}>
              {showCurationPhase && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <LinearGradient
                    colors={['#FFF7ED', '#FED7AA', '#FDBA74', '#EA580C']}
                    locations={[0, 0.35, 0.65, 1]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0.2, y: 0 }}
                    end={{ x: 0.8, y: 1 }}
                  />
                  <Animated.View style={[styles.curationWave, styles.curationWave1, wave1AnimatedStyle]} />
                  <Animated.View style={[styles.curationWave, styles.curationWave2, wave2AnimatedStyle]} />
                  <Animated.View style={[styles.curationWave, styles.curationWave3, wave3AnimatedStyle]} />
                </View>
              )}
              <View style={[styles.bottomSheetContainer, showCurationPhase && styles.bottomSheetCurationBg]}>
                <View style={[styles.dragHandle, showCurationPhase && styles.dragHandleOnCuration]} />
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitleText, showCurationPhase && styles.modalTitleTextOnCuration]}>{textRecipeResult ? "AI 텍스트 레시피" : "맞춤 요리 제안"}</Text>
                  <TouchableOpacity onPress={handleCloseModal} style={[styles.closeButton, showCurationPhase && styles.closeButtonOnCuration]}><Text style={[styles.closeButtonText, showCurationPhase && styles.closeButtonTextOnCuration]}>닫기 ✕</Text></TouchableOpacity>
                </View>
            
                <View style={styles.modalBody}>
                  {isCurating && (<View style={styles.loadingBoxFull}><ActivityIndicator size="large" color="#FF8C00" /><Text style={styles.loadingText}>최적의 메뉴를 고민 중입니다...</Text></View>)}
              
              {/* 🚨 [UI 개선] 3가지 추천 UI — 한 장씩 스냅 + 화살표 */}
              {!isCurating && curationThemes && !isGeneratingRecipe && !textRecipeResult && (
                <View style={styles.curationWrap}>
                  <Text style={[styles.curationTitle, styles.curationTitleOnCuration]}>이런 요리는 어떠신가요?</Text>
                  <Text style={[styles.curationSub, styles.curationSubOnCuration]}>아래 추천 메뉴 중 하나를 선택해 레시피를 받아보세요.</Text>
                  <View style={styles.curationCarouselRow}>
                    <TouchableOpacity
                      style={[styles.curationArrowBtn, currentCurationIndex === 0 && styles.curationArrowBtnDisabled]}
                      onPress={() => {
                        if (currentCurationIndex > 0) {
                          const next = currentCurationIndex - 1;
                          setCurrentCurationIndex(next);
                          curationScrollRef.current?.scrollTo({ x: next * CURATION_SNAP, animated: true });
                        }
                      }}
                      disabled={currentCurationIndex === 0}
                      accessibilityLabel="이전 추천"
                    >
                      <Ionicons name="chevron-back" size={28} color={currentCurationIndex === 0 ? Colors.textSub : Colors.textMain} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }} onLayout={(e) => setCurationCarouselWidth(e.nativeEvent.layout.width)}>
                      <ScrollView
                        ref={curationScrollRef}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        snapToInterval={CURATION_SNAP}
                        snapToAlignment="center"
                        decelerationRate="fast"
                        // 캐러셀 실제 너비 기준으로 메인 카드를 항상 화면 정중앙에 오도록 정렬
                        contentContainerStyle={[
                          styles.curationScroll,
                          {
                            paddingHorizontal: Math.max(
                              0,
                              (curationCarouselWidth - CURATION_CARD_WIDTH) / 2,
                            ),
                          },
                        ]}
                        scrollEventThrottle={16}
                        onScroll={(e) => setCurationScrollX(e.nativeEvent.contentOffset.x)}
                        onMomentumScrollEnd={(e) => {
                          const x = e.nativeEvent.contentOffset.x;
                          const index = Math.round(x / CURATION_SNAP);
                          setCurrentCurationIndex(Math.min(index, curationThemes.length - 1));
                        }}
                      >
                        {curationThemes.map((theme, index) => {
                          // 현재 스크롤 위치 대비 각 카드의 상대적인 위치 (index - progress)로 방향을 맞춰,
                          // 오른쪽으로 스와이프할 때 카드는 오른쪽으로 기울어지도록 조정
                          const rawProgress = index - curationScrollX / CURATION_SNAP;
                          const clampedProgress = Math.max(-1, Math.min(1, rawProgress));
                          const distance = Math.abs(clampedProgress);
                          const isMain = Math.round(curationScrollX / CURATION_SNAP) === index;

                          // 중앙 1.0, 양옆 약 0.9 정도로만 줄여서 입체감과 안정감 균형 맞춤
                          const scale = 1 - distance * 0.1;
                          // 양옆 카드도 충분히 보이도록 투명도는 크게 낮추지 않음
                          const opacity = isMain ? 1 : 0.9 - distance * 0.06;
                          // 회전 각도를 유지하되 너무 과하게 벗어나지 않도록 조금만 조정
                          const rotateY = -clampedProgress * 22; // 좌/우 대략 -22deg ~ 22deg
                          // 슬라이드 진행 방향으로 살짝만 이동시켜, 기울기와 방향감을 맞추되 잘림은 방지
                          const translateX = clampedProgress * 14;

                          // 카드 내부 컨텐츠에도 약한 패럴럭스/스케일을 적용해 평면 느낌을 줄임
                          const contentTranslateY = clampedProgress * 6;
                          const contentScale = 1 - distance * 0.04;

                          const cardTransform = [
                            { perspective: 900 }, // 항상 transform 배열의 첫 번째에 위치
                            { translateX },
                            { rotateY: `${rotateY}deg` },
                            { scale },
                          ];

                          return (
                            <View
                              key={index}
                              style={[
                                styles.curationCardSlot,
                                {
                                  width: CURATION_SNAP,
                                  zIndex: isMain ? 10 : 6 - distance * 2,
                                },
                              ]}
                            >
                              <TouchableOpacity onPress={() => generateFinalRecipe(theme)} activeOpacity={0.9}>
                                  <Animated.View
                                    style={[
                                      styles.curationCard,
                                      styles.curationCardGlass,
                                      {
                                        width: CURATION_CARD_WIDTH,
                                        height: CURATION_CARD_HEIGHT,
                                        opacity,
                                        transform: cardTransform,
                                      },
                                    ]}
                                  >
                                  {/* 배경 블러 + 색 오버레이는 같은 3D 컨텍스트 내에서만 절대 배치 */}
                                  {/* 하얀빛 플래시가 과한 문제를 줄이기 위해 블러 강도와 오버레이 투명도를 낮춤 */}
                                  <BlurView intensity={isMain ? 18 : 26} tint="light" style={StyleSheet.absoluteFill} />
                                  <View
                                    style={[
                                      StyleSheet.absoluteFill,
                                      {
                                        // 기존 '99'(약 60% 알파)에서 '66'(약 40% 알파)로 낮춰 밝은 플래시를 완화
                                        backgroundColor: (theme.ui_accent_color || '#FF8C00') + '66',
                                        borderRadius: Radius.lg,
                                      },
                                    ]}
                                  />

                                  {/* 이모지/텍스트 컨텐츠는 Animated.View의 직계 자식으로 두어 함께 3D 회전되도록 함 */}
                                  <View
                                    style={[
                                      styles.curationCardContent,
                                      {
                                        transform: [
                                          { translateY: contentTranslateY },
                                          { scale: contentScale },
                                        ],
                                      },
                                    ]}
                                  >
                                    <Text style={styles.curationCardIcon}>{theme.badge_icon}</Text>
                                    <Text style={styles.curationCardTitle} numberOfLines={1} ellipsizeMode="tail">
                                      {theme.theme_title}
                                    </Text>
                                    <Text style={styles.curationCardReason} numberOfLines={2} ellipsizeMode="tail">
                                      {theme.match_reason}
                                    </Text>
                                    <Text style={styles.curationCardCopy} numberOfLines={2} ellipsizeMode="tail">
                                      {pickThemeCopyForTitle(theme.theme_title)}
                                    </Text>
                                  </View>
                                </Animated.View>
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </ScrollView>
                    </View>
                    <TouchableOpacity
                      style={[styles.curationArrowBtn, currentCurationIndex >= curationThemes.length - 1 && styles.curationArrowBtnDisabled]}
                      onPress={() => {
                        if (currentCurationIndex < curationThemes.length - 1) {
                          const next = currentCurationIndex + 1;
                          setCurrentCurationIndex(next);
                          curationScrollRef.current?.scrollTo({ x: next * CURATION_SNAP, animated: true });
                        }
                      }}
                      disabled={currentCurationIndex >= curationThemes.length - 1}
                      accessibilityLabel="다음 추천"
                    >
                      <Ionicons name="chevron-forward" size={28} color={currentCurationIndex >= curationThemes.length - 1 ? Colors.textSub : Colors.textMain} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {isGeneratingRecipe && (<View style={styles.loadingBoxFull}><ActivityIndicator size="large" color="#4CAF50" /><Text style={[styles.loadingText, { color: Colors.textMain }]}>선택하신 요리의 레시피를 작성 중입니다...</Text></View>)}

              {!isGeneratingRecipe && textRecipeResult && (
                <ScrollView style={styles.recipeScroll} showsVerticalScrollIndicator={false}>
                  <TouchableOpacity style={styles.ttsStartBtn} onPress={startCookingMode}><Text style={styles.ttsStartBtnText}>조리 모드로 듣기</Text></TouchableOpacity>
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
                <TouchableOpacity style={[styles.gridBtn, {backgroundColor: '#4CAF50', flex: 1.1}]} onPress={() => handleRecipeSaveAndShare(true)}><Text style={styles.gridBtnText}>광장에 공유</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.gridBtn, {backgroundColor: '#8E24AA', flex: 1.4}]} onPress={() => { setShowStyleModal(true); }}><Text style={styles.gridBtnText}>레시피 스타일 변경</Text></TouchableOpacity>
              </View>
            )}
          </View>
        </View>
            ); })()}
      </Modal>

      {/* 스타일 수정 모달 */}
      <Modal visible={showStyleModal} transparent={true} animationType="fade" onRequestClose={() => setShowStyleModal(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={[styles.bottomSheetContainer, {height: 'auto', maxHeight: '80%', paddingBottom: 30, borderRadius: 20}]}>
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

      {/* TTS 조리 모달 */}
      <Modal visible={isCookingMode} transparent={false} animationType="slide">
        <SafeAreaView style={styles.ttsContainer}>
          <View style={styles.ttsHeader}>
            <Text style={styles.ttsStepIndicator}>조리 단계 {currentStepIndex + 1} / {cookingSteps.length}</Text>
            <TouchableOpacity onPress={handleExitCookingMode} style={styles.ttsCloseBtn}><Text style={styles.ttsCloseBtnText}>종료 ✕</Text></TouchableOpacity>
          </View>
          <View style={styles.ttsBody}>
            {isVoiceActive && (
              <View style={{ backgroundColor: 'rgba(255, 140, 0, 0.2)', padding: 10, borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: '#FF8C00' }}>
                <Text style={{ color: '#FFB347', fontWeight: 'bold' }}>음성 명령 활성화됨 ("다음", "이전" 대기 중)</Text>
              </View>
            )}
            <Text style={styles.ttsBigText}>{cookingSteps[currentStepIndex]}</Text>
          </View>
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
  body: {
    color: Colors.textMain,
    fontSize: 15,
    lineHeight: 24,
  },
  heading1: {
    color: Colors.primary,
    fontSize: 22,
    fontWeight: 'bold',
  },
  blockquote: {
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginVertical: 10,
    color: Colors.textMain,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgMain,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 32 : 16,
    paddingBottom: 12,
  },
  backBtn: {
    backgroundColor: Colors.bgElevated,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
  },
  backBtnText: {
    color: Colors.textSub,
    fontSize: 13,
    fontWeight: 'bold',
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.textMain,
  },

  cameraSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    padding: 18,
    borderRadius: Radius.lg,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  cameraIcon: {
    fontSize: 32,
    marginRight: 15,
  },
  cameraTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.textMain,
    marginBottom: 4,
  },
  cameraSub: {
    fontSize: 13,
    color: Colors.textSub,
  },
  cameraArrow: {
    fontSize: 18,
    color: Colors.textSub,
    marginLeft: 'auto',
  },

  dividerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textMuted,
    paddingHorizontal: 15,
    fontSize: 13,
    fontWeight: 'bold',
  },

  studioContainer: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    padding: 20,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  studioTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.textMain,
    marginBottom: 5,
  },
  studioSub: {
    fontSize: 13,
    color: Colors.textSub,
    marginBottom: 15,
  },
  studioInputBox: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15,
  },
  studioInput: {
    flex: 1,
    backgroundColor: Colors.bgMain,
    borderRadius: Radius.md,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.textMain,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  studioAddBtn: {
    backgroundColor: Colors.bgMuted,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  studioAddBtnText: {
    color: Colors.textMain,
    fontWeight: 'bold',
  },
  suggestionArea: {
    marginBottom: 15,
  },
  suggestionLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.textSub,
    marginBottom: 8,
  },
  suggestionTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionTag: {
    backgroundColor: Colors.bgMuted,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
  },
  suggestionTagText: {
    color: Colors.textMain,
    fontSize: 12,
    fontWeight: 'bold',
  },
  selectedArea: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
    padding: 10,
    backgroundColor: Colors.bgMain,
    borderRadius: Radius.md,
  },
  selectedTag: {
    backgroundColor: Colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
  },
  selectedTagText: {
    color: Colors.textInverse,
    fontSize: 12,
    fontWeight: 'bold',
  },
  studioGenerateBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: Radius.lg,
    alignItems: 'center',
    ...Shadows.glow,
  },
  studioGenerateBtnText: {
    color: Colors.textInverse,
    fontSize: 16,
    fontWeight: '900',
  },

  modalOverlayCenter: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
    justifyContent: 'center',
    padding: 20,
  },
  styleModalView: {
    backgroundColor: Colors.bgModal,
    borderRadius: Radius.lg,
    padding: 25,
    borderWidth: 1,
    borderColor: Colors.primary,
    position: 'relative',
    width: '100%',
  },
  closeIconBtn: {
    position: 'absolute',
    top: 15,
    right: 15,
    padding: 5,
    zIndex: 10,
  },
  closeIconText: {
    color: Colors.textSub,
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.primary,
    marginBottom: 10,
    textAlign: 'center',
  },
  modalSub: {
    fontSize: 14,
    color: Colors.textInverse,
    textAlign: 'center',
    marginBottom: 20,
  },
  styleInput: {
    backgroundColor: '#FFF',
    color: Colors.textInverse,
    borderRadius: Radius.md,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    marginBottom: 20,
  },
  generateBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginBottom: 12,
  },
  generateBtnText: {
    color: Colors.textInverse,
    fontSize: 16,
    fontWeight: '900',
  },
  skipBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  skipBtnText: {
    color: Colors.textSub,
    fontSize: 14,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
    justifyContent: 'flex-end',
  },
  modalOverlayCuration: {
    backgroundColor: 'transparent',
    justifyContent: 'center',
  },
  bottomSheetCurationBg: {
    backgroundColor: 'transparent',
    height: '100%',
  },
  curationWave: {
    position: 'absolute',
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 237, 213, 0.35)',
  },
  curationWave1: {
    width: SCREEN_WIDTH * 1.2,
    height: SCREEN_WIDTH * 1.2,
    bottom: -SCREEN_WIDTH * 0.5,
    left: -SCREEN_WIDTH * 0.3,
  },
  curationWave2: {
    width: SCREEN_WIDTH * 0.9,
    height: SCREEN_WIDTH * 0.9,
    bottom: -SCREEN_WIDTH * 0.2,
    right: -SCREEN_WIDTH * 0.4,
    backgroundColor: 'rgba(254, 215, 170, 0.4)',
  },
  curationWave3: {
    width: SCREEN_WIDTH * 0.7,
    height: SCREEN_WIDTH * 0.7,
    top: SCREEN_HEIGHT * 0.15,
    right: -SCREEN_WIDTH * 0.2,
    backgroundColor: 'rgba(253, 186, 116, 0.25)',
  },
  dragHandleOnCuration: {
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  modalTitleTextOnCuration: {
    color: '#1C1917',
  },
  closeButtonOnCuration: {
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  closeButtonTextOnCuration: {
    color: '#1C1917',
  },
  bottomSheetContainer: {
    height: '88%',
    backgroundColor: Colors.bgModal,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
  },
  dragHandle: {
    width: 50,
    height: 5,
    backgroundColor: '#E0D5CC',
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 15,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0D5CC',
    marginBottom: 15,
    paddingHorizontal: 20,
  },
  modalTitleText: {
    fontSize: 18,
    color: Colors.textInverse,
    fontWeight: '900',
  },
  closeButton: {
    backgroundColor: '#F5EBE7',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  closeButtonText: {
    color: Colors.textInverse,
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalBody: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 16,
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  loadingBoxFull: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    color: Colors.primary,
    marginTop: 15,
    fontSize: 15,
    fontWeight: 'bold',
  },

  curationWrap: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 12,
  },
  curationTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.textInverse,
    marginBottom: 5,
    textAlign: 'center',
  },
  curationTitleOnCuration: {
    color: '#1C1917',
  },
  curationSub: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 16,
    textAlign: 'center',
  },
  curationSubOnCuration: {
    color: '#57534e',
  },
  curationCarouselRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  curationArrowBtn: {
    padding: 12,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  curationArrowBtnDisabled: {
    opacity: 0.4,
  },
  curationScroll: {
    paddingBottom: 20,
  },
  curationCardSlot: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  curationCard: {
    borderRadius: Radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 26,
    justifyContent: 'space-between',
  },
  curationCardGlass: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    backfaceVisibility: 'hidden',
  },
  curationCardContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  curationCardIcon: {
    fontSize: 44,
    textAlign: 'center',
  },
  curationCardTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
  },
  curationCardReason: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
  },
  curationCardCopy: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.92)',
    textAlign: 'center',
  },

  recipeScroll: {
    flex: 1,
    paddingHorizontal: 20,
  },
  resultButtonsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 15,
    paddingHorizontal: 20,
  },
  gridBtn: {
    paddingVertical: 14,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  commerceSection: {
    marginTop: 20,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#E0D5CC',
  },
  commerceTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#8E24AA',
    marginBottom: 12,
  },
  commerceBtn: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0D5CC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  commerceBtnText: {
    color: '#3A2E2B',
    fontSize: 13,
    fontWeight: 'bold',
  },

  ttsStartBtn: {
    backgroundColor: '#E3F2FD',
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#CE93D8',
  },
  ttsStartBtnText: {
    color: '#8E24AA',
    fontSize: 15,
    fontWeight: '900',
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
    marginTop: 20,
  },
  ttsStepIndicator: {
    color: '#FFB347',
    fontSize: 18,
    fontWeight: 'bold',
  },
  ttsCloseBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  ttsCloseBtnText: {
    color: Colors.textMain,
    fontWeight: 'bold',
  },
  ttsBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  ttsBigText: {
    color: Colors.textMain,
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 45,
  },
  ttsControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 40,
  },
  ttsBtn: {
    backgroundColor: Colors.bgElevated,
    paddingVertical: 20,
    flex: 1,
    borderRadius: 20,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  ttsBtnText: {
    color: Colors.textMain,
    fontSize: 16,
    fontWeight: 'bold',
  },
  ttsBtnMain: {
    backgroundColor: Colors.primary,
    paddingVertical: 25,
    flex: 1.5,
    borderRadius: 25,
    alignItems: 'center',
    marginHorizontal: 5,
    ...Shadows.glow,
  },
  ttsBtnMainText: {
    color: Colors.textMain,
    fontSize: 18,
    fontWeight: '900',
  },

  styleModalTitle: {
    color: '#8E24AA',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  styleInputLabel: {
    color: Colors.textInverse,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 10,
  },
  styleTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 5,
  },
  styleTag: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#F9F5F3',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8D5D0',
  },
  styleTagActive: {
    backgroundColor: '#8E24AA',
    borderColor: '#AB47BC',
  },
  styleTagText: {
    color: '#8C7A76',
    fontSize: 13,
    fontWeight: 'bold',
  },
  styleTagTextActive: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  customTextInput: {
    backgroundColor: '#FFFDF9',
    color: '#3A2E2B',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#8E24AA',
    marginTop: 10,
  },
  styleModalButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 15,
    width: '100%',
    marginTop: 25,
  },
  styleModalCancel: {
    backgroundColor: '#F5EBE7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  styleModalSave: {
    backgroundColor: '#8E24AA',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1.5,
  },
  styleModalBtnText: {
    color: '#8C7A76',
    fontWeight: 'bold',
    fontSize: 15,
    textAlign: 'center',
  },
  styleModalBtnTextWhite: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
    textAlign: 'center',
  },
});