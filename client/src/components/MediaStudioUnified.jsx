import React, { useState } from 'react';

export default function MediaStudioUnified() {
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState(null);
  const [formData, setFormData] = useState({
    creativeVision: '',
    platformTarget: 'Instagram',
    brandTone: 'Professional',
    format: '9:16',
    durationSeconds: 30,
    captionLength: 'complete'
  });

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/media/generate-unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await response.json();
      if (data.success) setProject(data.project);
    } catch (err) {
      console.error("Pipeline generation failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>Media Studio Engine (Unified Mode)</h2>
      <p style={{ color: '#666' }}>Synchronized asset creation with minimal human interaction</p>
      
      <hr style={{ border: '0', borderTop: '1px solid #eee', margin: '20px 0' }} />

      {/* Configuration Parameters Panel */}
      <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', marginBottom: '24px' }}>
        <h3>Configure Design & Format Parameters</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Video Format/Aspect Ratio</label>
            <select name="format" value={formData.format} onChange={handleInputChange} style={{ width: '100%', padding: '8px', borderRadius: '4px' }}>
              <option value="9:16">9:16 (Vertical Short/Reel)</option>
              <option value="16:9">16:9 (Landscape Video)</option>
              <option value="1:1">1:1 (Square Feed)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Target Video Duration</label>
            <select name="durationSeconds" value={formData.durationSeconds} onChange={handleInputChange} style={{ width: '100%', padding: '8px', borderRadius: '4px' }}>
              <option value={15}>15 Seconds</option>
              <option value={30}>30 Seconds</option>
              <option value={60}>60 Seconds</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Caption Selection Style</label>
            <select name="captionLength" value={formData.captionLength} onChange={handleInputChange} style={{ width: '100%', padding: '8px', borderRadius: '4px' }}>
              <option value="minimal">Minimal Caption (Short Hook Only)</option>
              <option value="complete">Complete Media Input (Full Copy + Hashtags)</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Describe Your Creative Vision</label>
          <textarea 
            name="creativeVision" 
            placeholder="Describe what you want to create... (e.g., Launching an organic dog food subscription box)" 
            value={formData.creativeVision} 
            onChange={handleInputChange} 
            style={{ width: '100%', height: '80px', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <button 
          onClick={handleGenerate} 
          disabled={loading || !formData.creativeVision}
          style={{ background: '#d100d1', color: 'white', padding: '12px 24px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {loading ? 'Executing Synchronized Render...' : 'Generate Integrated Creative Content'}
        </button>
      </div>

      {/* Output Hub Preview & Download Panel */}
      {project && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Output Hub (Synchronized Preview)</h3>
            <button style={{ background: '#00c14d', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              🚀 Auto-Publish Complete Bundle to {formData.platformTarget}
            </button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '16px' }}>
            <div style={{ border: '1px solid #ddd', padding: '16px', borderRadius: '8px' }}>
              <h4>🎬 Core Script & Storyboard Context</h4>
              <p style={{ background: '#f1f1f1', padding: '10px', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>{project.assets.videoScript}</p>
              <a href={`/api/media/download/${project._id}/videoScript`} download style={{ color: '#0066cc', textDecoration: 'none', fontWeight: 'bold' }}>Download Script File</a>
            </div>

            <div style={{ border: '1px solid #ddd', padding: '16px', borderRadius: '8px' }}>
              <h4>🎨 Synchronized Thumbnail Preview</h4>
              <div style={{ width: '100%', height: '140px', background: '#e2e2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px', borderRadius: '4px' }}>
                <span style={{ color: '#555' }}>[Preview Mock: Aspect Ratio {project.videoSettings.format}]</span>
              </div>
              <a href={`/api/media/download/${project._id}/thumbnailUrl`} download style={{ color: '#0066cc', textDecoration: 'none', fontWeight: 'bold' }}>Download Visual Media</a>
            </div>

            <div style={{ border: '1px solid #ddd', padding: '16px', borderRadius: '8px', gridColumn: 'span 2' }}>
              <h4>✍️ Linked Marketing Copy & Captions ({project.videoSettings.captionLength})</h4>
              <p><strong>Ad Copy:</strong> {project.assets.adCopy}</p>
              <p><strong>Social Caption:</strong> {project.assets.caption}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
