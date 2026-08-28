// ============================================================
// Supabase 프로젝트 연결 정보
// sql/schema.sql을 실행한 "자신의" Supabase 프로젝트 값으로 바꿔주세요.
// Supabase 대시보드 > Project Settings > API 에서 확인할 수 있습니다.
// ============================================================
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
