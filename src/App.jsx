import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import Login from "./Login";

const FONT = "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif";

const BYTES = [
  { key: "ip",    name: "특허",     desc: "IP 관리",     url: "https://menuitdodo-ip.vercel.app",    color: "#7c5cfc", icon: "⚖️" },
  { key: "fi",    name: "파이낸스", desc: "재무 관리",   url: "https://menuitdodo-fi.vercel.app",    color: "#4a9eff", icon: "💰" },
  { key: "fn",    name: "마케팅",   desc: "마케팅",      url: "https://menuitdodo-fn.vercel.app",    color: "#f59e0b", icon: "📣" },
  { key: "scm",   name: "공급망",   desc: "공급망 관리", url: "https://menuitdodo-scm.vercel.app",   color: "#10b981", icon: "🔗" },
  { key: "sales", name: "영업",     desc: "영업 관리",   url: "https://menuitdodo-sales.vercel.app", color: "#ff5050", icon: "📊" },
];

const STATUS_COLOR = {
  "진행중": "#f59e0b",
  "완료":   "#10b981",
  "보류":   "#4a4d5e",
};

function PasswordModal({ onClose }) {
  const [pw, setPw]         = useState("");
  const [pw2, setPw2]       = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");

  async function save() {
    if (!pw || pw.length < 6) { setMsg("비밀번호는 6자 이상이어야 합니다"); return; }
    if (pw !== pw2) { setMsg("비밀번호가 일치하지 않습니다"); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setMsg(error.message); setSaving(false); return; }
    setMsg("✓ 변경 완료!");
    setTimeout(onClose, 1000);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, fontFamily: FONT }}>
      <div style={{ background: "#11141c", border: "1px solid #1e2130", borderRadius: 14, padding: "36px 32px", width: 360, boxSizing: "border-box" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#e8eaf0", marginBottom: 6 }}>비밀번호 변경</div>
        <div style={{ fontSize: 13, color: "#4a4d5e", marginBottom: 24 }}>새 비밀번호를 입력해주세요 (6자 이상)</div>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="새 비밀번호"
          style={{ width: "100%", boxSizing: "border-box", background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 8, padding: "10px 12px", color: "#e8eaf0", fontSize: 14, outline: "none", fontFamily: "inherit", marginBottom: 10 }} />
        <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} onKeyDown={e => e.key === "Enter" && save()} placeholder="비밀번호 확인"
          style={{ width: "100%", boxSizing: "border-box", background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 8, padding: "10px 12px", color: "#e8eaf0", fontSize: 14, outline: "none", fontFamily: "inherit", marginBottom: 16 }} />
        {msg && <div style={{ fontSize: 12, color: msg.startsWith("✓") ? "#10b981" : "#ff5050", marginBottom: 12 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={saving}
            style={{ flex: 1, background: "linear-gradient(135deg,#7c5cfc,#4a9eff)", border: "none", borderRadius: 8, padding: "11px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {saving ? "저장 중..." : "변경하기"}
          </button>
          <button onClick={onClose}
            style={{ flex: 1, background: "transparent", border: "1px solid #1e2130", borderRadius: 8, padding: "11px", color: "#4a4d5e", fontSize: 14, cursor: "pointer" }}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [profile, setProfile]           = useState(null);
  const [myBytes, setMyBytes]           = useState([]);
  const [todos, setTodos]               = useState([]);
  const [nickname, setNickname]         = useState("");
  const [nickSaving, setNickSaving]     = useState(false);
  const [showPwModal, setShowPwModal]   = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=invite")) setIsFirstLogin(true);

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadAll(data.session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "USER_UPDATED") return;
      setSession(s);
      if (s) loadAll(s.user.id);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadAll(uid) {
    const [{ data: prof }, { data: bm }, { data: td }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).single(),
      supabase.from("byte_members").select("byte_key").eq("user_id", uid),
      supabase.from("patent_todos").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    ]);
    setProfile(prof);
    setMyBytes((bm || []).map(b => b.byte_key));
    setTodos(td || []);
    setLoading(false);
  }

  async function saveNickname() {
    if (!nickname.trim()) return;
    setNickSaving(true);
    await supabase.from("profiles").update({ name: nickname.trim() }).eq("id", session.user.id);
    setProfile(p => ({ ...p, name: nickname.trim() }));
    setNickSaving(false);
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0d0f14", display: "flex", alignItems: "center", justifyContent: "center", color: "#4a4d5e", fontFamily: FONT }}>
      로딩 중...
    </div>
  );
  if (!session) return <Login />;

  if (isFirstLogin) return (
    <div style={{ minHeight: "100vh", background: "#0d0f14", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <PasswordModal onClose={() => setIsFirstLogin(false)} />
    </div>
  );

  if (session && profile && !profile.name) return (
    <div style={{ minHeight: "100vh", background: "#0d0f14", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ background: "#11141c", border: "1px solid #1e2130", borderRadius: 14, padding: "40px 36px", width: 360, boxSizing: "border-box" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#e8eaf0", marginBottom: 6 }}>닉네임 설정</div>
        <div style={{ fontSize: 13, color: "#4a4d5e", marginBottom: 28 }}>앱에서 사용할 이름을 입력해주세요</div>
        <input value={nickname} onChange={e => setNickname(e.target.value)} onKeyDown={e => e.key === "Enter" && saveNickname()} placeholder="닉네임 입력"
          style={{ width: "100%", boxSizing: "border-box", background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 8, padding: "10px 12px", color: "#e8eaf0", fontSize: 14, outline: "none", fontFamily: "inherit", marginBottom: 16 }} />
        <button onClick={saveNickname} disabled={nickSaving || !nickname.trim()}
          style={{ width: "100%", background: nickname.trim() ? "linear-gradient(135deg,#7c5cfc,#4a9eff)" : "#2a2d3a", border: "none", borderRadius: 8, padding: "12px", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          {nickSaving ? "저장 중..." : "시작하기"}
        </button>
      </div>
    </div>
  );

  const visibleBytes = BYTES.filter(b => myBytes.includes(b.key));

  return (
    <div style={{ minHeight: "100vh", background: "#0d0f14", fontFamily: FONT, color: "#e8eaf0" }}>

      {showPwModal && <PasswordModal onClose={() => setShowPwModal(false)} />}

      {/* 헤더 */}
      <div style={{ background: "#11141c", borderBottom: "1px solid #1e2130", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, background: "linear-gradient(135deg,#7c5cfc,#4a9eff)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff" }}>M</div>
          <div style={{ fontSize: 15, fontWeight: 800, background: "linear-gradient(135deg,#7c5cfc,#4a9eff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            my.menuit.io
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "#4a4d5e" }}>{profile?.name || session.user.email}</span>
          <button onClick={() => setShowPwModal(true)}
            style={{ background: "transparent", border: "1px solid #1e2130", color: "#4a4d5e", borderRadius: 7, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}>
            비밀번호 변경
          </button>
          <button onClick={() => supabase.auth.signOut()}
            style={{ background: "transparent", border: "1px solid #1e2130", color: "#4a4d5e", borderRadius: 7, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}>
            로그아웃
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "36px 24px" }}>

        {/* 인사말 */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#e8eaf0", marginBottom: 4 }}>
            안녕하세요, {profile?.name || ""}님
          </div>
          <div style={{ fontSize: 13, color: "#4a4d5e" }}>오늘도 좋은 하루 보내세요</div>
        </div>

        {/* 내 바이트 */}
        <div style={{ marginBottom: 44 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#4a4d5e", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>내 바이트</div>
          {visibleBytes.length === 0 ? (
            <div style={{ background: "#11141c", border: "1px solid #1e2130", borderRadius: 10, padding: "28px", textAlign: "center", fontSize: 13, color: "#4a4d5e" }}>
              아직 배정된 바이트가 없습니다
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              {visibleBytes.map(b => (
                <a key={b.key} href={b.url} target="_blank" rel="noopener noreferrer"
                  style={{ background: "#11141c", border: "1px solid #1e2130", borderRadius: 12, padding: "20px 18px", textDecoration: "none", display: "block", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = b.color}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#1e2130"}>
                  <div style={{ fontSize: 26, marginBottom: 10 }}>{b.icon}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#e8eaf0", marginBottom: 3 }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: "#4a4d5e", marginBottom: 14 }}>{b.desc}</div>
                  <div style={{ fontSize: 11, color: b.color, fontWeight: 700 }}>열기 →</div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* 내 TODO */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#4a4d5e", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>내 TODO</div>
          {todos.length === 0 ? (
            <div style={{ background: "#11141c", border: "1px solid #1e2130", borderRadius: 10, padding: "28px", textAlign: "center", fontSize: 13, color: "#4a4d5e" }}>
              할 일이 없습니다
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {todos.map(t => {
                const dl = t.due_date ? Math.ceil((new Date(t.due_date) - new Date()) / 86400000) : null;
                return (
                  <div key={t.id} style={{ background: "#11141c", border: "1px solid #1e2130", borderRadius: 10, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[t.status] || "#4a4d5e", flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 14, color: "#e8eaf0", fontWeight: 600 }}>{t.title}</div>
                    {t.note && <div style={{ fontSize: 12, color: "#4a4d5e", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note}</div>}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {dl !== null && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: dl < 0 ? "#ff5050" : dl <= 3 ? "#f59e0b" : "#4a4d5e" }}>
                          {dl < 0 ? `D+${Math.abs(dl)}` : dl === 0 ? "D-day" : `D-${dl}`}
                        </span>
                      )}
                      <span style={{ fontSize: 11, fontWeight: 700,
                        color: STATUS_COLOR[t.status] || "#4a4d5e",
                        background: (STATUS_COLOR[t.status] || "#4a4d5e") + "22",
                        border: `1px solid ${(STATUS_COLOR[t.status] || "#4a4d5e")}55`,
                        borderRadius: 4, padding: "2px 7px" }}>
                        {t.status || "진행중"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
