// 파일 위치: app/(tabs)/recipes.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RecipesScreen() {
  const [savedRecipes, setSavedRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [shoppingModalVisible, setShoppingModalVisible] = useState(false);
  const [searchIngredient, setSearchIngredient] = useState("");

  // 🚨 TTS 조리 모드 상태
  const [isCookingMode, setIsCookingMode] = useState(false);
  const [cookingSteps, setCookingSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

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

  // 화면에 들어올 때마다 로컬 스토리지에서 저장된 레시피 목록을 즉시 갱신합니다.
  useFocusEffect(
    useCallback(() => {
      const loadRecipes = async () => {
        try {
          const data = await AsyncStorage.getItem('cookdex_saved_recipes');
          if (data) setSavedRecipes(JSON.parse(data));
        } catch (error) { 
          console.error("레시피 로드 실패", error); 
        }
      };
      loadRecipes();
    }, [])
  );

  // 특정 레시피 삭제 기능
  const deleteRecipe = async (id) => {
    Alert.alert("삭제 확인", "이 레시피를 내 주방에서 버리시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: async () => {
          const updatedRecipes = savedRecipes.filter(r => r.id !== id);
          setSavedRecipes(updatedRecipes);
          await AsyncStorage.setItem('cookdex_saved_recipes', JSON.stringify(updatedRecipes));
          setModalVisible(false);
        }
      }
    ]);
  };

  // 긴 마크다운 텍스트 안에서 첫 번째 '# 제목' 부분만 잘라내어 카드 썸네일용으로 쓰는 함수
  const extractTitle = (content) => {
    const match = content.match(/#\s+(.*)/);
    return match ? match[1] : "이름 없는 요리";
  };

  // 🚨 TTS 조리 모드 함수
  const startCookingMode = () => {
    if (!selectedRecipe) return;
    const extractedSteps = selectedRecipe.content.split('\n').filter(line => /^\d+\.\s/.test(line.trim())).map(line => line.replace(/^\d+\.\s/, '').replace(/\*\*/g, '').trim());
    if (extractedSteps.length === 0) { Alert.alert("알림", "조리 단계를 인식하지 못했습니다."); return; }
    setCookingSteps(extractedSteps); setCurrentStepIndex(0); setIsCookingMode(true);
    Speech.speak(extractedSteps[0], { language: 'ko-KR', rate: 0.95, pitch: 1.0 });
  };
  const handleNextStep = () => { if (currentStepIndex < cookingSteps.length - 1) { Speech.stop(); setCurrentStepIndex(prev => prev + 1); Speech.speak(cookingSteps[currentStepIndex + 1], { language: 'ko-KR', rate: 0.95 }); } };
  const handlePrevStep = () => { if (currentStepIndex > 0) { Speech.stop(); setCurrentStepIndex(prev => prev - 1); Speech.speak(cookingSteps[currentStepIndex - 1], { language: 'ko-KR', rate: 0.95 }); } };
  const handleReplayStep = () => { Speech.stop(); Speech.speak(cookingSteps[currentStepIndex], { language: 'ko-KR', rate: 0.95 }); };
  const handleExitCookingMode = () => { Speech.stop(); setIsCookingMode(false); };

  return (
    <SafeAreaView style={styles.container}>
      {/* 상단 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>내 주방 🍳</Text>
        <Text style={styles.headerSub}>내가 저장한 비밀 레시피 북</Text>
      </View>

      {/* 레시피 리스트 렌더링 */}
      {savedRecipes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🫙</Text>
          <Text style={styles.emptyText}>아직 저장된 레시피가 없어요!</Text>
          <Text style={styles.emptySubText}>홈이나 스캐너에서 레시피를 만들어 저장해보세요.</Text>
        </View>
      ) : (
        <FlatList
          data={savedRecipes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.recipeCard} 
              activeOpacity={0.8}
              onPress={() => { setSelectedRecipe(item); setModalVisible(true); }}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardDate}>{item.date}</Text>
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>{extractTitle(item.content)}</Text>
              <Text style={styles.cardPreview} numberOfLines={2}>{item.content.replace(/#/g, '').replace(/\*/g, '').trim()}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* 상세 보기 바텀 모달 */}
      <Modal visible={modalVisible} transparent={true} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalDate}>{selectedRecipe?.date} 기록됨</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>닫기 ✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false} style={styles.markdownScroll}>
              {/* 🚨 TTS 시작 버튼 추가 */}
              <TouchableOpacity style={styles.ttsStartBtn} onPress={startCookingMode}>
                <Text style={styles.ttsStartBtnText}>🔊 화면 안 보고 귀로 듣기 (조리 모드)</Text>
              </TouchableOpacity>
              {selectedRecipe && <Markdown style={markdownStyles}>{selectedRecipe.content}</Markdown>}
              <View style={{height: 30}}/>
            </ScrollView>

            <TouchableOpacity style={styles.shoppingBtn} onPress={() => setShoppingModalVisible(true)}>
              <Text style={styles.shoppingBtnText}>🛒 부족한 재료 온라인 검색</Text>
            </TouchableOpacity>
            {/* 🚨 버튼 간격 축소 (20 -> 10) */}
            <View style={{height: 10}}/>

            <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteRecipe(selectedRecipe?.id)}>
              <Text style={styles.deleteBtnText}>🗑️ 이 레시피 삭제하기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 🛒 쇼핑 검색 모달 */}
      <Modal visible={shoppingModalVisible} transparent={true} animationType="fade" onRequestClose={() => setShoppingModalVisible(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          style={styles.shoppingModalOverlay}
        >
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
        </KeyboardAvoidingView>
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
  body: { color: '#3A2E2B', fontSize: 15, lineHeight: 24 }, 
  heading1: { color: '#FF8C00', fontSize: 22, fontWeight: 'bold' }, 
  blockquote: { backgroundColor: '#F9F5F3', borderLeftWidth: 4, borderLeftColor: '#4CAF50', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5, marginVertical: 10 }
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDF9' },
  header: { padding: 20, paddingTop: Platform.OS === 'android' ? 50 : 20, backgroundColor: '#2A2421', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.2, shadowRadius: 5, elevation: 5 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#FFFDF9', marginBottom: 5 },
  headerSub: { fontSize: 14, color: '#A89F9C' },
  
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyEmoji: { fontSize: 50, marginBottom: 15 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#3A2E2B', marginBottom: 8 },
  emptySubText: { fontSize: 14, color: '#8C7A76', textAlign: 'center' },
  
  listContainer: { padding: 20, paddingBottom: 100 },
  recipeCard: { backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 15, shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.05, shadowRadius: 6, elevation: 3, borderWidth: 1, borderColor: '#E8D5D0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardDate: { fontSize: 12, color: '#A89F9C', fontWeight: 'bold' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#FF8C00', marginBottom: 8, lineHeight: 24 },
  cardPreview: { fontSize: 13, color: '#8C7A76', lineHeight: 20 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { height: '85%', backgroundColor: '#FFFDF9', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#E8D5D0' },
  modalDate: { fontSize: 14, fontWeight: 'bold', color: '#8C7A76' },
  closeBtn: { backgroundColor: '#F5EBE7', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15 },
  closeBtnText: { color: '#3A2E2B', fontSize: 13, fontWeight: 'bold' },
  markdownScroll: { flex: 1 },
  deleteBtn: { backgroundColor: '#FFEBEE', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginTop: 15, borderWidth: 1, borderColor: '#FFCDD2' },
  deleteBtnText: { color: '#C62828', fontSize: 15, fontWeight: 'bold' },
  shoppingModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  shoppingBtn: { backgroundColor: '#0073E9', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 15 },
  shoppingBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  shoppingModalContent: { backgroundColor: '#3A322F', borderRadius: 24, padding: 25, borderWidth: 1, borderColor: '#0073E9', position: 'relative', width: '100%' },
  shoppingTitle: { fontSize: 22, fontWeight: '900', color: '#0073E9', marginBottom: 10, textAlign: 'center' },
  shoppingSub: { fontSize: 14, color: '#FFFDF9', textAlign: 'center', marginBottom: 20 },
  styleInput: { backgroundColor: '#2A2421', color: '#FFFDF9', borderRadius: 12, padding: 15, fontSize: 16, borderWidth: 1, borderColor: '#5A4E49', marginBottom: 20 },
  shoppingSubmitBtn: { backgroundColor: '#0073E9', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginBottom: 12 },
  shoppingSubmitBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },

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