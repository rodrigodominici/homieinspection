import { useEffect, useState } from 'react';
import { getSignedPhotoUrl, invalidatePhotoUrl } from '@/lib/photo-urls';

interface SignedPhotoImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Signed URL resolved by the caller (may be empty while loading). */
  url: string;
  /** Canonical storage path, used to re-sign the photo if the URL fails. */
  storagePath: string;
}

/**
 * <img> that recovers on its own when a signed URL is missing or expired
 * (blank tiles were the visible symptom of evicted/expired URLs).
 */
export function SignedPhotoImg({ url, storagePath, ...imgProps }: SignedPhotoImgProps) {
  const [src, setSrc] = useState(url);
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    setSrc(url);
    setRetried(false);
  }, [url]);

  // No URL at all — sign it directly.
  useEffect(() => {
    if (src || !storagePath) return;
    let cancelled = false;
    getSignedPhotoUrl(storagePath).then((u) => { if (!cancelled && u) setSrc(u); });
    return () => { cancelled = true; };
  }, [src, storagePath]);

  return (
    <img
      {...imgProps}
      src={src || undefined}
      onError={() => {
        if (retried || !storagePath) return;
        setRetried(true);
        invalidatePhotoUrl(storagePath);
        getSignedPhotoUrl(storagePath).then((u) => { if (u) setSrc(u); });
      }}
    />
  );
}

export default SignedPhotoImg;
