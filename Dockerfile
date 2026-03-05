# 1. Node.js LTS 버전 사용 (Alpine 리눅스 기반으로 경량화)
FROM node:20-alpine

# 2. 작업 디렉토리 설정
WORKDIR /app

# 3. 의존성 파일 복사 및 설치
# package.json과 package-lock.json을 먼저 복사하여 캐싱 효율을 높임
COPY package*.json ./

# npm install 실행 (ci를 사용하면 더 안정적이나 개발용으론 install도 무방)
RUN npm install

# 4. 소스 코드 전체 복사
COPY . .

# 5. Expo Metro Bundler 포트 노출
EXPOSE 8081

# 6. 환경 변수 설정 (필요시)
ENV NODE_ENV=development

# 7. 앱 실행 (터널링 모드로 실행하여 외부 접속 허용)
CMD ["npx", "expo", "start", "--tunnel"]
