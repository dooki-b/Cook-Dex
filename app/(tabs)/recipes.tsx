// 파일 위치: app/(tabs)/recipes.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { collection, doc, getDoc, getDocs, increment, limit, orderBy, query, setDoc, where } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { auth, db } from '../../firebaseConfig';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "AIzaSyBIjimRGdi7uNlx3xh7WgeDgAhdY5wO-EQ";
const RECIPE_TYPES = ["메인 디쉬 🍛", "디저트 🍰", "음료/칵테일 🍹", "간단한 간식 🍟", "술안주 🍻", "샐러드/다이어트 🥗"];
const RECIPE_TASTES = ["매콤한 🔥", "단짠단짠 🍯🧂", "짭짤한 🧂", "자극적인 속세의 맛 😈", "담백하고 건강한 🌿", "따뜻한 국물 🍲"];

const calculateLevel = (exp) => {
  if (exp < 30) return { level: 1, title: "🍳 요리 쪼렙", nextExp: 30 };
  if (exp < 100) return { level: 2, title: "🔪 견습 요리사", nextExp: 100 };
  if (exp < 300) return { level: 3, title: "👨‍🍳 수석 셰프", nextExp: 300 };
  return { level: 'MAX', title: "👑 마스터 셰프", nextExp: exp };
};

export default function RecipesScreen() {
  const [activeTab, setActiveTab] = useState('local');
  const [localRecipes, setLocalRecipes] = useState([]);
  const [globalRecipes, setGlobalRecipes] = useState([]);
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);

  const [selectedRecipe, setSelectedRecipe] = useState(null); 
  const [showStyleModal, setShowStyleModal] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [isCustomType, setIsCustomType] = useState(false);
  const [customTypeInput, setCustomTypeInput] = useState("");
  const [selectedTaste, setSelectedTaste] = useState("");
  const [isCustomTaste, setIsCustomTaste] = useState(false);
  const [customTasteInput, setCustomTasteInput] = useState("");
  const [isGeneratingVariant, setIsGeneratingVariant] = useState(false);

  const [chefProfile, setChefProfile] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const loadLocalRecipes = async () => {
        try {
          const stored = await AsyncStorage.getItem('cookdex_saved_recipes');
          if (stored) setLocalRecipes(JSON.parse(stored));
        } catch (error) {}
      };

      const loadGlobalRecipes = async () => {
        setIsLoadingGlobal(true);
        try {
          const dietRaw = await AsyncStorage.getItem('cookdex_diet_goal_arr');
          const userDiets = dietRaw ? JSON.parse(dietRaw) : [];
          const allergyRaw = await AsyncStorage.getItem('cookdex_allergies_arr');
          const userAllergies = allergyRaw ? JSON.parse(allergyRaw) : [];

          const q = query(collection(db, "global_recipes"), orderBy("createdAt", "desc"), limit(50));
          const snapshot = await getDocs(q);
          let loaded = [];
          
          let dietKeywords = [];
          userDiets.forEach(d => {
            if (d.includes("다이어트")) dietKeywords.push("다이어트", "저칼로리", "샐러드", "가벼운", "닭가슴살");
            else if (d.includes("벌크업")) dietKeywords.push("벌크업", "단백질", "고기", "스테이크");
            else if (d.includes("저탄고지")) dietKeywords.push("저탄고지", "키토", "버터", "치즈", "삼겹살");
            else if (d.includes("비건")) dietKeywords.push("비건", "채식", "두부", "야채", "식물성");
            else dietKeywords.push(d);
          });

          snapshot.forEach((doc) => {
            const data = doc.data();
            let score = 0;
            let isRecommended = false;
            let hasAllergy = false;

            userAllergies.forEach(allergy => {
              if (data.content.includes(allergy)) { score -= 1000; hasAllergy = true; }
            });
            dietKeywords.forEach(kw => {
              if (data.content.includes(kw)) { score += 50; isRecommended = true; }
            });

            score += new Date(data.createdAt).getTime() / 100000000000;

            loaded.push({ 
              id: doc.id, date: new Date(data.createdAt).toLocaleDateString(), content: data.content, 
              authorName: data.authorName, authorId: data.authorId, likes: data.likes || 0,
              score: score, isRecommended: isRecommended && !hasAllergy, hasAllergy: hasAllergy 
            });
          });

          loaded.sort((a, b) => b.score - a.score);
          setGlobalRecipes(loaded);
        } catch (error) {} finally { setIsLoadingGlobal(false); }
      };

      loadLocalRecipes();
      if (activeTab === 'global') loadGlobalRecipes();
    }, [activeTab])
  );

  const extractTitle = (content) => {
    if (!content) return "쿡덱스 요리";
    const lines = content.split('\n').map(line => line.trim());
    const headerLine = lines.find(line => line.startsWith('#'));
    if (headerLine) return headerLine.replace(/^#+\s*/, '').replace(/\*/g, '').trim();
    for (let line of lines) { if (line.length > 0 && !line.includes('쿡덱스') && !line.includes('반갑')) return line.replace(/\*/g, '').trim(); }
    return "요리";
  };

  const deleteRecipe = async (id) => {
    Alert.alert("레시피 삭제", "정말 지우시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: async () => {
          const updated = localRecipes.filter(r => r.id !== id);
          setLocalRecipes(updated);
          await AsyncStorage.setItem('cookdex_saved_recipes', JSON.stringify(updated));
          setSelectedRecipe(null); 
        }
      }
    ]);
  };

  const shareFromLibrary = async () => {
    if (!selectedRecipe) return;
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      await setDoc(doc(db, "global_recipes", selectedRecipe.id), {
        id: selectedRecipe.id, content: selectedRecipe.content, authorId: currentUser.uid, authorName: currentUser.displayName || "익명 셰프", createdAt: new Date().toISOString(), likes: 0
      });
      const currentExp = parseInt(await AsyncStorage.getItem('cookdex_user_exp') || '0');
      await AsyncStorage.setItem('cookdex_user_exp', (currentExp + 20).toString());
      await setDoc(doc(db, "users", currentUser.uid), { totalExp: increment(20) }, { merge: true });
      Alert.alert("광장에 등록 완료! 🌍✨", "광장에 기여한 보상으로 추가 보너스 +20 EXP가 지급되었습니다!");
    } catch (error) { Alert.alert("에러", "공유에 실패했습니다."); }
  };

  const checkAllergyAndScrap = async () => {
    if (!selectedRecipe) return;
    try {
      const allergiesRaw = await AsyncStorage.getItem('cookdex_allergies_arr');
      const allergiesArr = allergiesRaw ? JSON.parse(allergiesRaw) : [];
      const dangerousIngredients = allergiesArr.filter(allergy => selectedRecipe.content.includes(allergy));

      const doScrap = async () => {
        const newRecipe = { id: Date.now().toString(), date: new Date().toLocaleDateString(), content: selectedRecipe.content };
        const updatedRecipes = [newRecipe, ...localRecipes];
        setLocalRecipes(updatedRecipes);
        await AsyncStorage.setItem('cookdex_saved_recipes', JSON.stringify(updatedRecipes));
        Alert.alert("스크랩 완료! 💾", "남의 레시피를 내 주방으로 안전하게 복사했습니다!");
      };

      if (dangerousIngredients.length > 0) {
        Alert.alert("🚨 알레르기 경고!", `셰프님이 기피하는 식재료 [${dangerousIngredients.join(', ')}] 가 이 레시피에 포함되어 있습니다!\n정말 스크랩 하시겠습니까?`, [{ text: "취소", style: "cancel" }, { text: "무시하고 저장", onPress: doScrap, style: "destructive" }]);
      } else doScrap(); 
    } catch (error) {}
  };

  const handleLike = async () => {
    if (!selectedRecipe) return;
    try {
      await setDoc(doc(db, "global_recipes", selectedRecipe.id), { likes: increment(1) }, { merge: true });
      Alert.alert("❤️ 좋아요 완료!", "레시피 작성자에게 큰 힘이 됩니다!");
      setSelectedRecipe(prev => ({ ...prev, likes: (prev.likes || 0) + 1 }));
      setGlobalRecipes(prev => prev.map(r => r.id === selectedRecipe.id ? { ...r, likes: (r.likes || 0) + 1 } : r));
    } catch (error) { Alert.alert("에러", "좋아요 실패"); }
  };

  const generateVariantRecipe = async () => {
    let finalType = isCustomType && customTypeInput.trim() !== "" ? customTypeInput : selectedType;
    let finalTaste = isCustomTaste && customTasteInput.trim() !== "" ? customTasteInput : selectedTaste;
    let styleStr = "";
    if (finalType) styleStr += `요리 종류: ${finalType}, `;
    if (finalTaste) styleStr += `맛/분위기: ${finalTaste}`;
    
    if (!styleStr) { Alert.alert("알림", "원하시는 요리 종류나 맛을 선택해주세요!"); return; }
    setShowStyleModal(false); setIsGeneratingVariant(true);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`;
      const systemPrompt = `너는 최고의 셰프 '쿡덱스'야.\n[기존 레시피]:\n${selectedRecipe.content}\n[목표 스타일]: ${styleStr}\n[🚨출력 규칙🚨]: 무조건 가장 첫 번째 줄은 "# [새로운 요리 이름]" 형태로 적어라.`;
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] }) });
      const data = await response.json();
      if (!response.ok) throw new Error("API 에러");
      let rawRecipe = data.candidates[0].content.parts[0].text.trim().replace(/\*\*'([^']+)'\*\*/g, '**$1**').replace(/'\*\*(.+?)\*\*'/g, '**$1**');   
      setSelectedRecipe({ id: Date.now().toString(), content: rawRecipe, isVariant: true });
    } catch (error) { Alert.alert("안내", "레시피 창조 중 에러가 발생했습니다."); } finally { setIsGeneratingVariant(false); }
  };

  const saveVariantRecipe = async () => {
    try {
      const newRecipe = { id: Date.now().toString(), date: new Date().toLocaleDateString(), content: selectedRecipe.content };
      const updatedRecipes = [newRecipe, ...localRecipes];
      setLocalRecipes(updatedRecipes);
      await AsyncStorage.setItem('cookdex_saved_recipes', JSON.stringify(updatedRecipes));
      Alert.alert("성공! ✨", "새로운 스타일의 레시피가 내 주방에 보관되었습니다!");
      setSelectedRecipe(null); setActiveTab('local');
    } catch (error) { alert("저장 에러"); }
  };

  const handleCloseModal = () => {
    if (selectedRecipe?.isVariant) {
      Alert.alert("앗! 잠깐만요 🛑", "아직 변형된 레시피를 저장하지 않았어요. 창을 닫으시겠습니까?", [
        { text: "취소", style: "cancel" }, { text: "닫기", style: "destructive", onPress: () => { setSelectedRecipe(null); setIsGeneratingVariant(false); } }
      ]);
    } else { setSelectedRecipe(null); setIsGeneratingVariant(false); }
  };

  const openChefProfile = async (authorId, authorName) => {
    setChefProfile({ name: authorName, exp: 0, levelInfo: null, recipes: [] });
    setIsProfileLoading(true);
    try {
      const userDoc = await getDoc(doc(db, "users", authorId));
      let exp = 0;
      if (userDoc.exists()) exp = userDoc.data().totalExp || 0;
      const q = query(collection(db, "global_recipes"), where("authorId", "==", authorId));
      const snapshot = await getDocs(q);
      let userRecipes = [];
      snapshot.forEach(doc => { const d = doc.data(); userRecipes.push({ id: doc.id, title: extractTitle(d.content), likes: d.likes || 0, createdAt: d.createdAt }); });
      userRecipes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setChefProfile({ name: authorName, exp: exp, levelInfo: calculateLevel(exp), recipes: userRecipes.slice(0, 10) });
    } catch (error) { Alert.alert("안내", "프로필을 불러오지 못했습니다."); setChefProfile(null); } finally { setIsProfileLoading(false); }
  };

  const renderRecipeCard = ({ item }) => {
    const isGlobal = activeTab === 'global';
    return (
      <TouchableOpacity style={[styles.card, item.hasAllergy && styles.cardDanger]} onPress={() => setSelectedRecipe({ ...item, isGlobal })}>
        <View style={styles.cardHeader}>
          <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
            {isGlobal && item.isRecommended && <View style={styles.badgeRecommend}><Text style={styles.badgeRecommendText}>✨ 맞춤</Text></View>}
            {isGlobal && item.hasAllergy && <View style={styles.badgeDanger}><Text style={styles.badgeDangerText}>⚠️ 주의</Text></View>}
            <Text style={[styles.cardTitle, item.hasAllergy && {color: '#8C7A76', textDecorationLine: 'line-through'}]} numberOfLines={1}>{extractTitle(item.content)}</Text>
          </View>
          {!isGlobal && (<TouchableOpacity onPress={() => deleteRecipe(item.id)} style={styles.deleteButton}><Text style={styles.deleteButtonText}>삭제</Text></TouchableOpacity>)}
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardDate}>{item.date}</Text>
          {isGlobal && item.authorName && (
            <View style={styles.globalCardInfo}>
              <Text style={styles.likeTextBadge}>❤️ {item.likes || 0}</Text>
              <TouchableOpacity style={styles.authorBadge} onPress={() => openChefProfile(item.authorId, item.authorName)}><Text style={styles.authorBadgeText}>👨‍🍳 {item.authorName}</Text></TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📚 레시피 보관함</Text>
        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tabButton, activeTab === 'local' && styles.tabButtonActive]} onPress={() => setActiveTab('local')}><Text style={[styles.tabText, activeTab === 'local' && styles.tabTextActive]}>🍳 나의 주방</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.tabButton, activeTab === 'global' && styles.tabButtonActive]} onPress={() => setActiveTab('global')}><Text style={[styles.tabText, activeTab === 'global' && styles.tabTextActive]}>🌍 모두의 광장</Text></TouchableOpacity>
        </View>
      </View>

      {activeTab === 'global' && isLoadingGlobal ? (
        <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#FF8C00" /><Text style={styles.loadingText}>광장 소식 불러오는 중...</Text></View>
      ) : activeTab === 'local' && localRecipes.length === 0 ? (
        <View style={styles.emptyContainer}><Text style={styles.emptyIcon}>🍳</Text><Text style={styles.emptyText}>내 주방이 비어있습니다.</Text></View>
      ) : activeTab === 'global' && globalRecipes.length === 0 ? (
        <View style={styles.emptyContainer}><Text style={styles.emptyIcon}>🌍</Text><Text style={styles.emptyText}>광장에 아직 레시피가 없습니다.</Text></View>
      ) : (
        <FlatList data={activeTab === 'local' ? localRecipes : globalRecipes} keyExtractor={(item) => item.id} renderItem={renderRecipeCard} contentContainerStyle={styles.listContent} />
      )}

      <Modal visible={!!selectedRecipe} animationType="slide" transparent={true} onRequestClose={handleCloseModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheetContainer}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalDate}>{selectedRecipe?.isVariant ? "✨ 새롭게 탄생한 레시피!" : `${selectedRecipe?.date} 작성됨`}</Text>
                {selectedRecipe?.isGlobal && !selectedRecipe?.isVariant && (
                  <TouchableOpacity onPress={() => openChefProfile(selectedRecipe.authorId, selectedRecipe.authorName)}>
                    <Text style={[styles.modalAuthorText, {textDecorationLine: 'underline'}]}>by {selectedRecipe?.authorName} 셰프</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity onPress={handleCloseModal} style={styles.closeButton}><Text style={styles.closeButtonText}>닫기 ✕</Text></TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              {isGeneratingVariant ? (<View style={styles.loadingBox}><ActivityIndicator size="large" color="#8E24AA" /><Text style={styles.loadingText}>나만의 스타일로 재창조 중...</Text></View>) : (<ScrollView style={styles.modalScroll}>{selectedRecipe && <Markdown style={markdownStyles}>{selectedRecipe.content}</Markdown>}</ScrollView>)}
            </View>
            
            {!isGeneratingVariant && selectedRecipe && !selectedRecipe.isVariant && (
              <View style={styles.actionBtnRow}>
                {selectedRecipe.isGlobal ? (
                  <>
                    <TouchableOpacity style={[styles.shareButton, {backgroundColor: '#FF6B6B', flex: 1}]} onPress={handleLike}><Text style={styles.shareButtonText}>❤️ 좋아요</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.transformButton, {backgroundColor: '#4CAF50', flex: 1.5}]} onPress={checkAllergyAndScrap}><Text style={styles.transformButtonText}>💾 내 주방으로 스크랩</Text></TouchableOpacity>
                  </>
                ) : (
                  <>
                    {/* 🚨 버튼 텍스트 통일: 레시피 수정 🎲 */}
                    <TouchableOpacity style={styles.transformButton} onPress={() => { setIsCustomType(false); setShowStyleModal(true); }}><Text style={styles.transformButtonText}>레시피 수정 🎲</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.shareButton} onPress={shareFromLibrary}><Text style={styles.shareButtonText}>🌍 광장에 공유</Text></TouchableOpacity>
                  </>
                )}
              </View>
            )}
            {!isGeneratingVariant && selectedRecipe && selectedRecipe.isVariant && (<TouchableOpacity style={[styles.transformButton, {backgroundColor: '#4CAF50'}]} onPress={saveVariantRecipe}><Text style={styles.transformButtonText}>❤️ 이 새로운 레시피를 내 주방에 저장</Text></TouchableOpacity>)}
          </View>
        </View>
      </Modal>

      <Modal visible={!!chefProfile} transparent={true} animationType="fade" onRequestClose={() => setChefProfile(null)}>
        <TouchableOpacity style={styles.modalOverlayCenter} activeOpacity={1} onPress={() => setChefProfile(null)}>
          <View style={styles.profileModalContent} onStartShouldSetResponder={() => true}>
            {isProfileLoading || !chefProfile?.levelInfo ? (
              <View style={styles.loadingBox}><ActivityIndicator size="large" color="#FF8C00" /><Text style={styles.loadingText}>명함 불러오는 중...</Text></View>
            ) : (
              <>
                <View style={styles.profileHeader}>
                  <View style={styles.profileAvatar}><Text style={styles.profileAvatarIcon}>👨‍🍳</Text></View>
                  <View style={styles.profileTitleBadge}><Text style={styles.profileTitleText}>{chefProfile.levelInfo.title}</Text></View>
                  <Text style={styles.profileName}>{chefProfile.name} 셰프</Text>
                  <Text style={styles.profileExp}>총 누적 {chefProfile.exp} EXP</Text>
                </View>
                <View style={styles.profileDivider} />
                <Text style={styles.profileListTitle}>이 셰프의 광장 레시피</Text>
                <ScrollView style={styles.profileRecipeList}>
                  {chefProfile.recipes.length === 0 ? (
                    <Text style={styles.profileEmptyText}>아직 올린 레시피가 없습니다.</Text>
                  ) : (
                    chefProfile.recipes.map((r, idx) => (
                      <View key={idx} style={styles.profileRecipeItem}>
                        <Text style={styles.profileRecipeTitle} numberOfLines={1}>{r.title}</Text>
                        <Text style={styles.profileRecipeLikes}>❤️ {r.likes}</Text>
                      </View>
                    ))
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 🚨 [이슈 4 해결] 보관함 스타일 모달 UI 복구 완료 */}
      <Modal visible={showStyleModal} transparent={true} animationType="fade" onRequestClose={() => setShowStyleModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={styles.bottomSheetContainerWrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
                  <TouchableOpacity style={styles.styleModalSave} onPress={generateVariantRecipe}><Text style={styles.styleModalBtnTextWhite}>추천받기 ✨</Text></TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const markdownStyles = StyleSheet.create({ body: { color: '#3A2E2B', fontSize: 16, lineHeight: 26 }, heading1: { color: '#FF8C00', fontSize: 24, fontWeight: 'bold' } });
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDF9' }, header: { paddingTop: 40, paddingBottom: 10, paddingHorizontal: 20, backgroundColor: '#FFFDF9' }, headerTitle: { fontSize: 26, fontWeight: '900', color: '#3A2E2B', marginBottom: 15 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#F5EBE7', borderRadius: 12, padding: 4 }, tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 }, tabButtonActive: { backgroundColor: '#fff', shadowColor: '#8C7A76', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }, tabText: { fontSize: 15, fontWeight: 'bold', color: '#8C7A76' }, tabTextActive: { color: '#FF8C00', fontWeight: '900' },
  listContent: { padding: 20, paddingBottom: 100 }, card: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 15, paddingHorizontal: 18, marginBottom: 12, shadowColor: '#8C7A76', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 }, cardDanger: { backgroundColor: '#FFF5F5', borderColor: '#FFCDD2', borderWidth: 1 }, cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }, badgeRecommend: { backgroundColor: '#E1BEE7', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, marginRight: 6 }, badgeRecommendText: { color: '#6A1B9A', fontSize: 11, fontWeight: '900' }, badgeDanger: { backgroundColor: '#FFCDD2', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, marginRight: 6 }, badgeDangerText: { color: '#C62828', fontSize: 11, fontWeight: '900' }, cardTitle: { flex: 1, fontSize: 17, fontWeight: 'bold', color: '#3A2E2B', marginRight: 10 }, cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, cardDate: { color: '#8C7A76', fontSize: 12, fontWeight: '600' }, deleteButton: { backgroundColor: '#FFF3E0', paddingVertical: 5, paddingHorizontal: 12, borderRadius: 8 }, deleteButtonText: { color: '#E65100', fontSize: 12, fontWeight: 'bold' }, globalCardInfo: { flexDirection: 'row', alignItems: 'center' }, likeTextBadge: { fontSize: 12, fontWeight: 'bold', color: '#FF6B6B', marginRight: 8 }, authorBadge: { backgroundColor: '#F9F5F3', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: '#E8D5D0' }, authorBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#8E24AA' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }, emptyIcon: { fontSize: 60, marginBottom: 20 }, emptyText: { fontSize: 18, fontWeight: 'bold', color: '#8C7A76' }, loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' }, loadingText: { marginTop: 10, fontWeight: 'bold', color: '#8C7A76' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(58, 46, 43, 0.6)', justifyContent: 'flex-end' }, bottomSheetContainer: { height: '88%', backgroundColor: '#FFFDF9', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 }, bottomSheetContainerWrapper: { width: '100%', justifyContent: 'flex-end' }, dragHandle: { width: 50, height: 5, backgroundColor: '#E8D5D0', borderRadius: 3, alignSelf: 'center', marginTop: 12, marginBottom: 15 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#E8D5D0', marginBottom: 15 }, modalDate: { fontSize: 16, color: '#3A2E2B', fontWeight: '900' }, modalAuthorText: { fontSize: 13, color: '#8E24AA', fontWeight: 'bold', marginTop: 4 }, closeButton: { backgroundColor: '#F5EBE7', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20 }, closeButtonText: { color: '#3A2E2B', fontSize: 14, fontWeight: 'bold' }, modalBody: { flex: 1, justifyContent: 'center' }, modalScroll: { flex: 1 }, loadingBox: { alignItems: 'center', paddingVertical: 50 }, loadingText: { color: '#FF8C00', marginTop: 15, fontSize: 15, fontWeight: 'bold' }, actionBtnRow: { flexDirection: 'row', gap: 10, marginTop: 15 }, transformButton: { flex: 2, backgroundColor: '#8E24AA', paddingVertical: 16, borderRadius: 15, alignItems: 'center' }, transformButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' }, shareButton: { flex: 1, backgroundColor: '#4CAF50', paddingVertical: 16, borderRadius: 15, alignItems: 'center' }, shareButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }, 
  
  // 🚨 스타일 모달 UI 복구!
  styleModalTitle: { color: '#8E24AA', fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' }, styleInputLabel: { color: '#3A2E2B', fontSize: 14, fontWeight: 'bold', marginBottom: 8, marginTop: 10 }, styleTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 }, styleTag: { paddingVertical: 10, paddingHorizontal: 15, backgroundColor: '#F9F5F3', borderRadius: 20, borderWidth: 1, borderColor: '#E8D5D0' }, styleTagActive: { backgroundColor: '#8E24AA', borderColor: '#AB47BC' }, styleTagText: { color: '#8C7A76', fontSize: 13, fontWeight: 'bold' }, styleTagTextActive: { color: '#fff', fontSize: 13, fontWeight: 'bold' }, customTextInput: { backgroundColor: '#FFFDF9', color: '#3A2E2B', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 10, fontSize: 14, borderWidth: 1, borderColor: '#8E24AA', marginTop: 10 }, styleModalButtons: { flexDirection: 'row', justifyContent: 'center', gap: 15, width: '100%', marginTop: 25 }, styleModalCancel: { backgroundColor: '#F5EBE7', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flex: 1 }, styleModalSave: { backgroundColor: '#8E24AA', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flex: 1.5 }, styleModalBtnText: { color: '#8C7A76', fontWeight: 'bold', fontSize: 15, textAlign: 'center' }, styleModalBtnTextWhite: { color: '#fff', fontWeight: 'bold', fontSize: 15, textAlign: 'center' },

  profileModalContent: { width: '85%', backgroundColor: '#FFFDF9', borderRadius: 25, padding: 25, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 }, profileHeader: { alignItems: 'center', marginBottom: 15 }, profileAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F5EBE7', justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderWidth: 3, borderColor: '#FF8C00' }, profileAvatarIcon: { fontSize: 40 }, profileTitleBadge: { backgroundColor: '#FFF3E0', paddingVertical: 5, paddingHorizontal: 12, borderRadius: 15, marginBottom: 8, borderWidth: 1, borderColor: '#FFB74D' }, profileTitleText: { color: '#E65100', fontSize: 12, fontWeight: '900' }, profileName: { fontSize: 22, fontWeight: '900', color: '#3A2E2B', marginBottom: 5 }, profileExp: { fontSize: 14, fontWeight: 'bold', color: '#8C7A76' }, profileDivider: { width: '100%', height: 1, backgroundColor: '#E8D5D0', marginVertical: 15 }, profileListTitle: { alignSelf: 'flex-start', fontSize: 14, fontWeight: 'bold', color: '#FF8C00', marginBottom: 10 }, profileRecipeList: { width: '100%', maxHeight: 180 }, profileEmptyText: { textAlign: 'center', color: '#A89F9C', fontSize: 13, marginTop: 20 }, profileRecipeItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5EBE7' }, profileRecipeTitle: { flex: 1, fontSize: 14, color: '#3A2E2B', fontWeight: '600', paddingRight: 10 }, profileRecipeLikes: { fontSize: 13, color: '#FF6B6B', fontWeight: 'bold' }
});