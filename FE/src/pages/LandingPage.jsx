import React, { useEffect } from 'react'

// TEMPORARY: Landing page shows only TikTok verification text for domain verification.
// Revert to full landing page after TikTok verification succeeds.
const TIKTOK_VERIFY = 'tiktok-developers-site-verification=9ZmXlCTFB4n6biuoUgeGVK8LvWWGHutG'

export default function LandingPage() {
  useEffect(() => {
    document.body.classList.add('mm-landing')
    return () => document.body.classList.remove('mm-landing')
  }, [])

  return (
    <pre
      style={{
        margin: 0,
        padding: '2rem',
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#333',
        background: '#fff',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {TIKTOK_VERIFY}
    </pre>
  )
}

