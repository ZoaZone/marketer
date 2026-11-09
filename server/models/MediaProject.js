const mongoose = require('mongoose');

const MediaProjectSchema = new mongoose.Schema({
  // Phase 1: Ingestion Sources
  ingestion: {
    creativeVision: { type: String, required: true },
    scannedWebsite: { type: String, default: '' },
    uploadedFiles: [{ type: String }], // Paths to logos/reference images
    extractedLogos: [{ type: String }]
  },

  // Phase 2: Restored Parameters
  configuration: {
    format: { type: String, enum: ['9:16', '16:9', '1:1'], default: '9:16' },
    durationSeconds: { type: Number, default: 30 },
    captionStyle: { type: String, enum: ['minimal', 'complete'], default: 'complete' },
    targetPlatforms: [{ type: String }] // ['Instagram', 'YouTube', 'TikTok']
  },

  // Phase 3: Linked Production Canvas (All synchronized)
  productionCanvas: {
    videoScript: { type: String, default: '' },
    storyboard: [{ sceneNumber: Number, visualPrompt: String, textHook: String }],
    generatedVideoUrl: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
    adCopy: { type: String, default: '' },
    caption: { type: String, default: '' },
    hashtags: [{ type: String }]
  },
  
  // Phase 4: Campaign & Publishing Status
  publishing: {
    scheduledTime: { type: Date },
    socialAccounts: [{ provider: String, accountId: String, status: String }],
    publishStatus: { type: String, enum: ['Draft', 'Processing', 'Scheduled', 'Published', 'Failed'], default: 'Draft' },
    postId: { type: String, default: '' }
  },

  // Phase 5: Post-Publishing Analytics
  analytics: {
    deliveryStatus: { type: String, default: 'Pending' },
    views: { type: Number, default: 0 },
    engagement: { type: Number, default: 0 }
  },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MediaProject', MediaProjectSchema);
