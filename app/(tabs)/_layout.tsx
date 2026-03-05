import { Tabs } from 'expo-router';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';

export default function TabLayout() {
  const insets = useSafeAreaInsets(); // 기기별 하단 시스템 바 높이 자동 계산
  const [isInitializing, setIsInitializing] = useState(true);
  const [user, setUser] = useState(null);
  
  // 로그인 폼 상태
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoginLoading, setIsLoginLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (isInitializing) setIsInitializing(false);
    });
    return unsubscribe;
  }, [isInitializing]);

  const handleLogin = async () => {
    if (!email || !password) { Alert.alert("알림", "이메일과 비밀번호를 입력해주세요."); return; }
    setIsLoginLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) { Alert.alert("로그인 실패", "이메일이나 비밀번호를 확인해주세요."); } 
    finally { setIsLoginLoading(false); }
  };

  const handleSignUp = async () => {
    if (!email || !password) { Alert.alert("알림", "이메일과 비밀번호를 입력해주세요."); return; }
    if (password.length < 6) { Alert.alert("알림", "비밀번호는 6자리 이상이어야 합니다."); return; }
    setIsLoginLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      Alert.alert("가입 완료! 🎉", "쿡덱스의 셰프가 되신 것을 환영합니다.");
    } catch (error) { Alert.alert("회원가입 실패", error.message); } 
    finally { setIsLoginLoading(false); }
  };

  const handleSocialMock = (provider) => {
    Alert.alert("안내", `${provider} 소셜 로그인은 구글/애플 개발자 콘솔 세팅이 완료되는 스토어 등록 직전에 연동됩니다. 현재는 이메일 로그인을 이용해주세요!`);
  };

  if (isInitializing) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#FF8C00" /></View>;
  }

  // 🚨 유저가 없으면 앱 전체를 다크 테마 로그인 화면으로 덮어버림 (강제 차단)
  if (!user) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <View style={styles.authContent}>
          <Text style={styles.authTitle}>Cookdex 👨‍🍳</Text>
          <Text style={styles.authSubTitle}>당신만의 AI 수석 셰프를 만나보세요</Text>
          
          <View style={styles.authInputBox}>
            <TextInput style={styles.authInput} placeholder="이메일 주소" placeholderTextColor="#A89F9C" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <TextInput style={styles.authInput} placeholder="비밀번호 (6자리 이상)" placeholderTextColor="#A89F9C" secureTextEntry value={password} onChangeText={setPassword} />
            
            {isLoginLoading ? (
              <ActivityIndicator size="large" color="#FF8C00" style={{marginVertical: 15}} />
            ) : (
              <View style={styles.authBtnRow}>
                <TouchableOpacity style={[styles.authBtn, {backgroundColor: '#5A4E49'}]} onPress={handleSignUp}>
                  <Text style={styles.authBtnText}>이메일 가입</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.authBtn, {backgroundColor: '#FF8C00'}]} onPress={handleLogin}>
                  <Text style={styles.authBtnText}>로그인</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.dividerBox}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>또는 간편 로그인</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity style={[styles.socialBtn, {backgroundColor: '#fff'}]} onPress={() => handleSocialMock("Google")}>
            <Text style={[styles.socialBtnText, {color: '#000'}]}>Google로 계속하기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.socialBtn, {backgroundColor: '#FEE500'}]} onPress={() => handleSocialMock("Kakao")}>
            <Text style={[styles.socialBtnText, {color: '#000'}]}>카카오로 계속하기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.socialBtn, {backgroundColor: '#000', borderColor: '#4A3F3A', borderWidth: 1}]} onPress={() => handleSocialMock("Apple")}>
            <Text style={[styles.socialBtnText, {color: '#fff'}]}>Apple로 계속하기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 🚨 3개의 모던 플로팅 탭 바 렌더링 (광장 - 홈 - 프로필)
  return (
    <Tabs 
      initialRouteName="index"
      backBehavior="history"
      screenOptions={{ 
      headerShown: false, 
      tabBarActiveTintColor: '#FF8C00', 
      tabBarInactiveTintColor: '#A89F9C',
      tabBarShowLabel: true,
      tabBarLabelStyle: { fontSize: 11, fontWeight: 'bold', paddingBottom: 5 },
      tabBarHideOnKeyboard: true,
      tabBarStyle: [
        styles.tabBar,
        {
          height: 60 + insets.bottom, // 탭 바 높이를 줄여서 상단 여백 축소
          paddingBottom: insets.bottom + 5, // 아이콘 위치를 아래로 조정
          bottom: 0, // 플로팅 해제하고 바닥에 고정
        }
      ]
    }}>
      
      {/* 1. 좌측 탭: 요리 광장 */}
      <Tabs.Screen name="plaza" options={{ title: '요리 광장', tabBarIcon: ({color}) => <Text style={{fontSize: 20, color}}>🌍</Text> }} />
      
      {/* 2. 중앙 거대 플로팅 홈 버튼 */}
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: '홈', 
          tabBarIcon: () => (
            <View style={styles.homeBtnWrapper}>
              <View style={styles.homeBtn}>
                <Text style={{fontSize: 34}}>🏠</Text>
              </View>
            </View>
          ),
          tabBarLabel: () => null,
        }} 
      />
      
      {/* 3. 우측 탭: 프로필 */}
      <Tabs.Screen name="profile" options={{ title: '내 정보', tabBarIcon: ({color}) => <Text style={{fontSize: 20, color}}>⚙️</Text> }} />
      
      {/* 🚨 홈 화면의 퀵 메뉴를 통해서만 진입할 수 있도록 하단 탭 바에서는 숨김 처리 (href: null) */}
      <Tabs.Screen name="recipes" options={{ href: null }} />
      <Tabs.Screen name="quest" options={{ href: null }} />
      <Tabs.Screen name="ranking" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, backgroundColor: '#2A2421', justifyContent: 'center', alignItems: 'center' },
  authContainer: { flex: 1, backgroundColor: '#2A2421' },
  authContent: { flex: 1, justifyContent: 'center', padding: 30 },
  authTitle: { fontSize: 40, fontWeight: '900', color: '#FF8C00', textAlign: 'center', marginBottom: 10 },
  authSubTitle: { fontSize: 16, color: '#FFFDF9', textAlign: 'center', marginBottom: 40, fontWeight: 'bold' },
  authInputBox: { marginBottom: 30 },
  authInput: { backgroundColor: '#3A322F', color: '#FFFDF9', borderWidth: 1, borderColor: '#4A3F3A', borderRadius: 12, paddingHorizontal: 15, paddingVertical: 16, fontSize: 16, marginBottom: 12 },
  authBtnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  authBtn: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  authBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  dividerBox: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#4A3F3A' },
  dividerText: { color: '#8C7A76', paddingHorizontal: 15, fontSize: 13, fontWeight: 'bold' },
  socialBtn: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  socialBtnText: { fontSize: 16, fontWeight: 'bold' },
  
  tabBar: { 
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#3A322F', 
    borderTopLeftRadius: 30, // 레퍼런스처럼 상단 모서리만 둥글게
    borderTopRightRadius: 30,
    borderTopWidth: 0, 
    paddingTop: 5, // 상단 패딩을 줄여서 전체적으로 내려가게 함
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 }, // 그림자를 위쪽으로 쏴서 입체감 부여
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 15, // 안드로이드 겹침 방지 및 강한 그림자
  },
  homeBtnWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    top: -20, // 버튼 위치를 살짝 아래로 조정
  },
  homeBtn: {
    width: 76, // 크기 확대
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FF8C00',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#2A2421', // 뒷배경과 어우러지게 분리선 부여
    shadowColor: '#FF8C00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 6,
  },
});