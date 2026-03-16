import { useState } from "react";
import { supabase } from "./supabase";

const FONT = "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif";

export default function Login() {
  const [email, setEmail]     = useState("");
  const [pw, setPw]           = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function login(e) {
    e.preventDefault();
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) setError("이메일 또는 비밀번호가 올바르지 않습니다.");
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0d0f14", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <form onSubmit={login} style={{ background: "#11141c", border: "1px solid #1e2130", borderRadius: 14, padding: "40px 36px", width: 360, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, background: "linear-gradient(135deg,#7c5cfc,#4a9eff)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "#fff" }}>M</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#e8eaf0" }}>메뉴잇</div>
            <div style={{ fontSize: 12, color: "#4a4d5e" }}>my.menuit.io</div>
          </div>
        </div>
        {error && <div style={{ background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)", color: "#ff5050", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "#8890a4", marginBottom: 6 }}>이메일</div>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="이메일 입력"
            style={{ width: "100%", boxSizing: "border-box", background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 8, padding: "10px 12px", color: "#e8eaf0", fontSize: 14, outline: "none", fontFamily: "inherit" }} />
        </div>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: "#8890a4", marginBottom: 6 }}>비밀번호</div>
          <input value={pw} onChange={e => setPw(e.target.value)} type="password" required placeholder="••••••••"
            style={{ width: "100%", boxSizing: "border-box", background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 8, padding: "10px 12px", color: "#e8eaf0", fontSize: 14, outline: "none", fontFamily: "inherit" }} />
        </div>
        <button type="submit" disabled={loading}
          style={{ width: "100%", background: "linear-gradient(135deg,#7c5cfc,#4a9eff)", border: "none", borderRadius: 8, padding: "12px", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}
