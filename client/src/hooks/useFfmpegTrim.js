import { useRef, useCallback } from 'react';

/**
 * useFfmpegTrim
 *
 * Provides client-side video trimming via FFmpeg.wasm.
 * Loads lazily on first use. Falls back gracefully (returns null) if:
 *   - The npm package isn't installed
 *   - The WASM core can't be fetched (offline, COEP block, etc.)
 *   - Any per-clip trim operation fails
 *
 * When trimClip returns null, the caller should fall back to server-side trimming.
 */
export function useFfmpegTrim() {
  const instanceRef    = useRef(null);  // loaded FFmpeg instance
  const loadPromiseRef = useRef(null);  // in-flight load promise (dedupe concurrent calls)

  /** Load (or reuse) the FFmpeg.wasm instance. Returns null if unavailable. */
  const load = useCallback(async () => {
    if (instanceRef.current) return instanceRef.current;
    if (loadPromiseRef.current) return loadPromiseRef.current;

    loadPromiseRef.current = (async () => {
      try {
        const { FFmpeg }    = await import('@ffmpeg/ffmpeg');
        const { toBlobURL } = await import('@ffmpeg/util');

        const ff      = new FFmpeg();
        // Use the single-threaded core — no SharedArrayBuffer / COEP required.
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        await ff.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`,   'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });

        instanceRef.current = ff;
        return ff;
      } catch (err) {
        console.warn('[ffmpeg-wasm] Unavailable — will trim server-side:', err.message);
        return null;
      }
    })();

    return loadPromiseRef.current;
  }, []);

  /**
   * Trim `file` to the window [trimStart, trimEnd] using FFmpeg.wasm.
   *
   * @param {File}   file
   * @param {number} trimStart  — seconds
   * @param {number} trimEnd    — seconds
   * @returns {Promise<File|null>}  Trimmed File, or null to signal server-side fallback.
   */
  const trimClip = useCallback(async (file, trimStart, trimEnd) => {
    const ff = await load();
    if (!ff) return null;

    try {
      const { fetchFile } = await import('@ffmpeg/util');

      const ext        = file.name.slice(file.name.lastIndexOf('.')) || '.mp4';
      const inputName  = `in${ext}`;
      const outputName = `out${ext}`;

      await ff.writeFile(inputName, await fetchFile(file));
      await ff.exec([
        '-ss',                  String(trimStart),
        '-to',                  String(trimEnd),
        '-i',                   inputName,
        '-c',                   'copy',
        '-avoid_negative_ts',   'make_zero',
        outputName,
      ]);

      const data = await ff.readFile(outputName);
      const blob = data instanceof Uint8Array ? data : new Uint8Array(data);

      // Cleanup internal virtual FS
      await ff.deleteFile(inputName).catch(() => {});
      await ff.deleteFile(outputName).catch(() => {});

      return new File([blob], `trimmed_${file.name}`, {
        type: file.type || 'video/mp4',
      });
    } catch (err) {
      console.warn('[ffmpeg-wasm] Trim failed:', err.message);
      return null;
    }
  }, [load]);

  return { trimClip };
}
