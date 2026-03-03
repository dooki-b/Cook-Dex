// 파일 위치: app/(tabs)/plaza.tsx
import { useFocusEffect } from 'expo-router';
import { collection, doc, getDocs, increment, limit, orderBy, query, updateDoc } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { db } from '../../firebaseConfig';

export default function PlazaScreen() {
  const [globalRecipes, setGlobalRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // 화면에 진입할 때마다 Firebase에서 최신 공유 레시피를 불러옵니다.
  useFocusEffect(
    useCallback(() => {
      fetchGlobalRecipes();
    }, [])
  );

  const fetchGlobalRecipes = async () => {
    setLoading(true);
    try {
      // 최신순으로 최대 30개의 레시피를 가져옵니다.
      const recipesRef = collection(db, "global_recipes");
      const q = query(recipesRef, orderBy("createdAt", "desc"), limit(30));
      const querySnapshot = await getDocs(q);
      
      const recipes = [];
      querySnapshot.forEach((doc) => {
        recipes.push({ id: doc.id, ...doc.data() });
      });
      
      setGlobalRecipes(recipes);
    } catch (error) {
      console.error("광장 레시피 로드 에러:", error);
    } finally {
      setLoading(false);
    }
  };

  // 좋아요 버튼 기능 (Firebase DB 업데이트 및 로컬 UI 반영)
  const handleLike = async (recipeId) => {
    try {
      // 로컬 UI 즉각 업데이트 (Optimistic UI)
      setGlobalRecipes(prev => 
        prev.map(recipe => 
          recipe.id === recipeId ? { ...recipe, likes: (recipe.likes || 0) + 1 } : recipe
        )
      );

      // DB 업데이트
      const recipeDocRef = doc(db, "global_recipes", recipeId);
      await updateDoc(recipeDocRef, {
        likes: increment(1)
      });
    } catch (error) {
      Alert.alert("에러", "좋아요를 반영하지 못했습니다.");
      // 실패 시 원래대로 되돌리는 로직이 필요할 수 있으나 피드 갱신으로 대체
      fetchGlobalRecipes(); 
    }
  };

  // 마크다운에서 '# 제목' 부분만 추출하는 함수
  const extractTitle = (content) => {
    const match = content.match(/#\s+(.*)/);
    return match ? match[1] : "이름 없는 요리";
  };

  // 날짜 포맷 변환 함수
  const formatDate = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 상단 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>요리 광장 🌍</Text>
        <Text style={styles.headerSub}>전 세계 셰프들의 AI 레시피 피드</Text>
      </View>

      {/* 로딩 상태 및 리스트 렌더링 */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#FF8C00" />
          <Text style={styles.loadingText}>광장 소식을 불러오는 중...</Text>
        </View>
      ) : globalRecipes.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyEmoji}>🌬️</Text>
          <Text style={styles.emptyText}>아직 공유된 레시피가 없습니다.</Text>
          <Text style={styles.emptySubText}>첫 번째로 레시피를 공유해 보세요!</Text>
        </View>
      ) : (
        <FlatList
          data={globalRecipes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.feedCard}>
              <TouchableOpacity 
                activeOpacity={0.8}
                onPress={() => { setSelectedRecipe(item); setModalVisible(true); }}
                style={styles.feedContent}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.authorBox}>
                    <Text style={styles.authorIcon}>👨‍🍳</Text>
                    <Text style={styles.authorName}>{item.authorName}</Text>
                  </View>
                  <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
                </View>
                <Text style={styles.cardTitle} numberOfLines={2}>{extractTitle(item.content)}</Text>
                <Text style={styles.cardPreview} numberOfLines={3}>
                  {item.content.replace(/#/g, '').replace(/\*/g, '').trim()}
                </Text>
              </TouchableOpacity>
              
              {/* 피드 하단 액션 바 (좋아요) */}
              <View style={styles.cardFooter}>
                <TouchableOpacity style={styles.likeBtn} onPress={() => handleLike(item.id)}>
                  <Text style={styles.likeIcon}>❤️</Text>
                  <Text style={styles.likeCount}>{item.likes || 0}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setSelectedRecipe(item); setModalVisible(true); }}>
                  <Text style={styles.readMoreText}>레시피 보기 →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* 상세 보기 바텀 모달 (내 주방과 동일한 UI) */}
      <Modal visible={modalVisible} transparent={true} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalAuthor}>{selectedRecipe?.authorName} 님의 레시피</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>닫기 ✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false} style={styles.markdownScroll}>
              {selectedRecipe && <Markdown style={markdownStyles}>{selectedRecipe.content}</Markdown>}
              <View style={{height: 40}}/>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// 기존 홈 화면/내 주방과 통일된 다크 테마 스타일
const markdownStyles = StyleSheet.create({ 
  body: { color: '#3A2E2B', fontSize: 15, lineHeight: 24 }, 
  heading1: { color: '#FF8C00', fontSize: 22, fontWeight: 'bold' }, 
  blockquote: { backgroundColor: '#F9F5F3', borderLeftWidth: 4, borderLeftColor: '#4CAF50', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5, marginVertical: 10 }
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2A2421' }, // 다크 배경
  header: { padding: 20, paddingTop: Platform.OS === 'android' ? 50 : 20, marginBottom: 10 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#FFFDF9', marginBottom: 5 },
  headerSub: { fontSize: 14, color: '#A89F9C' },
  
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#FF8C00', marginTop: 15, fontSize: 15, fontWeight: 'bold' },
  emptyEmoji: { fontSize: 50, marginBottom: 15 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#FFFDF9', marginBottom: 8 },
  emptySubText: { fontSize: 14, color: '#A89F9C', textAlign: 'center' },
  
  listContainer: { padding: 15, paddingBottom: 100 },
  feedCard: { backgroundColor: '#3A322F', borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: '#4A3F3A', shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 },
  feedContent: { padding: 20, paddingBottom: 15 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  authorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4A3F3A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  authorIcon: { fontSize: 14, marginRight: 5 },
  authorName: { fontSize: 13, color: '#FFFDF9', fontWeight: 'bold' },
  cardDate: { fontSize: 12, color: '#8C7A76', fontWeight: 'bold' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#FF8C00', marginBottom: 10, lineHeight: 24 },
  cardPreview: { fontSize: 13, color: '#A89F9C', lineHeight: 20 },
  
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderTopWidth: 1, borderTopColor: '#4A3F3A', backgroundColor: 'rgba(0,0,0,0.1)', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4A3F3A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
  likeIcon: { fontSize: 14, marginRight: 6 },
  likeCount: { color: '#FFFDF9', fontSize: 13, fontWeight: 'bold' },
  readMoreText: { color: '#FF8C00', fontSize: 13, fontWeight: 'bold' },

  // 상세 보기 모달 스타일 (내 주방과 유사하나 라이트 테마로 가독성 확보)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { height: '85%', backgroundColor: '#FFFDF9', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#E8D5D0' },
  modalAuthor: { fontSize: 16, fontWeight: '900', color: '#8E24AA' },
  closeBtn: { backgroundColor: '#F5EBE7', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15 },
  closeBtnText: { color: '#3A2E2B', fontSize: 13, fontWeight: 'bold' },
  markdownScroll: { flex: 1 }
});