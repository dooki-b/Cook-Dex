// 파일 위치: app/login.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../firebaseConfig';

const SAFE_NICKNAMES = ["예: 마늘 다지는 곰돌이", "예: 방구석 미슐랭", "예: 파송송 계란탁", "예: 후라이팬 요정", "예: 불맛 마스터"];

export default function LoginScreen() {
  const router = useRouter();
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState(''); 
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoLogin, setIsAutoLogin] = useState(true);
  const [randomPlaceholder, setRandomPlaceholder] = useState("");

  useEffect(() => {
    setRandomPlaceholder(SAFE_NICKNAMES[Math.floor(Math.random() * SAFE_NICKNAMES.length)]);
    const loadAutoLoginSetting = async () => {
      const savedSetting = await AsyncStorage.getItem('cookdex_auto_login');
      if (savedSetting !== null) setIsAutoLogin(JSON.parse(savedSetting));
    };
    loadAutoLoginSetting();
  }, []);

  const handleAuth = async () => {
    if (!email || !password) { Alert.alert("알림", "이메일과 비밀번호를 입력해주세요."); return; }
    setIsLoading(true);
    try {
      await AsyncStorage.setItem('cookdex_auto_login', JSON.stringify(isAutoLogin));
      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (!nickname) { Alert.alert("알림", "멋진 셰프 닉네임을 지어주세요!"); setIsLoading(false); return; }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: nickname });
        await setDoc(doc(db, "users", userCredential.user.uid), {
          email: userCredential.user.email, nickname: nickname, totalExp: 0, createdAt: new Date().toISOString()
        }, { merge: true });
        Alert.alert("환영합니다! 🎉", `${nickname} 셰프님의 주방이 열렸습니다!`);
      }
    } catch (error) {
      Alert.alert("로그인 실패", "이메일 또는 비밀번호를 확인해주세요.");
    } finally { setIsLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.logoText}>Cook-Dex</Text>
          <Text style={styles.subText}>{isLoginMode ? "나만의 AI 셰프를 만나보세요" : "요리의 여정을 시작하세요"}</Text>
        </View>

        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="이메일 주소" placeholderTextColor="#A89F9C" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
          <TextInput style={styles.input} placeholder="비밀번호 (6자리 이상)" placeholderTextColor="#A89F9C" secureTextEntry value={password} onChangeText={setPassword} />
          {!isLoginMode && (<TextInput style={styles.input} placeholder={randomPlaceholder} placeholderTextColor="#A89F9C" value={nickname} onChangeText={setNickname} />)}

          {/* 🚨 완벽한 모던 중앙 정렬 체크박스 적용 (유니코드 U+2714 사용) */}
      {isLoginMode && (
            <TouchableOpacity style={styles.checkboxContainer} onPress={() => setIsAutoLogin(!isAutoLogin)} activeOpacity={0.8}>
              <View style={[styles.checkbox, isAutoLogin && styles.checkboxChecked]}>
                {isAutoLogin && <Text style={styles.checkmark}>✔</Text>}
              </View>
              <Text style={styles.checkboxLabel}>자동 로그인</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.submitBtn} onPress={handleAuth} disabled={isLoading}>
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>{isLoginMode ? "로그인" : "셰프 등록하기"}</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.toggleBtn} onPress={() => setIsLoginMode(!isLoginMode)}>
            <Text style={styles.toggleBtnText}>{isLoginMode ? "아직 회원이 아니신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDF9' }, content: { flex: 1, justifyContent: 'center', paddingHorizontal: 30 },
  header: { alignItems: 'center', marginBottom: 50 }, logoText: { fontSize: 42, fontWeight: '900', color: '#FF8C00', marginBottom: 10 }, subText: { fontSize: 16, color: '#8C7A76', fontWeight: '600' },
  form: { width: '100%' }, input: { backgroundColor: '#F9F5F3', color: '#3A2E2B', paddingHorizontal: 20, paddingVertical: 18, borderRadius: 15, fontSize: 16, marginBottom: 15, borderWidth: 1, borderColor: '#E8D5D0' },
  
  // 🚨 정밀 정렬 체크박스 스타일 (폰트 패딩 제거 및 위치 조정)
  checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, alignSelf: 'flex-start', marginLeft: 5 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#FF8C00', justifyContent: 'center', alignItems: 'center', marginRight: 8, backgroundColor: '#FFFDF9' },
  checkboxChecked: { backgroundColor: '#FF8C00' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '900', textAlign: 'center', includeFontPadding: false, marginTop: Platform.OS === 'ios' ? 1 : -1 },
  checkboxLabel: { fontSize: 14, color: '#8C7A76', fontWeight: '600' },

  submitBtn: { backgroundColor: '#FF8C00', paddingVertical: 18, borderRadius: 15, alignItems: 'center', marginTop: 5, shadowColor: '#FF8C00', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }, submitBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }, toggleBtn: { marginTop: 20, alignItems: 'center', padding: 10 }, toggleBtnText: { color: '#8C7A76', fontSize: 14, fontWeight: 'bold', textDecorationLine: 'underline' }
});