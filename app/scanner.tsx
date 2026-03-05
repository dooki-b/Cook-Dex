// 파일 위치: app/scanner.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { addDoc, collection, doc, increment, setDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebaseConfig';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const RECIPE_TYPES = ["메인 디쉬 🍛", "디저트 🍰", "음료/칵테일 🍹", "간단한 간식 🍟", "술안주 🍻", "샐러드/다이어트 🥗"];
const RECIPE_TASTES = ["매콤한 🔥", "단짠단짠 🍯🧂", "짭짤한 🧂", "자극적인 속세의 맛 😈", "담백하고 건강한 🌿", "따뜻한 국물 🍲"];
const COMMON_INGREDIENTS = ["감자", "고구마", "양파", "대파", "마늘", "돼지고기", "소고기", "닭고기", "생선", "계란", "두부", "김치", "통조림 햄", "소면", "치즈", "우유"];
const LABEL_CATEGORIES = ["🥬 채소", "🍎 과일", "🥩 육류", "🐟 해산물", "🍞 빵/곡물", "🥛 유제품", "🥫 가공품", "🧂 소스류"];

const windowHeight = Dimensions.get('window').height;

const extractJSON = (rawText) => {
  try {
    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(rawText.substring(start, end + 1));
  } catch (e) { return null; }
};

// 🚨 [이슈 2 해결] 쓸데없는 루프를 버리고, 빠르고 정확한 단일 스위칭으로 개편
const callGeminiAPI = async (systemPrompt, imageParts = []) => {
  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.5-pro'];
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }, ...imageParts] }]
        })
      });

      const data = await response.json();

      if (!response.ok) {
        lastError = new Error(`[${response.status}] ${model}: ${data.error?.message || '통신 에러'}`);
        if (response.status === 404 || response.status === 403) continue; // 권한 없으면 뻗지말고 다음 모델 시도
        throw lastError;
      }

      if (!data.candidates || data.candidates.length === 0) throw new Error("API_EMPTY");

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

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const router = useRouter();
  const params = useLocalSearchParams();

  // 🚨 [신규] 일일 스캔 제한 및 광고 상태
  const DAILY_SCAN_LIMIT = 3;
  const [scansLeft, setScansLeft] = useState(DAILY_SCAN_LIMIT);
  const [adPromptVisible, setAdPromptVisible] = useState(false);
  const [mockAdPlaying, setMockAdPlaying] = useState(false);
  const [adCountdown, setAdCountdown] = useState(3);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [photos, setPhotos] = useState([]); 
  const [appStep, setAppStep] = useState('camera'); 
  const [isAnalyzing, setIsAnalyzing] = useState(false); 
  
  const [isCurating, setIsCurating] = useState(false);
  const [curationThemes, setCurationThemes] = useState(null); 
  const [isGeneratingRecipe, setIsGeneratingRecipe] = useState(false);
  const [recipeResult, setRecipeResult] = useState(null);
  const [currentIngredients, setCurrentIngredients] = useState([]); 
  
  const [manualIngredients, setManualIngredients] = useState([]);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualInputText, setManualInputText] = useState("");

  const [shoppingList, setShoppingList] = useState([]);

  const [showStyleModal, setShowStyleModal] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [isCustomType, setIsCustomType] = useState(false);
  const [customTypeInput, setCustomTypeInput] = useState("");
  const [selectedTaste, setSelectedTaste] = useState("");
  const [isCustomTaste, setIsCustomTaste] = useState(false);
  const [customTasteInput, setCustomTasteInput] = useState("");

  const [isCookingMode, setIsCookingMode] = useState(false);
  const [cookingSteps, setCookingSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [selectedPhotoForTraining, setSelectedPhotoForTraining] = useState(null);
  const [trainingInput, setTrainingInput] = useState("");
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);

  // 🚨 [신규] 희망 요리 스타일 사전 질문 상태
  const [styleModalVisible, setStyleModalVisible] = useState(false);
  const [preferredStyle, setPreferredStyle] = useState("");

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardHeight(0));
    
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // 🚨 [신규] 외부(create-recipe)에서 텍스트 입력으로 넘어왔을 때 처리
  useEffect(() => {
    if (params.manualInput) {
      const inputStr = Array.isArray(params.manualInput) ? params.manualInput[0] : params.manualInput;
      if (inputStr) {
        const newIngredients = inputStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
        
        if (newIngredients.length > 0) { 
          setManualIngredients(prev => [...new Set([...prev, ...newIngredients])]);
          setStyleModalVisible(true);
        }
      }
    }
  }, [params.manualInput]);

  // 🚨 [신규] 일일 스캔 횟수 로드
  useFocusEffect(
    useCallback(() => {
      const loadDailyScans = async () => {
        try {
          const today = new Date().toLocaleDateString();
          const limitDataRaw = await AsyncStorage.getItem('cookdex_daily_scans');
          if (limitDataRaw) {
            const limitData = JSON.parse(limitDataRaw);
            if (limitData.date === today) {
              setScansLeft(limitData.count);
            } else {
              setScansLeft(DAILY_SCAN_LIMIT);
              await AsyncStorage.setItem('cookdex_daily_scans', JSON.stringify({ date: today, count: DAILY_SCAN_LIMIT }));
            }
          } else {
            await AsyncStorage.setItem('cookdex_daily_scans', JSON.stringify({ date: today, count: DAILY_SCAN_LIMIT }));
          }
        } catch (error) {}
      };
      loadDailyScans();
    }, [])
  );

  // 🚨 [신규] 스캔 제한 검사 래퍼
  const checkLimitAndRun = (actionFunc) => {
    if (scansLeft > 0) {
      actionFunc();
    } else {
      setAdPromptVisible(true);
    }
  };

  // 🚨 [신규] 가상 광고 재생 및 충전
  const playMockAd = () => {
    setAdPromptVisible(false);
    setMockAdPlaying(true);
    let timeLeft = 3;
    setAdCountdown(timeLeft);
    
    const timer = setInterval(async () => {
      timeLeft -= 1;
      setAdCountdown(timeLeft);
      if (timeLeft <= 0) {
        clearInterval(timer);
        setMockAdPlaying(false);
        const newCount = scansLeft + 1;
        setScansLeft(newCount);
        await AsyncStorage.setItem('cookdex_daily_scans', JSON.stringify({ date: new Date().toLocaleDateString(), count: newCount }));
        Alert.alert("보상 획득! 🎁", "스캔 횟수가 1회 충전되었습니다! 바로 스캔을 진행해주세요.");
      }
    }, 1000);
  };

  if (!permission) return <View style={styles.container}/>;
  if (!permission.granted) return (<View style={styles.container}><TouchableOpacity style={styles.analyzeButton} onPress={requestPermission}><Text style={styles.buttonText}>카메라 권한 허용</Text></TouchableOpacity></View>);

  const takePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
      const manipResult = await manipulateAsync(photo.uri, [{ resize: { width: 800 } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true });
      setPhotos(prev => [...prev, { ...manipResult, label: "" }]);
    }
  };

  const removePhoto = (index) => setPhotos(prev => prev.filter((_, i) => i !== index));

  const toggleManualIngredient = (ing) => {
    if (manualIngredients.includes(ing)) setManualIngredients(prev => prev.filter(i => i !== ing));
    else setManualIngredients(prev => [...new Set([...prev, ing])]);
    setManualInputText(""); 
  };

  const addCustomManualIngredient = () => {
    const newIng = manualInputText.trim();
    if (newIng && !manualIngredients.includes(newIng)) setManualIngredients(prev => [...new Set([...prev, newIng])]);
    setManualInputText("");
  };

  const filteredManualIngredients = COMMON_INGREDIENTS.filter(i => i.includes(manualInputText) && !manualIngredients.includes(i));

  const handleRecipeGeneration = () => {
    // 🚨 [방어 로직] 식재료 이름(Label) 검증
    if (photos.some(p => !p.label || p.label.trim() === "")) {
      Alert.alert("식재료로 인식되지 못함", "이름이 없는 사진이 있습니다. 사진을 눌러 정확한 식재료 이름을 기입해주세요.");
      return;
    }

    if (photos.length > 0 || manualIngredients.length > 0) {
      setPreferredStyle(""); // 스타일 초기화
      setStyleModalVisible(true); // 모달 띄우기
    } else {
      Alert.alert("알림", "재료를 추가하거나 사진을 찍어주세요.");
    }
  };

  const confirmStyleAndGenerate = (style) => {
    setStyleModalVisible(false);
    if (photos.length > 0) generateFromImage(style);
    else if (manualIngredients.length > 0) generateFromTextOnly(style);
  };

  const generateFromTextOnly = async (customStyleStr = "") => {
    setAppStep('result'); setIsAnalyzing(true); setIsCurating(true); setShowStyleModal(false); setCurationThemes(null); setRecipeResult(null); setShoppingList([]);
    try {
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
      const allIngredients = [...new Set([...currentIngredients, ...manualIngredients])]; 
      const systemPrompt = `너는 최고의 셰프 '쿡덱스'야. 유저가 기입한 [식재료: ${allIngredients.join(', ')}] 만을 사용하여 3가지 요리 테마를 제안해.${userContextPrompt}
      ${customStyleStr ? `[희망 요리 스타일: ${customStyleStr}]` : ''}
      
      ⚠️ 중요: 입력된 재료 중 '먹을 수 없는 것(비식재료, 예: 물티슈, 세제, 가구 등)'이 있다면 반드시 "invalid_items" 배열에 포함시켜.

      오직 아래 JSON 스키마를 100% 준수해서 응답해.
      { "invalid_items": ["식재료가 아닌 것"], "detected_ingredients": ["${allIngredients.join('", "')}"], "curation_themes": [ { "theme_title": "요리 이름", "match_reason": "추천 이유", "badge_icon": "이모지", "ui_accent_color": "#FF8C00" } ] }`;
      
      const parsedData = await callGeminiAPI(systemPrompt);

      if (parsedData.invalid_items && parsedData.invalid_items.length > 0) {
        Alert.alert("🚨 식재료가 아닙니다!", `다음 항목은 요리에 사용할 수 없습니다:\n\n👉 ${parsedData.invalid_items.join(', ')}\n\n식재료만 기입해주세요.`);
        setAppStep('camera'); setIsAnalyzing(false); setIsCurating(false);
        return;
      }

      setCurrentIngredients(parsedData.detected_ingredients || allIngredients);
      setCurationThemes(parsedData.curation_themes.slice(0, 3));
    } catch (error) {
      Alert.alert("🚨 구글 통신 에러", `API 키 문제이거나 서버 오류입니다.\n\n상세: ${error.message}`);
      setAppStep('camera');
    } finally { setIsAnalyzing(false); setIsCurating(false); }
  };

  const generateFromImage = async (customStyleStr = "") => {
    setAppStep('result'); setIsAnalyzing(true); setIsCurating(true); setShowStyleModal(false); setCurationThemes(null); setRecipeResult(null); setShoppingList([]);
    try {
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
      const imageParts = photos.map(photo => ({ inline_data: { mime_type: "image/jpeg", data: photo.base64 } }));
      const systemPrompt = `너는 최고의 셰프 '쿡덱스'야. 사진을 분석하고 유저가 추가한 [수동 재료: ${manualIngredients.join(', ')}]를 합쳐서 3가지 요리 테마를 제안해.${userContextPrompt}
      ${customStyleStr ? `[희망 요리 스타일: ${customStyleStr}]` : ''}
      과일(귤, 사과), 빵, 간식 등 사람이 먹을 수 있는게 하나라도 있으면 무조건 요리로 인정해.
      만약 사진에 식재료가 아예 없다면 "status": "NO_FOOD" 라고 반환해. 식재료가 있다면 "status": "SUCCESS" 로 반환해.
      
      ⚠️ 중요: 사진 속 물체나 입력된 재료 중 '먹을 수 없는 것(비식재료, 예: 물티슈, 그릇, 사람, 스마트폰 등)'이 있다면 반드시 "invalid_items" 배열에 포함시켜.

      오직 아래 JSON 스키마를 100% 준수해라.
      { 
        "status": "SUCCESS 또는 NO_FOOD",
        "invalid_items": ["식재료가 아닌 것"],
        "detected_ingredients": ["인식된 식재료 + 수동 재료"], 
        "curation_themes": [ { "theme_title": "요리 이름", "match_reason": "추천 이유", "badge_icon": "이모지", "ui_accent_color": "#FF8C00" } ] 
      }`;
      
      const parsedData = await callGeminiAPI(systemPrompt, imageParts);

      if (parsedData.status === "NO_FOOD") throw new Error("NO_FOOD_DETECTED");

      if (parsedData.invalid_items && parsedData.invalid_items.length > 0) {
        Alert.alert("🚨 식재료가 아닙니다!", `다음 항목은 요리에 사용할 수 없습니다:\n\n👉 ${parsedData.invalid_items.join(', ')}\n\n식재료를 촬영하거나 기입해주세요.`);
        setAppStep('camera'); setIsCurating(false); setIsAnalyzing(false);
        return;
      }

      // 🚨 [신규] 분석 성공 시 횟수 차감
      if (scansLeft > 0) {
        const newCount = scansLeft - 1;
        setScansLeft(newCount);
        await AsyncStorage.setItem('cookdex_daily_scans', JSON.stringify({ date: new Date().toLocaleDateString(), count: newCount }));
      }

      setCurrentIngredients(parsedData.detected_ingredients || []);
      setCurationThemes(parsedData.curation_themes.slice(0, 3));
      setIsCurating(false); setIsAnalyzing(false);
    } catch (error) { 
      // API Key 문제면 플랜 B 없이 즉시 배출 (결번 에러 방지용)
      if (error.message.includes("429") || error.message.includes("API 키") || error.message.includes("404")) {
        Alert.alert("🚨 구글 API 거절됨", `현재 사용 중인 API 키에 권한이 없거나 한도를 초과했습니다.\n\n원인: ${error.message}`);
        setAppStep('camera'); setIsCurating(false); setIsAnalyzing(false);
        return;
      }

      // 🚨 플랜 B 작동 (안전 필터 등에 걸렸을 때)
      if (manualIngredients.length > 0) {
        const isNoFood = error.message === "NO_FOOD_DETECTED";
        Alert.alert(
          isNoFood ? "⚠️ 식재료가 아닙니다" : "⚠️ 사진 인식 불가 (플랜 B 가동)", 
          isNoFood 
            ? "해당 물건은 식재료가 아니네요! 수동으로 기입하신 식재료로 레시피를 제작할까요?" 
            : "사진 속 물체를 식재료로 파악하기 어렵거나 서버가 혼잡합니다.\n\n기입하신 수동 재료만으로 레시피를 제작할까요?",
          [
            { text: "아니오 (다시 찍기)", style: "cancel", onPress: () => { setAppStep('camera'); setIsCurating(false); setIsAnalyzing(false); } },
            { text: "네! 만들어주세요", onPress: () => { 
                setPhotos([]); 
                generateFromTextOnly(""); 
              } 
            }
          ]
        );
      } else {
        Alert.alert("🤔 식재료 인식 실패!", `조리할 수 없는 물건이거나 분석 에러가 발생했습니다.\n\n상세: ${error.message}`); 
        setAppStep('camera'); setIsCurating(false); setIsAnalyzing(false);
      }
    } 
  };

  const generateFinalRecipe = async (theme) => {
    setIsGeneratingRecipe(true);
    try {
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
      const systemPrompt = `너는 셰프야. 재료(${currentIngredients.join(', ')})를 가지고 [${theme.theme_title}] 레시피를 작성해.${userContextPrompt}\n⚠️ 필수 지시사항: 1인분 기준 총 칼로리(kcal)와 영양성분을 정확히 계산하여 상단에 표기해.
      오직 JSON 형식으로 대답해.
      { 
        "safety_warning": "위생 경고 필요시 작성, 없으면 null", 
        "substitutions": [ { "original": "필요한데 없는 재료", "substitute": "대체재", "reason": "이유" } ], 
        "shopping_list": ["대체불가 필수 마트 구매 재료"], 
        "recipe_markdown": "무조건 첫 줄은 '# ${theme.theme_title}'. 조리 순서는 '1. ', '2. ' 숫자로 시작할 것." 
      }`;
      
      const parsedData = await callGeminiAPI(systemPrompt);

      if (parsedData.safety_warning && parsedData.safety_warning !== "null") Alert.alert("🚨 쿡덱스 위생/안전 경고!", parsedData.safety_warning);
      if (parsedData.shopping_list && Array.isArray(parsedData.shopping_list)) setShoppingList(parsedData.shopping_list);
      else setShoppingList([]);

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
      setRecipeResult(finalMarkdown);
      await AsyncStorage.setItem('cookdex_draft_recipe', JSON.stringify({ ingredients: currentIngredients, recipe: finalMarkdown, shopping: parsedData.shopping_list }));
    } catch (error) { Alert.alert("🚨 레시피 생성 실패", `상세 원인: ${error.message}`); setAppStep('camera'); } finally { setIsGeneratingRecipe(false); }
  };

  const openTrainingModal = (index) => {
    const photo = photos[index];
    setSelectedPhotoForTraining(photo.base64);
    setSelectedPhotoIndex(index);
    setTrainingInput(photo.label || "");
    setShowTrainingModal(true);
  };

  const submitTrainingData = async () => {
    if (!trainingInput.trim()) { Alert.alert("알림", "식재료 이름을 입력해주세요."); return; }
    
    // 1. 로컬 상태 업데이트 (사진 라벨링)
    setPhotos(prev => {
      const newPhotos = [...prev];
      if (selectedPhotoIndex !== null && newPhotos[selectedPhotoIndex]) {
        newPhotos[selectedPhotoIndex] = { ...newPhotos[selectedPhotoIndex], label: trainingInput.trim() };
      }
      return newPhotos;
    });

    // 2. 수동 재료 리스트에도 추가 (AI가 인식할 수 있도록)
    if(!manualIngredients.includes(trainingInput.trim())) {
      setManualIngredients(prev => [...new Set([...prev, trainingInput.trim()])]);
    }

    Alert.alert(
      "🚨 [경고] 데이터 제출 동의", 
      "유저 다수결 검증을 통해 허위/장난 정보(비식재료 등)를 고의로 학습시키려 한 정황이 파악될 경우, 심사 반려, 앱 이용 제한 및 조치를 당할 수 있습니다.\n\n해당 식재료를 제출하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        { text: "동의 및 제출", style: "destructive", onPress: async () => {
            try {
              const currentUser = auth.currentUser;
              if (currentUser) {
                await addDoc(collection(db, "ai_training_data"), { imageUrl: "base64_data_omitted", proposedName: trainingInput, category: "UserLabel", submittedBy: currentUser.uid, status: "pending_votes", voteCount: 1, createdAt: new Date().toISOString() });

                Alert.alert("제출 완료! 🎉", "AI 학습 데이터로 소중하게 쓰입니다. 심사 통과 이후 EXP가 지급됩니다!");
                setShowTrainingModal(false);
              }
            } catch (error) { Alert.alert("에러", "제출에 실패했습니다."); }
        }}
      ]
    );
  };

  const handleRecipeSaveAndShare = async (isSharing) => {
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
          await setDoc(doc(db, "global_recipes", recipeId), { id: recipeId, content: recipeResult, authorId: currentUser.uid, authorName: currentUser.displayName || "익명", createdAt: new Date().toISOString(), likes: 0 });
          Alert.alert("광장에 등록 완료! 🌍✨", `스캔한 레시피를 공유하여 엄청난 보상을 받았습니다! (+${earnedExp} EXP)`);
        } else Alert.alert("내 주방 저장 완료! 🍳", `스캔 레시피가 비밀스럽게 저장되었습니다. (+${earnedExp} EXP)`);
      }
      router.push('/(tabs)/recipes');
    } catch (error) { alert("저장 에러"); }
  };

  const handleExitGuard = () => {
    if (recipeResult || curationThemes) {
      Alert.alert("앗! 잠깐만요 🛑", "아직 레시피를 저장하지 않았어요. 정말 나가시겠습니까?", [
        { text: "취소", style: "cancel" }, { text: "나가기", style: "destructive", onPress: () => { setPhotos([]); setManualIngredients([]); setRecipeResult(null); setCurationThemes(null); setAppStep('camera'); } }
      ]);
    } else { setPhotos([]); setManualIngredients([]); setRecipeResult(null); setCurationThemes(null); setAppStep('camera'); }
  };

  const requestNewStyle = () => {
    let finalType = isCustomType && customTypeInput.trim() !== "" ? customTypeInput : selectedType;
    let finalTaste = isCustomTaste && customTasteInput.trim() !== "" ? customTasteInput : selectedTaste;
    let styleStr = "";
    if (finalType) styleStr += `요리 종류: ${finalType}, `;
    if (finalTaste) styleStr += `맛/분위기: ${finalTaste}`;
    if (!styleStr) { Alert.alert("알림", "원하시는 요리 종류나 맛을 선택해주세요!"); return; }
    
    setShowStyleModal(false);
    generateFromTextOnly(styleStr); 
  };

  const handleShopping = (item) => {
    const coupangSearchUrl = `https://m.coupang.com/nm/search?q=${encodeURIComponent(item)}`;
    Linking.openURL(coupangSearchUrl).catch((err) => console.error('쇼핑몰 연결 실패', err));
  };

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

  if (appStep === 'result') {
    return (
      <View style={styles.resultBg}>
        <View style={styles.resultContainer}>
          
          {isAnalyzing && isCurating && (<View style={styles.loadingBox}><ActivityIndicator size="large" color="#FF8C00" /><Text style={styles.loadingText}>냉장고를 분석 중입니다...</Text></View>)}
          
          {!isAnalyzing && !isCurating && curationThemes && !isGeneratingRecipe && !recipeResult && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{color: '#FFB347', marginBottom: 15, fontWeight: 'bold'}}>✨ 파악된 재료로 만들 수 있는 3가지 요리!</Text>
              {curationThemes.map((theme, index) => (
                <TouchableOpacity key={index} style={[styles.themeCard, {borderColor: theme.ui_accent_color}]} onPress={() => generateFinalRecipe(theme)}>
                  <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 5}}><Text style={{fontSize: 22, marginRight: 8}}>{theme.badge_icon}</Text><Text style={{fontSize: 16, fontWeight: 'bold', color: '#3A2E2B', flex: 1}}>{theme.theme_title}</Text></View>
                  <Text style={{fontSize: 13, color: '#8C7A76', marginTop: 5}}>{theme.match_reason}</Text>
                  <View style={{alignSelf: 'flex-end', marginTop: 10, backgroundColor: theme.ui_accent_color, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10}}><Text style={{color: '#fff', fontSize: 12, fontWeight: 'bold'}}>이 레시피 만들기 →</Text></View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {isGeneratingRecipe && (<View style={styles.loadingBox}><ActivityIndicator size="large" color="#4CAF50" /><Text style={styles.loadingText}>최적의 레시피를 작성 중입니다...</Text></View>)}

          {!isGeneratingRecipe && recipeResult && (
            <ScrollView style={styles.recipeScroll} showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={styles.ttsStartBtn} onPress={startCookingMode}><Text style={styles.ttsStartBtnText}>🔊 화면 안 보고 귀로 듣기 (조리 모드)</Text></TouchableOpacity>
              <Markdown style={markdownStyles}>{recipeResult}</Markdown>
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
              <View style={{height: 20}} />
            </ScrollView>
          )}
        </View>
        
        <View style={styles.previewControlsGrid}>
          {!isGeneratingRecipe && recipeResult && (
            <>
              <TouchableOpacity style={[styles.gridButton, {backgroundColor: '#FF6B6B', flex: 0.8}]} onPress={() => handleRecipeSaveAndShare(false)}><Text style={styles.buttonText}>저장</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.gridButton, {backgroundColor: '#4CAF50', flex: 1.1}]} onPress={() => handleRecipeSaveAndShare(true)}><Text style={styles.buttonText}>광장 공유 🌍</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.gridButton, {backgroundColor: '#8E24AA', flex: 1.4}]} onPress={() => { setIsCustomType(false); setShowStyleModal(true); }}><Text style={styles.buttonText}>레시피 수정 🎲</Text></TouchableOpacity>
            </>
          )}
          {!isAnalyzing && !isCurating && curationThemes && !recipeResult && (
            <TouchableOpacity style={[styles.gridButton, {backgroundColor: '#444', flex: 1}]} onPress={handleExitGuard}><Text style={styles.buttonText}>다시 스캔하기 📸</Text></TouchableOpacity>
          )}
        </View>
        
        <View style={{paddingBottom: 20, alignItems: 'center'}}>
           {!isAnalyzing && !isGeneratingRecipe && recipeResult && (<TouchableOpacity style={[styles.gridButton, {backgroundColor: '#444', width: '90%'}]} onPress={handleExitGuard}><Text style={styles.buttonText}>다시 스캔 📸</Text></TouchableOpacity>)}
        </View>

        <Modal visible={showStyleModal} transparent={true} animationType="fade" onRequestClose={() => setShowStyleModal(false)}>
          <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={[styles.bottomSheetContainer, {height: 'auto', maxHeight: '80%', paddingBottom: 30}]}>
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
          </KeyboardAvoidingView>
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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" ref={cameraRef}>
        
        {/* QA 모드 뱃지 삭제됨 */}

        {/* 🚨 [신규] 남은 횟수 뱃지 */}
        <View style={styles.limitBadge}><Text style={styles.limitBadgeText}>오늘 스캔: {scansLeft}회 남음</Text></View>

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}><Text style={styles.backButtonText}>✕</Text></TouchableOpacity>
        
        <View style={styles.topHUDContainer}>
          {manualIngredients.length > 0 && (
            <View style={styles.addedManualIngredientsBox}>
              <Text style={{color: '#fff', fontSize: 13, fontWeight: 'bold'}}>추가됨: {manualIngredients.join(', ')}</Text>
            </View>
          )}
          {photos.length > 0 && (
            <View>
              <Text style={styles.trainingHintText}>💡 사진을 터치해 AI를 학습시켜주세요!</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailScroll} contentContainerStyle={styles.thumbnailScrollContent}>
                {photos.map((photo, idx) => (
                  <View key={idx}>
                    <TouchableOpacity onPress={() => openTrainingModal(idx)}>
                      <Image source={{ uri: `data:image/jpeg;base64,${photo.base64}` }} style={styles.thumbnailImage} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deletePhotoBtn} onPress={() => removePhoto(idx)}>
                      <Text style={styles.deletePhotoBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={styles.overlay}>
          <View style={styles.bottomMask}>
            <View style={styles.controlsArea}>
                {(photos.length > 0 || manualIngredients.length > 0) && (
                  <View style={styles.scannerActionRow}>
                    <TouchableOpacity style={[styles.analyzeMultiButton, {backgroundColor: '#5A4E49'}]} onPress={() => setShowManualModal(true)}>
                      <Text style={styles.buttonText}>✏️ 재료 추가</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.analyzeMultiButton} onPress={handleRecipeGeneration}>
                      <Text style={styles.buttonText}>✨ AI 레시피</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity style={styles.captureButton} onPress={() => checkLimitAndRun(takePicture)}><View style={styles.captureButtonInner} /></TouchableOpacity>
            </View>
          </View>
        </View>
      </CameraView>

      <Modal visible={showManualModal} transparent={true} animationType="slide" onRequestClose={() => setShowManualModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.bottomSheetContainer, {height: 'auto', maxHeight: '85%', paddingBottom: 30}]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitleText}>✏️ 직접 검색 및 추가</Text>
              <TouchableOpacity onPress={() => setShowManualModal(false)} style={styles.closeButton}><Text style={styles.closeButtonText}>완료 ✕</Text></TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionLabel}>자주 쓰는 재료 빠른 추가</Text>
              <View style={styles.quickTagsContainer}>
                {COMMON_INGREDIENTS.filter(i => !manualIngredients.includes(i)).slice(0, 7).map(ing => (
                  <TouchableOpacity key={ing} style={styles.quickTag} onPress={() => toggleManualIngredient(ing)}>
                    <Text style={styles.quickTagText}>{ing} +</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {manualIngredients.length > 0 && (
                <View style={styles.selectedTagsContainer}>
                  {manualIngredients.map((ing) => (
                    <TouchableOpacity key={ing} style={styles.tagBadgeActive} onPress={() => toggleManualIngredient(ing)}>
                      <Text style={styles.tagTextActive}>{ing} ✕</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={[styles.sectionLabel, {marginTop: 10}]}>직접 검색 및 추가</Text>
              <View style={styles.inlineInputRow}>
                <TextInput 
                  style={styles.inlineTextInput} 
                  placeholder="예: 마늘, 고추장" 
                  placeholderTextColor="#A89F9C"
                  value={manualInputText} 
                  onChangeText={setManualInputText} 
                  onSubmitEditing={addCustomManualIngredient}
                />
                <TouchableOpacity style={styles.inlineAddBtn} onPress={addCustomManualIngredient}>
                  <Text style={styles.inlineAddBtnText}>추가</Text>
                </TouchableOpacity>
              </View>
              
              {manualInputText.length > 0 && (
                <View style={styles.autocompleteContainer}>
                  {filteredManualIngredients.length > 0 ? (
                    filteredManualIngredients.slice(0, 8).map((ing) => (
                      <TouchableOpacity key={ing} style={styles.tagBadge} onPress={() => toggleManualIngredient(ing)}>
                        <Text style={styles.tagText}>{ing} +</Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <TouchableOpacity style={styles.customAddBadge} onPress={addCustomManualIngredient}>
                      <Text style={styles.customAddText}>'{manualInputText}' 직접 추가 ➕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showTrainingModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlayCenter}>
           <TouchableOpacity style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={Keyboard.dismiss}>
             <View style={[styles.trainingModalContent, { maxHeight: windowHeight * 0.85 }]} onStartShouldSetResponder={() => true}>
               <ScrollView 
                 showsVerticalScrollIndicator={false} 
                 keyboardShouldPersistTaps="handled"
                 contentContainerStyle={{ paddingBottom: keyboardHeight + 20 }}
               >
                 <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15}}>
                    <Text style={styles.styleModalTitle}>🧠 AI에게 식재료 가르치기</Text>
                    <TouchableOpacity onPress={() => setShowTrainingModal(false)}><Text style={{fontSize: 20, color: '#A89F9C'}}>✕</Text></TouchableOpacity>
                 </View>

                 <Text style={styles.trainingGuideText}>💡 밝은 곳에서 재료가 잘 보이게 찍힌 사진만 학습에 도움을 줍니다!</Text>
                 
                 {selectedPhotoForTraining && (
                   <Image source={{ uri: `data:image/jpeg;base64,${selectedPhotoForTraining}` }} style={styles.trainingImagePreview} />
                 )}

                 <Text style={styles.styleInputLabel}>식재료 이름 입력</Text>
                 
                 <TextInput 
                   style={styles.customTextInput} 
                   placeholder="정확한 식재료 명칭을 적어주세요" 
                   value={trainingInput} 
                   onChangeText={setTrainingInput} 
                 />

                 <View style={styles.legalWarningBox}>
                   <Text style={styles.legalWarningText}>🚨 고의로 비(非)식재료를 입력하여 AI 학습을 방해할 시, 심사 반려, 앱 이용 제한 및 조치를 당할 수 있습니다.</Text>
                 </View>

                 <TouchableOpacity style={[styles.styleModalSave, {width: '100%', marginTop: 20}]} onPress={submitTrainingData}>
                    <Text style={styles.styleModalBtnTextWhite}>검증 데이터 제출 (심사 후 EXP 지급)</Text>
                 </TouchableOpacity>
               </ScrollView>
             </View>
           </TouchableOpacity>
        </View>
      </Modal>

      {/* 🚨 [신규] 희망 요리 스타일 사전 질문 모달 */}
      <Modal visible={styleModalVisible} transparent={true} animationType="fade" onRequestClose={() => setStyleModalVisible(false)}>
        <View style={styles.modalOverlayCenter}>
            <View style={[styles.bottomSheetContainer, {height: 'auto', maxHeight: '80%', paddingBottom: 30, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderRadius: 20}]}>
                <Text style={styles.styleModalTitle}>✨ 스캔된 재료로 어떤 요리를 원하세요?</Text>
                <Text style={{textAlign: 'center', color: '#8C7A76', marginBottom: 20}}>AI에게 알려주시면 더 마음에 드는 메뉴를 추천해 드려요!</Text>
                
                <TextInput
                    style={styles.customTextInput}
                    placeholder="예: 얼큰한 국물, 간단한 볶음, 다이어트식 등"
                    placeholderTextColor="#A89F9C"
                    value={preferredStyle}
                    onChangeText={setPreferredStyle}
                />
                
                <View style={styles.styleModalButtons}>
                    <TouchableOpacity style={styles.styleModalCancel} onPress={() => confirmStyleAndGenerate("")}>
                        <Text style={styles.styleModalBtnText}>건너뛰고 추천받기</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.styleModalSave} onPress={() => confirmStyleAndGenerate(preferredStyle)}>
                        <Text style={styles.styleModalBtnTextWhite}>이 스타일로 요리하기</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
      </Modal>

      {/* 횟수 소진 팝업 */}
      <Modal visible={adPromptVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.adModalContent}>
            <Text style={styles.adTitle}>스캔 횟수 소진 🥲</Text>
            <Text style={styles.adSub}>오늘의 무료 스캔 횟수를 모두 사용하셨습니다.</Text>
            <TouchableOpacity style={styles.watchAdBtn} onPress={playMockAd}>
              <Text style={styles.watchAdBtnText}>🎁 30초 광고 보고 1회 충전하기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeAdBtn} onPress={() => setAdPromptVisible(false)}>
              <Text style={styles.closeAdBtnText}>나중에 할게요</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 가상 광고 재생화면 (전체화면) */}
      <Modal visible={mockAdPlaying} transparent={false} animationType="slide">
        <View style={styles.mockAdContainer}>
          <Text style={styles.mockAdTitle}>📺 스폰서 광고 재생 중...</Text>
          <Text style={styles.mockAdTimer}>{adCountdown}초 후 보상이 지급됩니다</Text>
          <ActivityIndicator size="large" color="#FF8C00" style={{marginTop: 30}} />
        </View>
      </Modal>

    </View>
  );
}

const markdownStyles = StyleSheet.create({ body: { color: '#F9F5F3', fontSize: 15, lineHeight: 24 }, heading1: { color: '#FFB347', fontSize: 22, fontWeight: 'bold' }, blockquote: { backgroundColor: '#4A3F3A', borderLeftWidth: 4, borderLeftColor: '#FFB347', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5, marginVertical: 10 } });

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2A2421' },
  camera: { flex: 1 },
  limitBadge: { position: 'absolute', top: 50, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, zIndex: 10 },
  limitBadgeText: { color: '#FF8C00', fontWeight: 'bold', fontSize: 13 },
  backButton: { position: 'absolute', top: 50, left: 20, backgroundColor: 'rgba(0,0,0,0.5)', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  backButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  topHUDContainer: { position: 'absolute', top: 100, left: 20, right: 20, zIndex: 5 },
  addedManualIngredientsBox: { backgroundColor: 'rgba(255, 140, 0, 0.9)', padding: 10, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 10 },
  trainingHintText: { color: '#FFFDF9', fontSize: 13, fontWeight: 'bold', marginBottom: 10, textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },
  thumbnailScroll: { maxHeight: 80 },
  thumbnailScrollContent: { gap: 10 },
  thumbnailImage: { width: 60, height: 60, borderRadius: 10, borderWidth: 2, borderColor: '#FF8C00' },
  deletePhotoBtn: { position: 'absolute', top: -5, right: -5, backgroundColor: 'red', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  deletePhotoBtnText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  bottomMask: { backgroundColor: 'rgba(42, 36, 33, 0.8)', paddingBottom: 40, paddingTop: 20, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  controlsArea: { alignItems: 'center', gap: 20 },
  scannerActionRow: { flexDirection: 'row', gap: 15, marginBottom: 10 },
  analyzeMultiButton: { backgroundColor: '#FF8C00', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 20 },
  buttonText: { color: '#FFFDF9', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  captureButton: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#A89F9C', justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#FFFDF9' },
  captureButtonInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFFDF9' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  bottomSheetContainer: { backgroundColor: '#2A2421', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  dragHandle: { width: 40, height: 5, backgroundColor: '#4A3F3A', borderRadius: 3, alignSelf: 'center', marginBottom: 15 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitleText: { color: '#FF8C00', fontSize: 18, fontWeight: 'bold' },
  closeButton: { padding: 5 },
  closeButtonText: { color: '#A89F9C', fontSize: 14, fontWeight: 'bold' },
  sectionLabel: { color: '#A89F9C', fontSize: 13, fontWeight: 'bold', marginBottom: 10 },
  quickTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  quickTag: { backgroundColor: '#3A322F', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: '#4A3F3A' },
  quickTagText: { color: '#FFFDF9', fontSize: 13 },
  selectedTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20, padding: 15, backgroundColor: '#3A322F', borderRadius: 12 },
  tagBadgeActive: { backgroundColor: '#FF8C00', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15 },
  tagTextActive: { color: '#000', fontSize: 13, fontWeight: 'bold' },
  inlineInputRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  inlineTextInput: { flex: 1, backgroundColor: '#3A322F', color: '#FFFDF9', borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12, borderWidth: 1, borderColor: '#4A3F3A' },
  inlineAddBtn: { backgroundColor: '#5A4E49', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 12 },
  inlineAddBtnText: { color: '#FFFDF9', fontWeight: 'bold' },
  autocompleteContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagBadge: { backgroundColor: '#4A3F3A', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 15 },
  tagText: { color: '#FFFDF9', fontSize: 13 },
  customAddBadge: { backgroundColor: '#5A4E49', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 15 },
  customAddText: { color: '#FFB347', fontSize: 13, fontWeight: 'bold' },
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  trainingModalContent: { backgroundColor: '#2A2421', borderRadius: 20, padding: 20, width: '100%', borderWidth: 1, borderColor: '#FF8C00' },
  styleModalTitle: { color: '#FFFDF9', fontSize: 20, fontWeight: '900', marginBottom: 15 },
  trainingGuideText: { color: '#A89F9C', fontSize: 13, marginBottom: 15 },
  trainingImagePreview: { width: '100%', height: 200, borderRadius: 15, marginBottom: 15, resizeMode: 'cover' },
  styleInputLabel: { color: '#FFB347', fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
  customTextInput: { backgroundColor: '#3A322F', color: '#FFFDF9', borderRadius: 12, padding: 15, borderWidth: 1, borderColor: '#4A3F3A', marginBottom: 15 },
  legalWarningBox: { backgroundColor: '#4A3F3A', padding: 15, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: '#E53935' },
  legalWarningText: { color: '#FFFDF9', fontSize: 12, lineHeight: 18 },
  styleModalSave: { backgroundColor: '#FF8C00', paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  styleModalBtnTextWhite: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  styleModalButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  styleModalCancel: { flex: 1, backgroundColor: '#4A3F3A', paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  styleModalBtnText: { color: '#FFFDF9', fontSize: 15, fontWeight: 'bold' },
  adModalContent: { backgroundColor: '#2A2421', borderRadius: 24, padding: 25, alignItems: 'center', borderWidth: 1, borderColor: '#4A3F3A' },
  adTitle: { color: '#FF8C00', fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  adSub: { color: '#FFFDF9', fontSize: 14, textAlign: 'center', marginBottom: 25 },
  watchAdBtn: { backgroundColor: '#FF8C00', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 10 },
  watchAdBtnText: { color: '#000', fontSize: 15, fontWeight: 'bold' },
  closeAdBtn: { paddingVertical: 15 },
  closeAdBtnText: { color: '#A89F9C', fontSize: 14, fontWeight: 'bold' },
  mockAdContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  mockAdTitle: { color: '#FFFDF9', fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  mockAdTimer: { color: '#FF8C00', fontSize: 40, fontWeight: '900' },
  resultBg: { flex: 1, backgroundColor: '#2A2421' },
  resultContainer: { flex: 1, padding: 20, paddingTop: 50 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#FF8C00', marginTop: 15, fontSize: 16, fontWeight: 'bold' },
  themeCard: { backgroundColor: '#3A322F', padding: 15, borderRadius: 15, marginBottom: 15, borderWidth: 1 },
  recipeScroll: { flex: 1 },
  ttsStartBtn: { backgroundColor: '#3A322F', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#5A4E49' },
  ttsStartBtnText: { color: '#FFFDF9', fontSize: 14, fontWeight: 'bold' },
  commerceSection: { marginTop: 30, backgroundColor: '#3A322F', padding: 15, borderRadius: 15, borderWidth: 1, borderColor: '#4A3F3A' },
  commerceTitle: { color: '#FFFDF9', fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
  commerceBtn: { backgroundColor: '#5A4E49', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 10 },
  commerceBtnText: { color: '#FFFDF9', fontSize: 13, fontWeight: 'bold' },
  previewControlsGrid: { flexDirection: 'row', gap: 10, padding: 20, paddingBottom: 10 },
  gridButton: { paddingVertical: 15, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  styleTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 },
  styleTag: { backgroundColor: '#3A322F', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: '#4A3F3A' },
  styleTagActive: { backgroundColor: '#FF8C00', borderColor: '#FF8C00' },
  styleTagText: { color: '#FFFDF9', fontSize: 14, fontWeight: 'bold' },
  styleTagTextActive: { color: '#000', fontSize: 14, fontWeight: 'bold' },
  ttsContainer: { flex: 1, backgroundColor: '#2A2421', padding: 20, paddingTop: 60 },
  ttsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 },
  ttsStepIndicator: { color: '#FF8C00', fontSize: 18, fontWeight: 'bold' },
  ttsCloseBtn: { backgroundColor: '#4A3F3A', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 15 },
  ttsCloseBtnText: { color: '#FFFDF9', fontWeight: 'bold' },
  ttsBody: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  ttsBigText: { color: '#FFFDF9', fontSize: 28, fontWeight: 'bold', textAlign: 'center', lineHeight: 40 },
  ttsControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 40 },
  ttsBtn: { backgroundColor: '#4A3F3A', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 15 },
  ttsBtnMain: { backgroundColor: '#FF8C00', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 15 },
  ttsBtnMainText: { color: '#000', fontSize: 16, fontWeight: 'bold' }
});
