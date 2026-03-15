// 파일 위치: 최상위 폴더의 firebaseConfig.js
import { initializeApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import { getFirestore } from 'firebase/firestore';
// 🚨 React Native 전용 영구 저장 모듈 수입! (자동 로그인 핵심)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyD7SvVRGOnQDSo3aFHWV2KFolYqYoDMLEQ",
  authDomain: "cookdex.firebaseapp.com",
  projectId: "cookdex",
  storageBucket: "cookdex.firebasestorage.app",
  messagingSenderId: "318916867428",
  appId: "1:318916867428:web:62e33c63d4aa1170ec3671"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

// 🚨 getAuth 대신 initializeAuth를 사용하여 AsyncStorage에 세션을 '영구 박제' 합니다.
export let auth;

if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
}