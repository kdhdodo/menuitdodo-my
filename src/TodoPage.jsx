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
  const textareaRef                 = useRef(null);
  const dragItem                    = useRef(null);
  const dragOverItem                = useRef(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [showMention, setShowMention]   = useState(false);
  const [dragIndex, setDragIndex]   = useState(null);
  const [dropIndex, setDropIndex]   = useState(null);
  const [followers, setFollowers]   = useState({});
  const [unreadMentions, setUnreadMentions] = useState(new Set());
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyForm, setReplyForm]   = useState({ author_id: "", custom_name: "", content: "" });
  const replyTextareaRef            = useRef(null);
  const [replyMentionQuery, setReplyMentionQuery] = useState("");
  const [showReplyMention, setShowReplyMention]   = useState(false);

  useEffect(() => { loadTodos(); loadMembers(); loadFollowers(); loadUnreadMentions(); }, []);
  useEffect(() => { if (selected) loadComments(selected.id); }, [selected]);

  async function loadUnreadMentions() {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    const { data } = await supabase.from("mention_reads").select("todo_id").eq("user_id", uid);
    setUnreadMentions(new Set((data || []).map(r => r.todo_id)));
  }

  async function markMentionRead(todoId) {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    await supabase.from("mention_reads").delete().eq("user_id", uid).eq("todo_id", todoId);
    setUnreadMentions(prev => { const next = new Set(prev); next.delete(todoId); return next; });
  }

  async function loadTodos() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) { setLoading(false); return; }
    const { data: follows } = await supabase.from("todo_followers").select("todo_id").eq("user_id", uid);
    const ids = (follows || []).map(f => f.todo_id);
    if (ids.length === 0) { setTodos([]); setLoading(false); return; }
    const { data } = await supabase
      .from("patent_todos")
      .select("*")
      .is("deleted_at", null)
      .in("id", ids)
      .order("created_at", { ascending: false });
    setTodos(data || []);
    const params = new URLSearchParams(window.location.search);
    const todoParam = params.get("todo");
    if (todoParam && data) {
      const target = data.find(t => t.id === todoParam);
      if (target) setSelected(target);
      window.history.replaceState(null, "", window.location.pathname);
    } else if (data?.length > 0) {
      setSelected(prev => prev ?? data[0]);
    }
    setLoading(false);
  }

  async function loadMembers() {
    const { data } = await supabase.from("profiles").select("id, email, name").order("created_at");
    setMembers(data || []);
  }

  async function loadFollowers() {
    const { data } = await supabase.from("todo_followers").select("*");
    const map = {};
    for (const f of (data || [])) {
      if (!map[f.todo_id]) map[f.todo_id] = [];
      map[f.todo_id].push(f.user_id);
    }
    setFollowers(map);
  }

  async function toggleFollower(todoId, userId) {
    const list = followers[todoId] || [];
    const on = list.includes(userId);
    if (on) {
      await supabase.from("todo_followers").delete().eq("todo_id", todoId).eq("user_id", userId);
    } else {
      await supabase.from("todo_followers").insert({ todo_id: todoId, user_id: userId });
    }
    setFollowers(prev => {
      const next = { ...prev, [todoId]: [...(prev[todoId] || [])] };
      if (on) next[todoId] = next[todoId].filter(id => id !== userId);
      else next[todoId].push(userId);
      return next;
    });
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

  const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqbnNid3NndXFpcnNraW11a3hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg3MzEsImV4cCI6MjA4OTE0NDczMX0.PkHZQsAUVzOj6c6NaEgvyfPcF6e1m7JbnNTta7ZaNjQ";

  const mentionMembers = showMention
    ? members.filter(m => {
        const n = (m.name || m.email || "").toLowerCase();
        return !mentionQuery || n.startsWith(mentionQuery.toLowerCase());
      }).slice(0, 6)
    : [];

  function handleContentChange(e) {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const match = before.match(/@([\w가-힣]*)$/);
    if (match) { setMentionQuery(match[1]); setShowMention(true); }
    else { setShowMention(false); }
    setCForm(f => ({ ...f, content: val }));
  }

  function selectMention(member) {
    const name = member.name || member.email.split("@")[0];
    const cursor = textareaRef.current?.selectionStart ?? cForm.content.length;
    const before = cForm.content.slice(0, cursor);
    const match = before.match(/@([\w가-힣]*)$/);
    const start = match ? cursor - match[0].length : cursor;
    const newContent = cForm.content.slice(0, start) + `@${name} ` + cForm.content.slice(cursor);
    setCForm(f => ({ ...f, content: newContent }));
    setShowMention(false);
    setTimeout(() => {
      const pos = start + name.length + 2;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  function sendMentionNotifications(content, authorName) {
    const matches = [...content.matchAll(/@([\w가-힣]+)/g)];
    if (!matches.length) return;
    const names = matches.map(m => m[1]);
    const mentioned = members.filter(m => names.includes(m.name) || names.includes(m.email?.split("@")[0]));
    if (!mentioned.length) return;
    fetch("https://djnsbwsguqirskimukxh.supabase.co/functions/v1/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}` },
      body: JSON.stringify({
        action: "notify",
        todoId: selected?.id,
        todoTitle: selected?.title,
        authorName,
        content,
        recipients: mentioned.map(m => ({ email: m.email, name: m.name || m.email })),
      }),
    });
  }

  async function addReply(parentId) {
    const isCustom = replyForm.author_id === "__custom__";
    const authorName = isCustom
      ? replyForm.custom_name.trim()
      : (() => { const m = members.find(m => m.id === replyForm.author_id); return m?.name || m?.email || ""; })();
    if (!authorName || !replyForm.content.trim()) return;
    setSaving(true);
    const contentText = replyForm.content.trim();
    await supabase.from("todo_comments").insert({
      todo_id:     selected.id,
      parent_id:   parentId,
      author_id:   isCustom ? null : replyForm.author_id,
      author_name: authorName,
      content:     contentText,
    });
    if (contentText) sendMentionNotifications(contentText, authorName);
    setReplyForm(f => ({ ...f, content: "" }));
    setReplyingTo(null);
    setShowReplyMention(false);
    setSaving(false);
    loadComments(selected.id);
  }

  function handleReplyContentChange(e) {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const match = before.match(/@([\w가-힣]*)$/);
    if (match) { setReplyMentionQuery(match[1]); setShowReplyMention(true); }
    else { setShowReplyMention(false); }
    setReplyForm(f => ({ ...f, content: val }));
  }

  function selectReplyMention(member) {
    const name = member.name || member.email.split("@")[0];
    const cursor = replyTextareaRef.current?.selectionStart ?? replyForm.content.length;
    const before = replyForm.content.slice(0, cursor);
    const match = before.match(/@([\w가-힣]*)$/);
    const start = match ? cursor - match[0].length : cursor;
    const newContent = replyForm.content.slice(0, start) + `@${name} ` + replyForm.content.slice(cursor);
    setReplyForm(f => ({ ...f, content: newContent }));
    setShowReplyMention(false);
    setTimeout(() => {
      const pos = start + name.length + 2;
      replyTextareaRef.current?.focus();
      replyTextareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  const replyMentionMembers = showReplyMention
    ? members.filter(m => {
        const n = (m.name || m.email || "").toLowerCase();
        return !replyMentionQuery || n.startsWith(replyMentionQuery.toLowerCase());
      }).slice(0, 6)
    : [];

  function renderContent(content) {
    if (!content) return null;
    const parts = content.split(/(@[\w가-힣]+)/g);
    return parts.map((part, i) =>
      /^@[\w가-힣]+$/.test(part)
        ? <span key={i} style={{ color: "#7c5cfc", fontWeight: 700 }}>{part}</span>
        : part
    );
  }

  async function addComment() {
    const isCustom = cForm.author_id === "__custom__";
    const authorName = isCustom
      ? cForm.custom_name.trim()
      : (() => { const m = members.find(m => m.id === cForm.author_id); return m?.name || m?.email || ""; })();
    if (!authorName) return;
    if (!cForm.content.trim() && pendingFiles.length === 0 && pendingLinks.length === 0) return;
    setSaving(true);
    const contentText = cForm.content.trim();
    const uploadedFiles = pendingFiles.length > 0 ? await uploadFiles(pendingFiles, selected.id) : [];
    const maxOrder = comments.reduce((max, c) => Math.max(max, c.sort_order ?? 0), 0);
    await supabase.from("todo_comments").insert({
      todo_id:     selected.id,
      author_id:   isCustom ? null : cForm.author_id,
      author_name: authorName,
      content:     contentText,
      sort_order:  maxOrder + 1,
      attachments: uploadedFiles,
      links:       pendingLinks,
    });
    if (contentText) sendMentionNotifications(contentText, authorName);
    setCForm(f => ({ ...f, content: "" }));
    setShowMention(false);
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

  async function toggleComplete(id, current) {
    await supabase.from("todo_comments").update({ completed: !current }).eq("id", id);
    setComments(prev => prev.map(c => c.id === id ? { ...c, completed: !current } : c));
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
              <div key={t.id} onClick={() => { setSelected(selected?.id === t.id ? null : t); if (unreadMentions.has(t.id)) markMentionRead(t.id); }}
                style={{
                  background: selected?.id === t.id ? "#151820" : "#11141c",
                  border: `1px solid ${selected?.id === t.id ? (STATUS_COLOR[t.status] || "#7c5cfc") : "#1e2130"}`,
                  borderRadius: 10, padding: "12px 16px", cursor: "pointer", minWidth: 160, position: "relative",
                }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#e8eaf0", marginBottom: 6, paddingRight: 20, display: "flex", alignItems: "center", gap: 6 }}>
                  {t.title}
                  {unreadMentions.has(t.id) && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff5050", flexShrink: 0, display: "inline-block" }} />}
                </div>
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
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "#4a4d5e", fontWeight: 700 }}>팔로워</span>
              {members.map(m => {
                const on = (followers[selected.id] || []).includes(m.id);
                return (
                  <button key={m.id} onClick={() => toggleFollower(selected.id, m.id)}
                    style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 5, cursor: "pointer", border: `1px solid ${on ? "#7c5cfc" : "#1e2130"}`, background: on ? "#7c5cfc22" : "transparent", color: on ? "#7c5cfc" : "#4a4d5e" }}>
                    {m.name || m.email?.split("@")[0]}
                  </button>
                );
              })}
            </div>
          </div>

          {cLoading ? (
            <div style={{ padding: 24, textAlign: "center", color: "#4a4d5e", fontSize: 13 }}>불러오는 중...</div>
          ) : comments.filter(c => !c.parent_id).length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#4a4d5e", fontSize: 13 }}>아직 등록된 내용이 없습니다</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 24, position: "relative" }}>
              <div style={{ position: "absolute", left: 19, top: 0, bottom: 0, width: 2, background: "#1e2130" }} />
              {comments.filter(c => !c.parent_id).map((c, i) => {
                const replies = comments.filter(r => r.parent_id === c.id);
                return (
                  <div key={c.id}>
                    <div
                      draggable
                      onDragStart={e => onDragStart(e, i)}
                      onDragEnter={() => onDragEnter(i)}
                      onDragEnd={onDragEnd}
                      onDrop={onDrop}
                      onDragOver={e => e.preventDefault()}
                      style={{
                        display: "flex", gap: 16, paddingBottom: replyingTo === c.id || replies.length > 0 ? 8 : 20, position: "relative",
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
                            <span style={{ fontSize: 12, fontWeight: 700, color: c.completed ? "#4a4d5e" : "#7c5cfc", textDecoration: c.completed ? "line-through" : "none" }}>{c.author_name}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button onClick={() => toggleComplete(c.id, c.completed)}
                              style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${c.completed ? "#10b981" : "#2a2d3a"}`, background: c.completed ? "#10b981" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>
                              {c.completed && <span style={{ color: "#fff", fontSize: 11, fontWeight: 900 }}>✓</span>}
                            </button>
                            <span style={{ fontSize: 11, color: "#4a4d5e" }}>{formatCommentDate(c.created_at)}</span>
                            <button onClick={() => removeComment(c.id)}
                              style={{ background: "transparent", border: "none", color: "#2a2d3a", fontSize: 14, cursor: "pointer", padding: 0 }}>×</button>
                          </div>
                        </div>
                        {c.content && <div style={{ fontSize: 13, color: "#e8eaf0", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: (c.attachments?.length || c.links?.length) ? 10 : 0 }}>{renderContent(c.content)}</div>}
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
                        <button onClick={() => { setReplyingTo(replyingTo === c.id ? null : c.id); setReplyForm(f => ({ ...f, content: "" })); setShowReplyMention(false); }}
                          style={{ marginTop: 8, background: "transparent", border: "none", color: replyingTo === c.id ? "#7c5cfc" : "#4a4d5e", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                          ↩ 답글{replies.length > 0 ? ` (${replies.length})` : ""}
                        </button>
                      </div>
                    </div>
                    {replies.length > 0 && (
                      <div style={{ marginLeft: 56, marginBottom: replyingTo === c.id ? 8 : 20, display: "flex", flexDirection: "column", gap: 6 }}>
                        {replies.map(r => (
                          <div key={r.id} style={{ background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 8, padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#4a9eff" }}>{r.author_name}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 11, color: "#4a4d5e" }}>{formatCommentDate(r.created_at)}</span>
                                <button onClick={() => removeComment(r.id)}
                                  style={{ background: "transparent", border: "none", color: "#2a2d3a", fontSize: 13, cursor: "pointer", padding: 0 }}>×</button>
                              </div>
                            </div>
                            {r.content && <div style={{ fontSize: 12, color: "#c8cad4", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{renderContent(r.content)}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                    {replyingTo === c.id && (
                      <div style={{ marginLeft: 56, marginBottom: 20 }}>
                        <div style={{ background: "#0d0f14", border: "1px solid #7c5cfc44", borderRadius: 8, padding: "10px 12px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 8 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <select value={replyForm.author_id} onChange={e => setReplyForm(f => ({ ...f, author_id: e.target.value, custom_name: "" }))}
                                style={{ background: "#11141c", border: "1px solid #1e2130", borderRadius: 6, padding: "6px 10px", color: replyForm.author_id ? "#e8eaf0" : "#4a4d5e", fontSize: 12, outline: "none", fontFamily: "inherit" }}>
                                <option value="">작성자 선택</option>
                                {members.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                                <option value="__custom__">직접 입력</option>
                              </select>
                              {replyForm.author_id === "__custom__" && (
                                <input value={replyForm.custom_name} onChange={e => setReplyForm(f => ({ ...f, custom_name: e.target.value }))}
                                  placeholder="이름 입력"
                                  style={{ background: "#11141c", border: "1px solid #7c5cfc55", borderRadius: 6, padding: "6px 10px", color: "#e8eaf0", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
                              )}
                            </div>
                            <div style={{ position: "relative" }}>
                              <textarea ref={replyTextareaRef} value={replyForm.content} onChange={handleReplyContentChange}
                                onKeyDown={e => {
                                  if (showReplyMention && replyMentionMembers.length > 0) {
                                    if (e.key === "Escape") { e.preventDefault(); setShowReplyMention(false); return; }
                                    if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); selectReplyMention(replyMentionMembers[0]); return; }
                                  }
                                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addReply(c.id); }
                                  if (e.key === "Escape") { setReplyingTo(null); setShowReplyMention(false); }
                                }}
                                placeholder="답글 입력 (@멘션 가능)"
                                rows={1}
                                style={{ background: "#11141c", border: "1px solid #1e2130", borderRadius: 6, padding: "7px 10px", color: "#e8eaf0", fontSize: 12, outline: "none", fontFamily: "inherit", resize: "none", overflowY: "hidden", lineHeight: 1.6, minHeight: 32, fieldSizing: "content", width: "100%", boxSizing: "border-box" }} />
                              {showReplyMention && replyMentionMembers.length > 0 && (
                                <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 4, background: "#1a1d26", border: "1px solid #1e2130", borderRadius: 8, overflow: "hidden", zIndex: 100, minWidth: 160, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
                                  {replyMentionMembers.map((m, idx) => (
                                    <div key={m.id} onMouseDown={e => { e.preventDefault(); selectReplyMention(m); }}
                                      style={{ padding: "7px 10px", fontSize: 12, cursor: "pointer", color: "#e8eaf0", borderBottom: idx < replyMentionMembers.length - 1 ? "1px solid #1e2130" : "none", display: "flex", alignItems: "center", gap: 6 }}
                                      onMouseEnter={e => e.currentTarget.style.background = "#7c5cfc22"}
                                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                      <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#7c5cfc44", border: "1px solid #7c5cfc88", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#7c5cfc", flexShrink: 0 }}>
                                        {(m.name || m.email || "?")[0].toUpperCase()}
                                      </span>
                                      <span>{m.name || m.email}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button onClick={() => addReply(c.id)} disabled={saving || !replyForm.content.trim() || !replyForm.author_id}
                              style={{ background: replyForm.content.trim() && replyForm.author_id ? "linear-gradient(135deg,#7c5cfc,#4a9eff)" : "#2a2d3a", border: "none", borderRadius: 6, padding: "7px 14px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", alignSelf: "flex-start" }}>
                              {saving ? "..." : "등록"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
                <div style={{ position: "relative" }}>
                  <textarea ref={textareaRef} value={cForm.content} onChange={handleContentChange}
                    onKeyDown={e => {
                      if (showMention && mentionMembers.length > 0) {
                        if (e.key === "Escape") { e.preventDefault(); setShowMention(false); return; }
                        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); selectMention(mentionMembers[0]); return; }
                      }
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); }
                    }}
                    onPaste={onPaste}
                    placeholder="내용 입력 (Enter로 등록, Shift+Enter로 줄바꿈, @로 멘션)"
                    rows={1}
                    style={{ background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 7, padding: "8px 12px", color: "#e8eaf0", fontSize: 13, outline: "none", fontFamily: "inherit", resize: "none", overflowY: "hidden", lineHeight: 1.6, minHeight: 36, fieldSizing: "content", width: "100%", boxSizing: "border-box" }} />
                  {showMention && mentionMembers.length > 0 && (
                    <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 4, background: "#1a1d26", border: "1px solid #1e2130", borderRadius: 8, overflow: "hidden", zIndex: 100, minWidth: 180, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
                      {mentionMembers.map((m, i) => (
                        <div key={m.id} onMouseDown={e => { e.preventDefault(); selectMention(m); }}
                          style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", color: "#e8eaf0", borderBottom: i < mentionMembers.length - 1 ? "1px solid #1e2130" : "none", display: "flex", alignItems: "center", gap: 8 }}
                          onMouseEnter={e => e.currentTarget.style.background = "#7c5cfc22"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#7c5cfc44", border: "1px solid #7c5cfc88", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#7c5cfc", flexShrink: 0 }}>
                            {(m.name || m.email || "?")[0].toUpperCase()}
                          </span>
                          <span>{m.name || m.email}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

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
