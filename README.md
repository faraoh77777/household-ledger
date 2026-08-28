# 우리집가계부

가족과 함께 쓰는 가계부 웹앱. 정적 HTML/CSS/JS + Supabase(Postgres+Auth+RLS)로 만들어졌습니다.
(설계 문서: `..\가계부\기획서.md`, 디자인 목업: 같은 폴더의 published artifact 참고)

## 처음 설정하는 방법 (딱 한 번만 하면 됩니다)

1. **Supabase 프로젝트 만들기**
   https://supabase.com 에서 무료 계정으로 새 프로젝트를 하나 만듭니다.
   (다른 프로젝트와 섞이지 않게, 이 가계부 전용으로 새로 만드는 걸 추천합니다.)

2. **스키마 실행**
   프로젝트 대시보드 > **SQL Editor** 에서 `sql/schema.sql` 파일 내용 전체를 붙여넣고 실행(Run)합니다.
   테이블(households/members/accounts/categories/transactions/budgets), 보안 규칙(RLS),
   가구 생성·참여용 함수까지 한 번에 만들어집니다.

3. **연결 정보 입력**
   프로젝트 **Settings > API** 에서 `Project URL`과 `anon public` 키를 복사해
   `js/supabase-client.js` 파일의 아래 두 줄을 바꿔줍니다.
   ```js
   const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
   const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
   ```

4. **이메일 로그인 확인**
   Supabase 프로젝트는 기본적으로 이메일/비밀번호 로그인이 켜져 있습니다(Authentication > Providers).
   회원가입 시 "이메일 확인" 메일이 오도록 기본 설정되어 있는데, 가족끼리만 쓰는 용도라 번거로우면
   Authentication > Providers > Email 에서 "Confirm email"을 꺼도 됩니다(선택).

5. **로컬에서 열어보기**
   `index.html`을 더블클릭해서 브라우저로 열면 바로 써볼 수 있습니다.
   (또는 `npx serve .` 같은 간단한 정적 서버로 띄워도 됩니다.)

## 배포하기 (GitHub Pages)

report/shoot 등 기존 앱들과 같은 방식입니다.
1. 이 폴더를 새 GitHub 저장소로 push
2. 저장소 Settings > Pages 에서 배포 브랜치를 지정
3. `https://<계정>.github.io/<저장소명>/` 주소로 접속

## 파일 구조

```
household-ledger/
  index.html            로그인 상태 확인 후 알맞은 화면으로 이동
  login.html             로그인 / 회원가입
  household-setup.html   가구 만들기 / 초대코드로 참여
  app.html                메인 화면 (홈/내역/통계/예산/설정 5탭 + 내역추가 모달)
  css/style.css           공통 디자인(따뜻한 톤 색상 변수, 카드, 버튼 등)
  js/supabase-client.js   Supabase 연결 정보 (직접 채워야 함)
  js/auth.js              로그인 세션 / 가구 멤버십 / 다크모드 공용 함수
  js/app.js                메인 앱 로직(데이터 조회·저장, 5탭 렌더링, 문자 붙여넣기 파싱)
  sql/schema.sql          Supabase에 한 번 실행할 스키마 + 보안규칙 + 함수
```

## 이번 1차 구현에서 일부러 뺀 것 (다음에 필요하면 추가)

- **영수증 사진 첨부**: Storage 버킷 연동은 아직 없음(입력창 자체가 빠져 있음).
- **내역 목록 필터(계좌/카테고리/작성자별)**: 지금은 월별 전체 목록만 보여줌.
- **오픈뱅킹 자동 연동**: 기획서 6번에 정리된 대로 Phase 2 항목, 지금은 문자 붙여넣기 반자동까지만.
- **예산 초과 즉시 토스트**(저장 순간 알림): 홈 화면 상단 배너로는 항상 반영되지만, 저장 직후 별도 토스트는 아직 없음.
- 내역 목록의 "스와이프해서 수정/삭제"는 스와이프 제스처 대신 버튼으로 단순화했습니다.

## 사용해보기 전 체크리스트

- [ ] Supabase 프로젝트 생성
- [ ] `sql/schema.sql` 실행
- [ ] `js/supabase-client.js`에 URL/키 입력
- [ ] 회원가입 → 가구 만들기 → 내역 추가까지 한 번 해보기
