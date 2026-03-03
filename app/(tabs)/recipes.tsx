// 파일 위치: app/(tabs)/recipes.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';

export default function RecipesScreen() {
  const [savedRecipes, setSavedRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

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
              {selectedRecipe && <Markdown style={markdownStyles}>{selectedRecipe.content}</Markdown>}
              <View style={{height: 30}}/>
            </ScrollView>

            <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteRecipe(selectedRecipe?.id)}>
              <Text style={styles.deleteBtnText}>🗑️ 이 레시피 삭제하기</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  deleteBtnText: { color: '#C62828', fontSize: 15, fontWeight: 'bold' }
});