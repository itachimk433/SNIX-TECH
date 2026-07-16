import React, { useState, useEffect, useRef, useMemo } from "react";
import { db, auth } from "../firebase";
import {
  collection, query, where, onSnapshot, addDoc,
  increment, updateDoc, doc, deleteDoc, setDoc, getDoc, writeBatch
} from "firebase/firestore";
import { Comment } from "../types";
import { X, MessageCircle, LogIn, Pencil, Trash2, Check, Copy, ThumbsUp, CornerDownRight, Reply, ChevronDown, ChevronUp } from "lucide-react";
import VirtualKeyboard from "./VirtualKeyboard";
import { useKeyboard, type KeyboardSession } from "../context/KeyboardContext";
import LinkText from "./LinkText";
import { triggerPushNotification } from "../utils/notify";

interface CommentsSheetProps {
  postId: string;
  isGuest: boolean;
  onSignInRequired: () => void;
  onClose: () => void;
  highlightCommentId?: string;
  currentUserAvatar?: string;
  onAuthorClick?: (uid: string) => void;
}

async function copyText(text: string) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return; } } catch {}
  const el = document.createElement("textarea");
  el.value = text; el.style.cssText = "position:fixed;opacity:0;top:0;left:0;";
  document.body.appendChild(el); el.focus(); el.select();
  try { document.execCommand("copy"); } catch {}
  document.body.removeChild(el);
}

interface LikeInfo { count: number; userLiked: boolean; }

interface CommentItemProps {
  comment: Comment;
  isOwn: boolean;
  isGuest: boolean;
  isReply?: boolean;
  likeInfo: LikeInfo;
  selected: boolean;
  highlighted: boolean;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string, text: string) => void;
  onLike: (commentId: string, alreadyLiked: boolean) => void;
  onReply: (id: string, name: string) => void;
  copiedId: string | null;
  /** Called before editing starts so the parent can close its local compose keyboard */
  onWillEdit: () => void;
  /** Number of replies this (top-level) comment has */
  replyCount?: number;
  repliesExpanded?: boolean;
  onToggleReplies?: () => void;
  onAuthorClick?: (uid: string) => void;
}

function CommentItem({
  comment, isOwn, isGuest, isReply, likeInfo, selected, highlighted, onSelect,
  onDelete, onCopy, onLike, onReply, copiedId, onWillEdit,
  replyCount = 0, repliesExpanded, onToggleReplies, onAuthorClick,
}: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const editTextRef = useRef(editText);
  editTextRef.current = editText;
  const { openKeyboard, closeKeyboard, settings: kbSettings } = useKeyboard();

  // Scroll highlighted comment into view
  useEffect(() => {
    if (highlighted && ref.current) {
      setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, [highlighted]);

  const fmt = (ts: number) => {
    const d = Date.now()-ts, m = Math.floor(d/60000), h = Math.floor(m/60), dy = Math.floor(h/24);
    if (m < 1) return "Just now"; if (m < 60) return `${m}m ago`; if (h < 24) return `${h}h ago`; return `${dy}d ago`;
  };

  const saveEdit = async () => {
    const current = editTextRef.current;
    if (!current.trim() || current.trim() === comment.text) { setEditing(false); closeKeyboard(); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db,"comments",comment.id),{ text:current.trim() });
      setEditing(false);
      closeKeyboard();
    } catch {} finally { setSaving(false); }
  };

  const startEditing = () => {
    // Close parent's compose keyboard before opening the edit keyboard
    // so the two in-app keyboards never stack on top of each other.
    onWillEdit();
    setEditing(true);
    const session: KeyboardSession = {
      onChange: (v) => { setEditText(v); editTextRef.current = v; },
      onSubmit: saveEdit,
      // Done button or backdrop → cancel the edit
      onDismiss: () => { setEditing(false); setEditText(comment.text); },
      placeholder: "Edit your comment...",
      maxLength: 500,
    };
    openKeyboard(editTextRef.current, session);
  };

  return (
    <div ref={ref} className={`flex items-start gap-2.5 transition-all duration-500 ${isReply ? "ml-9 pl-2.5 border-l-2" style={{ borderColor: "#1E3A5F" }} : ""} ${highlighted ? "rounded-2xl p-1" style={{ boxShadow: "0 0 0 2px rgba(0,212,255,0.4)", backgroundColor: "rgba(0,212,255,0.05)" }} : ""}`}>
      <img
        src={comment.authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${comment.userId}`}
        alt={comment.authorName}
        className="w-7 h-7 rounded-full shrink-0 mt-0.5 cursor-pointer active:opacity-70" style={{ border: "1px solid #1E3A5F", backgroundColor: "#111B2A" }}
        onClick={() => onAuthorClick?.(comment.userId)}
      />
      <div className="flex-1 min-w-0">
        {comment.replyToName && (
          <div className="flex items-center gap-1 mb-1 ml-1">
            <CornerDownRight size={10} className="text-slate-400 shrink-0" />
            <span className="text-[10px] text-slate-400 font-medium">@{comment.replyToName}</span>
          </div>
        )}
        {editing ? (
          kbSettings.enabled ? (
            /* In-app keyboard: compact indicator, overlay handles the typing */
            <div
              className="bg-blue-50 rounded-2xl rounded-tl-sm px-3 py-2 border border-blue-200 flex items-center gap-2 cursor-pointer select-none"
              onPointerDown={e => { e.preventDefault(); startEditing(); }}
            >
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block mb-0.5">✏️ Editing</span>
                <p className="text-xs text-blue-800 break-words line-clamp-2 leading-relaxed">
                  {editText || <span className="italic text-blue-400">Type in the keyboard below</span>}
                </p>
              </div>
              <button
                onPointerDown={e => { e.preventDefault(); e.stopPropagation(); setEditing(false); setEditText(comment.text); closeKeyboard(); }}
                className="shrink-0 px-2.5 py-1 text-[10px] font-bold text-slate-500 bg-slate-100 rounded-lg"
              >Cancel</button>
            </div>
          ) : (
            /* Native keyboard: inline textarea */
            <div className="space-y-2">
              <textarea
                value={editText}
                onChange={e => { setEditText(e.target.value); editTextRef.current = e.target.value; }}
                placeholder="Edit your comment..."
                maxLength={500}
                rows={3}
                autoFocus
                className="w-full px-3 py-2 bg-blue-50 border border-blue-200 rounded-2xl rounded-tl-sm text-xs leading-relaxed outline-none resize-none"
              />
              <div className="flex gap-1.5 justify-end">
                <button onPointerDown={e => { e.preventDefault(); e.stopPropagation(); setEditing(false); setEditText(comment.text); }}
                  className="px-2.5 py-1 text-[10px] font-bold text-slate-500 bg-slate-100 rounded-lg">Cancel</button>
                <button onPointerDown={e => { e.preventDefault(); e.stopPropagation(); saveEdit(); }}
                  disabled={saving}
                  className="px-2.5 py-1 text-[10px] font-bold text-white bg-blue-600 rounded-lg disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )
        ) : (
          <>
            <div
              onClick={()=>onSelect(selected?null:comment.id)}
              className={`rounded-2xl rounded-tl-sm px-3 py-2 border transition-colors cursor-pointer active:opacity-80 ${
                copiedId===comment.id?"border-emerald-300 bg-emerald-50"
                :selected?"border-blue-300 bg-blue-50/60"
                :highlighted?"border-blue-300 bg-blue-50/30"
                :"border-slate-100 bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-bold text-slate-800 truncate">{comment.authorName}</span>
                <span className="text-[9px] text-slate-400 shrink-0">{fmt(comment.createdAt)}</span>
              </div>
              <LinkText text={comment.text} className="text-xs text-slate-700 leading-relaxed" />
              {copiedId===comment.id && <p className="text-[9px] text-emerald-600 font-bold mt-0.5 flex items-center gap-0.5"><Copy size={8}/>Copied!</p>}
            </div>
            {/* Like row */}
            <div className="flex items-center gap-3 mt-1 ml-1">
              <button
                onClick={e=>{ e.stopPropagation(); if (!isGuest) onLike(comment.id, likeInfo.userLiked); }}
                className={`flex items-center gap-1 transition-colors ${likeInfo.userLiked?"text-blue-600":"text-slate-400"}`}
              >
                <ThumbsUp size={11} className={likeInfo.userLiked?"fill-blue-600":""} />
                {likeInfo.count>0 && <span className="text-[10px] font-bold">{likeInfo.count}</span>}
              </button>
              {!isReply && replyCount > 0 && (
                <button
                  onClick={e=>{ e.stopPropagation(); onToggleReplies?.(); }}
                  className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {repliesExpanded ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
                  <span className="text-[10px] font-bold">Replies ({replyCount})</span>
                </button>
              )}
            </div>
            {/* Action bar */}
            {selected && (
              <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                {!isGuest && (
                  <button onClick={e=>{ e.stopPropagation(); onReply(comment.id,comment.authorName); onSelect(null); }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold active:bg-blue-200">
                    <Reply size={10}/>Reply
                  </button>
                )}
                <button onClick={e=>{ e.stopPropagation(); onCopy(comment.id,comment.text); onSelect(null); }}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                  <Copy size={10}/>Copy
                </button>
                {isOwn && !confirmDelete && (
                  <button onClick={e=>{ e.stopPropagation(); setConfirmDelete(true); }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-600 rounded-full text-[10px] font-bold">
                    <Trash2 size={10}/>Delete
                  </button>
                )}
                {isOwn && confirmDelete && (
                  <>
                    <button onClick={e=>{ e.stopPropagation(); onDelete(comment.id); onSelect(null); }}
                      className="px-2.5 py-1 bg-red-500 text-white rounded-full text-[10px] font-bold">Confirm</button>
                    <button onClick={e=>{ e.stopPropagation(); setConfirmDelete(false); }}
                      className="px-2.5 py-1 bg-slate-200 text-slate-600 rounded-full text-[10px] font-bold">Cancel</button>
                  </>
                )}
                {isOwn && (
                  <button
                    onPointerDown={e => { e.preventDefault(); e.stopPropagation(); startEditing(); onSelect(null); }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold"
                  >
                    <Pencil size={10}/>Edit
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function CommentsSheet({ postId, isGuest, onSignInRequired, onClose, highlightCommentId, currentUserAvatar, onAuthorClick }: CommentsSheetProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [likesMap, setLikesMap] = useState<Record<string, LikeInfo>>({});
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [showVK, setShowVK] = useState(false);
  // Clear highlight after 3 seconds
  const [activeHighlight, setActiveHighlight] = useState(highlightCommentId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentUser = auth.currentUser;

  // Read keyboard settings from global context
  const { settings } = useKeyboard();

  useEffect(() => {
    setActiveHighlight(highlightCommentId);
    if (!highlightCommentId) return;
    const t = setTimeout(() => setActiveHighlight(undefined), 3500);
    return () => clearTimeout(t);
  }, [highlightCommentId]);

  // Sync the stored commentCount once per open so stale counts self-heal
  const hasSyncedCount = useRef(false);

  // Real-time comments
  useEffect(() => {
    hasSyncedCount.current = false;
    const q = query(collection(db,"comments"),where("postId","==",postId));
    const unsub = onSnapshot(q, snap => {
      const data: Comment[] = [];
      snap.forEach(d => data.push({ id:d.id, ...d.data() } as Comment));
      data.sort((a,b)=>a.createdAt-b.createdAt);
      setComments(data); setLoading(false);
      // Sync stored commentCount to actual count once per sheet open
      if (!hasSyncedCount.current) {
        hasSyncedCount.current = true;
        updateDoc(doc(db,"posts",postId),{ commentCount: data.length }).catch(()=>{});
      }
      // Only scroll to bottom if no highlight is active
      if (!highlightCommentId) {
        setTimeout(()=>bottomRef.current?.scrollIntoView({ behavior:"smooth" }),80);
      }
    }, () => setLoading(false));
    return ()=>unsub();
  }, [postId]);

  // Real-time likes
  useEffect(() => {
    const q = query(collection(db,"commentLikes"),where("postId","==",postId));
    const unsub = onSnapshot(q, snap => {
      const map: Record<string,LikeInfo> = {};
      snap.docs.forEach(d => {
        const data = d.data() as { commentId:string; userId:string };
        if (!map[data.commentId]) map[data.commentId]={ count:0, userLiked:false };
        map[data.commentId].count++;
        if (currentUser && data.userId===currentUser.uid) map[data.commentId].userLiked=true;
      });
      setLikesMap(map);
    }, ()=>{});
    return ()=>unsub();
  }, [postId, currentUser?.uid]);

  // Group comments into top-level comments and their (possibly nested) replies,
  // flattened one level deep under whichever top-level comment started the thread.
  const { topLevel, repliesByRoot } = useMemo(() => {
    const byId: Record<string, Comment> = {};
    comments.forEach(c => { byId[c.id] = c; });

    const getRootId = (id: string): string => {
      let current = byId[id];
      let rootId = id;
      const seen = new Set<string>([id]);
      while (current?.replyToId && byId[current.replyToId] && !seen.has(current.replyToId)) {
        rootId = current.replyToId;
        seen.add(rootId);
        current = byId[rootId];
      }
      return rootId;
    };

    const topLevel: Comment[] = [];
    const repliesByRoot: Record<string, Comment[]> = {};
    comments.forEach(c => {
      if (!c.replyToId || !byId[c.replyToId]) { topLevel.push(c); return; }
      const rootId = getRootId(c.id);
      if (rootId === c.id) { topLevel.push(c); return; }
      (repliesByRoot[rootId] ||= []).push(c);
    });
    topLevel.sort((a, b) => a.createdAt - b.createdAt);
    Object.values(repliesByRoot).forEach(arr => arr.sort((a, b) => a.createdAt - b.createdAt));
    return { topLevel, repliesByRoot };
  }, [comments]);

  const handleCopyComment = (id: string, txt: string) => {
    copyText(txt); setCopiedId(id); setTimeout(()=>setCopiedId(null),2000);
  };

  // Deleting a comment cascades to every reply (and reply-of-reply) beneath it.
  const handleDeleteComment = async (commentId: string) => {
    try {
      const toDelete = new Set<string>([commentId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const c of comments) {
          if (c.replyToId && toDelete.has(c.replyToId) && !toDelete.has(c.id)) {
            toDelete.add(c.id);
            changed = true;
          }
        }
      }
      const batch = writeBatch(db);
      toDelete.forEach(id => batch.delete(doc(db, "comments", id)));
      await batch.commit();
      try { await updateDoc(doc(db,"posts",postId),{ commentCount:increment(-toDelete.size) }); } catch {}
    } catch {}
  };

  const handleLike = async (commentId: string, alreadyLiked: boolean) => {
    if (!currentUser) return;
    const likeRef = doc(db,"commentLikes",`${commentId}_${currentUser.uid}`);
    try {
      if (alreadyLiked) { await deleteDoc(likeRef); }
      else {
        await setDoc(likeRef,{ commentId, postId, userId:currentUser.uid, createdAt:Date.now() });
        const target = comments.find(c=>c.id===commentId);
        if (target && target.userId!==currentUser.uid) {
          addDoc(collection(db,"notifications"),{
            userId:target.userId, type:"like",
            fromName:currentUser.displayName||"Agent",
            fromAvatar:`https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(currentUser.displayName||"anon")}`,
            postId, commentId,
            commentPreview:target.text.substring(0,60),
            read:false, createdAt:Date.now(),
          }).catch(()=>{});
          triggerPushNotification({
            targetUserId: target.userId,
            title: "New like",
            body: `${currentUser.displayName||"Someone"} liked your comment`,
            data: { postId, commentId },
          });
        }
      }
    } catch {}
  };

  const handleReply = (commentId: string, authorName: string) => {
    setReplyingTo({ id:commentId, name:authorName });
    setText(""); setShowVK(true);
  };

  const handleSubmit = async () => {
    if (!text.trim()) return;
    if (isGuest||!currentUser) { onSignInRequired(); return; }
    setSubmitting(true); setError("");
    try {
      await currentUser.getIdToken(true);
      // Use the real avatar URL (passed from the parent who has it from Firestore).
      // Fall back to a deterministic DiceBear only if not available yet.
      const myAvatar = currentUserAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(currentUser.displayName||"anon")}`;
      const newDoc = await addDoc(collection(db,"comments"),{
        postId, userId:currentUser.uid,
        authorName:currentUser.displayName||"Agent",
        authorAvatar: myAvatar,
        text:text.trim(), createdAt:Date.now(),
        ...(replyingTo?{ replyToId:replyingTo.id, replyToName:replyingTo.name }:{}),
      });
      try { await updateDoc(doc(db,"posts",postId),{ commentCount:increment(1) }); } catch {}
      if (replyingTo) {
        const target = comments.find(c=>c.id===replyingTo.id);
        if (target && target.userId!==currentUser.uid) {
          addDoc(collection(db,"notifications"),{
            userId:target.userId, type:"reply",
            fromName:currentUser.displayName||"Agent",
            fromAvatar: myAvatar,
            postId, commentId:newDoc.id,
            commentPreview:text.trim().substring(0,60),
            read:false, createdAt:Date.now(),
          }).catch(()=>{});
          triggerPushNotification({
            targetUserId: target.userId,
            title: "New reply",
            body: `${currentUser.displayName||"Someone"} replied: ${text.trim().substring(0,80)}`,
            data: { postId, commentId: newDoc.id },
          });
        }
      } else {
        // Notify the post author on new top-level comments
        try {
          const postSnap = await getDoc(doc(db, "posts", postId));
          if (postSnap.exists()) {
            const postAuthorId = postSnap.data()?.uid;
            if (postAuthorId && postAuthorId !== currentUser.uid) {
              addDoc(collection(db,"notifications"),{
                userId: postAuthorId, type: "comment",
                fromName: currentUser.displayName||"Agent",
                fromAvatar: myAvatar,
                postId, commentId: newDoc.id,
                commentPreview: text.trim().substring(0,60),
                read: false, createdAt: Date.now(),
              }).catch(()=>{});
              triggerPushNotification({
                targetUserId: postAuthorId,
                title: "New comment",
                body: `${currentUser.displayName||"Someone"} commented: ${text.trim().substring(0,80)}`,
                data: { postId, commentId: newDoc.id },
              });
            }
          }
        } catch {}
      }
      if (replyingTo) {
        // Auto-expand the thread so the user immediately sees their new reply.
        const byId: Record<string, Comment> = {};
        comments.forEach(c => { byId[c.id] = c; });
        let rootId = replyingTo.id;
        const seen = new Set<string>([rootId]);
        let current = byId[rootId];
        while (current?.replyToId && byId[current.replyToId] && !seen.has(current.replyToId)) {
          rootId = current.replyToId;
          seen.add(rootId);
          current = byId[rootId];
        }
        setExpandedReplies(p => ({ ...p, [rootId]: true }));
      }
      setText(""); setReplyingTo(null); setShowVK(false);
    } catch (err: any) {
      const code = err?.code||"";
      setError(
        code==="permission-denied"?"Permission denied. Check Firestore rules."
        :code.includes("unavailable")||code.includes("network")?"Check your connection."
        :code.includes("unauthenticated")?"Session expired. Sign in again."
        :"Failed to send. Please try again."
      );
    } finally { setSubmitting(false); }
  };

  const replyBanner = replyingTo ? (
    <div className="flex items-center justify-between px-2 py-1 bg-blue-50 rounded-xl border border-blue-100">
      <div className="flex items-center gap-1.5">
        <Reply size={11} className="text-blue-500 shrink-0" />
        <span className="text-[11px] text-blue-700 font-medium">Replying to <strong>@{replyingTo.name}</strong></span>
      </div>
      <button onClick={()=>setReplyingTo(null)} className="text-blue-400 p-0.5"><X size={13}/></button>
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-end justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={()=>{ onClose(); setShowVK(false); }} />
      <div
        className="relative w-full bg-white rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: showVK?"100vh":"75vh" }}
        onClick={e=>e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="w-8 h-1 bg-slate-200 rounded-full absolute top-2 left-1/2 -translate-x-1/2" />
          <div className="flex items-center gap-2">
            <MessageCircle size={16} className="text-slate-500" />
            <h3 className="font-black text-slate-900 text-sm" style={{ fontFamily:"'Space Grotesk', sans-serif" }}>
              Comments <span className="text-slate-400 font-normal">({comments.length})</span>
            </h3>
          </div>
          <button onClick={()=>{ onClose(); setShowVK(false); }} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400"><X size={18}/></button>
        </div>

        {/* Comment list */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3" onClick={()=>setSelectedId(null)}>
          {loading ? (
            <div className="flex justify-center py-10">
              <span className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : comments.length===0 ? (
            <div className="py-12 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                <MessageCircle size={22} className="text-slate-300" />
              </div>
              <p className="text-xs text-slate-400 font-medium">No comments yet.<br/>Be the first!</p>
            </div>
          ) : topLevel.map(c => {
            const replies = repliesByRoot[c.id] || [];
            const expanded = !!expandedReplies[c.id];
            return (
              <div key={c.id}>
                <div onClick={e=>e.stopPropagation()}>
                  <CommentItem
                    comment={c}
                    isOwn={currentUser?.uid===c.userId}
                    isGuest={isGuest}
                    likeInfo={likesMap[c.id]??{ count:0, userLiked:false }}
                    selected={selectedId===c.id}
                    highlighted={activeHighlight===c.id}
                    onSelect={setSelectedId}
                    onDelete={handleDeleteComment}
                    onCopy={handleCopyComment}
                    onLike={handleLike}
                    onReply={handleReply}
                    copiedId={copiedId}
                    onWillEdit={() => setShowVK(false)}
                    replyCount={replies.length}
                    repliesExpanded={expanded}
                    onToggleReplies={() => setExpandedReplies(p => ({ ...p, [c.id]: !p[c.id] }))}
                    onAuthorClick={onAuthorClick}
                  />
                </div>
                {expanded && replies.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {replies.map(r => (
                      <div key={r.id} onClick={e=>e.stopPropagation()}>
                        <CommentItem
                          comment={r}
                          isReply
                          isOwn={currentUser?.uid===r.userId}
                          isGuest={isGuest}
                          likeInfo={likesMap[r.id]??{ count:0, userLiked:false }}
                          selected={selectedId===r.id}
                          highlighted={activeHighlight===r.id}
                          onSelect={setSelectedId}
                          onDelete={handleDeleteComment}
                          onCopy={handleCopyComment}
                          onLike={handleLike}
                          onReply={handleReply}
                          copiedId={copiedId}
                          onWillEdit={() => setShowVK(false)}
                          onAuthorClick={onAuthorClick}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Native input bar (when VK hidden) */}
        {!showVK && (
          <div className="shrink-0 px-4 pb-5 pt-3 border-t border-slate-100 bg-white">
            {error && <p className="text-[11px] text-red-500 font-medium mb-2 text-center">{error}</p>}
            {replyingTo && (
              <div className="flex items-center justify-between mb-2 px-3 py-1.5 bg-blue-50 rounded-xl border border-blue-100">
                <div className="flex items-center gap-1.5">
                  <Reply size={11} className="text-blue-500 shrink-0"/>
                  <span className="text-[11px] text-blue-700 font-medium">Replying to <strong>@{replyingTo.name}</strong></span>
                </div>
                <button onClick={()=>setReplyingTo(null)} className="text-blue-400 p-0.5"><X size={13}/></button>
              </div>
            )}
            {isGuest ? (
              <button onClick={onSignInRequired}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-emerald-500 text-white font-bold rounded-xl text-xs tracking-wider uppercase shadow-md flex items-center justify-center gap-2">
                <LogIn size={14}/> Sign In to Comment
              </button>
            ) : (
              <button
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-left active:bg-slate-100 transition-colors"
                onClick={()=>setShowVK(true)}
              >
                <img src={currentUserAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(currentUser?.displayName||"anon")}`}
                  alt="You" className="w-7 h-7 rounded-full border border-slate-200 bg-slate-50 shrink-0" />
                <span className="flex-1 text-xs text-slate-400">
                  {text||(replyingTo?`Reply to @${replyingTo.name}...`:"Write a comment...")}
                </span>
              </button>
            )}
          </div>
        )}

        {/* Virtual keyboard / native compose */}
        {showVK && !isGuest && (
          settings.enabled ? (
            <div className="shrink-0 border-t border-slate-200">
              {error && <p className="text-[11px] text-red-500 font-medium px-4 pt-2 text-center">{error}</p>}
              <VirtualKeyboard
                value={text}
                onChange={setText}
                onSubmit={handleSubmit}
                placeholder={replyingTo?`Reply to @${replyingTo.name}...`:"Write a comment..."}
                maxLength={500}
                submitting={submitting}
                replyBanner={replyBanner}
                isMultiline={true}
                theme={settings.theme}
                height={settings.height}
              />
              <div className="px-3 pb-2 flex justify-end" style={{ background: settings.theme==="dark"?"#1e293b":settings.theme==="blue"?"#1e3a5f":"white" }}>
                <button onClick={()=>setShowVK(false)}
                  className={`text-[10px] font-semibold px-3 py-1 rounded-lg ${settings.theme==="dark"||settings.theme==="blue"?"text-slate-300":"text-slate-400"}`}>
                  Hide keyboard
                </button>
              </div>
            </div>
          ) : (
            <div className="shrink-0 border-t border-slate-100 px-4 pb-4 pt-3 space-y-2 bg-white">
              {replyBanner}
              {error && <p className="text-[11px] text-red-500 font-medium text-center">{error}</p>}
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                placeholder={replyingTo ? `Reply to @${replyingTo.name}...` : "Write a comment..."}
                maxLength={500}
                rows={3}
                autoFocus
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs leading-relaxed outline-none resize-none"
              />
              <div className="flex justify-between items-center">
                <button onClick={() => { setShowVK(false); setReplyingTo(null); }}
                  className="text-xs text-slate-400 font-medium px-1">Cancel</button>
                <button onClick={handleSubmit} disabled={submitting || !text.trim()}
                  className="px-4 py-2 bg-slate-950 text-white text-xs font-bold rounded-xl disabled:opacity-40">
                  {submitting ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
