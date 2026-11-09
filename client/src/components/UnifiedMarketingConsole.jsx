import React, { useState } from 'react';

export default function UnifiedMarketingConsole() {
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState(null);
  const [uploadedBrandFiles, setUploadedBrandFiles] = useState([]);
  
  const [socialAccounts, setSocialAccounts] = useState({
    instagram: { connected: false, checking: false },
    youtube: { connected: false, checking: false },
    tiktok: { connected: false, checking: false }
  });

  const [formData, setFormData] = useState({
    creativeVision: '',
    scannedWebsite: '',
    format: '9:16',
    durationSeconds: 30,
    captionStyle: 'complete',
    selectedPlatforms: []
  });

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const togglePlatformSelection = (platform) => {
    const current = [...formData.selectedPlatforms];
    const index = current.indexOf(platform);
    if (index > -1) current.splice(index, 1);
    else current.push(platform);
    setFormData({ ...formData, selectedPlatforms: current });
  };

  // REPAIRED FILE UPLOADING TRIGGER
  const handleFileUploadMock = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const response = await fetch('/api/media/upload-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileType: 'logo' })
      });
      const data = await response.json();
      if (data.success) {
        setUploadedBrandFiles([...uploadedBrandFiles, data.file]);
        alert(`Successfully uploaded and linked: ${file.name}`);
      }
    } catch (err) {
      console.error("Upload error:", err);
    }
  };

  const verifySocialAccount = async (platform) => {
    setSocialAccounts(prev => ({ ...prev, [platform]: { ...prev[platform], checking: true } }));
    const response = await fetch('/api/media/verify-socials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform })
    });
    const data = await response.json();
    if (data.connected) {
      setSocialAccounts(prev => ({ ...prev, [platform]: { connected: true, checking: false } }));
    }
  };

  const handleExecutePipeline = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/media/execute-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, uploadedFiles: uploadedBrandFiles })
      });
      const data = await response.json();
      if (data.success) setProject(data.project);
    } catch (err) {
      console.error("Pipeline failure:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '30px', maxWidth: '1440px', margin: '0 auto', fontFamily: 'system-ui, sans-serif', backgroundColor: '#fafafa', color: '#222' }}>
      
      <header style={{ marginBottom: '30px', borderBottom: '2px solid #eaeaea', paddingBottom: '15px' }}>
        <h1 style={{ margin: 0, fontSize: '28px', color: '#111' }}>Auto-Pilot Social Marketing Console</h1>
        <p style={{ color: '#666', margin: '5px 0 0 0' }}>Streamlined Content Assembly and Delivery Pipeline</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '30px' }}>
        
        {/* INPUT AND CONFIG PANEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '8px' }}>1. Asset Ingestion</h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px', fontSize: '14px' }}>Scan Website Framework</label>
              <input type="url" name="scannedWebsite" placeholder="https://brand-domain.com" value={formData.scannedWebsite} onChange={handleInputChange} style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #ccc' }} />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px', fontSize: '14px' }}>Upload Logo / Reference Assets</label>
              <input type="file" onChange={handleFileUploadMock} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '6px', background: '#fcfcfc' }} />
              {uploadedBrandFiles.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#00c14d' }}>
                  ✓ Connected references: {uploadedBrandFiles.map(f => f.fileName).join(', ')}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px', fontSize: '14px' }}>AI Creative Vision Core</label>
              <textarea name="creativeVision" placeholder="Describe marketing goals..." value={formData.creativeVision} onChange={handleInputChange} style={{ width: '100%', height: '80px', padding: '10px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #ccc' }} />
            </div>
          </div>

          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '8px' }}>2. Format Configurations</h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px', fontSize: '14px' }}>Video Format</label>
              <select name="format" value={formData.format} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}>
                <option value="9:16">9:16 Vertical (Reels/TikTok)</option>
                <option value="16:9">16:9 Landscape (YouTube)</option>
                <option value="1:1">1:1 Square (Instagram Feed)</option>
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px', fontSize: '14px' }}>Video Target Length</label>
              <select name="durationSeconds" value={formData.durationSeconds} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}>
                <option value={15}>15 Seconds Length</option>
                <option value={30}>30 Seconds Length</option>
                <option value={60}>60 Seconds Length</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px', fontSize: '14px' }}>Caption Constraint Parameters</label>
              <select name="captionStyle" value={formData.captionStyle} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}>
                <option value="none">No Caption (Clean Video Output Only)</option>
                <option value="minimal">Minimal Caption Hook</option>
                <option value="complete">Complete Subtitles & Associated Hashtags</option>
              </select>
            </div>
          </div>

          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '8px' }}>3. Integrated Social Accounts</h3>
            {['instagram', 'youtube', 'tiktok'].map((platform) => (
              <div key={platform} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <label style={{ textTransform: 'capitalize', fontSize: '14px' }}>
                  <input type="checkbox" checked={formData.selectedPlatforms.includes(platform)} onChange={() => togglePlatformSelection(platform)} style={{ marginRight: '8px' }} />
                  {platform}
                </label>
                <button onClick={() => verifySocialAccount(platform)} style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer', background: socialAccounts[platform].connected ? '#e6f4ea' : '#fff', color: socialAccounts[platform].connected ? '#137333' : '#333' }}>
                  {socialAccounts[platform].checking ? 'Testing...' : socialAccounts[platform].connected ? '✓ Active Connection' : 'Verify Account Sync'}
                </button>
              </div>
            ))}
            <button onClick={handleExecutePipeline} disabled={loading || !formData.creativeVision} style={{ width: '100%', marginTop: '10px', background: '#7f00ff', color: 'white', padding: '14px', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
              {loading ? 'Processing Interconnected Render...' : 'Generate Integrated Creative Content'}
            </button>
          </div>
        </div>

        {/* INTERLINKED LIVE PRODUCTION MONITOR CANVAS */}
        <div style={{ background: '#fff', padding: '25px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h2 style={{ marginTop: 0, fontSize: '20px', color: '#333' }}>Production Canvas Monitor Hub</h2>
          
          {!project ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #eaeaea', borderRadius: '8px', height: '350px', color: '#aaa' }}>
              Awaiting auto-pilot generation stream initialization to populate canvas.
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f1f3f4', padding: '12px 20px', borderRadius: '8px', marginBottom: '24px', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 'bold' }}>Status: Ready for Sync Pipeline Distribution 🚀</span>
                </div>
                <button style={{ background: '#00c14d', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Deploy Single-Click Auto-Publish Schedule
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                
                {/* REPAIRED MONITOR PREVIEW BOX */}
                <div style={{ border: '1px solid #e0e0e0', padding: '16px', borderRadius: '8px', background: '#fafafa' }}>
                  <h4 style={{ margin: '0 0 10px 0' }}>🎬 Streamable Video Output Monitor</h4>
                  <video key={project.productionCanvas.generatedVideoUrl} controls style={{ width: '100%', borderRadius: '6px', background: '#000', maxHeight: '240px' }}>
                    <source src={project.productionCanvas.generatedVideoUrl} type="video/mp4" />
                    Canvas player failed to initialize asset stream.
                  </video>
                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: '#666' }}>Format Aspect Ratio: {project.configuration.format}</span>
                    <a href={project.productionCanvas.generatedVideoUrl} target="_blank" rel="noreferrer" download style={{ color: '#7f00ff', fontWeight: 'bold', fontSize: '14px', textDecoration: 'none' }}>⬇ Download HD Video Clip</a>
                  </div>
                </div>

                <div style={{ border: '1px solid #e0e0e0', padding: '16px', borderRadius: '8px', background: '#fafafa' }}>
                  <h4 style={{ margin: '0 0 10px 0' }}>🖼️ Synchronized Generated Thumbnail</h4>
                  <img src={project.productionCanvas.thumbnailUrl} alt="Thumbnail Canvas" style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '4px' }} />
                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#666' }}>Linked Graphic Resource</span>
                    <a href={project.productionCanvas.thumbnailUrl} target="_blank" rel="noreferrer" download style={{ color: '#7f00ff', fontWeight: 'bold', fontSize: '14px', textDecoration: 'none' }}>⬇ Download Thumbnail PNG</a>
                  </div>
                </div>

                <div style={{ border: '1px solid #e0e0e0', padding: '16px', borderRadius: '8px', gridColumn: 'span 2' }}>
                  <h4>✍️ Linked Cross-Asset Content Breakdown</h4>
                  <p><strong>Script Narrative Anchor:</strong> {project.productionCanvas.videoScript}</p>
                  <p><strong>Ad Copy Variant:</strong> {project.productionCanvas.adCopy}</p>
                  
                  {project.configuration.captionStyle === 'none' ? (
                    <p style={{ color: '#ff9900', fontStyle: 'italic' }}>⚠️ Configuration Parameter set to [No Caption Mode] — Output string cleared.</p>
                  ) : (
                    <>
                      <p><strong>Live Social Caption:</strong> {project.productionCanvas.caption}</p>
                      <p><strong>Hashtags:</strong> {project.productionCanvas.hashtags.map(t => `#${t}`).join(' ')}</p>
                    </>
                  )}
                </div>

              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
