import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function TutorialScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [hasAgreed, setHasAgreed] = useState(false);

  // 최종 시작 버튼 클릭 시 (동의 여부 확인 및 상태 저장)
  const handleStartApp = async () => {
    if (!hasAgreed) {
      Alert.alert("동의 필요", "안전 및 위생 면책 사항에 동의하셔야 서비스 이용이 가능합니다.");
      return;
    }
    try {
      await AsyncStorage.setItem('cookdex_has_agreed', 'true');
      router.replace('/(tabs)'); // 홈 화면으로 이동 (뒤로가기 불가하게 replace)
    } catch (e) {
      Alert.alert("오류", "설정 저장 중 문제가 발생했습니다.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.progressContainer}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={[styles.progressDot, step >= s && styles.progressDotActive]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* STEP 1: 기능 안내 */}
        {step === 1 && (
          <View style={styles.stepBox}>
            <Text style={styles.stepIcon}>📸</Text>
            <Text style={styles.stepTitle}>AI 카메라로 식재료 스캔</Text>
            <Text style={styles.stepDesc}>
              냉장고 속 남은 재료를 찍기만 하세요.{"\n"}
              Gemini AI가 당신의 양념장과 식단을 고려해{"\n"}
              최적의 레시피를 즉석에서 만들어 드립니다.
            </Text>
          </View>
        )}

        {/* STEP 2: 게이미피케이션 안내 */}
        {step === 2 && (
          <View style={styles.stepBox}>
            <Text style={styles.stepIcon}>📜</Text>
            <Text style={styles.stepTitle}>도파민 뿜뿜! 요리 미션</Text>
            <Text style={styles.stepDesc}>
              매일 주어지는 미션을 달성하고{"\n"}
              경험치(EXP)를 쌓아 '마스터 셰프'가 되어보세요.{"\n"}
              특별한 칭호를 획득하고 랭킹에 도전하세요!
            </Text>
          </View>
        )}

        {/* STEP 3: 법적 면책 동의 (가장 중요) */}
        {step === 3 && (
          <View style={styles.stepBox}>
            <Text style={styles.stepIcon}>⚖️</Text>
            <Text style={styles.stepTitle}>안전 및 위생 면책 동의</Text>
            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerText}>
                [필수 고지 사항]{"\n\n"}
                1. 본 AI가 제공하는 조리법 및 영양 정보는 참고용이며, 실제 식재료의 상태나 조리 환경에 따라 다를 수 있습니다.{"\n\n"}
                2. 식재료의 변질 여부 및 유통기한 확인은 사용자가 최종적으로 수행해야 하며, 식중독 예방 수칙을 반드시 준수하십시오.{"\n\n"}
                <Text style={{fontWeight: '900', color: '#FF8C00'}}>
                3. 조리 과정에서 발생하는 모든 안전사고(화상, 부상 등)나 식재료 위생 상태에 대한 최종 책임은 사용자 본인에게 있습니다.
                </Text>
              </Text>
            </View>
            
            <TouchableOpacity 
              style={styles.checkboxRow} 
              onPress={() => setHasAgreed(!hasAgreed)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, hasAgreed && styles.checkboxChecked]}>
                {hasAgreed && <Text style={{color: '#000', fontWeight: 'bold'}}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>위 모든 사항을 인지하였으며 동의합니다.</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      {/* 하단 버튼 제어 */}
      <View style={styles.footer}>
        {step < 3 ? (
          <TouchableOpacity style={styles.nextBtn} onPress={() => setStep(step + 1)}>
            <Text style={styles.nextBtnText}>다음으로 ▶</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.startBtn, !hasAgreed && { opacity: 0.5 }]} 
            onPress={handleStartApp}
          >
            <Text style={styles.startBtnText}>동의하고 쿡덱스 시작하기 ✨</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2A2421' },
  progressContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 60, gap: 10 },
  progressDot: { width: 40, height: 6, backgroundColor: '#4A3F3A', borderRadius: 3 },
  progressDotActive: { backgroundColor: '#FF8C00' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 30 },
  stepBox: { alignItems: 'center' },
  stepIcon: { fontSize: 80, marginBottom: 30 },
  stepTitle: { fontSize: 26, fontWeight: '900', color: '#FFFDF9', marginBottom: 20, textAlign: 'center' },
  stepDesc: { fontSize: 16, color: '#A89F9C', textAlign: 'center', lineHeight: 24, fontWeight: '500' },
  
  disclaimerBox: { backgroundColor: '#3A322F', padding: 20, borderRadius: 16, width: '100%', marginBottom: 20, borderWidth: 1, borderColor: '#4A3F3A' },
  disclaimerText: { color: '#E8D5D0', fontSize: 13, lineHeight: 20 },
  
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#FF8C00', marginRight: 10, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#FF8C00' },
  checkboxLabel: { color: '#FFFDF9', fontSize: 14, fontWeight: 'bold' },

  footer: { paddingHorizontal: 30, paddingBottom: 50, paddingTop: 20 },
  nextBtn: { backgroundColor: '#4A3F3A', paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  nextBtnText: { color: '#FFFDF9', fontSize: 16, fontWeight: 'bold' },
  startBtn: { backgroundColor: '#FF8C00', paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  startBtnText: { color: '#000', fontSize: 16, fontWeight: '900' }
});