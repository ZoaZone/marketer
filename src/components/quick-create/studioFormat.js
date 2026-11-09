// The video model only makes 16:9 and 9:16. Square and 4:5 are cropped from
// those in the browser during the "finish" step; export sizes are applied there too.
export const VIDEO_FORMATS = ['16:9', '9:16', '1:1', '4:5'];
export const EXPORT_SIZES = [['hd', 'HD 720p'], ['full', 'Full HD 1080p']];

const DIMS = {
  hd: { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [720, 720], '4:5': [720, 900] },
  full: { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] },
};

export const generationRatio = ratio => (ratio === '1:1' ? '16:9' : ratio === '4:5' ? '9:16' : ratio);
export const exportDims = (ratio, size) => DIMS[size][ratio];
// A finished file only needs the browser pass when it is not already native 16:9/9:16 at HD.
export const needsFormatPass = (ratio, size) => generationRatio(ratio) !== ratio || size !== 'hd';