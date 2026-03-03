// 파일 위치: app/(tabs)/profile.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../firebaseConfig';

const DIET_GOALS = ["다이어트(저칼로리) 🥗", "벌크업(고단백) 🥩", "비건(채식) 🌿", "저탄고지 🥑", "당뇨/혈당관리 📉"];
const COMMON_ALLERGIES = ["갑각류 🦐", "견과류 🥜", "우유/유제품 🥛", "계란 🥚", "밀가루 🍞", "복숭아 🍑"];

const calculateLevel = (exp) => {
  if (exp < 30) return { level: 1, title: "🍳 요리 쪼렙", nextExp: 30 };
  if (exp < 100) return { level: 2, title: "🔪 견습 요리사", nextExp: 100 };
  if (exp < 300) return { level: 3, title: "👨‍🍳 수석 셰프", nextExp: 300 };
  return { level: 'MAX', title: "👑 마스터 셰프", nextExp: exp };
};

export default function ProfileScreen() {
  const [userExp, setUserExp] = useState(0);
  const [userName, setUserName] = useState("셰프");
  
  // 식단 목표 관련 상태
  const [selectedDiet, setSelectedDiet] = useState("");
  const [customDiet, setCustomDiet] = useState("");

  // 알레르기 관련 상태
  const [selectedAllergies, setSelectedAllergies] = useState([]);
  const [customAllergy, setCustomAllergy] = useState("");

  useFocusEffect(
    useCallback(() => {
      const loadProfileData = async () => {
        try {
          const exp = await AsyncStorage.getItem('cookdex_user_exp');
          if (exp) setUserExp(parseInt(exp));

          const currentUser = auth.currentUser;
          if (currentUser) setUserName(currentUser.displayName || "익명 셰프");

          const savedDiet = await AsyncStorage.getItem('cookdex_diet_goal');
          if (savedDiet && savedDiet !== "없음") {
            setSelectedDiet(savedDiet);
          } else {
            setSelectedDiet("");
          }

          const savedAllergies = await AsyncStorage.getItem('cookdex_allergies');
          if (savedAllergies && savedAllergies !== "없음") {
            setSelectedAllergies(savedAllergies.split(', '));
          } else {
            setSelectedAllergies([]);
          }
        } catch (error) { console.error("프로필 로드 에러", error); }
      };
      loadProfileData();
    }, [])
  );

  // 식단 커스텀 입력
  const applyCustomDiet = () => {
    const diet = customDiet.trim();
    if (diet) {
      setSelectedDiet(diet);
    }
    setCustomDiet("");
  };

  // 알레르기 토글 및 커스텀 입력
  const toggleAllergy = (allergy) => {
    if (selectedAllergies.includes(allergy)) {
      setSelectedAllergies(prev => prev.filter(a => a !== allergy));
    } else {
      setSelectedAllergies(prev => [...prev, allergy]);
    }
  };

  const addCustomAllergy = () => {
    const newAllergy = customAllergy.trim();
    if (newAllergy && !selectedAllergies.includes(newAllergy)) {
      setSelectedAllergies(prev => [...prev, newAllergy]);
    }
    setCustomAllergy("");
  };

  // 저장
  const saveProfileSettings = async () => {
    try {
      const finalDiet = selectedDiet || "없음";
      await AsyncStorage.setItem('cookdex_diet_goal', finalDiet);
      
      const allergyStr = selectedAllergies.length > 0 ? selectedAllergies.join(', ') : "없음";
      await AsyncStorage.setItem('cookdex_allergies', allergyStr);
      
      Alert.alert("저장 완료! 💾", "맞춤 설정이 AI 셰프에게 완벽하게 전달되었습니다.");
    } catch (error) {
      Alert.alert("에러", "설정 저장에 실패했습니다.");
    }
  };

  const currentLevelInfo = calculateLevel(userExp);
  const expProgress = currentLevelInfo.level === 'MAX' ? 100 : (userExp / currentLevelInfo.nextExp) * 100;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        
        <Text style={styles.pageTitle}>내 정보 및 맞춤 설정 ⚙️</Text>

        <View style={styles.profileCard}>
          <Text style={styles.userName}>{userName}님</Text>
          <View style={styles.levelHeader}>
            <Text style={styles.levelTitle}>{currentLevelInfo.title} (Lv.{currentLevelInfo.level})</Text>
            <Text style={styles.expText}>{userExp} / {currentLevelInfo.level === 'MAX' ? 'MAX' : currentLevelInfo.nextExp} EXP</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${expProgress}%` }]} />
          </View>
          <Text style={styles.expHint}>* 레시피를 스캔하고 저장할 때마다 EXP가 오릅니다!</Text>
        </View>

        {/* 🚨 [요청 1 해결] 내 식단 목표 (직접 입력 추가) */}
        <View style={styles.settingSection}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5}}>
            <Text style={styles.sectionTitle}>🎯 내 식단 목표</Text>
            {selectedDiet ? (
              <TouchableOpacity onPress={() => setSelectedDiet("")} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>초기화</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={styles.sectionSub}>AI가 이 목표에 맞춰 레시피를 조정해 줍니다.</Text>
          
          <View style={styles.chipContainer}>
            {DIET_GOALS.map(diet => (
              <TouchableOpacity 
                key={diet} 
                style={[styles.chip, selectedDiet === diet && styles.chipActive]} 
                onPress={() => setSelectedDiet(diet)}
              >
                <Text style={[styles.chipText, selectedDiet === diet && styles.chipTextActive]}>{diet}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputRow}>
            <TextInput 
              style={styles.customInput} 
              placeholder="예: 저염식, 다이어트(직접 입력)" 
              placeholderTextColor="#A89F9C"
              value={customDiet}
              onChangeText={setCustomDiet}
              onSubmitEditing={applyCustomDiet}
            />
            <TouchableOpacity style={styles.addBtn} onPress={applyCustomDiet}>
              <Text style={styles.addBtnText}>적용</Text>
            </TouchableOpacity>
          </View>
          
          {/* 커스텀으로 입력된 다이어트 뱃지 표시 */}
          {selectedDiet && !DIET_GOALS.includes(selectedDiet) && (
             <View style={styles.selectedTagsContainer}>
                <TouchableOpacity style={styles.tagBadgeActive} onPress={() => setSelectedDiet("")}>
                  <Text style={styles.tagTextActive}>현재 적용됨: {selectedDiet} ✕</Text>
                </TouchableOpacity>
             </View>
          )}
        </View>

        {/* 알레르기 및 기피 식재료 */}
        <View style={styles.settingSection}>
          <Text style={styles.sectionTitle}>🚫 알레르기 및 기피 식재료</Text>
          <Text style={styles.sectionSub}>절대 레시피에 포함되지 않도록 AI에게 경고합니다.</Text>
          
          <View style={styles.chipContainer}>
            {COMMON_ALLERGIES.map(allergy => (
              <TouchableOpacity 
                key={allergy} 
                style={[styles.chip, selectedAllergies.includes(allergy) && styles.chipDangerActive]} 
                onPress={() => toggleAllergy(allergy)}
              >
                <Text style={[styles.chipText, selectedAllergies.includes(allergy) && styles.chipTextActive]}>{allergy}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputRow}>
            <TextInput 
              style={styles.customInput} 
              placeholder="기타 못 먹는 재료 (예: 오이, 고수)" 
              placeholderTextColor="#A89F9C"
              value={customAllergy}
              onChangeText={setCustomAllergy}
              onSubmitEditing={addCustomAllergy}
            />
            <TouchableOpacity style={styles.addBtn} onPress={addCustomAllergy}>
              <Text style={styles.addBtnText}>추가</Text>
            </TouchableOpacity>
          </View>

          {selectedAllergies.length > 0 && (
            <View style={styles.selectedTagsContainer}>
              {selectedAllergies.map(a => (
                <TouchableOpacity key={a} style={styles.tagBadgeDanger} onPress={() => toggleAllergy(a)}>
                  <Text style={styles.tagTextActive}>{a} ✕</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={saveProfileSettings}>
          <Text style={styles.saveButtonText}>맞춤 설정 저장하기 ✨</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2A2421' },
  scrollContent: { padding: 20, paddingBottom: 50 },
  pageTitle: { fontSize: 24, fontWeight: '900', color: '#FFFDF9', marginTop: Platform.OS === 'android' ? 40 : 20, marginBottom: 20 },
  
  profileCard: { backgroundColor: '#3A322F', borderRadius: 20, padding: 20, marginBottom: 30, borderWidth: 1, borderColor: '#4A3F3A', shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity: 0.2, shadowRadius: 5, elevation: 5 },
  userName: { fontSize: 20, fontWeight: 'bold', color: '#FFFDF9', marginBottom: 15 },
  levelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  levelTitle: { fontSize: 16, fontWeight: 'bold', color: '#FF8C00' },
  expText: { fontSize: 13, fontWeight: 'bold', color: '#A89F9C' },
  progressBarBg: { width: '100%', height: 12, backgroundColor: '#4A3F3A', borderRadius: 6, overflow: 'hidden', marginBottom: 10 },
  progressBarFill: { height: '100%', backgroundColor: '#FF8C00', borderRadius: 6 },
  expHint: { fontSize: 11, color: '#8C7A76', textAlign: 'right' },

  settingSection: { backgroundColor: '#3A322F', borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#4A3F3A' },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: '#FFFDF9', marginBottom: 5 },
  sectionSub: { fontSize: 12, color: '#A89F9C', marginBottom: 15 },
  clearBtn: { backgroundColor: '#5A4E49', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  clearBtnText: { color: '#E8D5D0', fontSize: 11, fontWeight: 'bold' },
  
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  chip: { backgroundColor: '#4A3F3A', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#5A4E49' },
  chipActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  chipDangerActive: { backgroundColor: '#E53935', borderColor: '#E53935' },
  chipText: { color: '#E8D5D0', fontSize: 13, fontWeight: 'bold' },
  chipTextActive: { color: '#fff', fontSize: 13, fontWeight: 'bold' },

  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  customInput: { flex: 1, backgroundColor: '#F9F5F3', borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12, fontSize: 14, color: '#3A2E2B' },
  addBtn: { backgroundColor: '#5A4E49', paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  
  selectedTagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5, padding: 10, backgroundColor: '#4A3F3A', borderRadius: 12 },
  tagBadgeDanger: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#E53935', borderRadius: 15 },
  tagBadgeActive: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#4CAF50', borderRadius: 15 },
  tagTextActive: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  saveButton: { backgroundColor: '#8E24AA', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginTop: 10, shadowColor: '#8E24AA', shadowOffset: {width:0, height:4}, shadowOpacity: 0.4, shadowRadius: 5, elevation: 5 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '900' }
});