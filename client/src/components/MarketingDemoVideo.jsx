import React from 'react';

export default function MarketingDemoVideo() {
  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '40px auto', 
      padding: '10px',
      background: '#fff',
      borderRadius: '16px', 
      boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
      border: '1px solid #eaeaea'
    }}>
      {/* Container to enforce exact video framing aspect ratios */}
      <div style={{ 
        position: 'relative', 
        borderRadius: '12px', 
        overflow: 'hidden', 
        backgroundColor: '#000',
        aspectRatio: '16/9'
      }}>
        <video 
          autoPlay 
          loop 
          muted 
          playsInline
          controls
          style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
          src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" 
        >
          Your browser does not support the video tag canvas player.
        </video>
      </div>

      {/* Visual Narrative Track Overlay Text */}
      <div style={{ 
        padding: '20px 15px 10px 15px', 
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif'
      }}>
        <h4 style={{ margin: '0 0 8px 0', color: '#111', fontSize: '16px', fontWeight: '700' }}>
          🎬 Watch the Platform Engine Run on Auto-Pilot
        </h4>
        <p style={{ margin: 0, color: '#666', fontSize: '13px', lineHeight: '1.5' }}>
          See how your creative vision transforms from a website link into synchronized scripts, vertical videos, captions, and automated social publishing in under 30 seconds.
        </p>
      </div>
    </div>
  );
}
