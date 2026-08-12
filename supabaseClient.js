// Supabase 연결 설정
// -------------------------------------------------
// 프로젝트: corgddhyokbylsfdclps
// key 는 공개(publishable) 키라 브라우저에 노출되어도 됩니다.
// (민감 데이터는 반드시 Supabase 테이블 RLS 로 보호하세요.)

export const SUPABASE_URL = "https://corgddhyokbylsfdclps.supabase.co";
export const SUPABASE_KEY = "sb_publishable_OVLf_f8LN0gRZlR-8eGTdA_v6DxLLjb";

// supabase-js v2 를 CDN(ESM)으로 불러와 클라이언트 생성
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
