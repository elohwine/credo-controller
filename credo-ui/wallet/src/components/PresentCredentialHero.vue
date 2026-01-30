<template>
  <section class="present-hero" role="region" aria-label="Present Credential hero">
    <div class="hero-inner">
      <div class="text-col">
        <h2 class="title">Present Credential</h2>
        <p class="subtitle">
          Scan a QR code to receive a new credential. We will securely scan the QR code and display
          the credential details for your review.
        </p>
        
        <!-- Slot for Action/Scanner Area -->
        <slot name="action-area">
            <button class="cta">Scan QR code</button>
        </slot>
      </div>
      <div class="illustration-col" aria-hidden="true">
        <!-- soft rounded panel with fading diagonal waves -->
        <div class="illustration-bg">
          <!-- Phone + VC card composed as inline SVG for crispness and perfect control -->
          <svg class="device-svg" viewBox="0 0 260 360" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
            <defs>
              <!-- Explicit Credentis Blue Gradient -->
              <linearGradient id="deviceGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#88C4E3" stop-opacity="1"/>
                <stop offset="50%" stop-color="#2188CA" stop-opacity="1"/>
                <stop offset="100%" stop-color="#0F3F5E" stop-opacity="1"/>
              </linearGradient>
              <linearGradient id="cardGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="rgba(255,255,255,0.25)" />
                <stop offset="100%" stop-color="rgba(255,255,255,0.10)" />
              </linearGradient>
              <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="12" stdDeviation="20" flood-color="#0F3F5E" flood-opacity="0.25"/>
              </filter>
              <!-- Faint diagonal shimmer -->
              <linearGradient id="waveFade" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="rgba(255,255,255,0.2)"/>
                <stop offset="100%" stop-color="rgba(255,255,255,0.0)"/>
              </linearGradient>
            </defs>

            <!-- Device Body -->
            <g transform="translate(10,10)">
              <rect x="0" y="0" rx="24" ry="24" width="130" height="260" fill="url(#deviceGradient)" filter="url(#softShadow)"/>
              <!-- Screen (Crisp White) -->
              <rect x="8" y="8" rx="16" ry="16" width="114" height="244" fill="#ffffff"/>
              
              <!-- Screen Content Group -->
              <g transform="translate(8, 8)">
                 <!-- Credentis Logo (Greek Column) -->
                 <g transform="translate(32, 70) scale(0.5)" fill="#2188CA">
                    <!-- Capital -->
                    <path d="M10 20 L90 20 L90 35 L80 35 L80 30 L20 30 L20 35 L10 35 Z" />
                    <path d="M5 10 L95 10 L95 18 L5 18 Z" />
                    <!-- Fluted Shaft -->
                    <rect x="20" y="40" width="10" height="60" rx="2" />
                    <rect x="35" y="40" width="10" height="60" rx="2" />
                    <rect x="50" y="40" width="10" height="60" rx="2" />
                    <rect x="65" y="40" width="10" height="60" rx="2" />
                    <!-- Base -->
                    <path d="M15 105 L85 105 L85 115 L15 115 Z" />
                 </g>
                 <!-- App Name -->
                 <text x="57" y="145" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="700" letter-spacing="1" fill="#0F3F5E">CREDENTIS</text>
                 
                 <!-- Mini QR Code -->
                 <g transform="translate(37, 160)" fill="#1F2937">
                    <rect x="0" y="0" width="12" height="12" rx="2" />
                    <rect x="28" y="0" width="12" height="12" rx="2" />
                    <rect x="0" y="28" width="12" height="12" rx="2" />
                    <rect x="16" y="16" width="8" height="8" rx="1" />
                    <rect x="28" y="28" width="4" height="4" />
                    <rect x="16" y="4" width="4" height="4" />
                    <rect x="4" y="16" width="4" height="4" />
                 </g>
              </g>

              <!-- Glass Reflection on Screen -->
              <path d="M8 8 L122 8 L122 100 Q65 140 8 100 Z" fill="url(#waveFade)" opacity="0.4" style="pointer-events:none;"/>
            </g>

            <!-- Floating Credential Card -->
            <g transform="translate(90,90)">
              <!-- Card Shadow -->
              <rect x="-6" y="-8" rx="12" ry="12" width="150" height="90" fill="#0F3F5E" opacity="0.15" filter="url(#softShadow)"/>
              <!-- Card Body (Glassmorphism blue) -->
              <rect x="0" y="0" rx="12" ry="12" width="150" height="90" fill="url(#deviceGradient)" opacity="0.95"/>
              <!-- Inner Border/Highlight -->
              <rect x="1" y="1" rx="11" ry="11" width="148" height="88" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
              
              <!-- Card Header Band -->
              <rect x="0" y="0" rx="12" ry="12" width="150" height="36" fill="rgba(255,255,255,0.15)"/>
              
              <!-- Card Content -->
              <g transform="translate(15, 55)">
                <text font-family="sans-serif" font-size="10" font-weight="700" fill="#ffffff" letter-spacing="0.5">INVOICE</text>
                <text y="14" font-family="sans-serif" font-size="14" font-weight="800" fill="#ffffff">CREDENTIAL</text>
              </g>
              
              <!-- Verified Badge -->
              <g transform="translate(100, 10)">
                 <rect x="0" y="0" width="40" height="16" rx="8" fill="#ffffff" />
                 <path d="M12 8 L18 14 L28 4" stroke="#2188CA" stroke-width="3" fill="none" transform="scale(0.4) translate(15,10)" />
              </g>
            </g>

            <!-- Ambient Glow -->
            <defs>
              <radialGradient id="ambglow" cx="50%" cy="50%">
                <stop offset="0%" stop-color="#2188CA" stop-opacity="0.15"/>
                <stop offset="100%" stop-color="#2188CA" stop-opacity="0"/>
              </radialGradient>
            </defs>
            <circle cx="130" cy="180" r="120" fill="url(#ambglow)" style="mix-blend-mode: multiply;"/>
          </svg>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
// no props required — static presentational piece
</script>

<style scoped>
/* Fallback tokens in case your global tokens are not yet imported */
:root {
  --credentis-curious: #2188CA;
  --credentis-viking: #6FB4DC;
  --credentis-cornflower: #88C4E3;
  --credentis-link-water: #D0E6F3;
  --primary-500: var(--credentis-curious);
  --primary-400: var(--credentis-viking);
  --primary-300: var(--credentis-cornflower);
  --primary-100: var(--credentis-link-water);
  --primary-gradient: linear-gradient(135deg, var(--primary-500) 0%, var(--primary-400) 50%, var(--primary-300) 100%);
  --header-gradient: linear-gradient(180deg, var(--primary-500) 0%, #1a6ca1 100%);
  --bg: #F6F8FC;
  --card-bg: #fff;
  --text-primary: #1F2937;
  --text-secondary: #6B7280;
  --radius-lg: 16px;
  --card-shadow-1: 0 10px 25px rgba(0,0,0,0.08);
}

/* container */
.present-hero {
  background: linear-gradient(180deg, rgba(33,136,202,0.06), rgba(140,196,227,0.02));
  padding: 36px 20px;
  border-radius: 18px;
  overflow: hidden;
}

/* inner layout: two columns */
.hero-inner {
  display: grid;
  grid-template-columns: 1fr 420px;
  gap: 28px;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
}

/* text column */
.text-col {
  padding: 28px 16px;
}

.title {
  margin: 0 0 10px 0;
  font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.2px;
}

.subtitle {
  margin: 0 0 18px 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.55;
  max-width: 540px;
}

/* CTA */
.cta {
  height: 44px;
  min-width: 160px;
  padding: 0 20px;
  border-radius: 10px;
  background: var(--primary-gradient);
  color: #fff;
  font-weight: 600;
  border: none;
  box-shadow: 0 6px 18px rgba(33,136,202,0.18);
  cursor: pointer;
  transition: transform .12s ease, box-shadow .12s ease;
}

.cta:active {
  transform: translateY(1px);
}

.cta:focus {
  outline: none;
  box-shadow: 0 8px 24px rgba(33,136,202,0.24);
}

/* illustration column */
.illustration-col {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}

.illustration-bg {
  width: 420px;
  height: 260px;
  border-radius: 14px;
  background: linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)), var(--soft-gradient, linear-gradient(180deg, rgba(33,136,202,0.06) 0%, rgba(140,196,227,0.03) 100%));
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 18px;
  box-shadow: var(--card-shadow-1);
  overflow: visible;
}

/* svg scales nicely */
.device-svg {
  width: 86%;
  height: auto;
  transform: translateY(-6px) rotate(-2deg);
  filter: drop-shadow(0 10px 20px rgba(32,64,96,0.06));
}

/* responsive adjustments */
@media (max-width: 920px) {
  .hero-inner {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .illustration-col {
    order: -1;
    justify-content: flex-end;
  }

  .illustration-bg {
    width: 100%;
    height: 220px;
  }

  .title {
    font-size: 22px;
  }
}
</style>
