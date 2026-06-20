'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function Hero() {
  const router = useRouter()
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (location) params.set('location', location)
    router.push(`/workers?${params.toString()}`)
  }

  return (
    <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white px-4 py-24 sm:py-32 text-center">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
          Find Skilled Workers Near You
        </h1>
        <p className="text-lg sm:text-xl text-blue-100 mb-8 max-w-2xl mx-auto leading-relaxed">
          Connect with trusted local tradespeople — plumbers, electricians, carpenters, and more. 
          Secure payments powered by Stellar blockchain.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center max-w-2xl mx-auto mb-8"
        >
          <input
            type="text"
            placeholder="Category (e.g. Plumber)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="flex-1 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-300"
            aria-label="Worker category"
          />
          <input
            type="text"
            placeholder="Location (e.g. Lagos)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="flex-1 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-300"
            aria-label="Location"
          />
          <button
            type="submit"
            className="rounded-lg bg-white text-blue-700 font-semibold px-6 py-3 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
          >
            Browse Workers
            <ArrowRight size={18} />
          </button>
        </form>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 bg-white text-blue-700 font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Get Started
            <ArrowRight size={18} />
          </Link>
          <Link
            href="/workers"
            className="inline-flex items-center gap-2 border-2 border-white text-white font-semibold px-6 py-3 rounded-lg hover:bg-white/10 transition-colors"
          >
            Browse All Workers
          </Link>
        </div>
      </div>
    </section>
  )
}
