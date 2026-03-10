// CookDex — 미니멀 + 글래스모피즘, 오렌지 베이스 (2026 트렌드)
export const Colors = {
  // 브랜드 & 액센트 (오렌지 베이스)
  primary: '#E85D04',        // 메인 오렌지 (진한)
  primaryLight: '#F97316',   // 밝은 오렌지 (버튼/강조)
  primarySoft: '#FFF7ED',    // 연한 오렌지 톤 (배경/태그)
  accent: '#FB923C',         // 보조 액센트

  // 배경 레벨 (라이트, 포털 느낌)
  bgMain: '#FAFAF9',         // 전체 배경 – 웜 그레이
  bgElevated: '#FFFFFF',     // 카드 기본
  bgCard: '#FFFFFF',         // 강조 카드
  bgMuted: '#F5F5F4',        // 보조 섹션
  bgModal: '#FFFFFF',        // 모달

  // 글래스모피즘 (반투명 카드용)
  glassBg: 'rgba(255, 255, 255, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.9)',
  glassBgDark: 'rgba(0, 0, 0, 0.04)',

  // 텍스트
  textMain: '#1C1917',       // 기본 텍스트
  textSub: '#78716C',        // 서브 텍스트
  textMuted: 'rgba(28, 25, 23, 0.6)',
  textInverse: '#FFFFFF',    // 진한 배경 위 텍스트

  // 상태 & 액션
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  actionShop: '#0EA5E9',
  actionDelete: '#EF4444',

  // 보더 & 선
  border: 'rgba(28, 25, 23, 0.08)',
  borderStrong: 'rgba(28, 25, 23, 0.12)',

  // 기타
  overlayDark: 'rgba(28, 25, 23, 0.4)',
  // 배경 메쉬/산뜻함용 (은은한 보조 톤)
  meshMint: 'rgba(240, 253, 244, 0.5)',
  meshPeach: 'rgba(255, 247, 237, 0.45)',
};

export const Radius = {
  xl: 32,
  lg: 24,
  md: 16,
  sm: 12,
  pill: 999,
};

export const Shadows = {
  glow: {
    shadowColor: '#E85D04',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  glass: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  // 클레이모피즘/네오모피즘 칩용 (부드러운 입체감)
  clay: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
  },
  clayInner: {
    shadowColor: '#fff',
    shadowOffset: { width: -1, height: -1 },
    shadowOpacity: 0.6,
    shadowRadius: 2,
    elevation: 0,
  },
  // 입체 글래스: 가까운 그림자 (버튼이 붙어 있는 느낌)
  glassTight: {
    shadowColor: '#E85D04',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
  },
  // 입체 글래스: 먼 그림자 (떠 있는 느낌)
  glassDiffused: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
};

// 유리 상단·좌측 하이라이트 (위에서 빛 받는 두께감)
export const GlassHighlight = {
  borderTopWidth: 1,
  borderLeftWidth: 1,
  borderTopColor: 'rgba(255, 255, 255, 0.5)',
  borderLeftColor: 'rgba(255, 255, 255, 0.5)',
};

// 퀵 메뉴 칩용 파스텔 배경 (레퍼런스 클레이 스타일)
export const ClayChipColors = {
  blue: '#E0F2FE',    // 출석/캘린더
  yellow: '#FEF9C3',  // 냉장고
  pink: '#FCE7F3',    // 오늘 뭐먹지
  green: '#DCFCE7',  // 레시피 분류
  peach: '#FFEDD5',   // 할인/혜택
};
