import React from 'react';
import UnifiedMarketingConsole from './components/UnifiedMarketingConsole';
import MarketingDemoVideo from './components/MarketingDemoVideo';

function App() {
  return (
    <div className="App" style={{ backgroundColor: '#fafafa', minHeight: '100vh', paddingBottom: '60px' }}>
      
      {/* 1. Main Functional Creation & Distribution Engine Dashboard */}
      <UnifiedMarketingConsole />

      {/* Separator Rule */}
      <div style={{ maxWidt: '1440px', margin: '40px auto', padding: '0 30px' }}>
        <hr style={{ border: '0', borderTop: '2px dashed #eaeaea' }} />
      </div>

      {/* 2. Public Marketing Showcase Section with the Improved Video Component */}
      <div style={{ padding: '0 30px' }}>
        <h3 style={{ textAlign: 'center', fontFamily: 'system-ui, sans-serif', color: '#444', marginBottom: '0' }}>
          App Marketing Presentation Layer
        </h3>
        <MarketingDemoVideo />
      </div>

    </div>
  );
}

export default App;
