import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { doc, getDoc, addDoc, collection, getDocs, query, orderBy, updateDoc, runTransaction, deleteDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Image, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../firebaseConfig';
import { Colors, Radius, Shadows } from '../constants/design-tokens';

type SourceType = 'plaza' | 'saved';

type PlazaRecipe = {
  id: string;
  content: string;
  authorId?: string;
  authorName?: string;
  createdAt?: string;
  likes?: number;
  ratingAvg?: number;
  reviewCount?: number;
  recipePhotoUrl?: string;
  servings?: number;
  estimatedMinutes?: number;
  difficulty?: string;
  relayFromId?: string;
  relayRootId?: string;
  relayDepth?: number;
};

type Review = {
  id: string;
  authorId?: string;
  authorName: string;
  rating: number;
  text: string;
  photoUrl?: string;
  photoUrls?: string[];
  createdAt: string;
  status?: string;
  hiddenAt?: string;
};

type SavedRecipe = {
  id: string;
  content: string;
  date: string;
};

type ParsedRecipeSections = {
  ingredients: string[];
  steps: string[];
  tips: string[];
};

// 부적절 후기 필터 (제출 전 체크)
// 정치/종교/욕설/일베/페미니즘 관련 과도한 논쟁·혐오 표현을 1차적으로 차단하기 위한 키워드 목록
// (정교한 필터는 아니며, 필요 시 계속 확장/조정 가능)
const INAPPROPRIATE_WORDS = [
  // 욕설/비방 (순화된 표현 위주로 기입)
  '욕설', '비방', '모욕', '욕하다', '쌍욕', '패드립',
  // 정치
  '정치', '좌파', '우파', '진보', '보수', '선거', '대통령', '국회의원',
  // 종교
  '종교', '교회', '목사', '신부', '신천지', '사이비',
  // 일베/극단 커뮤니티 관련
  '일베', '일간베스트', '워마드',
  // 급진 페미/젠더 갈등 키워드 (중립적 언급이 아닌 공격/비난 맥락 방지용)
  '페미니스트', '페미니즘', '한남', '된장녀', '메갈',
  // 스팸/홍보
  '광고', '스팸', '홍보 링크',
];

// 양념/조미료 판별을 위한 키워드 리스트 (간단 휴리스틱)
const SEASONING_KEYWORDS = [
  '소금',
  '설탕',
  '간장',
  '진간장',
  '고추장',
  '고춧가루',
  '참기름',
  '후추',
  '마요네즈',
  '된장',
  '식초',
  '액젓',
  '굴소스',
  '양념',
  '조미료',
  '소스',
];

const parseRecipeSections = (content: string): ParsedRecipeSections => {
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  let currentSection: 'none' | 'ingredients' | 'steps' | 'tips' = 'none';
  const ingredients: string[] = [];
  const steps: string[] = [];
  const tips: string[] = [];

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // 제목 헤더(#)는 스킵
    if (/^#\s+/.test(line)) continue;

    // 섹션 헤더 판별
    if (/^##\s+/.test(line)) {
      const lower = line.toLowerCase();
      if (lower.includes('재료')) {
        currentSection = 'ingredients';
      } else if (lower.includes('조리 순서') || lower.includes('조리순서') || lower.includes('만드는 법')) {
        currentSection = 'steps';
      } else if (lower.includes('요리 팁') || lower.includes('쿡덱스의 킥') || lower.includes('팁')) {
        currentSection = 'tips';
      } else {
        currentSection = 'none';
      }
      continue;
    }

    // 본문 내용 분류
    if (currentSection === 'ingredients') {
      const text = line.replace(/^[-*]\s*/, '');
      if (text) ingredients.push(text);
    } else if (currentSection === 'steps') {
      const text = line
        .replace(/^\d+\.\s*/, '')
        .replace(/^[-*]\s*/, '')
        .trim();
      if (text) steps.push(text);
    } else if (currentSection === 'tips') {
      const text = line.replace(/^[-*]\s*/, '');
      if (text) tips.push(text);
    }
  }

  return { ingredients, steps, tips };
};

export default function RecipeDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string; id?: string }>();
  const source = (params.source as SourceType) || 'saved';
  const recipeId = params.id as string | undefined;

  const [isLoading, setIsLoading] = useState(true);
  const [plazaRecipe, setPlazaRecipe] = useState<PlazaRecipe | null>(null);
  const [savedRecipe, setSavedRecipe] = useState<SavedRecipe | null>(null);
  const [showShoppingModal, setShowShoppingModal] = useState(false);
  const [measureModalVisible, setMeasureModalVisible] = useState(false);
  const [shoppingIngredients, setShoppingIngredients] = useState<string[]>([]);
  const [shareState, setShareState] = useState<'idle' | 'shared'>('idle');
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetail, setReportDetail] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [writeReviewVisible, setWriteReviewVisible] = useState(false);
  const [writeRating, setWriteRating] = useState(0);
  const [writeText, setWriteText] = useState('');
  const [writePhotos, setWritePhotos] = useState<string[]>([]);
  const [writeSubmitting, setWriteSubmitting] = useState(false);
  const [reviewSort, setReviewSort] = useState<'latest' | 'popular'>('latest');
  const [reviewPhotoOnly, setReviewPhotoOnly] = useState(false);
  const [reviewReportVisible, setReviewReportVisible] = useState(false);
  const [reportReviewId, setReportReviewId] = useState<string | null>(null);
  const [reviewReportReason, setReviewReportReason] = useState('');
  const [reviewReportDetail, setReviewReportDetail] = useState('');
  const [reviewReportSubmitting, setReviewReportSubmitting] = useState(false);
  const [otherChefsRecipes, setOtherChefsRecipes] = useState<{
    id: string;
    recipePhotoUrl?: string;
    authorName: string;
    title: string;
    ratingAvg?: number;
    reviewCount?: number;
  }[]>([]);
  const [relayChildren, setRelayChildren] = useState<{
    id: string;
    recipePhotoUrl?: string;
    authorName: string;
    title: string;
    ratingAvg?: number;
    reviewCount?: number;
  }[]>([]);
  const [showAllReviews, setShowAllReviews] = useState(false);

  const recipe = source === 'plaza' ? plazaRecipe : savedRecipe;

  useEffect(() => {
    const load = async () => {
      if (!recipeId) {
        setIsLoading(false);
        return;
      }

      try {
        if (source === 'plaza') {
          const snap = await getDoc(doc(db, 'global_recipes', recipeId));
          if (snap.exists()) {
            const data = snap.data() as any;
            setPlazaRecipe({
              id: snap.id,
              content: data.content || '',
              authorId: data.authorId,
              authorName: data.authorName,
              createdAt: data.createdAt,
              likes: data.likes,
              ratingAvg: data.ratingAvg,
              reviewCount: data.reviewCount ?? 0,
              recipePhotoUrl: data.recipePhotoUrl,
              servings: data.servings,
              estimatedMinutes: data.estimatedMinutes,
              difficulty: data.difficulty,
              relayFromId: data.relayFromId,
              relayRootId: data.relayRootId,
              relayDepth: data.relayDepth,
            });
            setReviewsLoading(true);
            try {
              const reviewsSnap = await getDocs(
                query(
                  collection(db, 'global_recipes', recipeId, 'reviews'),
                  orderBy('createdAt', 'desc')
                )
              );
              const list: Review[] = reviewsSnap.docs.map((d) => {
                const r = d.data() as any;
                const photoUrls = Array.isArray(r.photoUrls)
                  ? r.photoUrls
                  : r.photoUrl
                  ? [r.photoUrl]
                  : undefined;
                return {
                  id: d.id,
                  authorId: r.authorId,
                  authorName: r.authorName || '익명',
                  rating: typeof r.rating === 'number' ? r.rating : 0,
                  text: r.text || '',
                  photoUrl: photoUrls?.[0],
                  photoUrls,
                  createdAt: r.createdAt || '',
                  status: r.status || 'visible',
                  hiddenAt: r.hiddenAt || undefined,
                };
              });
              setReviews(list);
            } catch (_) {
              setReviews([]);
            } finally {
              setReviewsLoading(false);
            }
          } else {
            Alert.alert('알림', '해당 레시피를 찾을 수 없습니다.');
          }
        } else {
          const data = await AsyncStorage.getItem('cookdex_saved_recipes');
          if (data) {
            const list: SavedRecipe[] = JSON.parse(data);
            const found = list.find(r => r.id === recipeId);
            if (found) {
              setSavedRecipe(found);
            } else {
              Alert.alert('알림', '해당 레시피를 찾을 수 없습니다.');
            }
          }
        }
      } catch (e: any) {
        Alert.alert('에러', '레시피를 불러오지 못했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [recipeId, source]);

  const extractTitle = (content: string) => {
    const match = content.match(/#\s+(.*)/);
    return match ? match[1] : '이름 없는 요리';
  };

  const handleSaveToMyKitchen = async () => {
    if (!recipe) return;
    if (source === 'saved') {
      Alert.alert('알림', '이미 내 주방에 저장된 레시피입니다.');
      return;
    }

    try {
      const existingData = await AsyncStorage.getItem('cookdex_saved_recipes');
      const savedRecipes = existingData ? JSON.parse(existingData) : [];

      if (savedRecipes.some((r: any) => r.id === recipe.id)) {
        Alert.alert('알림', '이미 내 주방에 저장된 레시피입니다.');
        return;
      }

      const newRecipe = {
        id: recipe.id,
        date: new Date().toLocaleDateString(),
        content: recipe.content,
      };

      savedRecipes.unshift(newRecipe);
      await AsyncStorage.setItem('cookdex_saved_recipes', JSON.stringify(savedRecipes));
      Alert.alert('스크랩 완료! 📥', '이 레시피가 내 주방에 저장되었습니다.');
    } catch (e) {
      Alert.alert('에러', '저장에 실패했습니다.');
    }
  };

  const handleShareToPlaza = async () => {
    if (!recipe) return;
    if (source === 'plaza') {
      Alert.alert('알림', '이미 요리 광장에 있는 레시피입니다.');
      return;
    }

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert('로그인 필요', '요리 광장에 공유하려면 로그인해 주세요.');
        return;
      }

      const recipePhotoUrl: string | null = await new Promise((resolve) => {
        Alert.alert(
          '완성 요리 사진 필요',
          '완성된 레시피의 실제 요리 사진을 찍으시면 광장에 공유하실 수 있습니다!\n\n공유를 위해 촬영해주세요.',
          [
            {
              text: '취소하기',
              style: 'cancel',
              onPress: () => resolve(null),
            },
            {
              text: '촬영하기',
              onPress: async () => {
                try {
                  const { status } = await ImagePicker.requestCameraPermissionsAsync();
                  if (status !== 'granted') {
                    Alert.alert('권한 필요', '완성 요리 사진을 찍기 위해 카메라 권한을 허용해 주세요.');
                    resolve(null);
                    return;
                  }
                  const result = await ImagePicker.launchCameraAsync({
                    allowsEditing: true,
                    quality: 0.8,
                  });
                  if (result.canceled || !result.assets || result.assets.length === 0) {
                    resolve(null);
                    return;
                  }
                  const uri = result.assets[0].uri;
                  try {
                    const response = await fetch(uri);
                    const blob = await response.blob();
                    const storageRef = ref(
                      storage,
                      `recipePhotos/${recipeId || 'no-id'}/${currentUser.uid}-${Date.now()}.jpg`,
                    );
                    await uploadBytes(storageRef, blob);
                    const url = await getDownloadURL(storageRef);
                    resolve(url);
                  } catch (err) {
                    console.log('share recipe photo upload error', err);
                    Alert.alert(
                      '안내',
                      '사진을 서버에 업로드하지는 못했지만, 이 기기에서는 완성 사진이 함께 보이도록 공유할게요.',
                    );
                    resolve(uri);
                  }
                } catch (e) {
                  console.log('share recipe photo upload error', e);
                  Alert.alert(
                    '안내',
                    '사진을 서버에 업로드하지는 못했지만, 이 기기에서는 완성 사진이 함께 보이도록 공유할게요.',
                  );
                  resolve(null);
                }
              },
            },
          ],
          { cancelable: true },
        );
      });

      if (!recipePhotoUrl) {
        // 사용자가 취소했거나 업로드 실패
        return;
      }

      await addDoc(collection(db, 'global_recipes'), {
        content: recipe.content,
        authorId: currentUser.uid,
        authorName: currentUser.displayName || '익명 셰프',
        createdAt: new Date().toISOString(),
        likes: 0,
        recipePhotoUrl,
      });

      setShareState('shared');
      Alert.alert('셰프님의 요리가 광장에 게시되었습니다! 🎉', '요리 광장에서 다른 셰프들과 함께 공유되었어요.');
    } catch (e) {
      Alert.alert('에러', '공유에 실패했습니다.');
    }
  };

  const handleStyleChange = () => {
    if (!recipe) return;
    const title = extractTitle(recipe.content);
    const parsed = parseRecipeSections(recipe.content);
    const baseIngredients = parsed.ingredients
      .map(raw => raw.split('|')[0].replace(/^[-*]\s*/, '').trim())
      .filter(Boolean)
      .join(',');
    const params: Record<string, string> = { forkFrom: title, relayIngredients: baseIngredients };
    if (source === 'plaza' && recipeId) {
      const plaza = recipe as PlazaRecipe;
      params.relayParentId = recipeId;
      params.relayRootId = plaza.relayRootId ?? recipeId;
      params.relayDepth = String((plaza.relayDepth ?? 0) + 1);
    }
    router.push({
      pathname: '/create-recipe',
      params,
    });
  };

  const handleStartTTS = () => {
    if (!recipe) return;
    const content = recipe.content;
    const steps = content
      .split('\n')
      .filter(line => /^\d+\.\s/.test(line.trim()))
      .map(line =>
        line
          .replace(/^\d+\.\s/, '')
          .replace(/\*\*/g, '')
          .trim(),
      );
    const textToRead = steps.length > 0 ? steps.join(' 다음, ') : content.replace(/#/g, '').replace(/\*/g, '');
    Speech.stop();
    Speech.speak(textToRead, { language: 'ko-KR', rate: 0.95 });
  };

  const handleOpenShopping = () => {
    if (!recipe) return;
    const parsed = parseRecipeSections(recipe.content);
    const ingredients = parsed.ingredients
      .map(raw => raw.split('|')[0].replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
    if (ingredients.length === 0) {
      Alert.alert('알림', '인식된 재료가 없습니다.');
      return;
    }
    setShoppingIngredients(ingredients);
    setShowShoppingModal(true);
  };

  const handleShoppingItemPress = (name: string) => {
    const coupangSearchUrl = `https://m.coupang.com/nm/search?q=${encodeURIComponent(name)}`;
    Linking.openURL(coupangSearchUrl).catch(() => {
      Alert.alert('에러', '쇼핑몰 페이지를 열지 못했습니다.');
    });
  };

  const handleOpenReport = () => {
    setMenuVisible(false);
    setReportModalVisible(true);
    setReportReason('');
    setReportDetail('');
  };

  const handleSubmitReport = async () => {
    if (!recipeId || source !== 'plaza' || !auth.currentUser) return;
    const detail = reportDetail.trim();
    if (!detail) {
      Alert.alert('알림', '신고 내용을 입력해 주세요.');
      return;
    }
    setReportSubmitting(true);
    try {
      await addDoc(collection(db, 'reports'), {
        recipeId,
        reporterId: auth.currentUser.uid,
        reason: reportReason || '기타',
        detail,
        createdAt: new Date().toISOString(),
        status: 'pending',
      });
      setReportModalVisible(false);
      Alert.alert('접수 완료', '신고가 접수되었습니다. 검토 후 조치하겠습니다.');
    } catch (e) {
      Alert.alert('오류', '신고 제출에 실패했습니다.');
    } finally {
      setReportSubmitting(false);
    }
  };

  const hasInappropriateText = (text: string) =>
    INAPPROPRIATE_WORDS.some((w) => text.trim().toLowerCase().includes(w.toLowerCase()));

  const handleOpenWriteReview = () => {
    if (!auth.currentUser) {
      Alert.alert('로그인 필요', '요리 후기를 남기려면 로그인해 주세요.');
      return;
    }
    setWriteRating(0);
    setWriteText('');
    setWritePhotos([]);
    setWriteReviewVisible(true);
  };

  const hasWriteDraft = () =>
    writeText.trim().length > 0 || writePhotos.length > 0;

  const requestCloseWriteReview = () => {
    if (!hasWriteDraft()) {
      setWriteReviewVisible(false);
      setWriteRating(0);
      setWriteText('');
      setWritePhotos([]);
      return;
    }
    Alert.alert(
      '작성중인 후기가 있어요!',
      '창을 닫으시면 해당 내용이 저장되지 않습니다!',
      [
        {
          text: '계속 작성',
          style: 'cancel',
        },
        {
          text: '네, 취소',
          style: 'destructive',
          onPress: () => {
            setWriteReviewVisible(false);
            setWriteRating(0);
            setWriteText('');
            setWritePhotos([]);
          },
        },
      ],
    );
  };

  useEffect(() => {
    if (!writeReviewVisible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      requestCloseWriteReview();
      return true;
    });
    return () => sub.remove();
  }, [writeReviewVisible, writeText, writePhotos]);

  useEffect(() => {
    const loadOtherChefs = async () => {
      if (!recipeId || source !== 'plaza' || !plazaRecipe?.content) return;
      try {
        const qSnap = await getDocs(
          query(collection(db, 'global_recipes'), orderBy('createdAt', 'desc')),
        );
        const baseSections = parseRecipeSections(plazaRecipe.content);
        const baseIngredients = baseSections.ingredients
          .map(raw => raw.split('|')[0].replace(/^[-*]\s*/, '').trim())
          .filter(Boolean);
        const baseSet = new Set(baseIngredients);
        const others = qSnap.docs
          .filter((d) => d.id !== recipeId)
          .map((d) => {
            const r = d.data() as any;
            if (!r.content || !r.recipePhotoUrl) return null;
            const contentStr = r.content as string;
            const sections = parseRecipeSections(contentStr);
            const ingNames = sections.ingredients
              .map((raw) => raw.split('|')[0].replace(/^[-*]\s*/, '').trim())
              .filter(Boolean);
            const overlap = ingNames.reduce(
              (cnt, name) => (baseSet.has(name) ? cnt + 1 : cnt),
              0,
            );
            if (overlap === 0) return null;
            return {
              id: d.id,
              recipePhotoUrl: r.recipePhotoUrl as string | undefined,
              authorName: (r.authorName as string) || '익명 셰프',
              title: extractTitle(contentStr),
              ratingAvg: typeof r.ratingAvg === 'number' ? r.ratingAvg : undefined,
              reviewCount: typeof r.reviewCount === 'number' ? r.reviewCount : undefined,
              overlap,
              createdAt: r.createdAt as string | undefined,
            };
          })
          .filter((x) => x)
          .map(
            (x) =>
              x as {
                id: string;
                recipePhotoUrl?: string;
                authorName: string;
                title: string;
                ratingAvg?: number;
                reviewCount?: number;
                overlap: number;
                createdAt?: string;
              },
          )
          .sort((a, b) => {
            if (b.overlap !== a.overlap) return b.overlap - a.overlap;
            const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
            const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
            return tb - ta;
          })
          .slice(0, 4)
          .map(({ overlap, createdAt, ...rest }) => rest);
        setOtherChefsRecipes(others);
      } catch (e) {
        setOtherChefsRecipes([]);
      }
    };
    loadOtherChefs();
  }, [recipeId, source, plazaRecipe?.content]);

  useEffect(() => {
    const loadRelayChildren = async () => {
      if (!recipeId || source !== 'plaza') return;
      try {
        const qSnap = await getDocs(
          query(collection(db, 'global_recipes'), where('relayFromId', '==', recipeId)),
        );
        const children = qSnap.docs
          .map((d) => {
            const r = d.data() as any;
            return {
              id: d.id,
              recipePhotoUrl: r.recipePhotoUrl as string | undefined,
              authorName: (r.authorName as string) || '익명 셰프',
              title: typeof r.content === 'string' ? extractTitle(r.content) : '',
              ratingAvg: typeof r.ratingAvg === 'number' ? r.ratingAvg : undefined,
              reviewCount: typeof r.reviewCount === 'number' ? r.reviewCount : undefined,
              createdAt: r.createdAt as string | undefined,
            };
          })
          .sort((a, b) => {
            const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
            const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
            return tb - ta;
          })
          .map(({ createdAt, ...rest }) => rest);
        setRelayChildren(children);
      } catch (e) {
        setRelayChildren([]);
      }
    };
    loadRelayChildren();
  }, [recipeId, source]);

  const handlePickReviewPhoto = async () => {
    if (writePhotos.length >= 5) {
      Alert.alert('알림', '사진은 최대 5개까지 업로드할 수 있어요.');
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '사진 업로드를 위해 사진 접근 권한을 허용해 주세요.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      setWritePhotos((prev) => [...prev, uri]);
    }
  };

  const handleRemoveReviewPhoto = (uri: string) => {
    setWritePhotos((prev) => prev.filter((p) => p !== uri));
  };

  const handleSubmitReview = async () => {
    if (!recipeId || source !== 'plaza' || !auth.currentUser) return;
    if (writeRating < 1 || writeRating > 5) {
      Alert.alert('알림', '별점을 1~5점 사이로 선택해 주세요.');
      return;
    }
    const text = writeText.trim();
    if (!text) {
      Alert.alert('알림', '후기 내용을 입력해 주세요.');
      return;
    }
    const isHiddenBySafeBot = hasInappropriateText(text);
    if (isHiddenBySafeBot) {
      Alert.alert(
        '세이프봇 안내',
        '쿡덱스 세이프봇이 정치/종교/욕설/혐오 표현을 감지해 이 후기를 블라인드 처리했어요.\n\n다른 셰프들에게는 내용이 보이지 않지만, 기록용으로만 저장됩니다.',
      );
    }
    setWriteSubmitting(true);
    try {
      let uploadedPhotoUrls: string[] | undefined;
      if (writePhotos.length > 0) {
        uploadedPhotoUrls = [];
        for (let i = 0; i < writePhotos.length; i++) {
          const uri = writePhotos[i];
          try {
            const response = await fetch(uri);
            const blob = await response.blob();
            const storageRef = ref(
              storage,
              `reviewPhotos/${recipeId}/${auth.currentUser!.uid}-${Date.now()}-${i}.jpg`,
            );
            await uploadBytes(storageRef, blob);
            const downloadUrl = await getDownloadURL(storageRef);
            uploadedPhotoUrls.push(downloadUrl);
          } catch (e) {
            console.log('review photo upload error', e);
            // 업로드 실패 시 해당 사진만 무시
          }
        }
        if (uploadedPhotoUrls.length === 0) {
          uploadedPhotoUrls = undefined;
        }
      }
      // 개발 환경 또는 Storage 설정 문제로 업로드에 실패한 경우에도
      // 로컬 URI를 그대로 Firestore에 저장해 앱 내에서는 사진이 보이도록 처리
      if (!uploadedPhotoUrls && writePhotos.length > 0) {
        uploadedPhotoUrls = [...writePhotos];
      }
      const recipeRef = doc(db, 'global_recipes', recipeId);
      const reviewsRef = collection(db, 'global_recipes', recipeId, 'reviews');
      await runTransaction(db, async (tx) => {
        const recipeSnap = await tx.get(recipeRef);
        const data = recipeSnap.data() || {};
        const prevCount = data.reviewCount ?? 0;
        const prevAvg = data.ratingAvg ?? 0;
        const newCount = prevCount + 1;
        const newAvg = prevCount === 0 ? writeRating : (prevAvg * prevCount + writeRating) / newCount;
        const newReview: any = {
          authorId: auth.currentUser!.uid,
          authorName: auth.currentUser!.displayName || '익명',
          rating: writeRating,
          text,
          createdAt: new Date().toISOString(),
          status: isHiddenBySafeBot ? 'hidden_by_safe_bot' : 'visible',
          hiddenAt: isHiddenBySafeBot ? new Date().toISOString() : null,
        };
        if (uploadedPhotoUrls && uploadedPhotoUrls.length > 0) {
          newReview.photoUrls = uploadedPhotoUrls;
        }
        const newReviewRef = doc(reviewsRef);
        tx.set(newReviewRef, newReview);
        tx.update(recipeRef, { reviewCount: newCount, ratingAvg: Math.round(newAvg * 10) / 10 });
      });
      const reviewsSnap = await getDocs(
        query(collection(db, 'global_recipes', recipeId, 'reviews'), orderBy('createdAt', 'desc'))
      );
      const list: Review[] = reviewsSnap.docs.map((d) => {
        const r = d.data() as any;
        const photoUrls = Array.isArray(r.photoUrls)
          ? r.photoUrls
          : r.photoUrl
          ? [r.photoUrl]
          : undefined;
        return {
          id: d.id,
          authorId: r.authorId,
          authorName: r.authorName || '익명',
          rating: typeof r.rating === 'number' ? r.rating : 0,
          text: r.text || '',
          photoUrl: photoUrls?.[0],
          photoUrls,
          createdAt: r.createdAt || '',
          status: r.status || 'visible',
          hiddenAt: r.hiddenAt || undefined,
        };
      });
      setReviews(list);
      setPlazaRecipe((prev) => {
        if (!prev) return null;
        const n = (prev.reviewCount ?? 0) + 1;
        const avg = n === 1 ? writeRating : ((prev.ratingAvg ?? 0) * (prev.reviewCount ?? 0) + writeRating) / n;
        return { ...prev, reviewCount: n, ratingAvg: Math.round(avg * 10) / 10 };
      });
      setWriteReviewVisible(false);
      setWriteRating(0);
      setWriteText('');
      setWritePhotos([]);
      Alert.alert('작성 완료', '요리 후기가 등록되었습니다.');
    } catch (e: any) {
      console.log('handleSubmitReview error', e);
      let message = '후기 등록에 실패했습니다.';
      if (e?.code) {
        message += `\n\n코드: ${e.code}`;
      } else if (e?.message) {
        message += `\n\n${e.message}`;
      }
      Alert.alert('오류', message);
    } finally {
      setWriteSubmitting(false);
    }
  };

  const handleOpenReviewReport = (reviewId: string) => {
    setReportReviewId(reviewId);
    setReviewReportReason('');
    setReviewReportDetail('');
    setReviewReportVisible(true);
  };

  const handleDeleteOwnReview = (reviewId: string, rating: number) => {
    if (!recipeId || source !== 'plaza' || !auth.currentUser) return;
    Alert.alert('후기 삭제', '내가 작성한 후기를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            const recipeRef = doc(db, 'global_recipes', recipeId);
            const reviewRef = doc(db, 'global_recipes', recipeId, 'reviews', reviewId);
            await runTransaction(db, async (tx) => {
              const recipeSnap = await tx.get(recipeRef);
              const data = recipeSnap.data() || {};
              const prevCount = data.reviewCount ?? 0;
              const prevAvg = data.ratingAvg ?? 0;
              const newCount = Math.max(prevCount - 1, 0);
              const newAvg =
                newCount === 0
                  ? 0
                  : Math.max(
                      0,
                      (prevAvg * prevCount - rating) / newCount,
                    );
              tx.delete(reviewRef);
              tx.update(recipeRef, {
                reviewCount: newCount,
                ratingAvg: Math.round(newAvg * 10) / 10,
              });
            });
            const reviewsSnap = await getDocs(
              query(collection(db, 'global_recipes', recipeId, 'reviews'), orderBy('createdAt', 'desc'))
            );
            const list: Review[] = reviewsSnap.docs.map((d) => {
              const r = d.data();
              const photoUrls = Array.isArray((r as any).photoUrls)
                ? (r as any).photoUrls
                : (r as any).photoUrl
                ? [(r as any).photoUrl]
                : undefined;
              return {
                id: d.id,
                authorId: (r as any).authorId,
                authorName: (r as any).authorName || '익명',
                rating: typeof (r as any).rating === 'number' ? (r as any).rating : 0,
                text: (r as any).text || '',
                photoUrl: photoUrls?.[0],
                photoUrls,
                createdAt: (r as any).createdAt || '',
              };
            });
            setReviews(list);
            setPlazaRecipe((prev) => {
              if (!prev) return null;
              const n = (prev.reviewCount ?? 0) - 1;
              if (n <= 0) {
                return { ...prev, reviewCount: 0, ratingAvg: 0 };
              }
              // ratingAvg는 트랜잭션에서 이미 업데이트되므로, 여기서는 count만 맞춰 줌
              return { ...prev, reviewCount: n };
            });
            Alert.alert('삭제 완료', '후기가 삭제되었습니다.');
          } catch (e: any) {
            console.log('delete review error', e);
            Alert.alert('오류', '후기 삭제에 실패했습니다.');
          }
        },
      },
    ]);
  };

  const handleSubmitReviewReport = async () => {
    if (!reportReviewId || !recipeId || !auth.currentUser) return;
    const detail = reviewReportDetail.trim();
    if (!detail) {
      Alert.alert('알림', '신고 내용을 입력해 주세요.');
      return;
    }
    setReviewReportSubmitting(true);
    try {
      await addDoc(collection(db, 'review_reports'), {
        reviewId: reportReviewId,
        recipeId,
        reporterId: auth.currentUser.uid,
        reason: reviewReportReason || '기타',
        detail,
        createdAt: new Date().toISOString(),
        status: 'pending',
      });
      setReviewReportVisible(false);
      setReportReviewId(null);
      Alert.alert('접수 완료', '신고가 접수되었습니다.');
    } catch (e) {
      Alert.alert('오류', '신고 제출에 실패했습니다.');
    } finally {
      setReviewReportSubmitting(false);
    }
  };

  const handleDeleteRecipe = async () => {
    if (!recipeId) return;
    Alert.alert('삭제 확인', '이 레시피를 내 주방에서 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            const data = await AsyncStorage.getItem('cookdex_saved_recipes');
            if (!data) {
              router.back();
              return;
            }
            const list: SavedRecipe[] = JSON.parse(data);
            const next = list.filter(r => r.id !== recipeId);
            await AsyncStorage.setItem('cookdex_saved_recipes', JSON.stringify(next));
            Alert.alert('삭제 완료', '레시피가 삭제되었습니다.');
            router.back();
          } catch (e) {
            Alert.alert('에러', '레시피 삭제에 실패했습니다.');
          }
        },
      },
    ]);
  };

  const handleChangeRecipePhoto = async () => {
    if (source !== 'plaza' || !recipeId || !plazaRecipe) return;
    const currentUser = auth.currentUser;
    if (!currentUser || plazaRecipe.authorId && plazaRecipe.authorId !== currentUser.uid) {
      Alert.alert('알림', '내가 올린 레시피에서만 사진을 수정할 수 있어요.');
      return;
    }
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '완성 요리 사진을 수정하려면 카메라 권한을 허용해 주세요.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }
      const uri = result.assets[0].uri;
      const response = await fetch(uri);
      const blob = await response.blob();
      const storageRef = ref(
        storage,
        `recipePhotos/${recipeId}/${currentUser.uid}-${Date.now()}-updated.jpg`,
      );
      await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'global_recipes', recipeId), {
        recipePhotoUrl: downloadUrl,
      });
      setPlazaRecipe((prev) =>
        prev
          ? {
              ...prev,
              recipePhotoUrl: downloadUrl,
            }
          : prev,
      );
      Alert.alert('완료', '완성 요리 사진이 수정되었습니다.');
    } catch (e) {
      Alert.alert('오류', '사진 수정에 실패했습니다. 네트워크를 확인해 주세요.');
    } finally {
      setMenuVisible(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!recipe) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <Text style={styles.emptyText}>레시피 정보를 불러올 수 없습니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const title = extractTitle(recipe.content);
  const dateLabel =
    source === 'plaza'
      ? (recipe as PlazaRecipe).createdAt
        ? new Date((recipe as PlazaRecipe).createdAt!).toLocaleDateString()
        : ''
      : (recipe as SavedRecipe).date;

  const servings =
    source === 'plaza' ? (recipe as PlazaRecipe).servings ?? 2 : 2;
  const estimatedMinutes =
    source === 'plaza' ? (recipe as PlazaRecipe).estimatedMinutes ?? 20 : 20;
  const difficulty =
    source === 'plaza' ? (recipe as PlazaRecipe).difficulty ?? '보통' : '보통';

  const sections = parseRecipeSections(recipe.content);
  const hasStructuredSections =
    sections.ingredients.length > 0 || sections.steps.length > 0 || sections.tips.length > 0;

  const isPlazaOwner =
    source === 'plaza' &&
    (recipe as PlazaRecipe).authorId &&
    auth.currentUser &&
    (recipe as PlazaRecipe).authorId === auth.currentUser.uid;

  const visibleReviews = (() => {
    const base = reviewPhotoOnly
      ? reviews.filter((r) => r.photoUrl || (r.photoUrls && r.photoUrls.length > 0))
      : reviews;
    if (reviewSort === 'popular') {
      return [...base].sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bt - at;
      });
    }
    // latest (기본): createdAt 내림차순
    return [...base].sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    });
  })();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{title}</Text>
          {dateLabel ? <Text style={styles.headerSub}>{dateLabel} 기록</Text> : null}
        </View>
        {source === 'plaza' ? (
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.headerMenuBtn}>
            <Ionicons name="ellipsis-vertical" size={22} color={Colors.textMain} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 32 }} />
        )}
      </View>

      {source === 'plaza' && menuVisible && (
        <Modal visible={menuVisible} transparent animationType="fade">
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
            <View style={styles.menuBox}>
              {isPlazaOwner ? (
                <>
                  <TouchableOpacity style={styles.menuItem} onPress={handleChangeRecipePhoto}>
                    <Text style={styles.menuItemText}>사진 수정하기</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={styles.menuItem} onPress={handleOpenReport}>
                  <Text style={styles.menuItemText}>신고하기</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
                <Text style={styles.menuItemTextCancel}>취소</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      <Modal visible={reportModalVisible} transparent animationType="slide">
        <View style={styles.reportModalOverlay}>
          <View style={styles.reportModalContent}>
            <Text style={styles.reportModalTitle}>신고하기</Text>
            <Text style={styles.reportModalSub}>해당 레시피를 신고하는 사유를 입력해 주세요.</Text>
            <Text style={styles.reportLabel}>사유 (선택)</Text>
            <View style={styles.reportReasonRow}>
              {['스팸/광고', '부적절한 내용', '저작권 침해', '기타'].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.reportReasonChip, reportReason === r && styles.reportReasonChipActive]}
                  onPress={() => setReportReason(r)}
                >
                  <Text style={[styles.reportReasonChipText, reportReason === r && styles.reportReasonChipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.reportLabel}>신고 내용 (필수)</Text>
            <TextInput
              style={styles.reportInput}
              placeholder="구체적인 내용을 입력해 주세요."
              placeholderTextColor={Colors.textSub}
              value={reportDetail}
              onChangeText={setReportDetail}
              multiline
              numberOfLines={4}
            />
            <View style={styles.reportActions}>
              <TouchableOpacity style={styles.reportCancelBtn} onPress={() => setReportModalVisible(false)}>
                <Text style={styles.reportCancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reportSubmitBtn, (!reportDetail.trim() || reportSubmitting) && styles.reportSubmitBtnDisabled]}
                onPress={handleSubmitReport}
                disabled={!reportDetail.trim() || reportSubmitting}
              >
                <Text style={styles.reportSubmitBtnText}>{reportSubmitting ? '제출 중…' : '제출'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={writeReviewVisible}
        transparent
        animationType="slide"
        onRequestClose={requestCloseWriteReview}
      >
        <View style={styles.reportModalOverlay}>
          <View style={styles.reportModalContent}>
            <Text style={styles.reportModalTitle}>요리 후기 남기기</Text>
            <Text style={styles.reportModalSub}>이 레시피를 요리해 보셨다면 별점과 후기를 남겨 주세요.</Text>
            <Text style={styles.reportLabel}>별점 (1~5)</Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setWriteRating(n)}
                  style={styles.starBtn}
                >
                  <Text style={styles.starText}>{writeRating >= n ? '★' : '☆'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.reportLabel}>사진 업로드 (최대 5장)</Text>
            <View style={styles.reviewPhotoRow}>
              {writePhotos.map((uri) => (
                <View key={uri} style={styles.reviewPhotoItem}>
                  <Image source={{ uri }} style={styles.reviewPhotoImage} />
                  <TouchableOpacity
                    style={styles.reviewPhotoRemoveBtn}
                    onPress={() => handleRemoveReviewPhoto(uri)}
                  >
                    <Text style={styles.reviewPhotoRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {writePhotos.length < 5 && (
                <TouchableOpacity
                  style={styles.reviewPhotoAddBtn}
                  onPress={handlePickReviewPhoto}
                >
                  <Text style={styles.reviewPhotoAddText}>＋</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.reportLabel}>후기 내용 (필수)</Text>
            <TextInput
              style={styles.reportInput}
              placeholder="요리 후기를 작성해 주세요."
              placeholderTextColor={Colors.textSub}
              value={writeText}
              onChangeText={setWriteText}
              multiline
              numberOfLines={4}
            />
            <View style={styles.reportActions}>
              <TouchableOpacity style={styles.reportCancelBtn} onPress={requestCloseWriteReview}>
                <Text style={styles.reportCancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.writeReviewSubmitBtn,
                  (writeRating < 1 || !writeText.trim() || writeSubmitting) && styles.reportSubmitBtnDisabled,
                ]}
                onPress={handleSubmitReview}
                disabled={writeRating < 1 || !writeText.trim() || writeSubmitting}
              >
                <Text style={styles.reportSubmitBtnText}>{writeSubmitting ? '등록 중…' : '등록'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={reviewReportVisible} transparent animationType="slide">
        <View style={styles.reportModalOverlay}>
          <View style={styles.reportModalContent}>
            <Text style={styles.reportModalTitle}>후기 신고</Text>
            <Text style={styles.reportModalSub}>해당 후기를 신고하는 사유를 입력해 주세요.</Text>
            <Text style={styles.reportLabel}>사유 (선택)</Text>
            <View style={styles.reportReasonRow}>
              {['스팸/광고', '부적절한 내용', '저작권 침해', '기타'].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.reportReasonChip, reviewReportReason === r && styles.reportReasonChipActive]}
                  onPress={() => setReviewReportReason(r)}
                >
                  <Text style={[styles.reportReasonChipText, reviewReportReason === r && styles.reportReasonChipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.reportLabel}>신고 내용 (필수)</Text>
            <TextInput
              style={styles.reportInput}
              placeholder="구체적인 내용을 입력해 주세요."
              placeholderTextColor={Colors.textSub}
              value={reviewReportDetail}
              onChangeText={setReviewReportDetail}
              multiline
              numberOfLines={4}
            />
            <View style={styles.reportActions}>
              <TouchableOpacity style={styles.reportCancelBtn} onPress={() => { setReviewReportVisible(false); setReportReviewId(null); }}>
                <Text style={styles.reportCancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reportSubmitBtn, (!reviewReportDetail.trim() || reviewReportSubmitting) && styles.reportSubmitBtnDisabled]}
                onPress={handleSubmitReviewReport}
                disabled={!reviewReportDetail.trim() || reviewReportSubmitting}
              >
                <Text style={styles.reportSubmitBtnText}>{reviewReportSubmitting ? '제출 중…' : '제출'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        {source === 'plaza' && (recipe as PlazaRecipe).recipePhotoUrl && (
          <Image
            source={{ uri: (recipe as PlazaRecipe).recipePhotoUrl! }}
            style={styles.heroImage}
            resizeMode="cover"
          />
        )}

        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Ionicons name="people-outline" size={14} color={Colors.textSub} />
            <Text style={styles.metaChipText}> {servings}인분</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="time-outline" size={14} color={Colors.textSub} />
            <Text style={styles.metaChipText}> {estimatedMinutes}분 이내</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="star-outline" size={14} color={Colors.textSub} />
            <Text style={styles.metaChipText}> {difficulty}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.ttsPill} onPress={handleStartTTS}>
          <Text style={styles.ttsPillText}>🔊 조리 과정을 소리로 듣기</Text>
        </TouchableOpacity>

        {source === 'plaza' && (
          <View style={styles.chefInfoCard}>
            <Text style={styles.chefInfoTitle}>제작한 셰프 정보</Text>
            <Text style={styles.chefInfoMeta}>
              {(recipe as PlazaRecipe).authorName || '익명 셰프'}
            </Text>
          </View>
        )}

        {hasStructuredSections ? (
          <>
            {sections.ingredients.length > 0 && (() => {
              const baseItems: { key: string; label: string; length: number }[] = [];
              const seasoningItems: { key: string; label: string; length: number }[] = [];

              sections.ingredients.forEach((raw, index) => {
                const [nameRaw, amountRaw] = raw.split('|').map(part => part.trim());
                const name = nameRaw || '';
                const amount = amountRaw || '';
                const label = amount ? `${name} ${amount}` : name;
                const target = SEASONING_KEYWORDS.some(k => name.includes(k)) ? seasoningItems : baseItems;
                target.push({ key: `ing-${index}`, label, length: label.length });
              });

              const buildRows = (items: { key: string; label: string; length: number }[]) => {
                const sorted = [...items].sort((a, b) => a.length - b.length);
                const rows: { key: string; items: typeof items }[] = [];
                let currentRow: typeof items = [];

                sorted.forEach((item) => {
                  const isLong = item.length > 14;
                  if (currentRow.length === 0) {
                    currentRow.push(item);
                  } else if (currentRow.length === 1 && !isLong && currentRow[0].length <= 14) {
                    currentRow.push(item);
                    rows.push({ key: `row-${rows.length}`, items: currentRow });
                    currentRow = [];
                  } else {
                    rows.push({ key: `row-${rows.length}`, items: currentRow });
                    currentRow = [item];
                  }
                });
                if (currentRow.length > 0) {
                  rows.push({ key: `row-${rows.length}`, items: currentRow });
                }
                return rows;
              };

              const baseRows = buildRows(baseItems);
              const seasoningRows = buildRows(seasoningItems);

              return (
                <View style={[styles.sectionCard, styles.ingredientsCard]}>
                  {baseRows.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={styles.sectionTitle}>[ 재료 ]</Text>
                      <View style={styles.ingredientSheet}>
                        {baseRows.map((row, rowIndex) => {
                          const left = row.items[0];
                          const right = row.items[1];
                          return (
                            <View
                              key={row.key}
                              style={[
                                styles.ingredientRow,
                                rowIndex === baseRows.length - 1 && seasoningRows.length === 0 && { borderBottomWidth: 0 },
                              ]}
                            >
                              <View style={styles.ingredientItem}>
                                <Text style={styles.ingredientLabel} numberOfLines={1} ellipsizeMode="tail">
                                  {left?.label}
                                </Text>
                              </View>
                              <View style={styles.ingredientDivider} />
                              {right ? (
                                <View style={styles.ingredientItem}>
                                  <Text style={styles.ingredientLabel} numberOfLines={1} ellipsizeMode="tail">
                                    {right.label}
                                  </Text>
                                </View>
                              ) : (
                                <View style={styles.ingredientItemPlaceholder} />
                              )}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {seasoningRows.length > 0 && (
                    <View>
                      <Text style={styles.sectionTitle}>[ 양념 & 조미료 ]</Text>
                      <View style={styles.ingredientSheet}>
                        {seasoningRows.map((row, rowIndex) => {
                          const left = row.items[0];
                          const right = row.items[1];
                          return (
                            <View
                              key={row.key}
                              style={[
                                styles.ingredientRow,
                                rowIndex === seasoningRows.length - 1 && { borderBottomWidth: 0 },
                              ]}
                            >
                              <View style={styles.ingredientItem}>
                                <Text style={styles.ingredientLabel} numberOfLines={1} ellipsizeMode="tail">
                                  {left?.label}
                                </Text>
                              </View>
                              <View style={styles.ingredientDivider} />
                              {right ? (
                                <View style={styles.ingredientItem}>
                                  <Text style={styles.ingredientLabel} numberOfLines={1} ellipsizeMode="tail">
                                    {right.label}
                                  </Text>
                                </View>
                              ) : (
                                <View style={styles.ingredientItemPlaceholder} />
                              )}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </View>
              );
            })()}

            <TouchableOpacity style={styles.measureGuideBtn} onPress={() => setMeasureModalVisible(true)}>
              <Text style={styles.measureGuideBtnText}>기본 계량 가이드</Text>
            </TouchableOpacity>

            {sections.steps.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>👨‍🍳 조리 순서</Text>
                {sections.steps.map((step, index) => (
                  <View key={`step-${index}`} style={styles.stepRow}>
                    <View style={styles.stepBadge}>
                      <Text style={styles.stepBadgeText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            )}

            {sections.tips.length > 0 && (
              <View style={styles.tipCard}>
                <Text style={styles.tipTitle}>💡 요리 팁 (쿡덱스의 킥)</Text>
                {sections.tips.map((tip, index) => (
                  <View key={`tip-${index}`} style={styles.tipRow}>
                    <Text style={styles.tipText}>
                      {'\u2022 '}{tip}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.measureGuideBtn} onPress={() => setMeasureModalVisible(true)}>
              <Text style={styles.measureGuideBtnText}>기본 계량 가이드</Text>
            </TouchableOpacity>
            <Markdown style={markdownStyles}>{recipe.content}</Markdown>
          </>
        )}

        {source === 'plaza' && (
          <View style={styles.reviewsSection}>
            <Text style={styles.reviewsSectionTitle}>요리 후기</Text>
            <View style={styles.reviewsSummaryRow}>
              <Text style={styles.reviewsSummaryStars}>
                {reviews.length > 0
                  ? (plazaRecipe?.ratingAvg ?? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1)
                  : '0.0'}
                {' '}
                {(() => {
                  const avg = reviews.length > 0
                    ? (plazaRecipe?.ratingAvg ?? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length)
                    : 0;
                  const n = Math.round(avg);
                  return '★'.repeat(n) + '☆'.repeat(5 - n);
                })()}
              </Text>
              <Text style={styles.reviewsSummaryCount}>
                ({plazaRecipe?.reviewCount ?? reviews.length}개)
              </Text>
            </View>
            <View style={styles.reviewFilterRow}>
              <View style={styles.reviewSortGroup}>
                <TouchableOpacity
                  style={[
                    styles.reviewSortBtn,
                    reviewSort === 'popular' && styles.reviewSortBtnActive,
                  ]}
                  onPress={() => setReviewSort('popular')}
                >
                  <Text
                    style={[
                      styles.reviewSortText,
                      reviewSort === 'popular' && styles.reviewSortTextActive,
                    ]}
                  >
                    인기순
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.reviewSortBtn,
                    reviewSort === 'latest' && styles.reviewSortBtnActive,
                  ]}
                  onPress={() => setReviewSort('latest')}
                >
                  <Text
                    style={[
                      styles.reviewSortText,
                      reviewSort === 'latest' && styles.reviewSortTextActive,
                    ]}
                  >
                    최신순
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.photoOnlyToggle}
                onPress={() => setReviewPhotoOnly((prev) => !prev)}
              >
                <View
                  style={[
                    styles.photoOnlyCheckbox,
                    reviewPhotoOnly && styles.photoOnlyCheckboxChecked,
                  ]}
                >
                  {reviewPhotoOnly ? <View style={styles.photoOnlyInnerDot} /> : null}
                </View>
                <Text style={styles.photoOnlyLabel}>사진 후기만 보기</Text>
              </TouchableOpacity>
            </View>
            {reviewsLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 16 }} />
            ) : (
              <>
                <View style={styles.reviewList}>
                  {visibleReviews.slice(0, 5).map((r) => {
                    const isMine = !!auth.currentUser && r.authorId === auth.currentUser.uid;
                    const isHidden = r.status === 'hidden_by_safe_bot';
                    return (
                      <View key={r.id} style={styles.reviewCard}>
                        <View style={styles.reviewCardHeader}>
                          <Text style={styles.reviewAuthor}>{r.authorName}</Text>
                          <View style={styles.reviewMeta}>
                            <Text style={styles.reviewStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                            <Text style={styles.reviewDate}>
                              {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}
                            </Text>
                          </View>
                          <TouchableOpacity
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => {
                              if (isMine) {
                                handleDeleteOwnReview(r.id, r.rating);
                              } else {
                                handleOpenReviewReport(r.id);
                              }
                            }}
                            style={styles.reviewMenuBtn}
                          >
                            <Ionicons name="ellipsis-vertical" size={16} color={Colors.textSub} />
                          </TouchableOpacity>
                        </View>
                        <View style={styles.reviewBodyRow}>
                          <View style={styles.reviewTextCol}>
                            <Text style={styles.reviewText}>
                              {isHidden
                                ? '세이프봇에 의해 블라인드 처리된 후기입니다.'
                                : r.text}
                            </Text>
                          </View>
                          {!isHidden && r.photoUrl ? (
                            <Image source={{ uri: r.photoUrl }} style={styles.reviewPhotoThumb} />
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
                {visibleReviews.length > 5 && (
                  <TouchableOpacity
                    style={styles.reviewSeeAllBtn}
                    onPress={() => setShowAllReviews(true)}
                  >
                    <Text style={styles.reviewSeeAllText}>전체 보기</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.writeReviewBtn} onPress={handleOpenWriteReview}>
                  <Text style={styles.writeReviewBtnText}>요리 후기 남기기</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {source === 'plaza' && (
          <View style={styles.otherChefsSection}>
            <Text style={styles.otherChefsTitle}>
              해당 요리를 만든 다른 셰프들!
            </Text>
            {otherChefsRecipes.length > 0 ? (
              <View style={styles.otherChefsGrid}>
                {otherChefsRecipes.map((r, index) => (
                  <TouchableOpacity
                    key={r.id}
                    style={styles.otherChefCard}
                    onPress={() =>
                      router.push({
                        pathname: '/recipe-detail',
                        params: { id: r.id, source: 'plaza' },
                      })
                    }
                    activeOpacity={0.8}
                  >
                    <View style={styles.otherChefRankBadge}>
                      <Text style={styles.otherChefRankText}>{index + 1}</Text>
                    </View>
                    {r.recipePhotoUrl ? (
                      <Image source={{ uri: r.recipePhotoUrl }} style={styles.otherChefImage} />
                    ) : (
                      <View style={[styles.otherChefImage, { backgroundColor: Colors.bgMuted }]} />
                    )}
                    <Text style={styles.otherChefName} numberOfLines={1}>
                      {r.authorName}
                    </Text>
                    {r.title ? (
                      <Text style={styles.otherChefRecipeTitle} numberOfLines={1}>
                        {r.title}
                      </Text>
                    ) : null}
                    <Text style={styles.otherChefMeta} numberOfLines={1}>
                      ★ {typeof r.ratingAvg === 'number' ? r.ratingAvg.toFixed(1) : '0.0'} ({r.reviewCount ?? 0})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.otherChefsEmptyText}>
                이 레시피와 비슷한 다른 셰프들의 요리가 등록되면 여기에서 모아서 보여드릴게요.
              </Text>
            )}
          </View>
        )}

        {source === 'plaza' && (
          <View style={styles.otherChefsSection}>
            <Text style={styles.otherChefsTitle}>
              {title}에서 변형된 다른 셰프의 릴레이 요리!
            </Text>
            {relayChildren.length > 0 ? (
              <View style={styles.otherChefsGrid}>
                {relayChildren.map((r, index) => (
                  <TouchableOpacity
                    key={r.id}
                    style={styles.otherChefCard}
                    onPress={() =>
                      router.push({
                        pathname: '/recipe-detail',
                        params: { id: r.id, source: 'plaza' },
                      })
                    }
                    activeOpacity={0.8}
                  >
                    <View style={styles.otherChefRankBadge}>
                      <Text style={styles.otherChefRankText}>{index + 1}</Text>
                    </View>
                    {r.recipePhotoUrl ? (
                      <Image source={{ uri: r.recipePhotoUrl }} style={styles.otherChefImage} />
                    ) : (
                      <View style={[styles.otherChefImage, { backgroundColor: Colors.bgMuted }]} />
                    )}
                    <Text style={styles.otherChefName} numberOfLines={1}>
                      {r.authorName}
                    </Text>
                    {r.title ? (
                      <Text style={styles.otherChefRecipeTitle} numberOfLines={1}>
                        {r.title}
                      </Text>
                    ) : null}
                    <Text style={styles.otherChefMeta} numberOfLines={1}>
                      ★ {typeof r.ratingAvg === 'number' ? r.ratingAvg.toFixed(1) : '0.0'} ({r.reviewCount ?? 0})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.otherChefsEmptyText}>
                이 레시피로 변형한 다른 셰프의 릴레이 요리가 등록되면 여기에서 모아서 보여드릴게요.
              </Text>
            )}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <View style={styles.actionBar}>
        {source === 'plaza' ? (
          <View style={styles.actionIconRow}>
            <TouchableOpacity style={styles.actionIconButton} onPress={handleSaveToMyKitchen}>
              <View style={styles.actionIconCircle}>
                <Ionicons name="heart-outline" size={22} color={Colors.primary} />
              </View>
              <Text style={styles.actionIconLabel}>저장하기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionIconButton} onPress={handleStyleChange}>
              <View style={styles.actionIconCircle}>
                <Ionicons name="restaurant-outline" size={22} color={Colors.primary} />
              </View>
              <Text style={styles.actionIconLabel}>릴레이 제작</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionIconButton} onPress={handleOpenShopping}>
              <View style={styles.actionIconCircle}>
                <Ionicons name="cart-outline" size={22} color={Colors.primary} />
              </View>
              <Text style={styles.actionIconLabel}>장보기</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionIconRow}>
            <TouchableOpacity style={styles.actionIconButton} onPress={handleShareToPlaza}>
              <View style={styles.actionIconCircle}>
                <Ionicons name="megaphone-outline" size={22} color={Colors.primary} />
              </View>
              <Text style={styles.actionIconLabel}>광장 공유</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionIconButton} onPress={handleStyleChange}>
              <View style={styles.actionIconCircle}>
                <Ionicons name="sparkles-outline" size={22} color={Colors.primary} />
              </View>
              <Text style={styles.actionIconLabel}>다시 제작</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionIconButton} onPress={handleOpenShopping}>
              <View style={styles.actionIconCircle}>
                <Ionicons name="cart-outline" size={22} color={Colors.primary} />
              </View>
              <Text style={styles.actionIconLabel}>장보기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionIconButton} onPress={handleDeleteRecipe}>
              <View style={styles.actionIconCircle}>
                <Ionicons name="trash-outline" size={22} color={Colors.danger} />
              </View>
              <Text style={styles.actionIconLabel}>삭제하기</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Modal visible={measureModalVisible} transparent animationType="fade" onRequestClose={() => setMeasureModalVisible(false)}>
        <View style={styles.measureModalOverlay}>
          <View style={styles.measureModalContent}>
            <Text style={styles.measureTitle}>쿡덱스 기본 계량표</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.measureItem}>• 1큰술 (1T) = 15ml (어른 밥숟가락 1가득)</Text>
              <Text style={styles.measureItem}>• 1작은술 (1t) = 5ml (티스푼 1가득)</Text>
              <Text style={styles.measureItem}>• 1컵 (1Cup) = 200ml (일반 종이컵 가득)</Text>
              <Text style={styles.measureItem}>• 1꼬집 = 엄지와 검지로 집은 양 (약 2g)</Text>
              <Text style={styles.measureItem}>• 약간 = 2~3꼬집 정도의 양</Text>
              <Text style={styles.measureItem}>• 한 줌 = 한 손에 가득 쥐어지는 양</Text>
            </ScrollView>
            <TouchableOpacity style={styles.measureCloseBtn} onPress={() => setMeasureModalVisible(false)}>
              <Text style={styles.measureCloseBtnText}>확인했습니다</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showShoppingModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowShoppingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.shoppingSheet}>
            <View style={styles.shoppingHandle} />
            <Text style={styles.shoppingTitle}>🛒 이 레시피 재료 장보기</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {shoppingIngredients.map((name, idx) => (
                <TouchableOpacity
                  key={`${name}-${idx}`}
                  style={styles.shoppingItem}
                  onPress={() => handleShoppingItemPress(name)}
                >
                  <Text style={styles.shoppingItemText}>{name} 쿠팡에서 보기</Text>
                  <Ionicons name="open-outline" size={18} color={Colors.actionShop} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.shoppingCloseBtn} onPress={() => setShowShoppingModal(false)}>
              <Text style={styles.shoppingCloseText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const markdownStyles = StyleSheet.create({
  body: { color: Colors.textMain, fontSize: 15, lineHeight: 24 },
  heading1: { color: Colors.primary, fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  paragraph: { marginBottom: 6 },
  blockquote: {
    backgroundColor: Colors.primarySoft,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginVertical: 10,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgMain,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
    backgroundColor: Colors.bgMain,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backBtnText: {
    color: Colors.textMain,
    fontSize: 18,
    fontWeight: '600',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.textMain,
    textAlign: 'center',
  },
  headerSub: {
    fontSize: 12,
    color: Colors.textSub,
    marginTop: 4,
  },
  headerMenuBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 16,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  metaChipText: {
    fontSize: 12,
    color: Colors.textMain,
    fontWeight: '700',
    marginLeft: 4,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 56,
    paddingRight: 16,
  },
  menuBox: {
    backgroundColor: Colors.bgModal,
    borderRadius: Radius.lg,
    minWidth: 160,
    ...Shadows.soft,
  },
  menuItem: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textMain,
  },
  menuItemTextCancel: {
    fontSize: 15,
    color: Colors.textSub,
  },
  reportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  reportModalContent: {
    backgroundColor: Colors.bgModal,
    borderRadius: Radius.xl,
    padding: 24,
  },
  reportModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textMain,
    marginBottom: 4,
  },
  reportModalSub: {
    fontSize: 13,
    color: Colors.textSub,
    marginBottom: 16,
  },
  reportLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMain,
    marginBottom: 8,
  },
  reportReasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  reportReasonChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bgMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reportReasonChipActive: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
  reportReasonChipText: {
    fontSize: 13,
    color: Colors.textMain,
    fontWeight: '600',
  },
  reportReasonChipTextActive: {
    color: Colors.primary,
  },
  reportInput: {
    backgroundColor: Colors.bgMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 14,
    fontSize: 15,
    color: Colors.textMain,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  reportActions: {
    flexDirection: 'row',
    gap: 12,
  },
  reportCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgMuted,
    alignItems: 'center',
  },
  reportCancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textSub,
  },
  reportSubmitBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.danger,
    alignItems: 'center',
  },
  reportSubmitBtnDisabled: {
    opacity: 0.5,
  },
  reportSubmitBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textInverse,
  },
  writeReviewSubmitBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  starRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  starBtn: {
    padding: 4,
  },
  starText: {
    fontSize: 28,
    color: Colors.primary,
  },
  reviewPhotoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  reviewPhotoItem: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: Colors.bgMuted,
  },
  reviewPhotoImage: {
    width: '100%',
    height: '100%',
  },
  reviewPhotoRemoveBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewPhotoRemoveText: {
    color: Colors.textInverse,
    fontSize: 11,
    fontWeight: '700',
  },
  reviewPhotoAddBtn: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    borderWidth: 1.2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgElevated,
  },
  reviewPhotoAddText: {
    fontSize: 24,
    color: Colors.textSub,
    fontWeight: '700',
  },
  reviewsSection: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  reviewsSectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textMain,
    marginBottom: 8,
  },
  reviewsSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reviewsSummaryStars: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primary,
  },
  reviewsSummaryCount: {
    fontSize: 14,
    color: Colors.textSub,
    marginLeft: 6,
  },
  reviewFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  reviewSortGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  reviewSortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bgMuted,
  },
  reviewSortBtnActive: {
    backgroundColor: Colors.primarySoft,
  },
  reviewSortText: {
    fontSize: 12,
    color: Colors.textSub,
    fontWeight: '600',
  },
  reviewSortTextActive: {
    color: Colors.primary,
  },
  photoOnlyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  photoOnlyCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoOnlyCheckboxChecked: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
  photoOnlyInnerDot: {
    width: 10,
    height: 10,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  photoOnlyLabel: {
    fontSize: 12,
    color: Colors.textSub,
  },
  photoReviewsScroll: {
    marginBottom: 12,
  },
  photoReviewsContent: {
    paddingRight: 20,
  },
  photoReviewCard: {
    width: 100,
    marginRight: 12,
    alignItems: 'center',
  },
  photoReviewImage: {
    width: 80,
    height: 80,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgMuted,
  },
  photoReviewAuthor: {
    fontSize: 12,
    color: Colors.textSub,
    marginTop: 4,
  },
  photoReviewStars: {
    fontSize: 12,
    color: Colors.primary,
  },
  reviewList: {
  },
  reviewCard: {
    marginBottom: 12,
    backgroundColor: Colors.bgMuted,
    borderRadius: Radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  reviewAuthor: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textMain,
    flex: 1,
  },
  reviewMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewStars: {
    fontSize: 12,
    color: Colors.primary,
  },
  reviewDate: {
    fontSize: 12,
    color: Colors.textSub,
  },
  reviewMenuBtn: {
    padding: 4,
    marginLeft: 4,
  },
  reviewText: {
    fontSize: 13,
    color: Colors.textMain,
    lineHeight: 20,
  },
  reviewBodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  reviewTextCol: {
    flex: 1,
  },
  reviewPhotoThumb: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
    marginBottom: 8,
    backgroundColor: Colors.bgMuted,
  },
  writeReviewBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
  },
  writeReviewBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primary,
  },
  reviewSeeAllBtn: {
    marginTop: 8,
    marginBottom: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgElevated,
  },
  reviewSeeAllText: {
    fontSize: 12,
    color: Colors.textSub,
    fontWeight: '600',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  heroImage: {
    width: '100%',
    height: 220,
    borderRadius: Radius.lg,
    marginBottom: 12,
    backgroundColor: Colors.bgMuted,
  },
  ttsPill: {
    backgroundColor: Colors.primarySoft,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.primary,
    marginBottom: 16,
    alignItems: 'center',
  },
  ttsPillText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  sectionCard: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginBottom: 14,
    borderWidth: 0,
  },
  ingredientsCard: {
    paddingVertical: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textMain,
    marginBottom: 10,
  },
  ingredientSheet: {
    marginTop: 4,
    borderRadius: 0,
    backgroundColor: 'transparent',
    overflow: 'visible',
    borderWidth: 0,
    borderColor: 'transparent',
    gap: 4,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  ingredientItem: {
    flex: 1,
    minWidth: '45%',
  },
  ingredientItemPlaceholder: {
    flex: 1,
    minWidth: '45%',
    opacity: 0,
  },
  ingredientLabel: {
    fontSize: 13,
    color: Colors.textMain,
    fontWeight: '600',
    textAlign: 'center',
  },
  ingredientDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: Colors.border,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  stepBadgeText: {
    color: Colors.textInverse,
    fontSize: 13,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textMain,
    lineHeight: 20,
  },
  tipCard: {
    backgroundColor: Colors.meshPeach,
    borderRadius: Radius.xl,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primary,
    marginBottom: 8,
  },
  tipRow: {
    marginBottom: 4,
  },
  tipText: {
    fontSize: 13,
    color: Colors.textMain,
    lineHeight: 20,
  },
  chefInfoCard: {
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chefInfoTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textSub,
    marginBottom: 4,
  },
  chefInfoMeta: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textMain,
  },
  actionBar: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    backgroundColor: Colors.bgMain,
  },
  actionIconRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  actionIconButton: {
    flex: 1,
    alignItems: 'center',
  },
  actionIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 6,
  },
  actionIconLabel: {
    fontSize: 12,
    color: Colors.textMain,
    fontWeight: '700',
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSub,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  measureModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  measureGuideBtn: {
    backgroundColor: Colors.bgElevated,
    marginHorizontal: 20,
    marginVertical: 12,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  measureGuideBtnText: {
    color: Colors.textMain,
    fontSize: 14,
    fontWeight: '700',
  },
  measureModalContent: {
    backgroundColor: Colors.bgModal,
    borderRadius: Radius.lg,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    width: '90%',
    alignSelf: 'center',
  },
  measureTitle: {
    color: Colors.textMain,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  measureItem: {
    color: Colors.textMain,
    fontSize: 14,
    marginBottom: 10,
    lineHeight: 22,
  },
  measureCloseBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginTop: 8,
  },
  measureCloseBtnText: {
    color: Colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
  shoppingSheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  shoppingHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 12,
  },
  shoppingTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textMain,
    marginBottom: 10,
  },
  shoppingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  shoppingItemText: {
    fontSize: 14,
    color: Colors.textMain,
  },
  shoppingCloseBtn: {
    marginTop: 12,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  shoppingCloseText: {
    fontSize: 13,
    color: Colors.textSub,
  },
  otherChefsSection: {
    marginTop: 24,
  },
  otherChefsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textMain,
    marginBottom: 10,
  },
  otherChefsEmptyText: {
    fontSize: 12,
    color: Colors.textSub,
  },
  otherChefsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  otherChefCard: {
    width: '48%',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    padding: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  otherChefImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Radius.md,
    marginBottom: 6,
  },
  otherChefRankBadge: {
    position: 'absolute',
    top: -2,
    left: -2,
    backgroundColor: Colors.primary,
    borderTopLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.md,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 1,
  },
  otherChefRankText: {
    color: Colors.textInverse,
    fontSize: 11,
    fontWeight: '800',
  },
  otherChefName: {
    fontSize: 12,
    color: Colors.textMain,
    fontWeight: '700',
  },
  otherChefRecipeTitle: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.textSub,
  },
  otherChefMeta: {
    marginTop: 2,
    fontSize: 11,
    color: Colors.textSub,
  },
});

