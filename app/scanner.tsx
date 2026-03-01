// 파일 위치: app/scanner.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { addDoc, collection, doc, increment, setDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { auth, db } from '../firebaseConfig';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "AIzaSyBIjimRGdi7uNlx3xh7WgeDgAhdY5wO-EQ";
const RECIPE_TYPES = ["메인 디쉬 🍛", "디저트 🍰", "음료/칵테일 🍹", "간단한 간식 🍟", "술안주 🍻", "샐러드/다이어트 🥗"];
const RECIPE_TASTES = ["매콤한 🔥", "단짠단짠 🍯🧂", "짭짤한 🧂", "자극적인 속세의 맛 😈", "담백하고 건강한 🌿", "따뜻한 국물 🍲"];
const COMMON_INGREDIENTS = ["감자", "고구마", "양파", "대파", "마늘", "돼지고기", "소고기", "닭고기", "생선", "계란", "두부", "김치", "스팸", "소면", "치즈", "우유"];
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

// 🚨 구형 모델 돌려막기 완전 폐기. 오직 1.5 라인업 2개만 타격!
const callGeminiAPI = async (systemPrompt, imageParts = []) => {
  const modelsToTry = ['gemini-1.5-flash', 'gemini-1.5-pro'];
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
        continue; // 404나 403이 나면 앱을 죽이지 않고 다음 1.5-pro 로 조용히 우회
      }

      if (!data.candidates || data.candidates.length === 0) throw new Error("API_EMPTY");

      const rawText = data.candidates[0].content.parts[0].text;
      const extracted = extractJSON(rawText);
      if (extracted) return extracted;
      
      return JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, ''));
    } catch (error) {
      lastError = error;
      continue;
    }
  }
  throw lastError; // flash와 pro 둘 다 막혔을 때만 에러 표출
};

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const router = useRouter();

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
  const [aiCandidates, setAiCandidates] = useState([]);
  const [isFetchingCandidates, setIsFetchingCandidates] = useState(false);
  const [trainingInput, setTrainingInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardHeight(0));
    
    // 일일 스캔 횟수 차감 처리 (QA 모드면 안 깎임)
    const deductScanCount = async () => {
      try {
        const limitStr = await AsyncStorage.getItem('cookdex_daily_scans');
        if (limitStr !== '-9999') {
          const current = limitStr ? parseInt(limitStr) : 0;
          await AsyncStorage.setItem('cookdex_daily_scans', (current + 1).toString());
        }
      } catch(e) {}
    };
    deductScanCount();

    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  if (!permission) return <View />;
  if (!permission.granted) return (<View style={styles.container}><TouchableOpacity style={styles.analyzeButton} onPress={requestPermission}><Text style={styles.buttonText}>권한 허용</Text></TouchableOpacity></View>);

  const takePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
      const manipResult = await manipulateAsync(photo.uri, [{ resize: { width: 800 } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true });
      setPhotos(prev => [...prev, manipResult]);
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
    if (photos.length > 0) generateFromImage();
    else if (manualIngredients.length > 0) generateFromTextOnly("");
    else Alert.alert("알림", "재료를 추가하거나 사진을 찍어주세요.");
  };

  const generateFromTextOnly = async (customStyleStr = "", forcedIngredients = null) => {
    setAppStep('result'); setIsAnalyzing(true); setIsCurating(true); setShowStyleModal(false); setCurationThemes(null); setRecipeResult(null); setShoppingList([]);
    try {
      const targetIngredients = forcedIngredients || manualIngredients;
      const allIngredients = [...new Set([...currentIngredients, ...targetIngredients])]; 
      const systemPrompt = `너는 최고의 셰프 '쿡덱스'야. 유저가 기입한 [식재료: ${allIngredients.join(', ')}] 만을 사용하여 3가지 요리 테마를 제안해.
      ${customStyleStr ? `[목표 스타일]: ${customStyleStr}` : ''}
      오직 아래 JSON 스키마를 100% 준수해서 응답해.
      { "detected_ingredients": ["${allIngredients.join('", "')}"], "curation_themes": [ { "theme_title": "요리 이름", "match_reason": "추천 이유", "badge_icon": "이모지", "ui_accent_color": "#FF8C00" } ] }`;
      
      const parsedData = await callGeminiAPI(systemPrompt);
      setCurrentIngredients(parsedData.detected_ingredients || allIngredients);
      setCurationThemes(parsedData.curation_themes.slice(0, 3));
    } catch (error) {
      Alert.alert("🚨 구글 통신 에러", `API 권한 문제이거나 서버 오류입니다.\n\n상세: ${error.message}`);
      setAppStep('camera');
    } finally { setIsAnalyzing(false); setIsCurating(false); }
  };

  const generateFromImage = async () => {
    setAppStep('result'); setIsAnalyzing(true); setIsCurating(true); setShowStyleModal(false); setCurationThemes(null); setRecipeResult(null); setShoppingList([]);
    try {
      const imageParts = photos.map(photo => ({ inline_data: { mime_type: "image/jpeg", data: photo.base64 } }));
      const systemPrompt = `너는 최고의 셰프 '쿡덱스'야. 사진을 분석하고 유저가 추가한 [수동 재료: ${manualIngredients.join(', ')}]를 합쳐서 3가지 요리 테마를 제안해.
      과일(귤, 사과), 빵, 간식 등 사람이 먹을 수 있는게 하나라도 있으면 무조건 요리로 인정해.
      만약 사진에 식재료가 아예 없다면 "status": "NO_FOOD" 라고 반환해. 식재료가 있다면 "status": "SUCCESS" 로 반환해.
      오직 아래 JSON 스키마를 100% 준수해라.
      { 
        "status": "SUCCESS 또는 NO_FOOD",
        "detected_ingredients": ["인식된 식재료 + 수동 재료"], 
        "curation_themes": [ { "theme_title": "요리 이름", "match_reason": "추천 이유", "badge_icon": "이모지", "ui_accent_color": "#FF8C00" } ] 
      }`;
      
      const parsedData = await callGeminiAPI(systemPrompt, imageParts);

      if (parsedData.status === "NO_FOOD") throw new Error("NO_FOOD_DETECTED");

      setCurrentIngredients(parsedData.detected_ingredients || []);
      setCurationThemes(parsedData.curation_themes.slice(0, 3));
      setIsCurating(false); setIsAnalyzing(false);
    } catch (error) { 
      if (error.message.includes("429") || error.message.includes("API 키")) {
        Alert.alert("🚨 통신 거절됨", `구글 서버에서 요청을 거절했습니다.\n\n원인: ${error.message}`);
        setAppStep('camera'); setIsCurating(false); setIsAnalyzing(false);
        return;
      }

      // 🚨 플랜 B 작동
      if (manualIngredients.length > 0) {
        Alert.alert(
          "⚠️ 사진 인식 불가 (플랜 B 가동)", 
          "사진 속 물체를 식재료로 파악하기 어렵거나 서버가 혼잡합니다.\n\n기입하신 수동 재료만으로 레시피를 제작할까요?",
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
      const systemPrompt = `너는 셰프야. 재료(${currentIngredients.join(', ')})를 가지고 [${theme.theme_title}] 레시피를 작성해.
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

  const openTrainingModal = async (photoBase64) => {
    setSelectedPhotoForTraining(photoBase64); setShowTrainingModal(true); setTrainingInput(""); setSelectedCategory(""); setAiCandidates([]); setIsFetchingCandidates(true);
    try {
      const systemPrompt = `사진 속 물체가 어떤 식재료인지 분석해서, 가장 가능성 높은 3가지 이름을 문자열 배열로만 응답해. 예시: ["애호박", "오이", "가지"]. 식재료가 아니라면 빈 배열 [] 을 반환해.`;
      const parsedData = await callGeminiAPI(systemPrompt, [{ inline_data: { mime_type: "image/jpeg", data: photoBase64 } }]);
      setAiCandidates(parsedData);
    } catch (error) { setAiCandidates([]); } finally { setIsFetchingCandidates(false); }
  };

  const submitTrainingData = async () => {
    if (!selectedCategory || !trainingInput) { Alert.alert("알림", "카테고리와 식재료 이름을 모두 입력해주세요."); return; }
    Alert.alert(
      "🚨 [경고] 데이터 제출 동의", 
      "유저 다수결 검증을 통해 허위/장난 정보(비식재료 등)를 고의로 학습시키려 한 정황이 파악될 경우, 심사 반려, 앱 이용 제한 및 조치를 당할 수 있습니다.\n\n해당 식재료를 제출하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        { text: "동의 및 제출", style: "destructive", onPress: async () => {
            try {
              const currentUser = auth.currentUser;
              if (currentUser) {
                await addDoc(collection(db, "ai_training_data"), { imageUrl: "base64_data_omitted", proposedName: trainingInput, category: selectedCategory, submittedBy: currentUser.uid, status: "pending_votes", voteCount: 1, createdAt: new Date().toISOString() });
                
                if(!manualIngredients.includes(trainingInput)) {
                  setManualIngredients(prev => [...new Set([...prev, trainingInput])]);
                }

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
    Linking.openURL(coupangSearchUrl).catch((err) => console.error('쿠팡 연결 실패', err));
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
                      <TouchableOpacity key={idx} style={styles.commerceBtn} onPress={() => handleShopping(item)}><Text style={styles.commerceBtnText}>{item} 로켓검색 🚀</Text></TouchableOpacity>
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
                    <TouchableOpacity onPress={() => openTrainingModal(photo.base64)}>
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
                <TouchableOpacity style={styles.captureButton} onPress={takePicture}><View style={styles.captureButtonInner} /></TouchableOpacity>
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

                 <Text style={styles.styleInputLabel}>1. 대분류를 선택해주세요 (필수)</Text>
                 <View style={styles.styleTagsContainer}>
                    {LABEL_CATEGORIES.map(cat => (
                      <TouchableOpacity key={cat} style={[styles.styleTag, selectedCategory === cat && styles.styleTagActive]} onPress={() => setSelectedCategory(cat)}>
                        <Text style={[styles.styleTagText, selectedCategory === cat && styles.styleTagTextActive]}>{cat}</Text>
                      </TouchableOpacity>
                    ))}
                 </View>

                 <Text style={[styles.styleInputLabel, {marginTop: 20}]}>2. 식재료 이름 (AI 소프트 매칭)</Text>
                 {isFetchingCandidates ? (
                   <ActivityIndicator size="small" color="#FF8C00" style={{marginVertical: 10}} />
                 ) : (
                   <View style={[styles.styleTagsContainer, {marginBottom: 10}]}>
                     {aiCandidates.length > 0 ? aiCandidates.map((cand, idx) => (
                        <TouchableOpacity key={idx} style={styles.quickTag} onPress={() => setTrainingInput(cand)}>
                          <Text style={styles.quickTagText}>이거 혹시 '{cand}' 인가요?</Text>
                        </TouchableOpacity>
                     )) : <Text style={{fontSize: 12, color: '#8C7A76'}}>AI가 추측하지 못했습니다. 직접 적어주세요.</Text>}
                   </View>
                 )}
                 
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

    </View>
  );
}

const markdownStyles = StyleSheet.create({ body: { color: '#F9F5F3', fontSize: 15, lineHeight: 24 }, heading1: { color: '#FFB347', fontSize: 22, fontWeight: 'bold' }, blockquote: { backgroundColor: '#4A3F3A', borderLeftWidth: 4, borderLeftColor: '#FFB347', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5, marginVertical: 10 } });

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' }, camera: { flex: 1 }, overlay: { flex: 1, backgroundColor: 'transparent' }, 
  bottomMask: { flex: 1, backgroundColor: 'transparent', width: '100%', justifyContent: 'flex-end' },
  
  backButton: { position: 'absolute', top: 45, right: 20, zIndex: 30, padding: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20 }, backButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  
  topHUDContainer: { position: 'absolute', top: 90, left: 0, right: 0, zIndex: 10, paddingLeft: 20 },
  addedManualIngredientsBox: { backgroundColor: 'rgba(0,0,0,0.7)', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 12, marginBottom: 10, alignSelf: 'flex-start' },
  
  trainingHintText: { color: '#FFB347', fontSize: 12, fontWeight: '900', marginBottom: 5, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width:1, height:1}, textShadowRadius: 2 },
  thumbnailScroll: { maxHeight: 85, paddingTop: 5 }, 
  thumbnailScrollContent: { gap: 10, paddingRight: 20 },
  thumbnailImage: { width: 65, height: 65, borderRadius: 10, borderWidth: 2, borderColor: '#FF8C00' },
  deletePhotoBtn: { position: 'absolute', top: 0, right: 0, backgroundColor: '#FF6B6B', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', zIndex: 10, borderWidth: 1, borderColor: '#fff' },
  deletePhotoBtnText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  controlsArea: { height: 190, width: '100%', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 60 }, 
  scannerActionRow: { flexDirection: 'row', gap: 15, marginBottom: 20 },
  analyzeMultiButton: { backgroundColor: '#FF8C00', paddingVertical: 15, paddingHorizontal: 25, borderRadius: 30, shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 }, 
  captureButton: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255, 255, 255, 0.3)', justifyContent: 'center', alignItems: 'center' }, captureButtonInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },

  themeCard: { backgroundColor: '#3A322F', borderRadius: 16, padding: 20, marginBottom: 15, borderWidth: 1, shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.2, shadowRadius: 6, elevation: 2 },

  resultBg: { flex: 1, backgroundColor: '#2A2421' }, resultContainer: { flex: 1, backgroundColor: '#3A322F', marginHorizontal: 12, marginTop: 40, borderRadius: 15, padding: 15 }, loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' }, loadingText: { color: '#FFB347', marginTop: 15, fontWeight: 'bold' }, recipeScroll: { flex: 1 },
  previewControlsGrid: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: 10, paddingTop: 15, paddingHorizontal: 15 }, gridButton: { paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(58, 46, 43, 0.6)', justifyContent: 'flex-end' }, bottomSheetContainer: { height: '88%', backgroundColor: '#FFFDF9', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingBottom: 20 }, bottomSheetContainerWrapper: { width: '100%', justifyContent: 'flex-end' }, dragHandle: { width: 50, height: 5, backgroundColor: '#E8D5D0', borderRadius: 3, alignSelf: 'center', marginTop: 12, marginBottom: 15 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#E8D5D0', marginBottom: 15 }, modalTitleText: { fontSize: 18, color: '#3A2E2B', fontWeight: '900' }, closeButton: { backgroundColor: '#F5EBE7', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20 }, closeButtonText: { color: '#3A2E2B', fontSize: 14, fontWeight: 'bold' },
  
  styleModalTitle: { color: '#8E24AA', fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' }, styleInputLabel: { color: '#3A2E2B', fontSize: 14, fontWeight: 'bold', marginBottom: 8, marginTop: 10 }, styleTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 }, 
  styleTag: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#F9F5F3', borderRadius: 20, borderWidth: 1, borderColor: '#E8D5D0', flexShrink: 0 }, 
  styleTagActive: { backgroundColor: '#8E24AA', borderColor: '#AB47BC' }, styleTagText: { color: '#8C7A76', fontSize: 13, fontWeight: 'bold' }, styleTagTextActive: { color: '#fff', fontSize: 13, fontWeight: 'bold' }, customTextInput: { backgroundColor: '#F9F5F3', color: '#3A2E2B', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 10, fontSize: 14, borderWidth: 1, borderColor: '#E8D5D0', marginTop: 10 }, styleModalButtons: { flexDirection: 'row', justifyContent: 'center', gap: 15, width: '100%', marginTop: 25 }, styleModalCancel: { backgroundColor: '#F5EBE7', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flex: 1 }, styleModalSave: { backgroundColor: '#8E24AA', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flex: 1.5 }, styleModalBtnText: { color: '#8C7A76', fontWeight: 'bold', fontSize: 15, textAlign: 'center' }, styleModalBtnTextWhite: { color: '#fff', fontWeight: 'bold', fontSize: 15, textAlign: 'center' },
  
  sectionLabel: { fontSize: 13, fontWeight: 'bold', color: '#FF8C00', marginBottom: 8 }, quickTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 15 }, quickTag: { backgroundColor: '#FFF3E0', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: '#FFCC80' }, quickTagText: { color: '#E65100', fontSize: 12, fontWeight: 'bold' }, selectedTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12, marginTop: 5 }, autocompleteContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15, padding: 10, backgroundColor: '#F9F5F3', borderRadius: 10 }, tagBadge: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#E8D5D0' }, tagBadgeActive: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#FF8C00', borderRadius: 20, borderWidth: 1, borderColor: '#FF8C00' }, tagText: { color: '#8C7A76', fontSize: 13, fontWeight: 'bold' }, tagTextActive: { color: '#fff', fontSize: 13, fontWeight: 'bold' }, customAddBadge: { paddingVertical: 10, paddingHorizontal: 15, backgroundColor: '#FFF3E0', borderRadius: 10, borderWidth: 1, borderColor: '#FFB74D', width: '100%', alignItems: 'center' }, customAddText: { color: '#E65100', fontSize: 14, fontWeight: 'bold' },
  
  inlineInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }, inlineTextInput: { flex: 1, backgroundColor: '#F9F5F3', color: '#3A2E2B', paddingHorizontal: 15, paddingVertical: 14, borderRadius: 12, fontSize: 14, borderWidth: 1, borderColor: '#E8D5D0' }, inlineAddBtn: { backgroundColor: '#4CAF50', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, inlineAddBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  commerceSection: { marginTop: 20, paddingVertical: 15, borderTopWidth: 1, borderTopColor: '#4A3F3A' }, commerceTitle: { fontSize: 15, fontWeight: '900', color: '#FFB347', marginBottom: 12 }, commerceBtn: { backgroundColor: '#F9F5F3', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: '#FFB347' }, commerceBtnText: { color: '#2A2421', fontSize: 13, fontWeight: 'bold' },

  ttsStartBtn: { backgroundColor: '#E3F2FD', paddingVertical: 15, borderRadius: 15, alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#CE93D8' }, ttsStartBtnText: { color: '#8E24AA', fontSize: 15, fontWeight: '900' }, ttsContainer: { flex: 1, backgroundColor: '#2A2421', padding: 20, justifyContent: 'space-between' }, ttsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }, ttsStepIndicator: { color: '#FFB347', fontSize: 18, fontWeight: 'bold' }, ttsCloseBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20 }, ttsCloseBtnText: { color: '#fff', fontWeight: 'bold' }, ttsBody: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 }, ttsBigText: { color: '#FFFDF9', fontSize: 32, fontWeight: '900', textAlign: 'center', lineHeight: 45 }, ttsControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }, ttsBtn: { backgroundColor: '#4A3F3A', paddingVertical: 20, flex: 1, borderRadius: 20, alignItems: 'center', marginHorizontal: 5 }, ttsBtnText: { color: '#FFFDF9', fontSize: 16, fontWeight: 'bold' }, ttsBtnMain: { backgroundColor: '#FF8C00', paddingVertical: 25, flex: 1.5, borderRadius: 25, alignItems: 'center', marginHorizontal: 5, shadowColor: '#FF8C00', shadowOpacity: 0.5, shadowRadius: 10, elevation: 5 }, ttsBtnMainText: { color: '#fff', fontSize: 18, fontWeight: '900' },

  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  trainingModalContent: { width: '100%', maxHeight: windowHeight * 0.85, backgroundColor: '#FFFDF9', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: {width:0, height:10}, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  trainingGuideText: { fontSize: 13, color: '#4CAF50', fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  trainingImagePreview: { width: 100, height: 100, borderRadius: 10, alignSelf: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#E8D5D0' },
  legalWarningBox: { marginTop: 15, backgroundColor: '#FFEBEE', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#FFCDD2' },
  legalWarningText: { color: '#C62828', fontSize: 11, fontWeight: 'bold', textAlign: 'center', lineHeight: 16 }
});