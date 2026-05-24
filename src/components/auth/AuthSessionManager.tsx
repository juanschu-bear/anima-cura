"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { buildAuthenticatedAppUser, type AuthenticatedAppUser } from "@/lib/auth";
import { createBrowserClient } from "@/lib/db/supabase";
import { useAppStore } from "@/hooks/useAppStore";

const LAST_ACTIVITY_KEY = "ac-last-activity";
const INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const INACTIVITY_CHECK_MS = 60 * 1000;

function writeActivityTimestamp() {
  window.localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

function getLastActivityTimestamp() {
  const raw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
  const timestamp = raw ? Number(raw) : NaN;
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

export default function AuthSessionManager({
  initialUser,
}: {
  initialUser: AuthenticatedAppUser;
}) {
  const router = useRouter();
  const { setAuthReady, setAuthUser } = useAppStore();

  useEffect(() => {
    const supabase = createBrowserClient();

    function syncUser(user: User | null) {
      setAuthReady(true);
      setAuthUser(user ? buildAuthenticatedAppUser(user) : null);
    }

    async function signOutForInactivity() {
      await supabase.auth.signOut();
      window.localStorage.removeItem(LAST_ACTIVITY_KEY);
      syncUser(null);
      router.replace("/login?reason=expired");
      router.refresh();
    }

    async function validateActiveSession() {
      const lastActivity = getLastActivityTimestamp();
      if (Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS) {
        await signOutForInactivity();
      }
    }

    setAuthReady(true);
    setAuthUser(initialUser);
    writeActivityTimestamp();

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        syncUser(data.user);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      syncUser(session?.user ?? null);

      if (session?.user) {
        writeActivityTimestamp();
      } else {
        window.localStorage.removeItem(LAST_ACTIVITY_KEY);
        router.replace("/login");
        router.refresh();
      }
    });

    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "mousemove",
      "scroll",
      "focus",
    ];

    const markActive = () => writeActivityTimestamp();

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, markActive, { passive: true });
    });

    const visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        void validateActiveSession();
        writeActivityTimestamp();
      }
    };

    document.addEventListener("visibilitychange", visibilityHandler);
    const intervalId = window.setInterval(() => {
      void validateActiveSession();
    }, INACTIVITY_CHECK_MS);

    return () => {
      subscription.unsubscribe();
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", visibilityHandler);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, markActive);
      });
    };
  }, [initialUser, router, setAuthReady, setAuthUser]);

  return null;
}
