import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, Button, Image, ActivityIndicator, ScrollView, Share, FlatList, Alert } from 'react-native';
import { useCameraPermissions, CameraView } from 'expo-camera';
import { useState, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage'; 

// 🚨 대표님의 마스터키!
const GEMINI_API_KEY = 'AIzaSyBIjimRGdi7uNlx3xh7WgeDgAhdY5wO-EQ';

const MONSTER_INGREDIENTS = [
  "매운 배달 떡볶이 국물", "식은 배달 피자", "남은 치킨 조각", "반쯤 남은 햄 통조림",
  "자투리 양파", "시들어가는 대파", "유통기한 임박 우유", "딱딱해진 식빵",
  "애매하게 남은 짜장 소스", "반 모 남은 두부"
]

export default function Index() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [aiRecipe, setAiRecipe] = useState(null);
  const [selectedIngredients, setSelectedIngredients] = useState([]);
  
  const [dexList, setDexList] = useState([]);
  const [selectedDexRecipe, setSelectedDexRecipe] = useState(null);
  const cameraRef = useRef(null);

  useEffect(() => { loadDex(); }, []);

  const loadDex = async () => {
    try {
      const stored = await AsyncStorage.getItem('@cook_dex_saved');
      if (stored) setDexList(JSON.parse(stored));
    } catch (e) { console.error("도감 불러오기 실패", e); }
  };

  const saveToDex = async () => {
    try {
      const newRecipe = {
        id: Date.now().toString(),
        date: new Date().toLocaleDateString(),
        recipe: aiRecipe,
      };
      const updatedList = [newRecipe, ...dexList];
      await AsyncStorage.setItem('@cook_dex_saved', JSON.stringify(updatedList));
      setDexList(updatedList);
      alert("💾 쿡덱스 도감에 영구 저장되었습니다!");
      resetApp();
    } catch (e) { alert("저장에 실패했습니다."); }
  };

  const deleteFromDex = async (id) => {
    Alert.alert(
      "레시피 삭제",
      "이 꿀조합 레시피를 도감에서 영구 삭제하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        { 
          text: "삭제", 
          style: "destructive",
          onPress: async () => {
            const updatedList = dexList.filter(item => item.id !== id);
            await AsyncStorage.setItem('@cook_dex_saved', JSON.stringify(updatedList));
            setDexList(updatedList);
            setSelectedDexRecipe(null); 
          }
        }
      ]
    );
  };

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitle}>📸 권한이 필요합니다.</Text>
        <Button onPress={requestPermission} title="권한 허용하기" color="#FF7F50" />
      </View>
    );
  }

  const toggleIngredient = (ingredient) => {
    if (selectedIngredients.includes(ingredient)) {
      setSelectedIngredients(selectedIngredients.filter(item => item !== ingredient));
    } else {
      setSelectedIngredients([...selectedIngredients, ingredient]);
    }
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.2 });
      setCapturedPhoto(photo);
      setIsCameraActive(false);
    }
  };

  const analyzeIngredientsWithAI = async () => {
    if (!capturedPhoto && selectedIngredients.length === 0) { alert("스캔을 하거나 재료를 선택해주세요!"); return; }
    setIsLoading(true);
    let aiPrompt = `너는 'Cook-Dex' 앱의 요리 비서야. 1인 가구를 위한 자극적이고 맛있는 레시피를 1개 제안해 줘. 단, 특정 기업의 브랜드명이나 제품명(예: 스팸, 불닭, 엽기떡볶이)이 보이더라도 절대 상표명을 그대로 쓰지 말고 무조건 '통조림 햄', '매운 라면', '배달 떡볶이 국물' 같은 일반 명사로 바꿔서 설명해. 또한, 날고기나 유제품이 포함된다면 반드시 요리법 맨 앞에 '[위생 경고] 섭취 전 부패 여부를 꼭 확인하세요!'라는 문구를 넣어줘.`;
    if (selectedIngredients.length > 0) aiPrompt += `\n\n[선택한 재료]: ${selectedIngredients.join(', ')}`;
    if (capturedPhoto) aiPrompt += `\n\n그리고 첨부된 사진 속 재료도 함께 분석해줘.`;

    const apiParts = [{ text: aiPrompt }];
    if (capturedPhoto) apiParts.push({ inlineData: { mimeType: "image/jpeg", data: capturedPhoto.base64 } });

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: apiParts }] })
      });
      const result = await response.json();
      if (result.error) { alert(`API 에러: ${result.error.message}`); setIsLoading(false); return; }
      setAiRecipe(result.candidates[0].content.parts[0].text);
    } catch (error) { alert("통신 실패"); } finally { setIsLoading(false); }
  };

  const shareRecipe = async (textToShare) => {
    try { await Share.share({ message: `🔥 쿡덱스 생존 미션 🔥\n\n${textToShare}\n\n#CookDex #냉장고파먹기` }); } catch (error) {}
  };

  const resetApp = () => { setCapturedPhoto(null); setAiRecipe(null); setSelectedIngredients([]); };

  // 📖 5. 내 요리 도감 상세 열람 화면 (좌측 상단 휴지통, 우측 상단 닫기 대칭 UI)
  if (selectedDexRecipe) {
    return (
      <View style={styles.container}>
        {/* 🗑️ [신규] 좌측 상단 휴지통 (삭제 버튼) */}
        <TouchableOpacity style={styles.topLeftDeleteButton} onPress={() => deleteFromDex(selectedDexRecipe.id)}>
          <Text style={styles.topIconText}>🗑️</Text>
        </TouchableOpacity>

        {/* ✖ 우측 상단 닫기 버튼 */}
        <TouchableOpacity style={styles.topRightCloseButton} onPress={() => setSelectedDexRecipe(null)}>
          <Text style={styles.topIconText}>✖</Text>
        </TouchableOpacity>

        <Text style={styles.title}>📖 쿡덱스 기록</Text>
        <Text style={styles.dexDateLarge}>{selectedDexRecipe.date}의 연금술</Text>
        
        <View style={styles.recipeCard}>
          {/* 💡 [수정] 스크롤이 끝까지 내려가도록 하단 여백(paddingBottom) 넉넉히 추가 */}
          <ScrollView style={styles.cardContent} contentContainerStyle={{ paddingBottom: 60, flexGrow: 1 }}>
            <Text style={styles.recipeText}>{selectedDexRecipe.recipe}</Text>
          </ScrollView>
        </View>

        <View style={styles.actionButtons}>
          {/* 💡 [수정] 대표님 지시대로 '자랑하기'로 텍스트 롤백 */}
          <TouchableOpacity style={styles.shareButtonLarge} onPress={() => shareRecipe(selectedDexRecipe.recipe)}>
            <Text style={styles.buttonText} numberOfLines={1} adjustsFontSizeToFit>📲 자랑하기</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 4. 레시피 결과 화면 
  if (aiRecipe) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.topRightCloseButton} onPress={resetApp}>
          <Text style={styles.topIconText}>✖</Text>
        </TouchableOpacity>

        <Text style={styles.title}>🎉 미션 클리어!</Text>
        <View style={styles.recipeCard}>
          {capturedPhoto && <Image source={{ uri: capturedPhoto.uri }} style={styles.cardImage} />}
          {/* 💡 [수정] 스크롤이 끝까지 내려가도록 하단 여백 추가 */}
          <ScrollView style={styles.cardContent} contentContainerStyle={{ paddingBottom: 60, flexGrow: 1 }}>
            <Text style={styles.recipeText}>{aiRecipe}</Text>
          </ScrollView>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.shareButtonLarge} onPress={() => shareRecipe(aiRecipe)}>
            <Text style={styles.buttonText} numberOfLines={1} adjustsFontSizeToFit>📲 자랑하기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButtonLarge} onPress={saveToDex}>
            <Text style={styles.buttonText} numberOfLines={1} adjustsFontSizeToFit>💾 도감 저장</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (capturedPhoto) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>🔍 스캔 완료!</Text>
        <Image source={{ uri: capturedPhoto.uri }} style={styles.previewImage} />
        {isLoading ? (
          <View style={{ alignItems: 'center' }}><ActivityIndicator size="large" color="#FF7F50" /><Text style={styles.subtitle}>계산 중...</Text></View>
        ) : (
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.resetButton} onPress={() => setCapturedPhoto(null)}><Text style={styles.buttonText}>🔄 다시 찍기</Text></TouchableOpacity>
            <TouchableOpacity style={styles.analyzeButton} onPress={analyzeIngredientsWithAI}><Text style={styles.buttonText}>✨ 연금술 시작</Text></TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  if (isCameraActive) {
    return (
      <View style={styles.container}>
        <CameraView style={styles.camera} facing="back" ref={cameraRef}>
          <View style={styles.cameraOverlay}>
            <TouchableOpacity style={styles.closeButton} onPress={() => setIsCameraActive(false)}><Text style={styles.buttonText}>❌ 취소</Text></TouchableOpacity>
            <TouchableOpacity style={styles.captureCircle} onPress={takePicture}><View style={styles.innerCircle} /></TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  // 1. 메인 화면
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔥 Cook-Dex 🔥</Text>
      
      <TouchableOpacity style={styles.scanButton} onPress={() => setIsCameraActive(true)} activeOpacity={0.7}>
        <Text style={styles.scanButtonText}>📸 냉장고 카메라 스캔</Text>
      </TouchableOpacity>

      <View style={styles.ingredientsContainer}>
        <Text style={styles.listTitle}>🎯 몬스터 식재료 (터치)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsWrapper}>
          {MONSTER_INGREDIENTS.map((ingredient, index) => {
            const isSelected = selectedIngredients.includes(ingredient);
            return (
              <TouchableOpacity key={index} style={[styles.chip, isSelected && styles.chipSelected]} onPress={() => toggleIngredient(ingredient)}>
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{isSelected ? '✔️ ' : ''}{ingredient}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {selectedIngredients.length > 0 && (
        <TouchableOpacity style={styles.quickAnalyzeButton} onPress={analyzeIngredientsWithAI}>
          <Text style={styles.scanButtonText}>✨ {selectedIngredients.length}개 재료로 즉시 연금술</Text>
        </TouchableOpacity>
      )}

      {isLoading && <ActivityIndicator size="large" color="#FF7F50" style={{ marginTop: 20 }} />}

      <View style={styles.dexContainer}>
        <Text style={styles.listTitle}>📖 내 요리 도감 ({dexList.length}개)</Text>
        {dexList.length === 0 ? (
          <Text style={styles.emptyDexText}>아직 등록된 레시피가 없습니다.</Text>
        ) : (
          <FlatList 
            data={dexList}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => setSelectedDexRecipe(item)} activeOpacity={0.6}>
                <View style={styles.dexCard}>
                  <Text style={styles.dexDate}>{item.date}</Text>
                  <Text style={styles.dexRecipeText} numberOfLines={2}>{item.recipe}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1E293B', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#FF7F50', marginBottom: 20 },
  subtitle: { fontSize: 16, color: '#4ADE80', marginBottom: 30, textAlign: 'center' },
  
  // 💡 [신규/수정] 좌우 상단 대칭 버튼 스타일링
  topLeftDeleteButton: { position: 'absolute', top: 50, left: 20, zIndex: 10, padding: 10, backgroundColor: 'rgba(239, 68, 68, 0.3)', borderRadius: 20 },
  topRightCloseButton: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10, backgroundColor: 'rgba(255, 255, 255, 0.2)', borderRadius: 20 },
  topIconText: { fontSize: 20, color: 'white', fontWeight: 'bold' },

  scanButton: { backgroundColor: '#3B82F6', paddingVertical: 15, paddingHorizontal: 35, borderRadius: 15, width: '100%', alignItems: 'center', marginBottom: 20 },
  scanButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  
  ingredientsContainer: { width: '100%', marginBottom: 10, height: 80 },
  listTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold', marginBottom: 10, marginLeft: 5 },
  chipsWrapper: { paddingRight: 20, gap: 10, flexDirection: 'row' },
  chip: { backgroundColor: '#334155', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: '#475569', height: 40 },
  chipSelected: { backgroundColor: '#FF7F50', borderColor: '#FF7F50' },
  chipText: { color: '#CBD5E1', fontSize: 14, fontWeight: '500' },
  chipTextSelected: { color: '#FFFFFF', fontWeight: 'bold' },

  quickAnalyzeButton: { backgroundColor: '#4ADE80', paddingVertical: 15, paddingHorizontal: 35, borderRadius: 15, width: '100%', alignItems: 'center', marginTop: 10 },

  camera: { flex: 1, width: '100%' },
  cameraOverlay: { flex: 1, backgroundColor: 'transparent', flexDirection: 'column', justifyContent: 'space-between', padding: 30, paddingBottom: 50 },
  closeButton: { alignSelf: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 10, marginTop: 20 },
  captureCircle: { alignSelf: 'center', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255, 255, 255, 0.3)', justifyContent: 'center', alignItems: 'center' },
  innerCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF' },
  
  previewImage: { width: '100%', height: 350, borderRadius: 15, marginBottom: 30 },
  recipeCard: { flex: 1, width: '100%', backgroundColor: '#F8FAFC', borderRadius: 20, overflow: 'hidden', marginTop: 10, marginBottom: 20 },
  cardImage: { width: '100%', height: 200, backgroundColor: '#E2E8F0' },
  
  // 💡 [수정] 스크롤 내부 영역을 위해 기본 패딩은 없애고, 위쪽 컴포넌트에서 contentContainerStyle로 패딩 제어
  cardContent: { paddingHorizontal: 20, paddingTop: 20 },
  recipeText: { fontSize: 16, lineHeight: 26, color: '#334155', fontWeight: '500' },

  actionButtons: { flexDirection: 'row', gap: 10, width: '100%', justifyContent: 'space-between', marginBottom: 20 },
  resetButton: { flex: 1, backgroundColor: '#64748B', paddingVertical: 15, alignItems: 'center', borderRadius: 12 },
  analyzeButton: { flex: 1, backgroundColor: '#4ADE80', paddingVertical: 15, alignItems: 'center', borderRadius: 12 },
  
  shareButtonLarge: { flex: 1, backgroundColor: '#3B82F6', paddingVertical: 16, alignItems: 'center', borderRadius: 15, marginHorizontal: 3 },
  saveButtonLarge: { flex: 1, backgroundColor: '#FF7F50', paddingVertical: 16, alignItems: 'center', borderRadius: 15, marginHorizontal: 3 },
  buttonText: { color: 'white', fontSize: 15, fontWeight: 'bold' },

  dexContainer: { flex: 1, width: '100%', marginTop: 20, backgroundColor: '#0F172A', padding: 15, borderRadius: 20 },
  emptyDexText: { color: '#94A3B8', textAlign: 'center', marginTop: 20, fontSize: 14 },
  dexCard: { backgroundColor: '#1E293B', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  dexDate: { color: '#4ADE80', fontSize: 12, fontWeight: 'bold', marginBottom: 5 },
  dexDateLarge: { color: '#4ADE80', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  dexRecipeText: { color: '#F8FAFC', fontSize: 14, lineHeight: 22 }
});