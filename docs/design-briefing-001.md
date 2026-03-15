# [디자인 브리핑 - 001호]

## 1. 디자인 감사 (Audit)

*   **일관성 점수:** **78 / 100**
*   **점수 산정 근거:**
    *   **[긍정]** 최근 트렌드인 **글래스모피즘(Glassmorphism)**과 상큼한 **오렌지 톤(`design-tokens.ts`)**을 메인 레이아웃 및 홈 화면에 잘 녹여내어 시각적 전달력이 우수함.
    *   **[부정]** 공용 UI 컴포넌트(Button, Input, Card 등)의 부재로 인해 화면 파일(`index.tsx` 등)이 비대해지고 스타일이 하드코딩되는 **스타일 파편화** 위험이 높음.
    *   **[부정]** 구형 테마 파일(`theme.ts`)이 잔존하여 작업자 간 혼선 및 디자인 노이즈 유발 소지가 있음.

### 🚨 가장 시급한 개선 과제 Top 3
1.  **공용 UI 컴포넌트 아키텍처 수립**
    *   `components/ui/`에 `Button`, `Input`, `Card` 등 원자(Atomic) 컴포넌트를 정의하여 코드 중복 제거 및 일관성 확보.
2.  **레거시 테마 (`theme.ts`) 제거 및 단일화**
    *   `design-tokens.ts`를 "Single Source of Truth"로 확정하고 구형 코드를 정리하여 디자인 시스템 연동 오류 차단.
3.  **글래스모피즘 스타일 규격화**
    *   화면별로 개별 적용 중인 `BlurView` 및 그림자 옵션을 `GlassCard` 컴포넌트로 규격화하여 렌더링 성능 및 비주얼 완성도 향상.

---

## 2. 브랜드 컬러 확립 및 UX 근거

*   **메인 컬러 (Primary):** `#E85D04` *(Warm Orange)*
*   **보조 액센트 (Accent):** `#F97316` *(Light Orange)*
*   **글래스 배경 (Glass):** `rgba(255, 255, 255, 0.72)`
*   **배경색 (Background):** `#FAFAF9` *(Warm Beige)*

> **💡 UX 심리학적 근거:**
> 주황색(Orange)은 활력과 친근함을 자극하고 **식욕을 돋우는 대표적인 색상**입니다. 요리 앱의 정체성에 부합하며, 이를 글래스모피즘의 화이트 톤으로 중화함으로써 **"깨끗한 주방"과 "트렌디한 모던함"**을 동시에 전달합니다.

---

## 3. 신규 작업을 위한 디자인 가이드

### 🔘 버튼 (Button)
*   `BounceButton`을 확장하여 `variant`(`primary`, `secondary`, `outlined`)를 지원하도록 개선.
*   **Primary:** `#E85D04` 배경 + `#FFFFFF` 텍스트 + `Shadows.glow` 그림자 적용.

### ✍️ 입력창 (Input / TextInput)
*   **둥글기:** `Radius.md` (16px)를 적용하여 부드러운 클레이모피즘(Claymorphism) 느낌 유도.
*   **테두리:** 투명도 8%의 `Colors.border`를 사용하여 프레임이 과도하게 강조되어 콘텐츠 가독성을 해치지 않도록 조율.

### 🧭 아이콘 (Icons)
*   `Ionicons` 및 `MaterialCommunityIcons` 규격 사용.
*   **규칙:** 탭 활성화나 강조 액션 시에는 **Filled(채워짐)**, 일반 안내나 서브 섹션에는 **Outline(선형)**을 사용하여 상태 변화의 인지 속도를 배가함.

---

## 4. 실시간 프리뷰 모니터링 계획

*   **모니터링 대상:** `http://localhost:8081` (Expo Web Preview 포트)
*   **검증 프로세스 (안티그래비티 PC 환경):**
    1.  백그라운드 터미널에서 `npx expo start --web` 실행 확인 (혹은 수동 구동).
    2.  `Browser` 서브에이전트를 통해 해당 로컬 URL 로드.
    3.  컴포넌트의 가변 프레임 대응력(Responsiveness), 폰트 가독성(WCAG 대비), 글래스모피즘 투영 효과 등을 시각적으로 Inspection 및 캡처하여 검증.
