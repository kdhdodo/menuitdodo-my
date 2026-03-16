import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const STATUS_COLOR = {
  "진행중": "#f59e0b",
  "완료":   "#10b981",
  "보류":   "#4a4d5e",
};

function formatCommentDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

function formatDue(due) {
  if (!due) return null;
  return due.replace(/-/g, ".");
}

function daysLeft(due) {
  if (!due) return null;
  return Math.ceil((new Date(due) - new Date()) / 86400000);
}

function isImage(name) {
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
}

function AttachmentView({ att }) {
  if (isImage(att.name)) {
    return (
      <a href={att.url} target="_blank" rel="noopener noreferrer">
        <img src={att.url} alt={att.name}
          style={{ maxWidth: 200, maxHeight: 160, borderRadius: 6, border: "1px solid #1e2130", objectFit: "cover", cursor: "pointer" }} />
      </a>
    );
  }
  return (
    <a href={att.url} target="_blank" rel="noopener noreferrer" download={att.name}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 6, padding: "5px 10px", color: "#8890a4", fontSize: 12, textDecoration: "none" }}>
      📄 {att.name}
    </a>
  );
}

function LinkView({ link }) {
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 6, padding: "5px 10px", color: "#4a9eff", fontSize: 12, textDecoration: "none", maxWidth: 320, overflow: "hidden" }}>
      🔗 <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.label || link.url}</span>
    </a>
  );
}

export default function TodoPage() {
  const [todos, setTodos]           = useState([]);
  const [selected, setSelected]     = useState(null);
  const [comments, setComments]     = useState([]);
  const [members, setMembers]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [cLoading, setCLoading]     = useState(false);
  const [showAdd, setShowAdd]       = useState(false);
  const [filter, setFilter]         = useState("전체");
  const [tForm, setTForm]           = useState({ title: "", due_date: "", note: "", status: "진행중" });
  const [cForm, setCForm]           = useState({ author_id: "", custom_name: "", content: "" });
  const [pendingFiles, setPendingFiles] = useState([]);
  const [pendingLinks, setPendingLinks] = useState([]);
  const [linkInput, setLinkInput]   = useState({ url: "", label: "" });
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [saving, setSaving]         = useState(false);
  const timelineRef                 = useRef(null);
  const dragItem                    = useRef(null);
  const dragOverItem                = useRef(null);
  const [dragIndex, setDragIndex]   = useState(null);
  const [dropIndex, setDropIndex]   = useState(null);

  useEffect(() => { loadTodos(); loadMembers(); }, []);
  useEffect(() => { if (selected) loadComments(selected.id); }, [selected]);

  async function loadTodos() {
    setLoading(true);
    const { data } = await supabase
      .from("patent_todos")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setTodos(data || []);
    if (data?.length > 0) setSelected(prev => prev ?? data[0]);
    setLoading(false);
  }

  async function loadMembers() {
    const { data } = await supabase.from("profiles").select("id, email, name").order("created_at");
    setMembers(data || []);
  }

  async function loadComments(todoId) {
    setCLoading(true);
    const { data } = await supabase
      .from("todo_comments")
      .select("*")
      .eq("todo_id", todoId)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    setComments(data || []);
    setCLoading(false);
    setTimeout(() => timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  async function changeStatus(id, status) {
    await supabase.from("patent_todos").update({ status }).eq("id", id);
    setTodos(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    if (selected?.id === id) setSelected(s => ({ ...s, status }));
  }

  async function addTodo() {
    if (!tForm.title.trim()) return;
    setSaving(true);
    const { data } = await supabase.from("patent_todos").insert({
      title:    tForm.title.trim(),
      status:   tForm.status,
      due_date: tForm.due_date || null,
      note:     tForm.note.trim() || null,
    }).select().single();
    setTForm({ title: "", due_date: "", note: "", status: "진행중" });
    setShowAdd(false);
    setSaving(false);
    await loadTodos();
    if (data) setSelected(data);
  }

  async function uploadFiles(files, todoId) {
    const results = [];
    for (const file of files) {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const path = `todos/${todoId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { data, error } = await supabase.storage.from("dispute-files").upload(path, file, { upsert: false });
      if (error) { console.error("upload error", error); continue; }
      if (data) {
        const { data: { publicUrl } } = supabase.storage.from("dispute-files").getPublicUrl(data.path);
        results.push({ name: file.name, url: publicUrl });
      }
    }
    return results;
  }

  async function addComment() {
    const isCustom = cForm.author_id === "__custom__";
    const authorName = isCustom
      ? cForm.custom_name.trim()
      : (() => { const m = members.find(m => m.id === cForm.author_id); return m?.name || m?.email || ""; })();
    if (!authorName) return;
    if (!cForm.content.trim() && pendingFiles.length === 0 && pendingLinks.length === 0) return;
    setSaving(true);
    const uploadedFiles = pendingFiles.length > 0 ? await uploadFiles(pendingFiles, selected.id) : [];
    const maxOrder = comments.reduce((max, c) => Math.max(max, c.sort_order ?? 0), 0);
    await supabase.from("todo_comments").insert({
      todo_id:     selected.id,
      author_id:   isCustom ? null : cForm.author_id,
      author_name: authorName,
      content:     cForm.content.trim(),
      sort_order:  maxOrder + 1,
      attachments: uploadedFiles,
      links:       pendingLinks,
    });
    setCForm(f => ({ ...f, content: "" }));
    setPendingFiles([]);
    setPendingLinks([]);
    setShowLinkForm(false);
    setLinkInput({ url: "", label: "" });
    setSaving(false);
    loadComments(selected.id);
  }

  function addLink() {
    if (!linkInput.url.trim()) return;
    let url = linkInput.url.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    setPendingLinks(prev => [...prev, { url, label: linkInput.label.trim() || url }]);
    setLinkInput({ url: "", label: "" });
    setShowLinkForm(false);
  }

  function onPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItems = Array.from(items).filter(item => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    e.preventDefault();
    const files = imageItems.map(item => {
      const blob = item.getAsFile();
      return new File([blob], `붙여넣기_${Date.now()}.png`, { type: blob.type });
    });
    setPendingFiles(prev => [...prev, ...files]);
  }

  async function removeTodo(id) {
    if (!confirm("삭제하시겠습니까?")) return;
    await supabase.from("patent_todos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (selected?.id === id) setSelected(null);
    loadTodos();
  }

  async function removeComment(id) {
    await supabase.from("todo_comments").delete().eq("id", id);
    setComments(prev => prev.filter(c => c.id !== id));
  }

  function onDragStart(e, index) {
    dragItem.current = index;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragEnter(index) {
    dragOverItem.current = index;
    setDropIndex(index);
  }

  function onDragEnd() {
    setDragIndex(null);
    setDropIndex(null);
  }

  async function onDrop() {
    const from = dragItem.current;
    const to   = dragOverItem.current;
    if (from === null || to === null || from === to) {
      dragItem.current = null; dragOverItem.current = null;
      setDragIndex(null); setDropIndex(null);
      return;
    }
    const reordered = [...comments];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const updated = reordered.map((c, i) => ({ ...c, sort_order: i + 1 }));
    setComments(updated);
    await Promise.all(updated.map(c =>
      supabase.from("todo_comments").update({ sort_order: c.sort_order }).eq("id", c.id)
    ));
    dragItem.current = null; dragOverItem.current = null;
    setDragIndex(null); setDropIndex(null);
  }

  const hasAuthor = cForm.author_id && (cForm.author_id !== "__custom__" || cForm.custom_name.trim());
  const canSubmit = hasAuthor && (cForm.content.trim() || pendingFiles.length > 0 || pendingLinks.length > 0);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>

      {/* ── 할 일 목록 ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["전체", ...Object.keys(STATUS_COLOR)].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ background: filter === f ? (STATUS_COLOR[f] || "#e8eaf0") + "22" : "transparent", border: `1px solid ${filter === f ? (STATUS_COLOR[f] || "#e8eaf0") : "#1e2130"}`, borderRadius: 6, padding: "4px 12px", color: filter === f ? (STATUS_COLOR[f] || "#e8eaf0") : "#4a4d5e", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {f}
            </button>
          ))}
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          style={{ background: showAdd ? "#2a2d3a" : "linear-gradient(135deg,#7c5cfc,#4a9eff)", border: "none", borderRadius: 7, padding: "8px 18px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {showAdd ? "취소" : "+ 추가"}
        </button>
      </div>

      {/* 추가 폼 */}
      {showAdd && (
        <div style={{ background: "#11141c", border: "1px solid #1e2130", borderRadius: 10, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 8 }}>
            <input value={tForm.title} onChange={e => setTForm(f => ({ ...f, title: e.target.value }))}
              placeholder="할 일 제목"
              style={{ background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 7, padding: "8px 12px", color: "#e8eaf0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
            <select value={tForm.status} onChange={e => setTForm(f => ({ ...f, status: e.target.value }))}
              style={{ background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 7, padding: "8px 12px", color: "#e8eaf0", fontSize: 13, outline: "none", fontFamily: "inherit" }}>
              {Object.keys(STATUS_COLOR).map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input value={tForm.note} onChange={e => setTForm(f => ({ ...f, note: e.target.value }))}
              placeholder="설명 (선택)"
              style={{ background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 7, padding: "8px 12px", color: "#e8eaf0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
            <button onClick={addTodo} disabled={saving || !tForm.title.trim()}
              style={{ background: tForm.title.trim() ? "linear-gradient(135deg,#7c5cfc,#4a9eff)" : "#2a2d3a", border: "none", borderRadius: 7, padding: "8px 20px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {saving ? "..." : "저장"}
            </button>
          </div>
        </div>
      )}

      {/* 카드 목록 */}
      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: "#4a4d5e", fontSize: 13 }}>불러오는 중...</div>
      ) : todos.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "#4a4d5e", fontSize: 13 }}>등록된 할 일이 없습니다</div>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 32 }}>
          {todos.filter(t => filter === "전체" || (t.status || "진행중") === filter).map(t => {
            const dl = daysLeft(t.due_date);
            const urgent = dl !== null && dl <= 7;
            return (
              <div key={t.id} onClick={() => setSelected(selected?.id === t.id ? null : t)}
                style={{
                  background: selected?.id === t.id ? "#151820" : "#11141c",
                  border: `1px solid ${selected?.id === t.id ? (STATUS_COLOR[t.status] || "#7c5cfc") : "#1e2130"}`,
                  borderRadius: 10, padding: "12px 16px", cursor: "pointer", minWidth: 160, position: "relative",
                }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#e8eaf0", marginBottom: 6, paddingRight: 20 }}>{t.title}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: t.due_date ? 4 : 0 }}>
                  <select value={t.status || "진행중"}
                    onClick={e => e.stopPropagation()}
                    onChange={e => { e.stopPropagation(); changeStatus(t.id, e.target.value); }}
                    style={{ background: (STATUS_COLOR[t.status] || "#4a4d5e") + "22", border: `1px solid ${(STATUS_COLOR[t.status] || "#4a4d5e")}55`, borderRadius: 4, padding: "2px 6px", color: STATUS_COLOR[t.status] || "#4a4d5e", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    {Object.keys(STATUS_COLOR).map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                {t.due_date && (
                  <div style={{ fontSize: 11, color: urgent ? "#f59e0b" : "#4a4d5e", fontWeight: urgent ? 700 : 400 }}>
                    {formatDue(t.due_date)}
                    {dl !== null && (dl === 0 ? " (오늘)" : dl < 0 ? ` (${Math.abs(dl)}일 초과)` : ` (D-${dl})`)}
                  </div>
                )}
                {t.note && <div style={{ fontSize: 11, color: "#4a4d5e", marginTop: 4, lineHeight: 1.4 }}>{t.note}</div>}
                <button onClick={e => { e.stopPropagation(); removeTodo(t.id); }}
                  style={{ background: "transparent", border: "none", color: "#2a2d3a", fontSize: 15, cursor: "pointer", padding: "0 2px", position: "absolute", top: 8, right: 8 }}>×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 타임라인 ── */}
      {selected && (
        <div ref={timelineRef}>
          <div style={{ borderTop: "1px solid #1e2130", paddingTop: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#e8eaf0" }}>{selected.title}</div>
            {selected.due_date && (() => {
              const dl = daysLeft(selected.due_date);
              const urgent = dl !== null && dl <= 7;
              return <div style={{ fontSize: 12, color: urgent ? "#f59e0b" : "#4a4d5e", marginTop: 4 }}>
                {formatDue(selected.due_date)}{dl !== null && (dl === 0 ? " (오늘)" : dl < 0 ? ` (${Math.abs(dl)}일 초과)` : ` (D-${dl})`)}
              </div>;
            })()}
            {selected.note && <div style={{ fontSize: 12, color: "#4a4d5e", marginTop: 4 }}>{selected.note}</div>}
          </div>

          {cLoading ? (
            <div style={{ padding: 24, textAlign: "center", color: "#4a4d5e", fontSize: 13 }}>불러오는 중...</div>
          ) : comments.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#4a4d5e", fontSize: 13 }}>아직 등록된 내용이 없습니다</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 24, position: "relative" }}>
              <div style={{ position: "absolute", left: 19, top: 0, bottom: 0, width: 2, background: "#1e2130" }} />
              {comments.map((c, i) => (
                <div key={c.id}
                  draggable
                  onDragStart={e => onDragStart(e, i)}
                  onDragEnter={() => onDragEnter(i)}
                  onDragEnd={onDragEnd}
                  onDrop={onDrop}
                  onDragOver={e => e.preventDefault()}
                  style={{
                    display: "flex", gap: 16, paddingBottom: 20, position: "relative",
                    opacity: dragIndex === i ? 0.4 : 1,
                    borderTop: dropIndex === i && dragIndex !== i ? "2px solid #7c5cfc" : "2px solid transparent",
                    transition: "opacity 0.15s", cursor: "grab",
                  }}>
                  <div style={{ width: 40, flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: 2 }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#7c5cfc", border: "2px solid #0d0f14", zIndex: 1 }} />
                  </div>
                  <div style={{ flex: 1, background: "#11141c", border: "1px solid #1e2130", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "#2a2d3a", fontSize: 14, cursor: "grab", userSelect: "none", letterSpacing: "-1px" }}>⠿</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#7c5cfc" }}>{c.author_name}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, color: "#4a4d5e" }}>{formatCommentDate(c.created_at)}</span>
                        <button onClick={() => removeComment(c.id)}
                          style={{ background: "transparent", border: "none", color: "#2a2d3a", fontSize: 14, cursor: "pointer", padding: 0 }}>×</button>
                      </div>
                    </div>
                    {c.content && <div style={{ fontSize: 13, color: "#e8eaf0", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: (c.attachments?.length || c.links?.length) ? 10 : 0 }}>{c.content}</div>}
                    {c.attachments?.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: c.links?.length ? 8 : 0 }}>
                        {c.attachments.map((att, j) => <AttachmentView key={j} att={att} />)}
                      </div>
                    )}
                    {c.links?.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {c.links.map((link, j) => <LinkView key={j} link={link} />)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 입력 */}
          <div style={{ background: "#11141c", border: "1px solid #1e2130", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "180px 1fr auto", gap: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <select value={cForm.author_id} onChange={e => setCForm(f => ({ ...f, author_id: e.target.value, custom_name: "" }))}
                  style={{ background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 7, padding: "8px 12px", color: cForm.author_id ? "#e8eaf0" : "#4a4d5e", fontSize: 13, outline: "none", fontFamily: "inherit" }}>
                  <option value="">작성자 선택</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                  <option value="__custom__">직접 입력</option>
                </select>
                {cForm.author_id === "__custom__" && (
                  <input value={cForm.custom_name} onChange={e => setCForm(f => ({ ...f, custom_name: e.target.value }))}
                    placeholder="이름 입력"
                    style={{ background: "#0d0f14", border: "1px solid #7c5cfc55", borderRadius: 7, padding: "8px 12px", color: "#e8eaf0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <textarea value={cForm.content} onChange={e => setCForm(f => ({ ...f, content: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); }}}
                  onPaste={onPaste}
                  placeholder="내용 입력 (Enter로 등록, Shift+Enter로 줄바꿈, 이미지 Ctrl+V)"
                  rows={1}
                  style={{ background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 7, padding: "8px 12px", color: "#e8eaf0", fontSize: 13, outline: "none", fontFamily: "inherit", resize: "none", overflowY: "hidden", lineHeight: 1.6, minHeight: 36, fieldSizing: "content" }} />

                {pendingFiles.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {pendingFiles.map((f, i) => (
                      <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 6, padding: "4px 8px" }}>
                        <span style={{ fontSize: 11, color: "#8890a4" }}>{isImage(f.name) ? "🖼" : "📄"} {f.name}</span>
                        <button onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                          style={{ background: "transparent", border: "none", color: "#4a4d5e", fontSize: 12, cursor: "pointer", padding: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}

                {pendingLinks.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {pendingLinks.map((link, i) => (
                      <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 6, padding: "4px 8px" }}>
                        <span style={{ fontSize: 11, color: "#4a9eff" }}>🔗 {link.label}</span>
                        <button onClick={() => setPendingLinks(prev => prev.filter((_, j) => j !== i))}
                          style={{ background: "transparent", border: "none", color: "#4a4d5e", fontSize: 12, cursor: "pointer", padding: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}

                {showLinkForm && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6 }}>
                    <input value={linkInput.url} onChange={e => setLinkInput(f => ({ ...f, url: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && addLink()}
                      placeholder="URL (예: https://...)"
                      style={{ background: "#0d0f14", border: "1px solid #4a9eff55", borderRadius: 7, padding: "7px 10px", color: "#e8eaf0", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
                    <input value={linkInput.label} onChange={e => setLinkInput(f => ({ ...f, label: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && addLink()}
                      placeholder="표시 이름 (선택)"
                      style={{ background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 7, padding: "7px 10px", color: "#e8eaf0", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
                    <button onClick={addLink}
                      style={{ background: "linear-gradient(135deg,#7c5cfc,#4a9eff)", border: "none", borderRadius: 7, padding: "7px 14px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>추가</button>
                  </div>
                )}

                <div style={{ display: "flex", gap: 6 }}>
                  <label style={{ position: "relative", background: "transparent", border: "1px solid #1e2130", borderRadius: 6, padding: "5px 10px", color: pendingFiles.length > 0 ? "#7c5cfc" : "#4a4d5e", fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
                    📎 파일{pendingFiles.length > 0 && <span style={{ fontWeight: 700 }}>({pendingFiles.length})</span>}
                    <input type="file" multiple
                      style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", fontSize: 0 }}
                      onChange={e => { const files = Array.from(e.target.files || []); if (files.length > 0) setPendingFiles(prev => [...prev, ...files]); e.target.value = ""; }} />
                  </label>
                  <button onClick={() => setShowLinkForm(v => !v)}
                    style={{ background: showLinkForm ? "#1e2130" : "transparent", border: "1px solid #1e2130", borderRadius: 6, padding: "5px 10px", color: showLinkForm ? "#4a9eff" : "#4a4d5e", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    🔗 URL
                  </button>
                </div>
              </div>

              <button onClick={addComment} disabled={saving || !canSubmit}
                style={{ background: canSubmit ? "linear-gradient(135deg,#7c5cfc,#4a9eff)" : "#2a2d3a", border: "none", borderRadius: 7, padding: "8px 20px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", alignSelf: "flex-start" }}>
                {saving ? "..." : "등록"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
