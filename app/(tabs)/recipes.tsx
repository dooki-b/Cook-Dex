// 파일 위치: app/(tabs)/recipes.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadows } from '../../constants/design-tokens';

export default function RecipesScreen() {
  const router = useRouter();
  const [savedRecipes, setSavedRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [shoppingModalVisible, setShoppingModalVisible] = useState(false);
  const [searchIngredient, setSearchIngredient] = useState("");
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedIdsForDelete, setSelectedIdsForDelete] = useState<string[]>([]);

  // 🚨 TTS 조리 모드 상태
  const [isCookingMode, setIsCookingMode] = useState(false);
  const [cookingSteps, setCookingSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isVoiceActive, setIsVoiceActive] = useState(false);

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

  // 삭제 모드 토글
  const handleHeaderDeletePress = () => {
    if (!isDeleteMode) {
      setIsDeleteMode(true);
      setSelectedIdsForDelete([]);
      return;
    }
    // 삭제 모드에서 상단 "삭제하기" 버튼은 최종 삭제 역할
    confirmBulkDelete();
  };

  const toggleSelectForDelete = (id: string) => {
    setSelectedIdsForDelete(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const selectAllForDelete = () => {
    if (selectedIdsForDelete.length === savedRecipes.length) {
      setSelectedIdsForDelete([]);
    } else {
      setSelectedIdsForDelete(savedRecipes.map(r => r.id));
    }
  };

  const confirmBulkDelete = async () => {
    if (selectedIdsForDelete.length === 0) {
      Alert.alert("알림", "삭제할 레시피를 선택해 주세요.");
      return;
    }
    Alert.alert(
      "삭제 확인",
      `선택한 ${selectedIdsForDelete.length}개의 레시피를 내 주방에서 삭제할까요?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
      const updatedRecipes = savedRecipes.filter(r => !selectedIdsForDelete.includes(r.id));
            setSavedRecipes(updatedRecipes);
            await AsyncStorage.setItem('cookdex_saved_recipes', JSON.stringify(updatedRecipes));
      setSelectedIdsForDelete([]);
      setIsDeleteMode(false);
          },
        },
      ],
    );
  };

  // 긴 마크다운 텍스트 안에서 첫 번째 '# 제목' 부분만 잘라내어 카드 썸네일용으로 쓰는 함수
  const extractTitle = (content) => {
    const match = content.match(/#\s+(.*)/);
    return match ? match[1] : "이름 없는 요리";
  };

  // 🚨 TTS 조리 모드 함수
  const startCookingMode = async () => {
    if (!selectedRecipe) return;
    const extractedSteps = selectedRecipe.content.split('\n').filter(line => /^\d+\.\s/.test(line.trim())).map(line => line.replace(/^\d+\.\s/, '').replace(/\*\*/g, '').trim());
    if (extractedSteps.length === 0) { Alert.alert("알림", "조리 단계를 인식하지 못했습니다."); return; }
    setCookingSteps(extractedSteps); setCurrentStepIndex(0); setIsCookingMode(true);
    Speech.speak(extractedSteps[0], { language: 'ko-KR', rate: 0.95, pitch: 1.0 });

    const checkSettings = async () => {
      const wakelock = await AsyncStorage.getItem('cookdex_setting_wakelock');
      const voice = await AsyncStorage.getItem('cookdex_setting_voice');
      if (wakelock === 'true') {
        try { await activateKeepAwakeAsync(); } catch(e){}
      }
      if (voice === 'true') {
        setIsVoiceActive(false);
      }
    };
    checkSettings();
  };
  const handleNextStep = () => { if (currentStepIndex < cookingSteps.length - 1) { Speech.stop(); setCurrentStepIndex(prev => prev + 1); Speech.speak(cookingSteps[currentStepIndex + 1], { language: 'ko-KR', rate: 0.95 }); } };
  const handlePrevStep = () => { if (currentStepIndex > 0) { Speech.stop(); setCurrentStepIndex(prev => prev - 1); Speech.speak(cookingSteps[currentStepIndex - 1], { language: 'ko-KR', rate: 0.95 }); } };
  const handleReplayStep = () => { Speech.stop(); Speech.speak(cookingSteps[currentStepIndex], { language: 'ko-KR', rate: 0.95 }); };
  const handleExitCookingMode = async () => { Speech.stop(); setIsCookingMode(false); try { await deactivateKeepAwake(); } catch(e){} setIsVoiceActive(false); };

  const handleVerifyCooking = async () => {
    // 실제 배포 시에는 expo-image-picker로 카메라 연동하지만, 일단 게이미피케이션 로직을 위해 Mock 구현
    Alert.alert(
      "📸 요리 완성 인증", 
      "카메라가 열립니다... (찰칵!)\n\n인증이 완료되었습니다!\n막대한 보상이 지급됩니다.", 
      [{ text: "보상 받기", onPress: async () => {
        try {
          const currentExp = parseInt(await AsyncStorage.getItem('cookdex_user_exp') || '0');
          await AsyncStorage.setItem('cookdex_user_exp', (currentExp + 50).toString()); // 50 EXP 폭발
          Alert.alert("🎉 레벨업 임박!", "요리 인증 성공! +50 EXP 획득!");
        } catch (e) { console.error("EXP 갱신 에러"); }
      }}]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>나의 레시피 북</Text>
          <Text style={styles.headerSub}>내가 저장한 레시피를 한눈에 모아봤어요.</Text>
        </View>
        {savedRecipes.length > 0 && (
          <View style={styles.headerRight}>
            {/* 위 줄: 삭제 모드일 때만 보이는 전체/취소 (높이는 항상 유지해서 레이아웃 안 흔들리게) */}
            {isDeleteMode && (
              <View style={styles.headerSecondaryRow}>
                <TouchableOpacity style={styles.headerSecondaryBtn} onPress={selectAllForDelete}>
                  <Text style={styles.headerSecondaryText}>전체</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerSecondaryBtn}
                  onPress={() => {
                    setIsDeleteMode(false);
                    setSelectedIdsForDelete([]);
                  }}
                >
                  <Text style={styles.headerSecondaryText}>취소</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 아래 줄: 항상 같은 위치에 있는 최종 삭제 버튼 */}
            <TouchableOpacity
              style={styles.headerDeleteBtn}
              onPress={handleHeaderDeletePress}
            >
              <Text style={styles.headerDeleteText}>삭제하기</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {savedRecipes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📖</Text>
          <Text style={styles.emptyText}>아직 저장된 레시피가 없습니다.</Text>
          <Text style={styles.emptySubText}>홈이나 스캐너에서 레시피를 만든 뒤 내 주방에 담아보세요.</Text>
        </View>
      ) : (
        <FlatList
          data={savedRecipes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isSelected = selectedIdsForDelete.includes(item.id);
            return (
            <TouchableOpacity 
              style={[
                styles.recipeCard,
                isDeleteMode && styles.recipeCardDeletable,
                isDeleteMode && isSelected && styles.recipeCardSelected,
              ]} 
              activeOpacity={0.8}
              onPress={() => {
                if (isDeleteMode) {
                  toggleSelectForDelete(item.id);
                } else {
                  router.push({
                    pathname: '/recipe-detail',
                    params: { source: 'saved', id: item.id },
                  });
                }
              }}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardDate}>{item.date}</Text>
                <View style={styles.bookmarkPill}>
                  <Text style={styles.bookmarkPillText}>저장됨 🔖</Text>
                </View>
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>{extractTitle(item.content)}</Text>
              <Text style={styles.cardPreview} numberOfLines={2}>{item.content.replace(/#/g, '').replace(/\*/g, '').trim()}</Text>
            </TouchableOpacity>
          )}}
        />
      )}

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
                <Text style={styles.ttsStartBtnText}>조리 모드로 듣기</Text>
              </TouchableOpacity>
              {selectedRecipe && <Markdown style={markdownStyles}>{selectedRecipe.content}</Markdown>}
              <View style={{height: 30}}/>
            </ScrollView>

            <TouchableOpacity style={styles.verifyBtn} onPress={handleVerifyCooking}>
              <Text style={styles.verifyBtnText}>요리 완성 인증하기</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shoppingBtn} onPress={() => setShoppingModalVisible(true)}>
              <Text style={styles.shoppingBtnText}>부족한 재료 온라인 검색</Text>
            </TouchableOpacity>
            <View style={styles.modalSpacingSmall} />

            <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteRecipe(selectedRecipe?.id)}>
              <Text style={styles.deleteBtnText}>🗑️ 이 레시피 삭제하기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={shoppingModalVisible} transparent={true} animationType="fade" onRequestClose={() => setShoppingModalVisible(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          style={styles.shoppingModalOverlay}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShoppingModalVisible(false)} />
          <View style={styles.shoppingModalContent}>
            <Text style={styles.shoppingTitle}>온라인 장보기</Text>
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

      <Modal visible={isCookingMode} transparent={false} animationType="slide">
        <SafeAreaView style={styles.ttsContainer}>
          <View style={styles.ttsHeader}>
            <Text style={styles.ttsStepIndicator}>조리 단계 {currentStepIndex + 1} / {cookingSteps.length}</Text>
            <TouchableOpacity onPress={handleExitCookingMode} style={styles.ttsCloseBtn}><Text style={styles.ttsCloseBtnText}>종료 ✕</Text></TouchableOpacity>
          </View>
          <View style={styles.ttsBody}>
            {isVoiceActive && (
              <View style={styles.voiceBadge}>
                <Text style={styles.voiceBadgeText}>🎙️ 음성 명령 활성화됨 ("다음", "이전" 대기 중)</Text>
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

      {isDeleteMode && savedRecipes.length > 0 && (
        <View style={styles.deleteToolbar}>
          <TouchableOpacity style={styles.deleteToolbarBtn} onPress={selectAllForDelete}>
            <Text style={styles.deleteToolbarBtnText}>
              {selectedIdsForDelete.length === savedRecipes.length ? "선택 해제" : "일괄 선택"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.deleteToolbarBtn,
              selectedIdsForDelete.length === 0 && { opacity: 0.4 },
            ]}
            onPress={confirmBulkDelete}
            disabled={selectedIdsForDelete.length === 0}
          >
            <Text style={[styles.deleteToolbarBtnText, { color: Colors.danger }]}>
              선택 삭제
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const markdownStyles = StyleSheet.create({ 
  body: { color: Colors.textMain, fontSize: 15, lineHeight: 24 }, 
  heading1: { color: Colors.primary, fontSize: 22, fontWeight: 'bold' }, 
  blockquote: {
    backgroundColor: Colors.primarySoft,
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginVertical: 10,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgMain,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 32 : 16,
    paddingBottom: 16,
    backgroundColor: Colors.bgMain,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerRight: {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.textMain,
    marginBottom: 4,
  },
  headerSub: {
    fontSize: 13,
    color: Colors.textSub,
  },
  headerDeleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerDeleteText: {
    fontSize: 12,
    color: Colors.actionDelete,
    fontWeight: '700',
  },
  headerSecondaryRow: {
    flexDirection: 'row',
    gap: 6,
    minHeight: 0,
    marginBottom: 6,
    opacity: 1,
  },
  headerSecondaryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgElevated,
  },
  headerSecondaryText: {
    fontSize: 11,
    color: Colors.textSub,
    fontWeight: '600',
  },
  deleteControlsContainer: {
    minHeight: 0,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textMain,
    marginBottom: 6,
  },
  emptySubText: {
    fontSize: 13,
    color: Colors.textSub,
    textAlign: 'center',
  },

  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    paddingTop: 8,
  },
  recipeCard: {
    backgroundColor: Colors.bgElevated,
    padding: 18,
    borderRadius: Radius.xl,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  recipeCardDeletable: {
    borderStyle: 'dashed',
  },
  recipeCardSelected: {
    borderColor: Colors.actionDelete,
    backgroundColor: Colors.bgMuted,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardDate: {
    fontSize: 12,
    color: Colors.textSub,
    fontWeight: '500',
  },
  bookmarkPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primarySoft,
  },
  bookmarkPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textMain,
    marginBottom: 6,
    lineHeight: 23,
  },
  cardPreview: {
    fontSize: 13,
    color: Colors.textSub,
    lineHeight: 20,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '85%',
    backgroundColor: Colors.bgModal,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: 20,
    ...Shadows.glassDiffused,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalDate: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSub,
  },
  closeBtn: {
    backgroundColor: Colors.primarySoft,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
  },
  closeBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  markdownScroll: {
    flex: 1,
  },
  verifyBtn: {
    backgroundColor: Colors.success,
    paddingVertical: 15,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginTop: 12,
  },
  verifyBtnText: {
    color: Colors.textInverse,
    fontSize: 15,
    fontWeight: '800',
  },
  shoppingModalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  shoppingBtn: {
    backgroundColor: Colors.actionShop,
    paddingVertical: 16,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginTop: 12,
  },
  shoppingBtnText: {
    color: Colors.textInverse,
    fontSize: 15,
    fontWeight: '800',
  },
  shoppingModalContent: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.xl,
    padding: 22,
    borderWidth: 1,
    borderColor: Colors.actionShop,
    width: '100%',
  },
  shoppingTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.actionShop,
    marginBottom: 8,
    textAlign: 'center',
  },
  shoppingSub: {
    fontSize: 13,
    color: Colors.textSub,
    textAlign: 'center',
    marginBottom: 16,
  },
  styleInput: {
    backgroundColor: Colors.bgMuted,
    color: Colors.textMain,
    borderRadius: Radius.md,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 18,
  },
  shoppingSubmitBtn: {
    backgroundColor: Colors.actionShop,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginBottom: 6,
  },
  shoppingSubmitBtnText: {
    color: Colors.textInverse,
    fontSize: 15,
    fontWeight: '800',
  },

  // TTS Styles
  ttsStartBtn: {
    backgroundColor: Colors.primarySoft,
    paddingVertical: 15,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  ttsStartBtnText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '800',
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
    marginTop: 12,
  },
  ttsStepIndicator: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  ttsCloseBtn: {
    backgroundColor: Colors.bgElevated,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: Radius.pill,
  },
  ttsCloseBtnText: {
    color: Colors.textMain,
    fontWeight: '600',
  },
  ttsBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  voiceBadge: {
    backgroundColor: Colors.primarySoft,
    padding: 10,
    borderRadius: Radius.pill,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  voiceBadgeText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  ttsBigText: {
    color: Colors.textMain,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 40,
  },
  ttsControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  ttsBtn: {
    backgroundColor: Colors.bgMuted,
    paddingVertical: 18,
    flex: 1,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  ttsBtnText: {
    color: Colors.textMain,
    fontSize: 15,
    fontWeight: '700',
  },
  ttsBtnMain: {
    backgroundColor: Colors.primary,
    paddingVertical: 20,
    flex: 1.5,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginHorizontal: 5,
    ...Shadows.glassTight,
  },
  ttsBtnMainText: {
    color: Colors.textInverse,
    fontSize: 16,
    fontWeight: '900',
  },

  modalSpacingSmall: {
    height: 10,
  },
  deleteBtn: {
    backgroundColor: Colors.bgElevated,
    paddingVertical: 15,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.actionDelete,
  },
  deleteBtnText: {
    color: Colors.actionDelete,
    fontSize: 14,
    fontWeight: '800',
  },
  deleteToolbar: {
    // legacy 스타일 (사용 안 함)
    paddingHorizontal: 20,
    paddingVertical: 0,
  },
  deleteToolbarBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteToolbarBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMain,
  },
});