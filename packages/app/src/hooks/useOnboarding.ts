import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";

export function useOnboarding() {
  const { user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (user && !user.onboardingCompleted) {
      // Check if user has already dismissed onboarding in this session
      const dismissed = sessionStorage.getItem("onboarding-dismissed");
      if (!dismissed) {
        setShowOnboarding(true);
      }
    }
  }, [user]);

  const completeOnboarding = async () => {
    if (!user) return;

    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: true }),
      });

      if (response.ok) {
        setShowOnboarding(false);
        sessionStorage.setItem("onboarding-dismissed", "true");
      }
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
    }
  };

  const skipOnboarding = () => {
    setShowOnboarding(false);
    sessionStorage.setItem("onboarding-dismissed", "true");
  };

  const restartOnboarding = () => {
    setShowOnboarding(true);
    sessionStorage.removeItem("onboarding-dismissed");
  };

  return {
    showOnboarding,
    completeOnboarding,
    skipOnboarding,
    restartOnboarding,
  };
}
