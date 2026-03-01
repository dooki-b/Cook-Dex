// 파일 위치: app/(tabs)/mypage.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut } from 'firebase/auth'; // 🚨 로그아웃 모듈 추가
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Keyboard, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../../firebaseConfig';

const DB_SPICES = ["소금", "설탕", "간장", "고추장", "된장", "쌈장", "참기름", "들기름", "식초", "맛술", "올리고당", "물엿", "매실액", "케첩", "마요네즈", "굴소스", "멸치액젓", "까나리액젓", "다시다", "미원", "후추", "고춧가루", "파슬리", "바질", "카레가루", "버터"];
const DB_ALLERGIES = ["갑각류", "새우", "게", "오징어", "땅콩", "호두", "아몬드", "대두", "우유", "치즈", "계란", "밀가루", "생선", "조개", "굴", "복숭아", "토마토", "돼지고기", "소고기", "닭고기", "오이", "가지", "메밀"];
const DB_DIETS = ["다이어트", "벌크업", "유지어터", "저탄고지 (키토제닉)", "당뇨 식단", "저염식", "고단백", "비건 (완전채식)", "페스코 (해산물 허용)", "글루텐 프리", "간헐적 단식"];

const windowHeight = Dimensions.get('window').height;

const TagInputSection = ({ title, icon, desc, placeholder, dbList, selectedTags, setSelectedTags, onFocusScroll }) => {
  const [searchText, setSearchText] = useState("");
  const [sectionY, setSectionY] = useState(0); 

  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) setSelectedTags(prev => prev.filter(t => t !== tag));
    else setSelectedTags(prev => [...prev, tag]);
    setSearchText(""); 
  };
  const addCustomTag = () => {
    const newTag = searchText.trim();
    if (newTag && !selectedTags.includes(newTag)) setSelectedTags(prev => [...prev, newTag]);
    setSearchText("");
  };
  const filteredList = dbList.filter(item => item.includes(searchText) && !selectedTags.includes(item));

  return (
    <View style={styles.card} onLayout={(event) => setSectionY(event.nativeEvent.layout.y)}>
      <View style={styles.cardHeader}><Text style={styles.cardIcon}>{icon}</Text><Text style={styles.cardTitle}>{title}</Text></View>
      <Text style={styles.cardDesc}>{desc}</Text>
      {selectedTags.length > 0 && (
        <View style={styles.selectedTagsContainer}>
          {selectedTags.map((tag) => (<TouchableOpacity key={tag} style={styles.tagBadgeActive} onPress={() => toggleTag(tag)}><Text style={styles.tagTextActive}>{tag}  ✕</Text></TouchableOpacity>))}
        </View>
      )}
      <TextInput style={styles.inputBox} placeholder={placeholder} placeholderTextColor="#A89F9C" value={searchText} onChangeText={setSearchText} onFocus={() => onFocusScroll(sectionY)} onTouchStart={() => onFocusScroll(sectionY)} />
      {searchText.length > 0 && (
        <View style={styles.autocompleteContainer}>
          {filteredList.length > 0 ? (filteredList.slice(0, 8).map((tag) => (<TouchableOpacity key={tag} style={styles.tagBadge} onPress={() => toggleTag(tag)}><Text style={styles.tagText}>{tag} +</Text></TouchableOpacity>))) : (<TouchableOpacity style={styles.customAddBadge} onPress={addCustomTag}><Text style={styles.customAddText}>'{searchText}' 직접 추가하기 ➕</Text></TouchableOpacity>)}
        </View>
      )}
    </View>
  );
};

export default function MyPageScreen() {
  const [deviceId, setDeviceId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const scrollViewRef = useRef(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [selectedSpices, setSelectedSpices] = useState([]);
  const [selectedAllergies, setSelectedAllergies] = useState([]);
  const [selectedDiets, setSelectedDiets] = useState([]);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    const initializeAndLoad = async () => {
      try {
        let currentDeviceId = await AsyncStorage.getItem('cookdex_device_id');
        if (!currentDeviceId) {
          currentDeviceId = 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
          await AsyncStorage.setItem('cookdex_device_id', currentDeviceId);
        }
        setDeviceId(currentDeviceId);

        const localSpices = await AsyncStorage.getItem('cookdex_default_spices');
        const localAllergies = await AsyncStorage.getItem('cookdex_allergies_arr');
        const localDiets = await AsyncStorage.getItem('cookdex_diet_goal_arr');

        if (localSpices) setSelectedSpices(JSON.parse(localSpices));
        if (localAllergies) setSelectedAllergies(JSON.parse(localAllergies));
        if (localDiets) setSelectedDiets(JSON.parse(localDiets));

        const docRef = doc(db, "users", currentDeviceId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const cloudData = docSnap.data();
          if (cloudData.spices) { setSelectedSpices(cloudData.spices); await AsyncStorage.setItem('cookdex_default_spices', JSON.stringify(cloudData.spices)); }
          if (cloudData.allergiesArr) { setSelectedAllergies(cloudData.allergiesArr); await AsyncStorage.setItem('cookdex_allergies_arr', JSON.stringify(cloudData.allergiesArr)); }
          if (cloudData.dietsArr) { setSelectedDiets(cloudData.dietsArr); await AsyncStorage.setItem('cookdex_diet_goal_arr', JSON.stringify(cloudData.dietsArr)); }
          await AsyncStorage.setItem('cookdex_allergies', cloudData.allergiesArr ? cloudData.allergiesArr.join(', ') : '');
          await AsyncStorage.setItem('cookdex_diet_goal', cloudData.dietsArr ? cloudData.dietsArr.join(', ') : '');
        }
      } catch (error) { console.log("동기화 지연:", error); }
    };
    initializeAndLoad();
  }, []);

  const handleScrollToInput = (yPos) => {
    setTimeout(() => {
      if (scrollViewRef.current) {
        const targetY = Math.max(0, yPos - (windowHeight * 0.25));
        scrollViewRef.current.scrollTo({ y: targetY, animated: true });
      }
    }, 350);
  };

  const saveSettings = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await AsyncStorage.setItem('cookdex_default_spices', JSON.stringify(selectedSpices));
      await AsyncStorage.setItem('cookdex_allergies_arr', JSON.stringify(selectedAllergies));
      await AsyncStorage.setItem('cookdex_diet_goal_arr', JSON.stringify(selectedDiets));
      await AsyncStorage.setItem('cookdex_allergies', selectedAllergies.join(', '));
      await AsyncStorage.setItem('cookdex_diet_goal', selectedDiets.join(', '));

      if (deviceId) {
        const savePromise = setDoc(doc(db, "users", deviceId), {
          spices: selectedSpices, allergiesArr: selectedAllergies, dietsArr: selectedDiets, lastUpdated: new Date().toISOString()
        }, { merge: true });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000));
        await Promise.race([savePromise, timeoutPromise]);
      }
      Alert.alert("클라우드 저장 완료! ☁️👨‍🍳", "셰프님의 설정이 동기화되었습니다!");
    } catch (error) {
      if (error.message === "Timeout") Alert.alert("서버 지연", "로컬에 저장되었습니다.");
      else Alert.alert("서버 에러", "클라우드 저장 실패.");
    } finally { setIsSaving(false); }
  };

  // 🚨 로그아웃 함수
  const handleLogout = () => {
    Alert.alert("로그아웃", "정말 로그아웃 하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "로그아웃", style: "destructive", onPress: async () => { await signOut(auth); } }
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>⚙️ 나만의 셰프 설정</Text>
              <Text style={styles.headerSub}>여기에 입력한 정보는 클라우드에 자동 동기화됩니다!</Text>
            </View>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutText}>로그아웃</Text>
            </TouchableOpacity>
          </View>

          <TagInputSection title="우리집에 있는 향신료/양념장" icon="🧂" desc="집에 항상 구비되어 있는 양념장을 적어주세요." placeholder="🔍 양념장 검색 (예: 간장)" dbList={DB_SPICES} selectedTags={selectedSpices} setSelectedTags={setSelectedSpices} onFocusScroll={handleScrollToInput} />
          <TagInputSection title="알레르기 / 기피 식재료" icon="🚫" desc="절대 레시피에 들어가면 안 되는 식재료를 적어주세요." placeholder="🔍 식재료 검색 (예: 땅콩)" dbList={DB_ALLERGIES} selectedTags={selectedAllergies} setSelectedTags={setSelectedAllergies} onFocusScroll={handleScrollToInput} />
          <TagInputSection title="현재 식단 목표" icon="💪" desc="현재 다이어트 중이거나 벌크업 중이라면 알려주세요." placeholder="🔍 식단 검색 (예: 저탄고지)" dbList={DB_DIETS} selectedTags={selectedDiets} setSelectedTags={setSelectedDiets} onFocusScroll={handleScrollToInput} />

          <TouchableOpacity style={[styles.saveButton, isSaving && styles.saveButtonDisabled]} onPress={saveSettings} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>클라우드에 저장하기 ☁️</Text>}
          </TouchableOpacity>

          <View style={{ height: keyboardHeight > 0 ? keyboardHeight : 0 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDF9' }, scrollContent: { padding: 20, paddingBottom: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 30, marginBottom: 25 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#3A2E2B', marginBottom: 5 }, headerSub: { fontSize: 13, color: '#8C7A76', fontWeight: '600', maxWidth: '90%' },
  logoutBtn: { backgroundColor: '#F5EBE7', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E8D5D0' }, logoutText: { color: '#FF6B6B', fontSize: 12, fontWeight: 'bold' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 20, shadowColor: '#8C7A76', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 }, cardIcon: { fontSize: 22, marginRight: 10 }, cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#3A2E2B' }, cardDesc: { fontSize: 13, color: '#8C7A76', marginBottom: 15, lineHeight: 18 },
  selectedTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }, inputBox: { backgroundColor: '#F9F5F3', color: '#3A2E2B', paddingHorizontal: 15, paddingVertical: 14, borderRadius: 12, fontSize: 15, marginBottom: 10, borderWidth: 1, borderColor: '#E8D5D0' }, autocompleteContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 5, padding: 10, backgroundColor: '#F9F5F3', borderRadius: 10 }, tagBadge: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#E8D5D0' }, tagBadgeActive: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#FF8C00', borderRadius: 20, borderWidth: 1, borderColor: '#FF8C00' }, tagText: { color: '#8C7A76', fontSize: 13, fontWeight: 'bold' }, tagTextActive: { color: '#fff', fontSize: 13, fontWeight: 'bold' }, customAddBadge: { paddingVertical: 10, paddingHorizontal: 15, backgroundColor: '#FFF3E0', borderRadius: 10, borderWidth: 1, borderColor: '#FFB74D', width: '100%', alignItems: 'center' }, customAddText: { color: '#E65100', fontSize: 14, fontWeight: 'bold' },
  saveButton: { backgroundColor: '#FF8C00', paddingVertical: 18, borderRadius: 15, alignItems: 'center', marginTop: 10, shadowColor: '#FF8C00', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }, saveButtonDisabled: { backgroundColor: '#FFCC80', shadowOpacity: 0, elevation: 0 }, saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});