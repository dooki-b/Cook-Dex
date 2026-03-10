import { Tabs, useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../firebaseConfig';
import { Colors, Radius, Shadows } from '../../constants/design-tokens';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
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
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // 🚨 유저가 없으면 앱 전체를 다크 테마 로그인 화면으로 덮어버림 (강제 차단)
  if (!user) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <View style={styles.authContent}>
          <Text style={styles.authTitle}>Cookdex</Text>
          <Text style={styles.authSubTitle}>당신만의 AI 수석 셰프를 만나보세요</Text>
          
          <View style={styles.authInputBox}>
            <TextInput
              style={styles.authInput}
              placeholder="이메일 주소"
              placeholderTextColor={Colors.textSub}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.authInput}
              placeholder="비밀번호 (6자리 이상)"
              placeholderTextColor={Colors.textSub}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            
            {isLoginLoading ? (
              <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: 15 }} />
            ) : (
              <View style={styles.authBtnRow}>
                <TouchableOpacity style={[styles.authBtn, styles.authBtnSecondary]} onPress={handleSignUp}>
                  <Text style={styles.authBtnText}>이메일 가입</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.authBtn, styles.authBtnPrimary]} onPress={handleLogin}>
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

          <TouchableOpacity style={[styles.socialBtn, styles.socialBtnGoogle]} onPress={() => handleSocialMock("Google")}>
            <Text style={[styles.socialBtnText, styles.socialBtnTextDark]}>Google로 계속하기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.socialBtn, styles.socialBtnKakao]} onPress={() => handleSocialMock("Kakao")}>
            <Text style={[styles.socialBtnText, styles.socialBtnTextDark]}>카카오로 계속하기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.socialBtn, styles.socialBtnApple]} onPress={() => handleSocialMock("Apple")}>
            <Text style={[styles.socialBtnText, styles.socialBtnTextLight]}>Apple로 계속하기</Text>
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
      tabBarActiveTintColor: Colors.primary, 
      tabBarInactiveTintColor: Colors.textSub,
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
      {/* 1. 홈 */}
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      {/* 2. 요리 광장 */}
      <Tabs.Screen
        name="plaza"
        options={{
          title: '요리 광장',
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" size={size} color={color} />,
        }}
      />
      {/* 3. 레시피 제작 (가운데 FAB → /create-recipe) */}
      <Tabs.Screen
        name="create"
        options={{
          title: '레시피 제작',
          tabBarButton: (props) => (
            <View style={styles.centerFabWrapper}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.centerFab}
                onPress={() => router.push('/create-recipe')}
              >
                <Ionicons name="add" size={28} color={Colors.textInverse} />
                <Text style={styles.centerFabLabel}>레시피 제작</Text>
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      {/* 4. 내 설정 */}
      <Tabs.Screen
        name="profile"
        options={{
          title: '내 설정',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
      {/* 5. 전체 메뉴 */}
      <Tabs.Screen
        name="menu"
        options={{
          title: '전체 메뉴',
          tabBarIcon: ({ color, size }) => <Ionicons name="menu-outline" size={size} color={color} />,
        }}
      />
      {/* 탭 바에 숨김: 전체 메뉴에서만 진입 */}
      <Tabs.Screen name="benefits" options={{ href: null }} />
      <Tabs.Screen name="recipes" options={{ href: null }} />
      <Tabs.Screen name="quest" options={{ href: null }} />
      <Tabs.Screen name="ranking" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.bgMain,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authContainer: {
    flex: 1,
    backgroundColor: Colors.bgMain,
  },
  authContent: {
    flex: 1,
    justifyContent: 'center',
    padding: 30,
  },
  authTitle: {
    fontSize: 40,
    fontWeight: '900',
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: 10,
  },
  authSubTitle: {
    fontSize: 16,
    color: Colors.textMain,
    textAlign: 'center',
    marginBottom: 40,
    fontWeight: 'bold',
  },
  authInputBox: {
    marginBottom: 30,
  },
  authInput: {
    backgroundColor: Colors.bgElevated,
    color: Colors.textMain,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 15,
    paddingVertical: 16,
    fontSize: 16,
    marginBottom: 12,
  },
  authBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  authBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  authBtnPrimary: {
    backgroundColor: Colors.primary,
    ...Shadows.glow,
  },
  authBtnSecondary: {
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  authBtnText: {
    color: Colors.textInverse,
    fontSize: 16,
    fontWeight: 'bold',
  },
  dividerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textSub,
    paddingHorizontal: 15,
    fontSize: 13,
    fontWeight: 'bold',
  },
  socialBtn: {
    paddingVertical: 14,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
  },
  socialBtnGoogle: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.08)',
  },
  socialBtnKakao: {
    backgroundColor: '#FEE500',
    borderColor: 'rgba(0,0,0,0.08)',
  },
  socialBtnApple: {
    backgroundColor: '#000000',
    borderColor: Colors.borderStrong,
  },
  socialBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  socialBtnTextDark: {
    color: '#000000',
  },
  socialBtnTextLight: {
    color: '#FFFFFF',
  },

  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 0,
    paddingTop: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 15,
  },
  homeBtnWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    top: -20,
  },
  homeBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: Colors.bgMain,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 6,
  },
  centerFabWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    top: -18,
  },
  centerFab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.bgElevated,
    ...Shadows.glow,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  centerFabLabel: {
    position: 'absolute',
    bottom: -18,
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
});