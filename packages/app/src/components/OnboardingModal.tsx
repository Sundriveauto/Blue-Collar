'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Wallet, Users } from 'lucide-react'

interface OnboardingModalProps {
  isOpen: boolean
  onComplete: () => void
  onSkip: () => void
}

type Step = 'profile' | 'wallet' | 'explore'

export default function OnboardingModal({ isOpen, onComplete, onSkip }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState<Step>('profile')

  const steps: { id: Step; title: string; description: string; icon: React.ReactNode }[] = [
    {
      id: 'profile',
      title: 'Complete Your Profile',
      description: 'Add a profile picture and bio to help workers know more about you.',
      icon: <Users size={40} className="text-blue-500" />,
    },
    {
      id: 'wallet',
      title: 'Connect Your Wallet',
      description: 'Connect your Stellar wallet to send tips and payments to workers.',
      icon: <Wallet size={40} className="text-blue-500" />,
    },
    {
      id: 'explore',
      title: 'Explore Workers',
      description: 'Browse and discover skilled workers in your area.',
      icon: <CheckCircle2 size={40} className="text-blue-500" />,
    },
  ]

  const currentStepData = steps.find((s) => s.id === currentStep)!
  const stepIndex = steps.findIndex((s) => s.id === currentStep)
  const progress = ((stepIndex + 1) / steps.length) * 100

  const handleNext = () => {
    if (stepIndex < steps.length - 1) {
      setCurrentStep(steps[stepIndex + 1].id)
    } else {
      onComplete()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onSkip()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to BlueCollar</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-600">
              <span>Step {stepIndex + 1} of {steps.length}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Step content */}
          <div className="space-y-4 text-center">
            <div className="flex justify-center">{currentStepData.icon}</div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{currentStepData.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{currentStepData.description}</p>
            </div>
          </div>

          {/* Step indicators */}
          <div className="flex justify-center gap-2">
            {steps.map((step, idx) => (
              <button
                key={step.id}
                onClick={() => setCurrentStep(step.id)}
                className={`h-2 rounded-full transition-all ${
                  idx <= stepIndex ? 'bg-blue-600 w-6' : 'bg-gray-300 w-2'
                }`}
                aria-label={`Go to step ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onSkip} className="flex-1">
            Skip
          </Button>
          <Button onClick={handleNext} className="flex-1">
            {stepIndex === steps.length - 1 ? 'Get Started' : 'Next'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
