import React, { useState } from "react";
import { auth, db } from "../firebase";
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, signInWithCredential,
  sendEmailVerification,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { Mail, Lock, User, Info, ArrowRight, Ghost, Check } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import VKInput from "./VKInput";
import snixIcon from "../assets/snix-icon.jpg";

interface AuthViewProps {
  onAuthSuccess: () => void;
  onGuestContinue: () => void;
  /** Called with the email address right after a new account is created so
   *  App.tsx can show the email verification screen (which must live outside
   *  AuthView to survive the onAuthStateChanged that fires on account creation). */
  onNewAccountCreated?: (email: string) => void;
  /** Called immediately after native Google sign-in succeeds so the app can
   *  switch away from AuthView while signInWithCredential runs in the background.
   *  This makes the transition feel instant instead of waiting for the extra RTT. */
  onGoogleOptimisticAuth?: () => void;
  /** Called if the background signInWithCredential exchange fails so the app
   *  can restore the AuthView and let the user try again. */
  onGoogleAuthFailed?: () => void;
}

export default function AuthView({ onAuthSuccess, onNewAccountCreated, onGuestContinue, onGoogleOptimisticAuth, onGoogleAuthFailed }: AuthViewProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const ensureUserProfile = (uid: string, displayNameValue: string, emailValue: string) => {
    // Use merge:true so we never overwrite existing fields (bio, avatarUrl, etc.)
    // but always write defaults for brand-new accounts — no read round-trip needed.
    return setDoc(doc(db, "users", uid), {
      uid, displayName: displayNameValue, email: emailValue,
      bio: "VPN Configuration Curator & Secure Net enthusiast.",
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(displayNameValue)}`,
      createdAt: Date.now(), followerCount: 0, followingCount: 0,
    }, { merge: true });
  };

  const handleGoogleSignIn = async () => {
    setError(""); setGoogleLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle();
        const idToken = result.credential?.idToken;
        if (!idToken) throw new Error("Google Sign-In was cancelled or failed.");
        const credential = GoogleAuthProvider.credential(idToken, result.credential?.accessToken);
        // Optimistic navigation: switch the app away from AuthView immediately
        // while signInWithCredential (Firebase JS SDK token exchange) runs in
        // the background. onAuthStateChanged fires once the exchange completes
        // and populates the user state. This removes the visible ~1-2 s wait
        // the user would otherwise see after the Google picker closes.
        onGoogleOptimisticAuth?.();
        signInWithCredential(auth, credential).then(userCred => {
          ensureUserProfile(
            userCred.user.uid,
            userCred.user.displayName || "Agent",
            userCred.user.email || "",
          ).catch(() => {});
          onAuthSuccess();
        }).catch((exchErr: any) => {
          // Token exchange failed — restore the AuthView so the user can retry.
          onGoogleAuthFailed?.();
          const code = exchErr?.code || "";
          if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
            setError(exchErr?.message || "Google Sign-In failed. Please try again.");
          }
        });
        return; // loading state cleared by finally below
      } else {
        const provider = new GoogleAuthProvider();
        try {
          const userCred = await signInWithPopup(auth, provider);
          ensureUserProfile(
            userCred.user.uid,
            userCred.user.displayName || "Agent",
            userCred.user.email || "",
          ).catch(() => {});
          onAuthSuccess();
        } catch (popupErr: any) {
          // If Chrome blocks the popup, fall back to redirect flow.
          if (popupErr?.code === "auth/popup-blocked") {
            await signInWithRedirect(auth, provider);
            return; // page is navigating away
          }
          throw popupErr; // re-throw so outer catch handles it
        }
      }
    } catch (err: any) {
      const code = err?.code || "";
      const msg: string = err?.message || "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // User dismissed — no error needed
      } else if (msg.includes("10:") || msg.includes("28444") || msg.includes("Developer console")) {
        setError(
          "Google Sign-In is not configured for this build. " +
          "Please sign in with Email/Password instead."
        );
      } else if (code === "auth/network-request-failed") {
        setError("No internet connection. Please check your Wi-Fi or mobile data.");
      } else if (code === "auth/argument-error" || code === "auth/invalid-api-key") {
        setError("Google Sign-In setup is incomplete. Please sign in with Email/Password instead.");
      } else {
        setError(msg || "Google Sign-In failed.");
      }
    } finally { setGoogleLoading(false); }
  };

  /**
   * Password rules only apply when CREATING an account.
   * Login accepts any password length so existing accounts are not blocked.
   */
  const validateNewPassword = (pw: string): string | null => {
    if (pw.length < 6)  return "Password must be at least 6 characters.";
    if (pw.length > 15) return "Password must be 15 characters or fewer.";
    if (!/[A-Z]/.test(pw)) return "Password must include at least one uppercase letter (A–Z).";
    if (!/[a-z]/.test(pw)) return "Password must include at least one lowercase letter (a–z).";
    return null;
  };

  const handleSubmit = async () => {
    setError(""); setLoading(true);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password || (!isLogin && !displayName)) {
      setError("Please fill out all required fields."); setLoading(false); return;
    }
    // Email length limit applies to new accounts only
    if (!isLogin && trimmedEmail.length > 50) {
      setError("Email address must be 50 characters or fewer."); setLoading(false); return;
    }
    // Password complexity rules only for new accounts
    if (!isLogin) {
      const pwError = validateNewPassword(password);
      if (pwError) { setError(pwError); setLoading(false); return; }
      if (password !== confirmPassword) {
        setError("Passwords do not match."); setLoading(false); return;
      }
    }
    try {
      if (isLogin) {
        const loginCred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
        // If this email/password account was never verified, re-show the
        // verification screen instead of letting the user straight into the app.
        if (!loginCred.user.emailVerified) {
          try { await sendEmailVerification(loginCred.user); } catch {}
          onNewAccountCreated?.(email);
        } else {
          onAuthSuccess();
        }
      } else {
        const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        await updateProfile(cred.user, { displayName });
        await setDoc(doc(db, "users", cred.user.uid), {
          uid: cred.user.uid, displayName, email: trimmedEmail,
          bio: bio || "VPN Configuration Curator & Secure Net enthusiast.",
          avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(displayName)}`,
          createdAt: Date.now(), followerCount: 0, followingCount: 0,
        });
        // Send the verification email. The confirmation screen lives in App.tsx
        // (not here) so it survives the onAuthStateChanged that fires on account
        // creation and would otherwise unmount this component.
        try { await sendEmailVerification(cred.user); } catch {}
        onNewAccountCreated?.(email);
      }
    } catch (err: any) {
      const code = err.code || "";
      if (code === "auth/email-already-in-use")
        setError("An account with this email already exists. Try signing in instead.");
      else if (code === "auth/weak-password")
        setError("Password must be at least 6 characters with upper and lower case letters.");
      else if (["auth/user-not-found","auth/wrong-password","auth/invalid-credential"].includes(code))
        setError("Incorrect email or password. Please try again.");
      else if (code === "auth/invalid-email")
        setError("Please enter a valid email address.");
      else if (code === "auth/operation-not-allowed")
        setError("Email/Password sign-in is not enabled. Contact support.");
      else if (code === "auth/argument-error")
        setError("Please enter a valid email address and password.");
      else if (code === "auth/network-request-failed")
        setError("No internet connection. Please check your Wi-Fi or mobile data.");
      else if (code === "auth/too-many-requests")
        setError("Too many failed attempts. Please wait a moment, then try again.");
      else
        setError(err.message || "An error occurred. Please try again.");
    } finally { setLoading(false); }
  };

  const commonInputCls   = "w-full pl-9 pr-4 py-2.5 rounded-xl text-sm" as any;
  const passwordInputCls = "w-full pl-9 pr-10 py-2.5 rounded-xl text-sm" as any;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="min-h-full flex flex-col justify-center px-6 py-10">

        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-xl mb-4">
            <img src={snixIcon} alt="SNIX" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#E8F4F8", textShadow: "0 0 20px rgba(0,212,255,0.5)", letterSpacing: "6px" }}>SNIX</h1>
          <p className="text-xs mt-2 max-w-[280px]" style={{ color: "#3A5A78", fontFamily: "'JetBrains Mono', monospace" }}>The Decentralized VPN Configuration Hub & Community</p>
        </div>

        <div className="flex mb-4 p-1 rounded-xl" style={{ backgroundColor: "#0D1520", border: "1px solid #1E3A5F" }}>
          <button type="button" onClick={() => { setIsLogin(true); setError(""); setConfirmPassword(""); }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${isLogin ? "bg-slate-950 text-white shadow-sm" : "text-slate-500"}`}>Sign In</button>
          <button type="button" onClick={() => { setIsLogin(false); setError(""); setConfirmPassword(""); }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${!isLogin ? "bg-slate-950 text-white shadow-sm" : "text-slate-500"}`}>Create Account</button>
        </div>

        <div className="p-5 rounded-2xl">
          <div className="space-y-3.5">
            {error && (
              <div className="p-3 rounded-xl text-xs font-medium flex items-start gap-2" style={{ backgroundColor: "rgba(255,56,96,0.12)", color: "#FF3860", border: "1px solid rgba(255,56,96,0.3)" }}>
                <span className="font-bold shrink-0">Error:</span>
                <span className="break-all">{error}</span>
              </div>
            )}

            {!isLogin && (
              <VKInput
                label="Display Name"
                required
                value={displayName}
                onChange={setDisplayName}
                placeholder="e.g. shadow_curator"
                icon={<User size={14} />}
                inputClassName={commonInputCls}
                maxLength={50}
              />
            )}

            <VKInput
              label="Email Address"
              required
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              type="email"
              icon={<Mail size={14} />}
              inputClassName={commonInputCls}
              /* 50-char limit enforced on registration only (validation gate above).
                 Login keeps a generous UI limit so existing accounts aren't blocked. */
              maxLength={isLogin ? 200 : 50}
              memoryKey="auth_email"
            />
            {!isLogin && (
              <p className="text-[10px] text-slate-400 -mt-2 pl-1">Max 50 characters</p>
            )}

            <div>
              <VKInput
                label="Password"
                required
                value={password}
                onChange={setPassword}
                placeholder="Enter Password"
                type="password"
                icon={<Lock size={14} />}
                inputClassName={passwordInputCls}
                /* 15-char max applies only to new accounts to avoid locking out
                   existing users who registered with longer passwords. */
                maxLength={isLogin ? 128 : 15}
                showPasswordToggle={true}
              />
              {!isLogin && (
                <p className="text-[10px] text-slate-400 mt-1 pl-1">
                  6–15 characters · must include uppercase &amp; lowercase letters
                </p>
              )}
            </div>

            {!isLogin && (
              <div>
                <VKInput
                  label="Retype Password"
                  required
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Retype Password"
                  type="password"
                  icon={<Lock size={14} />}
                  inputClassName={passwordInputCls}
                  maxLength={15}
                  showPasswordToggle={true}
                />
                {confirmPassword.length > 0 && (
                  password === confirmPassword ? (
                    <p className="text-[10px] text-emerald-500 font-bold mt-1 pl-1 flex items-center gap-1">
                      <Check size={11} /> Perfect match
                    </p>
                  ) : (
                    <p className="text-[10px] text-red-400 mt-1 pl-1">Passwords don't match yet</p>
                  )
                )}
              </div>
            )}

            {!isLogin && (
              <VKInput
                label="Bio (Optional)"
                value={bio}
                onChange={setBio}
                placeholder="Details about your configs..."
                icon={<Info size={14} />}
                multiline
                rows={2}
                inputClassName={commonInputCls}
                maxLength={200}
              />
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-3 font-bold rounded-xl text-sm tracking-wider uppercase flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: "linear-gradient(90deg, #00A8CC, #00D4FF)", color: "#040709", fontFamily: "'JetBrains Mono', monospace", boxShadow: "0 0 20px rgba(0,212,255,0.25)" }}
            >
              {loading
                ? <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                : <>{isLogin ? "Sign In" : "Create Account"}<ArrowRight size={14} /></>}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <div className="relative flex py-2 items-center mb-3">
            <div className="flex-grow border-t border-slate-200" />
            <span className="flex-shrink mx-3 text-[9px] tracking-widest uppercase" style={{ color: "#3A5A78", fontFamily: "'JetBrains Mono', monospace" }}>or</span>
            <div className="flex-grow border-t border-slate-200" />
          </div>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full py-3 font-bold rounded-xl text-xs tracking-wider uppercase flex items-center justify-center gap-2 mb-2.5 disabled:opacity-60" style={{ backgroundColor: "#111B2A", color: "#E8F4F8", border: "1px solid #1E3A5F", fontFamily: "'JetBrains Mono', monospace" }}
          >
            {googleLoading
              ? <span className="animate-spin rounded-full h-4 w-4 border-2 border-slate-400 border-t-transparent" />
              : <><FcGoogle size={16} /> Continue with Google</>}
          </button>
          <button type="button" onClick={onGuestContinue}
            className="w-full py-3 font-bold rounded-xl text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all" style={{ backgroundColor: "#0D1520", color: "#7A9BB5", border: "1px solid #1E3A5F", fontFamily: "'JetBrains Mono', monospace" }}>
            <Ghost size={14} /> Continue as Guest
          </button>
          <p className="text-[10px] text-center mt-2" style={{ color: "#3A5A78" }}>
            Guests can browse, copy, and download configs — sign in to react, post, and comment.
          </p>
        </div>
        <p className="text-[10px] text-center mt-5" style={{ color: "#3A5A78" }}>By connecting, you agree to SNIX secure config sharing norms.</p>
      </div>
    </div>
  );
}
