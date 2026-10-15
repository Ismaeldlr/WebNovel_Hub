import { useEffect, useEffectEvent } from 'react';
import { useNavigate } from 'react-router';
import { getPlatform } from '../../platform';

/** Android: tapping a notification about a novel opens the novel's page. */
export function useNotificationTaps(): void {
  const navigate = useNavigate();
  const open = useEffectEvent((novelId: string) => {
    void navigate(`/novels/${encodeURIComponent(novelId)}`);
  });
  useEffect(() => {
    let stop: (() => void) | undefined;
    let ended = false;
    void getPlatform().then((platform) => {
      if (!ended) stop = platform.onNotificationTap?.((novelId) => open(novelId));
    });
    return () => {
      ended = true;
      stop?.();
    };
  }, []);
}
