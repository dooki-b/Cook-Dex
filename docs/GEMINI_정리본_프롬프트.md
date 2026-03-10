# CookDex 프로젝트 작업 정리본 — Gemini 전달용 프롬프트

아래 내용을 그대로 복사해 웹 Gemini에 붙여넣으면, 지금까지의 작업 맥락을 이어받을 수 있습니다.

---

## 프롬프트 (복사용)

```
당신은 React Native(Expo) + Firebase 기반 요리/레시피 앱 "CookDex" 프로젝트의 후속 작업을 돕는 AI입니다. 아래는 지금까지 적용된 작업과 디자인/기술 스택 정리본입니다. 이 맥락을 유지한 채로 요청사항을 구현해 주세요.

---

### 1. 프로젝트 개요
- **앱 이름**: CookDex (쿡덱스)
- **스택**: React Native, Expo (Expo Router), Firebase Auth + Firestore
- **주요 기능**: AI 레시피 생성, 스캔 레시피, **레시피 검색(Search)**, 저장 레시피(스크랩), 퀘스트, 요리 광장(플라자), 혜택 상점(포인트), 설정(프로필/맞춤 설정)
- **라우팅**: app/(tabs)/ 가 탭 레이아웃. 탭 바 노출: plaza, index=홈, benefits, profile=설정. recipes, quest, ranking, menu, create 등은 href: null로 탭 바에 숨김. 루트 Stack: login, (tabs), scanner, tutorial, benefits, **search**.

---

### 2. 디자인 시스템 (반드시 준수)
- **파일**: `constants/design-tokens.ts`
- **컬러**: primary: #E85D04 (메인 오렌지), primaryLight: #F97316, primarySoft: #FFF7ED, accent: #FB923C. bgMain: #FAFAF9, bgElevated/bgCard/bgModal: #FFFFFF. textMain: #1C1917, textSub: #78716C, textInverse: #FFFFFF. glassBg, glassBorder (글래스모피즘). actionShop, success, warning, danger, border 등.
- **스타일 톤**: 2026년형 모던, 밝은 배경 + 오렌지 포인트, 미니멀·글래스모피즘, 이모지 사용 최소화.
- **사용**: 새 화면/컴포넌트는 가능한 한 `Colors`, `Radius`, `Shadows`를 import해 일관된 룩 유지.

---

### 3. 설정(Profile) 탭 — 적용된 재설계 요약
- **경로**: `app/(tabs)/profile.tsx`, 탭 제목은 "설정".

**3-1. 설정 메인 (탭 리스트 형식)**
- 상단: "설정" 타이틀 + 로그아웃 버튼.
- **개인 정보 행**: 아바타(이니셜 원형) + 우측 하단 연필 배지(파란 원), 이름 "??? 셰프", 그 아래 이메일(연락처), 오른쪽 ›.  
  → 탭 시 **개인 정보 관리 모달**이 열림 (칭호 장착함이 아님).
- **퀵 카드 3개** (한 줄, 구분선):  
  - 레시피 → `router.push('/(tabs)/recipes')`  
  - 스크랩 → `router.push('/(tabs)/recipes')` (저장 레시피 북)  
  - 포인트 → `router.push('/benefits')`
- 그 다음: CookDex Plus 카드, 이후 리스트 섹션.
- **맞춤 설정** 섹션: "우리 집 기본 양념장", "내 식단 목표", "알레르기 및 기피 식재료" — 각각 탭 시 **서브뷰**로 진입 (별도 라우트 아님, 상태로 `settingsSubView` 전환).
- **요리 모드**: 음성 제어, 화면 꺼짐 방지 (스위치).
- **기타**: 마이 포인트 혜택 상점, 앱 튜토리얼 및 법적 고지.

**3-2. 서브뷰 (양념장 / 식단 목표 / 알레르기)**
- `settingsSubView === 'condiments' | 'diet' | 'allergies'` 일 때만 해당 폼(칩 + 직접 입력 + 선택된 태그) 표시.
- 상단: "‹ 설정" 뒤로가기 + 해당 제목. 하단: "저장하고 설정으로 돌아가기" 버튼 (저장 후 `setSettingsSubView(null)`).
- **Android OS 뒤로가기**: 서브뷰가 열려 있으면 `BackHandler`로 `setSettingsSubView(null)`만 수행하고 `return true` 해서 설정 메인으로만 복귀 (홈으로 나가면 안 됨).

**3-3. 개인 정보 관리 모달**
- 프로필 행(또는 화살표) 탭 시 `profileInfoModalVisible === true` 로 이 모달 표시.
- 구성: "‹ 뒤로" + "내 정보 관리" 제목, 프로필 사진(이니셜) + 연필 배지, 표시 이름, **기본정보**(이메일, 휴대폰 미입력+변경), **부가정보**(생년월일/성별 미입력), **칭호** 항목 — "칭호 변경" 탭 시 이 모달 닫고 **칭호 장착함 모달**(`titleModalVisible`) 열기.

**3-4. 프로필 화면 사용자 상태**
- `user` 초기값: `useState(() => auth.currentUser)` 로 설정해, 이미 로그인된 상태에서 설정 탭 진입 시 로그인 화면이 잠깐 보이지 않도록 함.

---

### 4. 앱 파일 구조 (app/)
- **루트 레이아웃**: `app/_layout.tsx` — Stack(login, (tabs), scanner, tutorial, benefits, search). 인증: 비로그인 시 탭 진입하면 `/login`으로. 로그인 후 탭이 아닌 화면이면 `/(tabs)`로 리다이렉트(단, scanner, create-recipe, tutorial, benefits, **search** 는 예외). 튜토리얼: cookdex_has_agreed !== 'true' 이면 `/tutorial`로.
- **탭 그룹**: `app/(tabs)/_layout.tsx` — 탭 바. 노출 탭: plaza, index(홈), benefits, profile(설정). 숨김: recipes, quest, ranking, menu, create 등 (href: null).
- **스크린 파일**:
  - `index.tsx` — 홈(레벨 뱃지, 칭호, 인사, 테마 모달, 상단 검색 버튼→/search, 오늘 냉장고 파먹기→create-recipe).
  - `search.tsx` — 레시피 검색(내 주방/요리 광장, 최근·인기 검색어, TTS 조리 모드, 상세 모달). 진입: 홈 상단 "재료나 요리명 검색" 탭.
  - `plaza.tsx` — 요리 광장(글로벌 피드).
  - `recipes.tsx` — 저장/스크랩 레시피.
  - `quest.tsx` — 퀘스트·미션·EXP·칭호.
  - `ranking.tsx` — 랭킹.
  - `profile.tsx` — 설정(개인정보, 맞춤 설정 서브뷰, 퀵 카드).
  - `benefits.tsx` — 혜택 상점(포인트).
  - `menu.tsx`, `create.tsx` — 메뉴/생성 보조.
- **앱 레벨(탭 밖)**: `login.tsx`, `tutorial.tsx`, `scanner.tsx`, `create-recipe.tsx`, `benefits.tsx`(모달), `modal.tsx`. Firebase: 루트 `firebaseConfig.js` (auth, db). app 내 import 경로: `../firebaseConfig` (app 직하위), `../../firebaseConfig` (app/(tabs) 직하위).

### 5. 수정·관련된 주요 파일
- `constants/design-tokens.ts` — 디자인 토큰 (Colors, Radius, Shadows).
- `app/(tabs)/profile.tsx` — 설정 탭 전체.
- `app/(tabs)/_layout.tsx` — 탭 라우트.
- `app/(tabs)/index.tsx`, `app/search.tsx`, `app/create-recipe.tsx`, `app/scanner.tsx`, `app/plaza.tsx`, `app/quest.tsx`, `app/recipes.tsx`, `app/login.tsx`, `app/tutorial.tsx`, `app/benefits.tsx` 등 — 디자인 토큰·라우팅·AsyncStorage 일관 적용.
- **README.md** — 프로젝트 소개, 다른 환경에서 작업하기 절차, 문서 참고 링크 (아래 5-1).
- **docs/GEMINI_정리본_프롬프트.md**, **docs/백업용_프롬프트.md** — 작업 맥락 복원·인수인계용.

**5-1. README.md 및 다른 환경에서 작업하기**
- **README.md**(루트)에 프로젝트 소개(앱 이름·스택·주요 기능)와 **"다른 환경에서 작업하기"** 절차가 정리되어 있음.
- **순서**: 1) `git clone` → `cd cook-dex` → `npm install`. 2) 프로젝트 루트에 `.env` 생성, `EXPO_PUBLIC_GEMINI_API_KEY` 등 설정(.env는 .gitignore로 Git 제외, 각 환경에서 직접 생성). 3) `npx expo start`(캐시 문제 시 `npx expo start -c`). 4) 작업 맥락 복원은 `docs/GEMINI_정리본_프롬프트.md`, `docs/백업용_프롬프트.md` 참고.

---

### 6. 참고 사항
- **AsyncStorage 키**: cookdex_user_exp, cookdex_diet_goal, cookdex_allergies, cookdex_condiments, cookdex_equipped_title, cookdex_unlocked_titles, cookdex_saved_recipes, cookdex_setting_voice, cookdex_setting_wakelock, cookdex_has_agreed, cookdex_auto_login, cookdex_legal_agreed, cookdex_theme_used_log, cookdex_draft_recipe, cookdex_search_history, cookdex_plaza_daily_views, cookdex_daily_scans, cookdex_daily_missions, cookdex_exp_buff_date 등.
- 설정 변경사항이 화면에 안 보이면 Metro 캐시 문제일 수 있음 → `npx expo start -c` 로 캐시 클리어 후 재실행 권장.
- TypeScript: profile.tsx, _layout.tsx 등에 `user` 타입 관련 기존 경고 있음. 필요 시 타입만 정리하면 됨.
- **환경 변수**: API 키 등은 `.env`에 두고 Git에는 커밋하지 않음(.gitignore에 .env 포함).
- **주요 패키지**: expo-router, firebase(auth, firestore), @react-native-async-storage/async-storage, expo-speech, react-native-markdown-display, react-native-reanimated, expo-blur, expo-linear-gradient, react-native-safe-area-context 등 이미 사용 중.
- **문서**: README.md(다른 환경 작업 절차), docs/GEMINI_정리본_프롬프트.md, docs/백업용_프롬프트.md.

---

### 7. AI 레시피 생성·테마 모달·3가지 추천·광장 공유

**관련 파일**: `app/(tabs)/index.tsx`, `app/create-recipe.tsx`, `constants/design-tokens.ts`, `firebaseConfig`(auth, db)

**7-1. 홈 "나에게 맞는 테마" 모달**
- 테마 카드 탭 시 **테마 재료 입력 모달**이 뜨도록 함 (openThemeModal). 모달이 안 뜨던 문제는 openThemeModal을 동기로 두고 AsyncStorage 로드는 비동기로 분리, themeModalContent에 minHeight(이후 제거) 및 높이 82% 등으로 조정해 해결.
- 모달: transparent, animationType="slide", 오버레이 탭 시 닫기(TouchableWithoutFeedback), onRequestClose. "직접 입력하여 레시피 만들기" 칩은 THEME_MODAL_INGREDIENTS.slice(0, 5) 로 최대 5개만 노출.
- 테마 중 "저탄고지" 카드 이미지는 고기(스테이크) Unsplash URL로 변경 (저탄고지 이미지 미적용 시 캐시 무효화용 쿼리 파라미 사용).

**7-2. 테마 플로우에서 취소 시 홈으로**
- create-recipe에서 **테마 플로우 진입** 여부: `params.directStyle && params.directIngredients` (isFromThemeFlow).
- 추천 모달 "닫기" 또는 상단 "뒤로" 시: 테마 플로우면 `router.replace('/(tabs)')` 로 홈 이동 (AI 레시피 생성 페이지로 돌아가지 않음).

**7-3. 3가지 맞춤 요리 제안 모달 (create-recipe) + 3D Cover Flow**
- **로딩·카드·제작 중·완성 레시피**를 같은 꽉 찬 화면으로 통일: `showCurationPhase = isCurating || (curationThemes && !textRecipeResult) || isGeneratingRecipe || !!textRecipeResult`. 이때 modalOverlayCuration(배경 투명, justifyContent center), bottomSheetCurationBg(투명, height 100%), 오렌지 그라데이션 + 파도 배경 표시.
- **배경**: LinearGradient(오렌지 계열) + 파도 원 3개. 파도는 react-native-reanimated로 useSharedValue, useAnimatedStyle, withRepeat(withTiming(...), -1, true) 사용해 opacity/translateX/scale 애니메이션.
- **카드 캐러셀**: 한 장씩 스냅(snapToInterval = CURATION_SNAP), 좌우 화살표(Ionicons chevron), ScrollView ref로 scrollTo. 카드 크기: CURATION_CARD_WIDTH = SCREEN_WIDTH*0.72, CURATION_CARD_HEIGHT, CURATION_CARD_GAP=8. **메인 카드 항상 중앙 정렬**: contentContainerStyle의 paddingHorizontal을 (curationCarouselWidth - CURATION_CARD_WIDTH) / 2 로 동적 계산. curationCardSlot에는 marginHorizontal 없음(잘림 방지).
- **3D Cover Flow (현재 구현)**: progress = index - curationScrollX/CURATION_SNAP (스와이프와 기울기 방향 일치). transform 맨 앞에 perspective: 900. rotateY = -clampedProgress*22deg, translateX = clampedProgress*14. 카드 전체를 Animated.View로 감싸 transform 적용. **그림자/elevation 제거** (카드·컨텐츠). BlurView는 중앙 약함·양옆 강함. 하얀 플래시 방지: 색 오버레이 알파 '66', 비메인 카드용 BlurView(72) 제거.
- **카드 내부 카피**: THEME_COPY_TEMPLATES(덮밥/찌개/샐러드/면/구이/디저트/간식/generic)와 pickThemeCopyForTitle(theme_title)로 카테고리별 한 줄 문구. match_reason 아래 curationCardCopy로 표시. 텍스트 크기: curationCardIcon 44, curationCardTitle 24, curationCardReason 14, curationCardCopy 13. Lv/숫자 절대 위치(top·bottom). **레벨 상한 제거**(MAX 없음), 하단 퍼센트 텍스트 제거.
- **텍스트 짧게**: Gemini 프롬프트에 theme_title 4~8글자, match_reason 10글자 이내 지시. UI는 numberOfLines, ellipsizeMode="tail" 적용.
- **완성 레시피 텍스트 가독성**: markdownStyles의 body, blockquote 색을 Colors.textMain 으로 변경(기존 textInverse는 흰 배경에서 안 보임).
- **제작 중 로딩**: loadingBoxFull + 로딩 문구 색 Colors.textMain.

**7-3-1. 개발용 Gemini 목업 응답(429 회피용)**
- **파일**: `app/create-recipe.tsx`
- 함수 `callGeminiAPI(systemPrompt, imageParts)` 상단에 `__DEV__` 체크를 두고, 개발 환경에서는 실제 Gemini 호출 대신 **목업 JSON을 바로 반환**해서 UI/플로우 테스트가 가능하도록 함.
  - `systemPrompt`에 `"curation_themes"` 문자열이 포함된 경우 → 3가지 추천 카드용 목업:
    - theme_title: '불고기덮밥' / '얼큰김치찌개' / '상큼샐러드'
    - match_reason, badge_icon(🍚, 🍲, 🥗), ui_accent_color 등을 하드코딩.
  - `systemPrompt`에 `"recipe_markdown"` 문자열이 포함된 경우 → 최종 레시피/쇼핑 리스트용 목업:
    - safety_warning: null, substitutions: [],
    - shopping_list: ['대파', '참기름', '깨소금'],
    - recipe_markdown: 불고기덮밥 예시 마크다운(간단 3단계).
- **주의 (실서비스 전환 시)**:
  - 운영 빌드에서는 `__DEV__`가 자동으로 false가 되므로, 별도 수정 없이도 실제 Gemini API를 사용하게 됨.
  - 다만 추후 프롬프트 구조를 크게 변경할 경우, 목업 분기 조건(`includes('curation_themes')`, `includes('recipe_markdown')`)이 더 이상 맞지 않을 수 있으니, 함께 업데이트해야 함.

**7-4. 저장·광장 공유**
- **저장**: handleRecipeSaveAndShare(false) 시 로컬 저장 후 반드시 `await AsyncStorage.setItem('cookdex_saved_recipes', JSON.stringify(savedRecipes))` 호출, Alert "저장됨".
- **광장 공유**: 시스템 Share.share()가 아닌 **앱 내 요리 광장 피드** 등록. `auth.currentUser` 없으면 "로그인 필요" 알림. 로그인 시 Firestore `global_recipes` 컬렉션에 `setDoc(doc(db, 'global_recipes', recipeId), { id, content: textRecipeResult, authorId, authorName, createdAt: new Date().toISOString(), likes: 0 })` 로 문서 추가. 성공 시 "광장에 등록 완료!" 알림 후 확인 시 `router.push('/(tabs)/plaza')`. create-recipe에서 `auth, db`는 `../firebaseConfig`, `doc, setDoc`는 `firebase/firestore`에서 import.

**7-5. 추가 AsyncStorage 키**
- cookdex_legal_agreed, cookdex_theme_used_log, cookdex_draft_recipe 등 사용됨.

**7-6. 홈 레벨 뱃지·칭호·인사**
- **파일**: `app/(tabs)/index.tsx`
- **레벨 뱃지**: userExp·equippedTitle는 AsyncStorage(cookdex_user_exp, cookdex_equipped_title)에서 로드. calculateLevel(exp): 500 EXP 이후 200당 +1레벨(상한 없음). 원형 뱃지: levelBadgeRing(#FED7AA), levelBadgeInner(#FFF7ED + 옅은 주황 테두리), 왕관 12시(top:-12). Lv/숫자 절대 위치(top:4, bottom:3). 바깥 네모 테두리 없음, 왕관은 levelBadgeOuter 안에 유지.
- **칭호**: greetingRow 안에 titlePill(equippedTitle)을 인사말 오른쪽에 pill 형태로 표시.
- **인사**: "{userName}님 어서오세요!" (기존 "오늘 뭐 만들까요" 제거).

**7-7. 홈 히어로 버튼(냉장고·배경)**
- **파일**: `app/(tabs)/index.tsx`
- **아이콘**: MaterialCommunityIcons name="fridge-outline" size={28} (기존 숟가락/포크 대신 냉장고).
- **배경**: HERO_BG_IMAGE = require('../../assets/hero-bg-fresh-vegetables.png'). (도마 이미지 사용 시 assets에 hero-bg-cutting-board.png 추가 후 require 경로만 변경.)

**7-8. 레시피 검색(Search) 화면 + 홈 진입**
- **파일**: `app/search.tsx`, `app/(tabs)/index.tsx`, `app/_layout.tsx`
- **역할**: 내 주방(cookdex_saved_recipes)·요리 광장(Firestore global_recipes + 더미)에서 레시피/재료 검색. 최근 검색어(cookdex_search_history)·인기 검색어. 알레르기/식단 필터(안심 필터). 상세 모달에서 TTS 조리 모드(expo-speech), 마크다운 렌더(react-native-markdown-display), 쿠팡 밀키트 링크. 레시피 요청 시 global_recipes에 type: "request" 문서 추가 후 `router.push('/(tabs)/plaza')`.
- **진입**: 홈 상단 검색창 문구 "재료나 요리명 검색" 탭 시 `router.push('/search')`. (아래 "오늘 냉장고 파먹기"는 그대로 create-recipe.)
- **라우트**: `app/_layout.tsx`에 `<Stack.Screen name="search" />` 등록. 로그인 후 리다이렉트 예외에 `segments[0] !== 'search'` 포함.
- **Firebase**: `auth`, `db`는 `../firebaseConfig` (app/search.tsx 기준). AsyncStorage 키는 프로젝트와 동일(cookdex_ 접두사).

이제 [여기에 Gemini에게 요청할 구체적인 작업 내용을 적어 주세요.]
```

---

## 사용 방법
1. 위 **"프롬프트 (복사용)"** 블록 전체를 복사합니다.
2. 마지막 문장 `이제 [여기에 Gemini에게 요청할 구체적인 작업 내용을 적어 주세요.]` 부분을 실제로 원하는 작업 설명으로 바꿉니다.
3. 웹 Gemini 채팅에 붙여넣고 전송합니다.

필요하면 이 파일 경로(`docs/GEMINI_정리본_프롬프트.md`)를 알려주면, 팀원이나 다른 AI가 같은 맥락으로 이어서 작업할 수 있습니다. 다른 환경에서 처음 셋업할 때는 루트 **README.md**의 "다른 환경에서 작업하기"를 따르면 됩니다.
