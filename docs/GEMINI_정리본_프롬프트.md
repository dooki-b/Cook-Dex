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
- **라우팅**: app/(tabs)/ 가 탭 레이아웃. 탭 바 노출: plaza, index=홈, benefits, profile=설정. recipes, quest, ranking, menu, create 등은 href: null로 탭 바에 숨김. 루트 Stack: login, (tabs), scanner, tutorial, benefits, search, recipe-detail, **plaza-hof**, **plaza-ranking**, **categories**.

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
- **루트 레이아웃**: `app/_layout.tsx` — Stack(login, (tabs), scanner, tutorial, benefits, search, recipe-detail, plaza-hof, plaza-ranking, categories). 인증: 비로그인 시 탭 진입하면 `/login`으로. 로그인 후 탭이 아닌 화면이면 `/(tabs)`로 리다이렉트(단, scanner, create-recipe, tutorial, benefits, search, recipe-detail 등 예외). 튜토리얼: cookdex_has_agreed !== 'true' 이면 `/tutorial`로.
- **탭 그룹**: `app/(tabs)/_layout.tsx` — 탭 바. 노출 탭: plaza, index(홈), benefits, profile(설정). 숨김: recipes, quest, ranking, menu, create 등 (href: null).
- **스크린 파일**:
  - `index.tsx` — 홈(레벨 뱃지, 칭호, 인사, 테마 모달, 상단 검색 버튼→/search, 오늘 냉장고 파먹기→create-recipe).
  - `search.tsx` — 레시피 검색(홈/광장 검색 통일·최근 검색·최근 본 셰프·안심 필터, TTS 조리 모드). 진입: 홈 상단 "재료나 요리명 검색" 탭.
  - `plaza.tsx` — 요리 광장(상단 검색바 + 명예의 전당/랭킹/레시피 분류 아이콘 그리드, 실시간 급상승 5개, 피드 카드·썸네일·별점·후기 수·인분/시간/난이도). 카드 탭 시 recipe-detail로 이동.
  - `plaza-hof.tsx`, `plaza-ranking.tsx`, `categories.tsx` — 명예의 전당, 랭킹, 레시피 분류 화면.
  - `recipes.tsx` — 저장/스크랩 레시피(카드 탭 시 recipe-detail).
  - `quest.tsx` — 퀘스트·미션·EXP·칭호.
  - `ranking.tsx` — 랭킹.
  - `profile.tsx` — 설정(개인정보, 맞춤 설정 서브뷰, 퀵 카드).
  - `benefits.tsx` — 혜택 상점(포인트).
  - `menu.tsx`, `create.tsx` — 메뉴/생성 보조.
  - `recipe-detail.tsx` — 통합 레시피 상세(재료/양념 구분, TTS "조리 과정을 소리로 듣기", ⋮ 신고, **요리 후기** 섹션: 평균 별점·후기 리스트·후기 남기기·후기 신고).
- **앱 레벨(탭 밖)**: `login.tsx`, `tutorial.tsx`, `scanner.tsx`, `create-recipe.tsx`, `benefits.tsx`(모달), `modal.tsx`. Firebase: 루트 `firebaseConfig.js` (auth, db). app 내 import: `../firebaseConfig` (app 직하위), `../../firebaseConfig` (app/(tabs) 직하위).

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

- **7-8. 레시피 검색(Search) + 홈/광장 검색 통일**
  - **파일**: `app/search.tsx`, `app/(tabs)/index.tsx`, `app/_layout.tsx`
  - **역할**: 내 주방(cookdex_saved_recipes)·요리 광장(global_recipes) 검색. **홈과 동일** 디자인/색상, **최근 검색어·최근 본 셰프** 유지. **안심 필터**: 텍스트 가독성·주황 테두리·방패 이모지 제거, "전체/내 주방/요리 광장" 탭 제거, ON/OFF 동일 디자인·박스 크기. TTS 조리 모드, 마크다운, 쿠팡 링크. 레시피 요청 시 global_recipes type "request" 후 plaza 이동.
  - **진입**: 홈 상단 "재료나 요리명 검색" 탭 → `router.push('/search')`.
  - **라우트**: Stack에 search 등록, 리다이렉트 예외. Firebase/AsyncStorage(cookdex_*) 동일.

**7-9. 요리 광장(plaza) 개편**
- **파일**: `app/(tabs)/plaza.tsx`
- 상단 **검색바 1개** + **아이콘 그리드**(명예의 전당→plaza-hof, 랭킹→plaza-ranking, 레시피 분류→categories). **실시간 급상승 레시피** 최대 5개: 카드에 포토 썸네일·별점·후기 수·인분/시간/난이도·작성자 뱃지, 중복 제거. **내부 두 번째 검색창·해시태그·탐색/내맞춤 탭 제거**. 피드: Colors.bgElevated, 작성자·날짜·좋아요 등.
- **새 화면**: `app/plaza-hof.tsx`, `app/plaza-ranking.tsx`, `app/categories.tsx` — _layout.tsx Stack에 등록. Empty state: 🍽️ + 안내 문구.

**7-10. 퀘스트(quest) UI 리팩터링**
- **파일**: `app/(tabs)/quest.tsx`
- 전체 배경을 `Colors.bgMain`으로 변경하고, 상단 헤더(도파민 퀘스트)·레벨/칭호 카드·버프 버튼·미션 카드들을 모두 `Colors.bgElevated/bgMuted`, `Radius`, `Shadows` 기반 라이트 톤으로 통일.
- 레벨 카드: `profileCard`에 EXP 프로그레스 바(`progressBarBg/progressBarFill`), 레벨/버프 텍스트를 `Colors.textMain/primary/danger` 조합으로 표시. 칭호 뱃지는 `Colors.primarySoft` pill.
- 일일 미션: `missionRow`를 밝은 카드로 변경, 진행 상태에 따라 Claim 버튼(주황), Lock/완료 텍스트를 서로 다른 톤으로 표현.
- 스와이프 투표 카드: `voteSection` 라이트 카드 안에 중앙 `voteCard`(벤토 박스)로 질문을 표시하고, 하단에 X/O 버튼(`voteBtnNo/voteBtnYes`)을 pill 버튼으로 배치하여 좌우 스와이프와 동작을 일치시킴.
- Empty state: 투표 데이터가 없을 때 `🧺` + 라이트 톤 텍스트로 부드러운 빈 상태 표시.

**7-11. 내 주방(recipes) UI 리팩터링**
- **파일**: `app/(tabs)/recipes.tsx`
- 배경을 `Colors.bgMain`, 헤더 `"나의 레시피 북"`을 `Colors.textMain/textSub`로 라이트 톤으로 변경.
- 레시피 카드 리스트: `recipeCard`를 `Colors.bgElevated` + `Radius.xl` + `Shadows.soft` 기반 카드로 만들고, 날짜/제목/본문 프리뷰를 `Colors.textMain/textSub`로 재구성.  
  카드 우측 상단에 `"저장됨 🔖"` pill 뱃지(`bookmarkPill`)를 추가해 저장 레시피임을 명확하게 표시.
- 상세 모달: `modalContent`를 `Colors.bgModal` + `Radius.xl` + `Shadows.glassDiffused`로 변경, 닫기 버튼·TTS 시작 버튼·요리 인증 버튼·쇼핑 버튼·삭제 버튼을 모두 디자인 토큰(Colors.primary, success, actionShop, actionDelete)을 사용해 정리.
- TTS 전체화면 모달: 배경을 `Colors.bgMain`, 텍스트·버튼을 라이트 톤 + 오렌지 포인트로 맞추고, 음성 명령 활성화 뱃지(`voiceBadge`)를 `Colors.primarySoft/primary` 조합의 pill로 표현.

**7-12. 혜택 상점(benefits) UI 리팩터링**
- **파일**: `app/(tabs)/benefits.tsx`
- 전체 배경 `Colors.bgMain`. 상단 헤더는 `Colors.textMain` 타이틀 + 라이트 톤 뒤로가기 버튼(`Colors.bgElevated` + `Colors.border`).
- 포인트 대시보드: `pointsCard`를 `Colors.primarySoft` 배경 + `Radius.xl` + `Shadows.soft`로 구성. `"보유 마이 포인트"`는 `Colors.textSub`, 포인트 숫자(`1,250 P` 등)는 큰 폰트 + `Colors.textMain`, 우측에 🪙 아이콘(`Colors.primary`)으로 게이미피케이션 강조.
- 상품 리스트: `productsGrid` 2열 그리드, 각 상품 카드(`productCard`)는 `Colors.bgElevated` + `Radius.xl` + `Shadows.glass`. 이름·가격을 라이트 톤 텍스트로 표시.
- 교환 버튼: `exchangeBtn`은 포인트 충분 시 `Colors.primary` 배경 + `Colors.textInverse` 텍스트, 부족 시 `Colors.bgMuted` 배경 + `Colors.textSub` 텍스트로 비활성화 표시. 로직(buyItem, 포인트 차감)은 그대로 유지.

**7-13. 스캐너(scanner) UI 리팩터링 (AR 렌즈 + 라이트 테마)**
- **파일**: `app/scanner.tsx`
- 전체 배경 `Colors.bgMain`, 카메라 오버레이 위 UI를 모두 라이트 + 오렌지 포인트 테마로 재정렬.
- AR 코너 가이드라인: 중앙에 `centerGuide` 박스를 두고, 네 모서리에 `corner*` 스타일로 L자형 가이드를 `Colors.primary` 라인으로 표시해 사용자가 식재료를 맞출 수 있도록 함.
- 상단 HUD: 뒤로가기 버튼(`backButton`)과 `"오늘 스캔: N회 남음"` 뱃지(`limitBadge`)를 화면 상단 여백(안드로이드 상태바 침범 X) 안에 배치. 뱃지는 우상단 pill, 반투명 블랙 배경 + `Colors.primarySoft` 텍스트.
- 하단 컨트롤 바(bottomMask): `rgba(255,255,255,0.92)` 반투명 화이트 + `Radius.xl`로 글래스 바텀 시트 느낌. 내부에 촬영 버튼(`captureButton`)을 `Colors.primary` 원형 버튼 + 흰색 내부 링(Shadows.glassTight)으로 구성.
- `"재료 추가"`·`"AI 레시피"` 버튼: 항상 같은 위치에 렌더링하되, 사진이 없을 때는 `opacity: 0` + `pointerEvents: 'none'` 처리로 공간은 고정, 촬영 후 자연스럽게 나타나도록 조정(`scannerActionRow`).
- 썸네일 및 삭제 X 버튼: 썸네일(`thumbnailImage`)은 `Colors.primary` 보더, 삭제 버튼(`deletePhotoBtn`) 위치를 조정해 윗부분이 잘리지 않도록(top: 0, right: -5).
- 텍스트 가이드: `"💡 사진을 터치해 식재료를 기입해주세요!"`로 문구 변경.
- 캡처 이미지 크롭: `takePicture` 후 `manipulateAsync`에서 중앙 가이드에 맞게 이미지 가운데만 crop(좌우 10% 여백, 상단 26%·하단 36% 영역) 후 리사이즈하여, 촬영된 썸네일이 실제 가이드 박스와 시각적으로 일치하게 보이도록 개선. (카메라/Expo 로직, Gemini/Firebase 호출은 그대로 유지)

**7-14. 통합 레시피 상세 페이지(recipe-detail)**
- **파일**: `app/recipe-detail.tsx`
- 역할: 요리 광장/내 주방 **공통 풀 페이지** 상세. `source`('plaza'|'saved') + `id`로 Firestore `global_recipes` 또는 AsyncStorage `cookdex_saved_recipes`에서 로드.
- 상단 헤더: 뒤로가기 + 제목(# 제목 추출) + "YYYY.MM.DD 기록". **요리 광장 진입 시** 우측 **⋮** → "신고하기" → 모달 제출 시 Firestore `reports`(recipeId, reporterId, reason, detail, status).
- 본문: **재료 구분(만개의레시피 스타일)** — `## 필요한 재료` 파싱 시 **[ 재료 ]** / **[ 양념 & 조미료 ]** 로 구분해 2열 시트 표시. TTS pill 문구: **"🔊 조리 과정을 소리로 듣기"**. 그 아래 마크다운 렌더, **기본 계량 가이드** 버튼(재료↔조리순서 사이).
- 하단 액션: 광장→저장하기/릴레이 제작/장보기, 내 주방→광장 공유/다시 제작/장보기/삭제하기.
- **요리 후기 섹션**(source === 'plaza'): 레시피 본문 아래. Firestore `global_recipes/{recipeId}/reviews` 로드(createdAt 내림차순). 상단 평균 별점(★☆) + (N개). 포토 후기(photoUrl) 가로 스크롤, 후기 리스트(닉네임·별점·텍스트·날짜), 후기별 ⋮ → 신고(`review_reports`). "요리 후기 남기기" → 별점 1~5 + 내용(필수), 부적절 필터(INAPPROPRIATE_WORDS) 제출 전 체크, 제출 시 runTransaction으로 reviews 추가 + `global_recipes` 문서 ratingAvg/reviewCount 갱신.
- 라우팅: Stack에 recipe-detail 등록, plaza/recipes에서 `router.push({ pathname: '/recipe-detail', params: { source, id } })`.

**7-15. 기본 계량 가이드 버튼 위치 통일**
- **목표**: 모든 레시피에서 "기본 계량 가이드"가 **필요한 재료 바로 아래·조리 순서 바로 위**에 노출되도록 통일.
- **app/(tabs)/recipes.tsx**: "내 주방" 탭 상단에 있던 "기본 계량 가이드" 버튼 및 계량표 모달 제거.
- **app/recipe-detail.tsx**: 구조화된 레이아웃에서 재료 블록과 조리 순서 블록 **사이**에 "기본 계량 가이드" 버튼 추가. 비구조화(마크다운만) 레시피는 TTS pill 아래·본문 위에 버튼 노출. 탭 시 "쿡덱스 기본 계량표" 모달(1큰술/1작은술/1컵/1꼬집/약간/한 줌) 표시.
- **app/create-recipe.tsx**: AI 완성 레시피 블록에서 "필요한 재료" 다음·"조리 순서" 전에 동일 버튼 추가, 같은 계량표 모달 사용.

**7-16. 릴레이 챌린지·스타일 입력·셰프의 킥·Scanner DEV 목업**

- **릴레이 챌린지 메타데이터 & 상세 페이지 섹션**
  - Firestore `global_recipes` 문서에 아래 필드를 추가해 **릴레이 체인의 관계를 표현**합니다:
    - `relayFromId?: string` — 지금 레시피가 **어떤 레시피를 기반으로 릴레이 제작**되었는지(부모 레시피 ID).  
    - `relayRootId?: string` — 릴레이 체인의 **루트 레시피 ID**(원본 레시피 자신 또는 최초 레시피).  
    - `relayDepth?: number` — 루트에서 몇 단계 떨어진 릴레이인지(0: 루트, 1: 1단계 릴레이 등).  
  - `app/recipe-detail.tsx`에서 Plaza 소스(`source === 'plaza'`)인 경우:
    - 헤더/본문 아래에 두 개의 하위 섹션을 렌더링합니다.  
      - **"해당 요리를 만든 다른 셰프들!"** — 비슷한 재료/완성 사진을 가진 다른 광장 레시피를 수집, 셰프 닉네임·요리 이름·별점·후기 수를 카드로 표시.  
      - **"{제목}에서 변형된 다른 셰프의 릴레이 요리!"** — `relayFromId === 현재 recipeId` 인 릴레이 레시피들을 모아 2열 카드 그리드로 표시, 카드 탭 시 해당 릴레이 상세로 이동.  
    - 하단 액션 그리드에 **"릴레이 제작"** 버튼을 두고, 탭 시 `app/create-recipe.tsx`로 이동하면서 `relayParentId`, `relayRootId`, `relayDepth`를 params로 넘깁니다.
  - `app/create-recipe.tsx`에서 광장 공유 시:
    - AsyncStorage용 `recipeId`와는 별도로 **광장 전용 ID(`plazaRecipeId`)를 매번 새로 생성**하여, 같은 내용이라도 Firestore `global_recipes` 문서가 덮어써지지 않도록 분리합니다.  
    - 릴레이 제작으로 진입했다면 전달받은 `relayParentId`, `relayRootId`, `relayDepth`를 Firestore 문서의 `relayFromId`, `relayRootId`, `relayDepth`로 저장합니다.

- **AI 레시피 결과 화면: 제목·메타 태그·TTS pill 정렬**
  - `app/create-recipe.tsx`의 AI 결과 모달 상단 레이아웃을 **레시피 상세 페이지와 유사하게 정리**합니다:
    - 마크다운에서 `# 제목`을 추출해 **굵은 요리 제목**을 별도 Text 컴포넌트(`generatedTitle`)로 노출.  
    - 그 아래에 인분/시간/난이도 정보를 **pill 메타 태그 3개**로 노출(`metaRow`, `metaChip`, `metaChipText` 스타일 재사용).  
      - 예: `"2인분"`, `"20분 이내"`, `"난이도: 보통"` (기본값, 추후 파싱/사용자 입력으로 대체 가능).  
    - 메타 태그 아래에 `"🔊 조리 모드로 듣기"` TTS pill(`ttsPill`)을 배치해, 레시피 상세 페이지와 일관된 UX 제공.

- **스타일 입력 UX 개편 + 안전 필터 및 LLM 모더레이션 래퍼**
  - 기존에는 하나의 TextInput(`preferredStyle`)에 **희망 요리 이름/조리 방법/스타일을 자유 서술**하게 했지만, 구조 파악과 안전 필터링이 어려웠습니다.
  - 개선안: **"나만의 요리 스타일 추가!"** 모달을 도입하고 입력을 세 칸으로 분리합니다.
    - `styleDishName` — 원하는 요리 이름(예: "닭볶음탕", "차돌된장찌개").  
    - `styleMethod` — 원하는 조리 방식(예: "국물 자작하게", "강불에 빠르게 볶기").  
    - `styleExtra` — 추가 설명/스타일(예: "아이도 먹을 수 있게 맵지 않게", "단맛은 많이 줄여서").  
  - 내부 동작:
    - 세 칸의 값을 `"원하는 요리 이름: ..."`, `"원하는 조리 방식: ..."`, `"추가 설명: ..."` 형식으로 연결해 하나의 문자열로 만든 뒤, 기존 `preferredStyle`에 넣어 프롬프트에 전달합니다.  
    - `generateFinalRecipe` 프롬프트에는 아래와 같은 **구조화 블록**을 추가합니다:
      - `--- 🧾 사용자 지정 요리 방향 ---`  
      - `원하는 요리 이름: ...`  
      - `원하는 조리 방식: ...`  
      - `추가 설명: ...`  
      - `---`  
  - 안전 필터 & LLM 모더레이션(현재는 구조만 구현, DEV에서는 목업):
    - `checkStyleSafety(combinedStyle: string)`:
      - `INAPPROPRIATE_WORDS`, `STYLE_INAPPROPRIATE_WORDS`, `DANGEROUS_STYLE_PATTERNS` 등을 사용해  
        - 성적 표현/혐오 표현,  
        - 음식과 무관한 컨텍스트(정치·종교·폭력 등),  
        - 위험 조리 방식/위생 위험(세제·표백제·상한 음식 사용 등)을 감지.  
      - 문제 감지 시 Alert로 사용자에게 경고하고, Gemini 호출을 **진행하지 않음**.  
    - `moderateStyleWithLLM(combinedStyle: string)`:
      - 실제 배포 환경에서는 Gemini 1.5 Pro 같은 **LLM 분류기**에 combined 스타일 텍스트를 넘겨 `"ok" | "unsafe" | "not_food_related"` 등의 태그를 받을 예정.  
      - 현재 DEV 빌드에서는 `__DEV__` 분기를 통해 **항상 `'ok'`를 반환하는 목업 구현**만 되어 있음(비용/쿼터 절감을 위해).  
      - 추후 실제 LLM 호출을 붙일 때는, 이 함수 안에서만 API 키/엔드포인트를 관리하면 되도록 레이어를 분리해 둔 상태.
  - 동일한 스타일 모달과 필터/모더레이션 래퍼를 **스캐너 플로우(`app/scanner.tsx`)에도 재사용**하여,  
    - "식재료를 촬영 → ✨ AI 레시피" 시에도 똑같은 UX와 안전 규칙이 적용되도록 설계했습니다.

- **"셰프의 킥!" 모달: 광장 공유 전 사진 확인·추가 설명 입력**
  - `app/create-recipe.tsx`에서 AI로 만든 레시피나 내 주방 레시피를 **광장에 공유**할 때, 바로 Firestore에 저장하지 않고 **중간에 모달을 한 번 더 거치도록** 변경했습니다.
    - 흐름: `광장 공유` 버튼 → 완료 사진 촬영(또는 기존 사진 선택) → `"셰프의 킥!"` 모달 → 확인 후 Firestore 저장.  
  - `"셰프의 킥!"` 모달 구성:
    - 상단 제목: `"셰프의 킥!"`.  
    - 중앙: 촬영한 사진 미리보기(3:2 비율, 90% 폭, radius + border).  
    - 사진 바로 아래: `"다시 찍기"` pill 버튼 → Alert `"요리의 사진을 다시 찍겠습니까?"` / `"찍을래요"` / `"아니요"` 옵션. `"찍을래요"` 선택 시 카메라 재오픈.  
    - 하단 텍스트 입력: placeholder `"추가/변경하신 사항을 자유롭게 적어주세요! 안 적고 제출하셔도 OK!"` (한 줄 문장, 줄바꿈 없음).  
    - 버튼:
      - `"이대로 광장에 공유하기"` — 내용 확인 Alert 후 Firestore `global_recipes`에 `chefKick` 필드와 함께 업로드.  
      - `"취소"` — `"이전 사항이 저장되지 않습니다. 정말 취소할까요?"` Alert 후 모달 닫기.  
    - 모달 바깥 영역 탭 시에도 동일한 취소 Alert가 뜨도록 통일.
  - 성능/UX 고려:
    - 사진 촬영 즉시 Storage에 업로드하지 않고, **로컬 URI만 저장한 뒤 모달을 먼저 띄움**으로써  
      - 사진을 확인하는 모달이 **지연 없이 바로 뜨게** 하고,  
      - 사용자가 실제로 공유를 확정했을 때만 Storage 업로드를 수행하도록 설계했습니다.

- **Scanner용 Gemini DEV 목업 로직**
  - `app/scanner.tsx`의 `callGeminiAPI`에 `__DEV__` 분기를 추가해, 개발 환경에서는 아래처럼 **하드코딩된 JSON**을 반환합니다:
    - `"is_food_check"` 타입: `{ is_food: true, reason: "예시" }`.  
    - `"curation_from_text"` 타입: `invalid_items`, `detected_ingredients`, 3개의 `curation_themes`(예: 불고기덮밥/얼큰김치찌개/상큼샐러드).  
    - `"curation_from_image"` 타입: 이미지에서 뽑힌 예시 재료 리스트 + 3가지 추천 테마.  
    - `"final_recipe_markdown"` 타입: 불고기덮밥 예시 레시피 마크다운 + 쇼핑 리스트.  
  - 운영 모드에서(`__DEV__ === false`)는 기존처럼 실제 Gemini API를 호출하므로,
    - **DEV: 회수 제한·비용 걱정 없이 UI/플로우 테스트**,
    - **PROD: 실제 모델 응답 사용**이 자연스럽게 분리되도록 구현되어 있습니다.

**7-17. 맞춤 요리 카드 인분 선택(True 3D Flip·터치 개선) + recipe-detail 릴레이**
- **create-recipe.tsx**: 카드 탭 시 **뒷면**에 인분 선택(1~4인분 2×2 + "5인분 이상" + 취소). 인분/취소 시 즉시 flippedCardIndex·pendingThemeForServings 초기화. 커버플로우용 3D transform은 바깥 카드 컨테이너에 유지하고, 그 안쪽 앞/뒷면 레이어에 `flipProgress` 기반 `rotateY` 0→180 / -180→0 + `perspective: 1000` + `backfaceVisibility: 'hidden'` + zIndex 스위칭을 적용해 **실제 180도 3D 플립** 구현. 중앙 카드만 앞/뒤 두 면 렌더, 뒤집힌 상태에서 앞면 pointerEvents='none', 뒷면 'box-none'. 카드 TouchableOpacity에 hitSlop·delayPressIn으로 가장자리 탭 인식 개선. 인분 선택 시 generateFinalRecipe(theme, servings), 결과·광장 공유 메타(finalServings 등) 연동.
- **recipe-detail.tsx**: Plaza 로드 시 relayFromId/relayRootId/relayDepth 매핑, "다른 셰프들!"·"릴레이 요리!" 섹션(relayChildren) 표시. 릴레이 제작 시 params로 create-recipe 이동.
- **create-recipe 광장 공유**: 릴레이 params가 있으면 Firestore 문서에 relay 필드 함께 저장.

**7-18. 3D 홀로그램 셰프 카드 & 스택 레벨바 부착형 디자인 고도화**
- **profile.tsx (내 정보)**: 
  - 카드 터치 시 **180도 smooth flip** 애니메이션 (`withSpring`, `perspective: 1000`, `rotateY` 트릭). Android `pointerEvents` 가림막 전담 제어.
  - 뒷면 스탯 가독성 전면 개선: 테이블형 리스트로 정렬하고 우측 하단 `sync-circle`로 미니멀 명함 룩을 탔습니다.
- **셰프 카드 디자인 상점**:
  - 상단 `별` 아이콘으로 연결되는 커스텀 디자인 `Modal` 개장. 인게임 가상 재화 교환(`coins`) 및 해금 preview 동기화.
- **슬림 레벨 바 부착형**:
  - 기존의 대시보드 부자연스러운 box 레이아웃을 걷어내고, 카드 하단에 단차 없이 밀착 결합시킨 **`attachedLevelBar`**로 묶어 연속성을 높였습니다.

이제 [여기에 Gemini에게 요청할 구체적인 작업 내용을 적어 주세요.]
```

---

## 사용 방법
1. 위 **"프롬프트 (복사용)"** 블록 전체를 복사합니다.
2. 마지막 문장 `이제 [여기에 Gemini에게 요청할 구체적인 작업 내용을 적어 주세요.]` 부분을 실제로 원하는 작업 설명으로 바꿉니다.
3. 웹 Gemini 채팅에 붙여넣고 전송합니다.

필요하면 이 파일 경로(`docs/GEMINI_정리본_프롬프트.md`)를 알려주면, 팀원이나 다른 AI가 같은 맥락으로 이어서 작업할 수 있습니다. 다른 환경에서 처음 셋업할 때는 루트 **README.md**의 "다른 환경에서 작업하기"를 따르면 됩니다.
