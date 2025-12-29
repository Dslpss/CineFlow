import { useEffect, useRef } from 'react';
import mpegts from 'mpegts.js';
import { X } from 'lucide-react';
import type { Channel } from '../types';

interface PlayerProps {
  channel: Channel;
  onClose: () => void;
}

export function Player({ channel, onClose }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let player: mpegts.Player | null = null;

    // Use local proxy/tiralit.shop to avoid HTTPS upgrades/Mixed Content
    // IMPORTANT: Web Workers in mpegts sometimes fail with relative paths. We must provide the full absolute URL.
    const relativeProxyUrl = channel.url.replace('http://tiralit.shop:8880', '/stream-proxy');
    const absoluteProxyUrl = new URL(relativeProxyUrl, window.location.origin).href;
    
    console.log("Original URL:", channel.url);
    const isMp4 = channel.url.toLowerCase().endsWith('.mp4');

    if (isMp4) {
      console.log("Playing native MP4:", absoluteProxyUrl);
      video.src = absoluteProxyUrl;
      video.play().catch(e => console.error("Native play error:", e));
    } else if (mpegts.isSupported()) {
      console.log("Playing via mpegts.js:", absoluteProxyUrl);
      player = mpegts.createPlayer({
        type: 'mpegts',
        isLive: true,
        url: absoluteProxyUrl,
        cors: true,
      }, {
        enableWorker: false, 
        enableStashBuffer: true, // Enable buffer to handle network jitter better
        stashInitialSize: 128,   // Buffer at least 128KB before playing
        liveBufferLatencyChasing: false, // Don't jump around trying to catch up, just play smooth
        autoCleanupSourceBuffer: true,
      });
      
      player.attachMediaElement(video);
      player.load();
      try {
        const playPromise = player.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => console.error("Auto-play failed", e));
        }
      } catch (e) {
         console.error("Play error:", e);
      }
      
      player.on(mpegts.Events.ERROR, (errorType, errorDetail, errorInfo) => {
        console.error("Mpegts error:", errorType, errorDetail, errorInfo);
      });

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Fallback for Safari which might support native HLS even if source is TS? 
      // Unlikely, but let's try just setting src if mpegts not supported.
      video.src = absoluteProxyUrl;
      video.play().catch(e => console.error("Auto-play failed", e));
    }

    return () => {
      if (player) {
        player.destroy();
      }
    };
  }, [channel.url]);

  return (
    <div className="player-overlay">
      <button 
        onClick={onClose}
        className="close-btn"
      >
        <X size={24} />
      </button>
      
      <div className="player-container">
        <video 
          ref={videoRef} 
          style={{ width: '100%', height: '100%' }}
          controls 
          autoPlay
        />
        <div style={{
          position: 'absolute',
          top: '1rem',
          left: '1rem',
          background: 'rgba(0,0,0,0.6)',
          padding: '0.25rem 0.75rem',
          borderRadius: '4px',
          color: 'white',
          fontWeight: 600,
          backdropFilter: 'blur(4px)',
          pointerEvents: 'none'
        }}>
          {channel.name}
        </div>
      </div>
    </div>
  );
}
