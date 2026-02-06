import React, { useEffect, useMemo } from 'react'

const RAW_CSS = `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body.mm-landing {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: #000000;
  color: #ffffff;
  min-height: 100vh;
  overflow-x: hidden;
}

/* Background with subtle gradient */
body.mm-landing::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 50% 20%, rgba(30, 30, 45, 0.4) 0%, transparent 50%);
  z-index: -1;
}

nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 4%;
  background: transparent;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 1.35rem;
  font-weight: 400;
  font-style: italic;
  color: #ffffff;
}

.logo-icon {
  width: 32px;
  height: 32px;
  background: #ffffff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

/* Moon icon - matching the reference */
.logo-icon::after {
  content: '';
  width: 18px;
  height: 18px;
  background: #000000;
  border-radius: 50%;
  position: absolute;
  left: 6px;
  top: 7px;
}

.nav-links {
  display: flex;
  gap: 2.5rem;
  list-style: none;
}

.nav-links a {
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  transition: color 0.3s;
  font-size: 0.95rem;
  font-weight: 400;
}

.nav-links a:hover {
  color: #ffffff;
}

.get-template {
  padding: 0.6rem 1.25rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #ffffff;
  text-decoration: none;
  font-size: 0.9rem;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.get-template:hover {
  background: rgba(255, 255, 255, 0.12);
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 6rem 5% 8rem;
  max-width: 1200px;
  margin: 0 auto;
  position: relative;
}

/* Icon container with glow effect */
.hero-icon-container {
  position: relative;
  margin-bottom: 3rem;
}

.icon-glow {
  position: absolute;
  width: 150px;
  height: 150px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%);
  border-radius: 50%;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  filter: blur(30px);
  z-index: 0;
}

.hero-icon {
  width: 100px;
  height: 100px;
  background: linear-gradient(135deg, #1a1a1a 0%, #2a2a3a 100%);
  border-radius: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

/* Moon icon inside hero */
.hero-icon::before {
  content: '';
  width: 50px;
  height: 50px;
  background: #ffffff;
  border-radius: 50%;
  position: relative;
}

.hero-icon::after {
  content: '';
  width: 30px;
  height: 30px;
  background: linear-gradient(135deg, #1a1a1a 0%, #2a2a3a 100%);
  border-radius: 50%;
  position: absolute;
  left: 32px;
  top: 28px;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 1.2rem;
  background: transparent;
  border-radius: 50px;
  font-size: 0.75rem;
  letter-spacing: 1.5px;
  margin-bottom: 2rem;
  color: rgba(255, 255, 255, 0.8);
  text-transform: uppercase;
  font-weight: 500;
}

.badge::before {
  content: '•';
  color: rgba(255, 255, 255, 0.5);
  font-size: 1.2rem;
}

h1 {
  font-size: 5.5rem;
  font-weight: 400;
  line-height: 1.1;
  margin-bottom: 1.5rem;
  color: #a0a0a0;
  letter-spacing: -0.02em;
}

h1 .line1,
h1 .line2 {
  display: block;
}

.highlight {
  font-style: italic;
  color: #ffffff;
  font-weight: 300;
}

.subtitle {
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 3rem;
  max-width: 550px;
  font-weight: 300;
  line-height: 1.6;
}

.cta-button {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.9rem 2rem;
  background: #ffffff;
  color: #000000;
  text-decoration: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  transition: all 0.3s;
  border: 1px solid #ffffff;
}

.cta-button:hover {
  background: rgba(255, 255, 255, 0.9);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(255, 255, 255, 0.2);
}

/* Social icons at bottom */
.social-icons {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 2rem;
  z-index: 100;
}

.social-icons a {
  color: rgba(255, 255, 255, 0.3);
  font-size: 1.3rem;
  transition: color 0.3s;
  text-decoration: none;
}

.social-icons a:hover {
  color: rgba(255, 255, 255, 0.6);
}

footer {
  padding: 2rem 5%;
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  margin-top: 6rem;
}

.footer-links {
  display: flex;
  justify-content: center;
  gap: 2rem;
  margin-bottom: 1rem;
}

.footer-links a {
  color: rgba(255, 255, 255, 0.4);
  text-decoration: none;
  font-size: 0.9rem;
  transition: color 0.3s;
}

.footer-links a:hover {
  color: rgba(255, 255, 255, 0.7);
}

.copyright {
  color: rgba(255, 255, 255, 0.25);
  font-size: 0.85rem;
  margin-top: 1rem;
}

@media (max-width: 768px) {
  h1 {
    font-size: 2.8rem;
  }

  .nav-links {
    gap: 1.5rem;
    font-size: 0.85rem;
  }

  .hero {
    padding: 4rem 5% 6rem;
  }

  .get-template {
    display: none;
  }

  .social-icons {
    gap: 1.5rem;
  }

  .footer-links {
    flex-direction: column;
    gap: 1rem;
  }
}
`

export default function LandingPage() {
  useEffect(() => {
    document.body.classList.add('mm-landing')
    return () => document.body.classList.remove('mm-landing')
  }, [])

  const css = useMemo(() => RAW_CSS, [])

  return (
    <>
      <style>{css}</style>

      <nav>
        <div className="logo">
          <div className="logo-icon" />
          <span>Motion Model</span>
        </div>
        <ul className="nav-links">
          <li>
            <a href="/app">App</a>
          </li>
          <li>
            <a href="/terms.html">Terms</a>
          </li>
          <li>
            <a href="/privacy.html">Privacy</a>
          </li>
        </ul>
        <a href="/app" className="get-template">
          <span>✨</span>
          <span>Open CreateAI</span>
        </a>
      </nav>

      <div className="hero">
        <div className="hero-icon-container">
          <div className="icon-glow" />
          <div className="hero-icon" />
        </div>

        <div className="badge">AI-POWERED VIDEO GENERATION</div>

        <h1>
          <span className="line1">Create Videos. Grow</span>
          <span className="line2">
            Faster. <span className="highlight">With AI.</span>
          </span>
        </h1>

        <p className="subtitle">
          AI-powered video generation tool that creates and publishes videos to TikTok
          automatically
        </p>

        <a href="/app" className="cta-button">
          <span>Open the App</span>
          <span>↗</span>
        </a>
      </div>

      <div className="social-icons">
        <a href="https://twitter.com" target="_blank" rel="noreferrer" title="Twitter">
          𝕏
        </a>
        <a href="https://instagram.com" target="_blank" rel="noreferrer" title="Instagram">
          📷
        </a>
        <a href="https://facebook.com" target="_blank" rel="noreferrer" title="Facebook">
          f
        </a>
      </div>

      <footer>
        <div className="footer-links">
          <a href="/terms.html">Terms of Service</a>
          <a href="/privacy.html">Privacy Policy</a>
          <a href="/app">Open App</a>
        </div>
        <p className="copyright">© 2026 Motion Model. All rights reserved.</p>
      </footer>
    </>
  )
}

