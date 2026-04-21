import { useRef, useState, useCallback } from 'react';

const ACCEPTED = '.jpg,.jpeg,.png,.mp4,.mov,.webm';

export default function Upload({ onUpload, isUploading }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragError, setDragError] = useState('');

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const ok = /\.(jpg|jpeg|png|mp4|mov|webm)$/i.test(file.name);
    if (!ok) {
      setDragError('Unsupported format. Use JPG, PNG, MP4, or MOV.');
      return;
    }
    setDragError('');
    onUpload(file);
  }, [onUpload]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile]);

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        className={`relative flex flex-col items-center justify-center gap-5 px-8 py-16
          border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300
          ${isDragging
            ? 'drop-zone-active border-violet-400'
            : 'border-border hover:border-violet-500/50 hover:bg-surface-700/40'
          }
          ${isUploading ? 'pointer-events-none opacity-60' : ''}
        `}
        onClick={() => !isUploading && inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {/* Icon */}
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300
          ${isDragging ? 'bg-accent-muted' : 'bg-surface-700'}`}>
          {isUploading ? (
            <div className="spinner w-8 h-8" style={{ width: 32, height: 32, borderWidth: 3 }} />
          ) : (
            <svg className={`w-8 h-8 transition-colors duration-300 ${isDragging ? 'text-violet-400' : 'text-ink-muted'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
          )}
        </div>

        {/* Text */}
        <div className="text-center space-y-1">
          <p className="text-ink font-semibold text-lg">
            {isUploading ? 'Uploading…' : isDragging ? 'Drop to upload' : 'Drop your media here'}
          </p>
          <p className="text-ink-muted text-sm">
            {isUploading ? 'Hang tight…' : 'or click to browse — JPG, PNG, MP4, MOV · max 150 MB'}
          </p>
        </div>

        {/* Format badges */}
        {!isUploading && (
          <div className="flex gap-2 flex-wrap justify-center">
            {['JPG', 'PNG', 'MP4', 'MOV'].map(fmt => (
              <span key={fmt} className="label-tag">{fmt}</span>
            ))}
          </div>
        )}

        {dragError && (
          <p className="absolute bottom-4 text-red-400 text-sm font-medium">{dragError}</p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={e => handleFile(e.target.files[0])}
        />
      </div>
    </div>
  );
}
