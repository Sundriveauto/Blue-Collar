import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'

export function useOnboarding() {
  const { user } = useAuth()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setIsLoading(false)
      return
    }

    // Check if user has completed onboarding
    const hasCompletedOnboarding = localStorage.getItem(`onboarding_${user.id}`)
    if (!hasCompletedOnboarding && !user.onboardingCompleted) {
      setShowOnboarding(true)
    }
    setIsLoading(false)
  }, [user])

  const completeOnboarding = async () => {
    if (!user) return

    try {
      // Call API to mark onboarding as complete
      const response = await fetch('/api/users/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (response.ok) {
        localStorage.setItem(`onboarding_${user.id}`, 'true')
        setShowOnboarding(false)
      }
    } catch (error) {
      console.error('Failed to complete onboarding:', error)
    }
  }

  const skipOnboarding = () => {
    if (!user) return
    localStorage.setItem(`onboarding_${user.id}`, 'true')
    setShowOnboarding(false)
  }

  const restartOnboarding = () => {
    if (!user) return
    localStorage.removeItem(`onboarding_${user.id}`)
    setShowOnboarding(true)
  }

  return {
    showOnboarding,
    isLoading,
    completeOnboarding,
    skipOnboarding,
    restartOnboarding,
  }
}
