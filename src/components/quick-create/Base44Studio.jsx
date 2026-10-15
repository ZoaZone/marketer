import { useState, useEffect } from 'react';
import Base44StudioControls from '@/components/quick-create/Base44StudioControls';
import Base44StudioPreview from '@/components/quick-create/Base44StudioPreview';
import StudioVideoBranding from '@/components/quick-create/StudioVideoBranding';
import useStudioVideoOptions from '@/components/quick-create/useStudioVideoOptions';
import useStudioMedia from '@/components/quick-create/useStudioMedia';

export default function Base44Studio({ type, prompt, referenceImageUrls, onBusyChange }) {
  const [imageRatio, setImageRatio] = useState('1:1');
  const [videoRatio, setVideoRatio] = useState('16:9');
  const [duration, setDuration] = useState(15);
  const [audio, setAudio] = useState(false);
  const [size, setSize] = useState('hd');
  const [optionsError, setOptionsError] = useState('');
  const options = useStudioVideoOptions(setOptionsError);
  const media = useStudioMedia({ type, prompt, referenceImageUrls: type === 'video' ? (options.character ? [options.character.fileUri] : []) : referenceImageUrls, ratio: type === 'video' ? videoRatio : imageRatio, duration, audio, size });
  const blocked = media.busy || media.saving || !!options.uploading || options.checking;
  useEffect(() => { onBusyChange(blocked); return () => onBusyChange(false); }, [blocked, onBusyChange]);
  const error = optionsError || media.error;
  const graphicsKey = JSON.stringify([options.logo?.fileUri || null, options.text]);
  const needsGraphics = !!media.result && media.result.renderedKey !== graphicsKey;
  return <div className="space-y-3">
    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {media.message && <p role="status" className="text-sm text-muted-foreground">{media.message}</p>}
    <div className="grid md:grid-cols-2 gap-5">
      <Base44StudioControls type={type} ratio={type === 'video' ? videoRatio : imageRatio} setRatio={type === 'video' ? setVideoRatio : setImageRatio} size={size} setSize={setSize} duration={duration} setDuration={setDuration} audio={audio} setAudio={setAudio} busy={blocked} pending={type === 'video' && !!media.pending} gateway={media.gateway} estimatedCredits={media.estimatedCredits} onEstimate={media.estimate} hasPrompt={!!prompt.trim()} onGenerate={() => { setOptionsError(''); media.generate(); }}>
        <StudioVideoBranding {...options} showCharacter={type === 'video'} disabled={blocked || !!media.pending} />
      </Base44StudioControls>
      <Base44StudioPreview result={media.result} busy={blocked} saving={media.saving} saved={media.saved && !needsGraphics} onSave={media.save} needsGraphics={needsGraphics} onRender={() => { setOptionsError(''); media.render(options); }} type={type} />
    </div>
  </div>;
}