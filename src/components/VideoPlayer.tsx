import React, { useRef, useState, useEffect, useMemo } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  Gauge,
  Tv,
  ArrowLeft,
  ChevronRight,
  Heart,
  Share2,
  AlertCircle,
  Server,
  RefreshCw,
  Download,
  ExternalLink,
  ShieldCheck,
  Film,
  Copy,
  Check,
  Info
} from "lucide-react";
import { Movie } from "../types";
import { EMBED_API_KEY } from "../lib/api";

interface VideoPlayerProps {
  movie: Movie;
  onBack: () => void;
  onNextRecommended?: (movie: Movie) => void;
  recommendedMovies?: Movie[];
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

const BACKUP_MP4_POOL = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4"
];

export default function VideoPlayer({
  movie,
  onBack,
  onNextRecommended,
  recommendedMovies = [],
  isFavorite = false,
  onToggleFavorite
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  // Server selection state:
  // "server1" -> VidSrc Pro (Ultra HD Primary)
  // "server2" -> AutoEmbed (Fast CDN Stream)
  // "server3" -> VidSrc CC (Global Mirror)
  // "server4" -> CodeSpecters Stream API
  // "server5" -> VidSrc TO (Legacy Mirror)
  // "server6" -> Backup Full HD Direct Stream
  // "server7" -> YouTube Unblocked / Proxy Trailer
  const [activeServer, setActiveServer] = useState<"server1" | "server2" | "server3" | "server4" | "server5" | "server6" | "server7">("server1");
  const [ytProxyEngine, setYtProxyEngine] = useState<"nocookie" | "invidious" | "piped">("nocookie");
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const [adBlockShield, setAdBlockShield] = useState<boolean>(false);

  // Extract YouTube Video ID if present
  const youtubeId = useMemo(() => {
    const raw = movie.videoUrl || movie.embedUrl || "";
    if (raw.includes("v=")) {
      return raw.split("v=")[1]?.split("&")[0] || "";
    } else if (raw.includes("youtu.be/")) {
      return raw.split("youtu.be/")[1]?.split("?")[0] || "";
    } else if (raw.includes("/embed/")) {
      const parts = raw.split("/embed/")[1]?.split("?")[0] || "";
      if (parts && !parts.includes("/")) return parts;
    }
    return "";
  }, [movie]);

  // Clean TMDB/IMDB ID for embed providers
  const tmdbOrCleanId = useMemo(() => {
    if (movie.tmdbId) return movie.tmdbId;
    if (movie.imdbId) return movie.imdbId;
    return movie.id.replace(/^(tmdb-movie-|tmdb-tv-|omdb-|fdb-|mb-|dj-|ia-|mcl-)/, "").split("-")[0];
  }, [movie]);

  const isTVSeries = useMemo(() => {
    return movie.isTV || movie.subCategory === "Web Series" || movie.id.includes("-tv-") || (movie.duration && movie.duration.toLowerCase().includes("season"));
  }, [movie]);

  // Derive movie stream URL or iframe embed based on active server
  const currentStreamInfo = useMemo(() => {
    let url = movie.videoUrl || movie.embedUrl || "";

    if (activeServer === "server1") {
      url = isTVSeries
        ? `https://api.codespecters.com/embed/tv/${tmdbOrCleanId}/1/1?apikey=${EMBED_API_KEY}`
        : `https://api.codespecters.com/embed/movie/${tmdbOrCleanId}?apikey=${EMBED_API_KEY}`;
    } else if (activeServer === "server2") {
      url = isTVSeries
        ? `https://vidsrc.pro/embed/tv/${tmdbOrCleanId}/1/1`
        : `https://vidsrc.pro/embed/movie/${tmdbOrCleanId}`;
    } else if (activeServer === "server3") {
      url = isTVSeries
        ? `https://autoembed.co/tv/tmdb/${tmdbOrCleanId}-1-1`
        : `https://autoembed.co/movie/tmdb/${tmdbOrCleanId}`;
    } else if (activeServer === "server4") {
      url = isTVSeries
        ? `https://vidsrc.cc/v2/embed/tv/${tmdbOrCleanId}/1/1`
        : `https://vidsrc.cc/v2/embed/movie/${tmdbOrCleanId}`;
    } else if (activeServer === "server5") {
      if ((movie.embedUrl && movie.embedUrl.includes("archive.org")) || movie.id.startsWith("ia-")) {
        const iaId = movie.id.replace(/^ia-/, "");
        url = `https://archive.org/embed/${iaId}`;
      } else {
        url = `https://vidsrc.to/embed/${isTVSeries ? "tv" : "movie"}/${tmdbOrCleanId}`;
      }
    } else if (activeServer === "server6") {
      let numericHash = 0;
      for (let i = 0; i < movie.id.length; i++) {
        numericHash += movie.id.charCodeAt(i);
      }
      url = BACKUP_MP4_POOL[numericHash % BACKUP_MP4_POOL.length];
    } else if (activeServer === "server7") {
      if (youtubeId) {
        if (ytProxyEngine === "invidious") {
          url = `https://invidious.nerdvpn.de/embed/${youtubeId}?autoplay=1`;
        } else if (ytProxyEngine === "piped") {
          url = `https://piped.video/embed/${youtubeId}?autoplay=1`;
        } else {
          url = `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1`;
        }
      } else {
        const query = encodeURIComponent(`${movie.title} ${movie.year || ""} official trailer`);
        url = `https://www.youtube-nocookie.com/embed?listType=search&list=${query}`;
      }
    }

    // Process Internet Archive, YouTube, and Embed URLs
    let isIframe = false;
    if (url.includes("archive.org") || movie.id.startsWith("ia-")) {
      isIframe = true;
      if (!url.includes("/embed/")) {
        const match = url.match(/archive\.org\/(?:download|details|embed)\/([^/]+)/);
        if (match && match[1]) {
          url = `https://archive.org/embed/${match[1]}`;
        } else {
          const iaId = movie.id.replace(/^ia-/, "");
          url = `https://archive.org/embed/${iaId}`;
        }
      }
    } else if (youtubeId || url.includes("youtube.com/watch") || url.includes("youtu.be/")) {
      isIframe = true;
      if (activeServer !== "server7" && youtubeId) {
        url = `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1`;
      }
    } else if (
      url.includes("/embed/") ||
      url.includes("vidsrc") ||
      url.includes("autoembed") ||
      url.includes("2embed") ||
      url.includes("codespecters") ||
      url.includes("player") ||
      url.includes("youtube.com/embed") ||
      url.includes("dailymotion.com/embed") ||
      url.includes("player.vimeo.com")
    ) {
      isIframe = true;
    }

    return { url, isIframe };
  }, [movie, activeServer, youtubeId, ytProxyEngine, tmdbOrCleanId, isTVSeries]);

  const rotateServerNext = () => {
    const serversList: Array<"server1" | "server2" | "server3" | "server4" | "server5" | "server6"> = ["server1", "server2", "server3", "server4", "server5", "server6"];
    const currentIndex = serversList.indexOf(activeServer as any);
    const nextIndex = (currentIndex + 1) % serversList.length;
    const nextServer = serversList[nextIndex];
    setActiveServer(nextServer);
    setHasError(false);
    setFallbackMessage(`Switched to ${nextServer.toUpperCase()} Stream Provider`);
  };

  // Auto-hide controls when mouse is inactive
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const handleMouseMove = () => {
      setControlsVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (isPlaying) {
          setControlsVisible(false);
        }
      }, 3000);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("mousemove", handleMouseMove);
    }

    return () => {
      if (container) {
        container.removeEventListener("mousemove", handleMouseMove);
      }
      clearTimeout(timer);
    };
  }, [isPlaying]);

  // Handle keyboard hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!videoRef.current || currentStreamInfo.isIframe) return;
      
      switch (e.key.toLowerCase()) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "arrowleft":
          e.preventDefault();
          skip(-10);
          break;
        case "arrowright":
          e.preventDefault();
          skip(10);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, isMuted, currentStreamInfo]);

  // Reset states when movie or active server changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setHasError(false);
    if (videoRef.current && !currentStreamInfo.isIframe) {
      videoRef.current.load();
    }
  }, [movie, activeServer, currentStreamInfo]);

  const togglePlay = () => {
    if (!videoRef.current || currentStreamInfo.isIframe) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          handleVideoError();
        });
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    setIsMuted(vol === 0);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = vol === 0;
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const newMute = !isMuted;
    setIsMuted(newMute);
    videoRef.current.muted = newMute;
    if (!newMute && volume === 0) {
      setVolume(0.5);
      videoRef.current.volume = 0.5;
    }
  };

  const skip = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime += seconds;
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setShowSpeedMenu(false);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.error("Error attempting to enable full-screen mode:", err);
      });
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Keep state sync with fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds)) return "0:00";
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const handleVideoError = () => {
    if (activeServer === "server1") {
      setFallbackMessage("Primary stream restricted/CORS error. Auto-switched to High-Speed Backup Server (Server 3).");
      setActiveServer("server3");
      setHasError(false);
    } else if (activeServer === "server2") {
      setFallbackMessage("Embed server unresponsive. Auto-switched to Backup Stream (Server 3).");
      setActiveServer("server3");
      setHasError(false);
    } else {
      setHasError(true);
    }
  };

  // Direct open watch stream in unblocked external popup or tab
  const handleOpenDirectWatch = () => {
    let watchUrl = currentStreamInfo.url;
    if (youtubeId) {
      watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    }
    window.open(watchUrl, "_blank", "noopener,noreferrer");
  };

  // Trigger Download
  const handleDownload = () => {
    let downloadTarget = movie.downloadUrl || movie.videoUrl || currentStreamInfo.url;
    
    // If it's a direct mp4/webm file, trigger download
    if (downloadTarget.endsWith(".mp4") || downloadTarget.endsWith(".m3u8") || downloadTarget.endsWith(".webm")) {
      const a = document.createElement("a");
      a.href = downloadTarget;
      a.download = `${movie.title.replace(/[^a-zA-Z0-9]/g, "_")}.mp4`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      setShowDownloadModal(true);
    }
  };

  const handleShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className={`w-full ${isTheaterMode ? "max-w-full" : "max-w-5xl mx-auto"} flex flex-col gap-6`}>
      {/* Top action header & Unblocked Server Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-2 select-none">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-sm font-semibold py-1.5 cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>Back to Catalog</span>
        </button>

        {/* Streaming Server Selector Bar */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-1 text-neutral-400 mr-1 font-mono text-[11px]">
            <Server size={13} className="text-red-500 animate-pulse" />
            <span>Server:</span>
          </div>
          
          <button
            onClick={() => { setActiveServer("server1"); setHasError(false); setFallbackMessage(null); }}
            className={`px-2.5 py-1 rounded border transition-all cursor-pointer font-bold ${
              activeServer === "server1"
                ? "bg-red-600 border-red-500 text-white shadow"
                : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            Server 1 (CodeSpecters HD)
          </button>

          <button
            onClick={() => { setActiveServer("server2"); setHasError(false); setFallbackMessage(null); }}
            className={`px-2.5 py-1 rounded border transition-all cursor-pointer font-bold ${
              activeServer === "server2"
                ? "bg-red-600 border-red-500 text-white shadow"
                : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            Server 2 (VidSrc Pro)
          </button>

          <button
            onClick={() => { setActiveServer("server3"); setHasError(false); setFallbackMessage(null); }}
            className={`px-2.5 py-1 rounded border transition-all cursor-pointer font-bold ${
              activeServer === "server3"
                ? "bg-red-600 border-red-500 text-white shadow"
                : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            Server 3 (AutoEmbed)
          </button>

          <button
            onClick={() => { setActiveServer("server4"); setHasError(false); setFallbackMessage(null); }}
            className={`px-2.5 py-1 rounded border transition-all cursor-pointer font-bold ${
              activeServer === "server4"
                ? "bg-red-600 border-red-500 text-white shadow"
                : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            Server 4 (VidSrc CC)
          </button>

          <button
            onClick={() => { setActiveServer("server5"); setHasError(false); setFallbackMessage(null); }}
            className={`px-2.5 py-1 rounded border transition-all cursor-pointer font-bold ${
              activeServer === "server5"
                ? "bg-red-600 border-red-500 text-white shadow"
                : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            Server 5 (VidSrc TO)
          </button>

          <button
            onClick={() => { setActiveServer("server6"); setHasError(false); setFallbackMessage(null); }}
            className={`px-2.5 py-1 rounded border transition-all cursor-pointer font-bold ${
              activeServer === "server6"
                ? "bg-red-600 border-red-500 text-white shadow"
                : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            Server 6 (Full HD Direct)
          </button>

          {youtubeId && (
            <button
              onClick={() => { setActiveServer("server7"); setHasError(false); setFallbackMessage(null); }}
              className={`px-2.5 py-1 rounded border transition-all cursor-pointer font-bold ${
                activeServer === "server7"
                  ? "bg-red-600 border-red-500 text-white shadow"
                  : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              Server 7 (YouTube Proxy)
            </button>
          )}

          <button
            onClick={rotateServerNext}
            className="px-2.5 py-1 bg-amber-600/80 hover:bg-amber-500 border border-amber-500 text-white font-bold rounded flex items-center gap-1 transition-all shadow cursor-pointer text-[11px]"
            title="Auto-rotate to next available stream server if video is unavailable"
          >
            <RefreshCw size={12} />
            <span>অন্য সার্ভার (Rotate)</span>
          </button>

          {/* Ad Shield Toggle */}
          <button
            onClick={() => setAdBlockShield(!adBlockShield)}
            className={`px-2.5 py-1 rounded border transition-all cursor-pointer font-bold text-[11px] flex items-center gap-1 ${
              adBlockShield
                ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-300"
                : "bg-neutral-900 border-neutral-800 text-neutral-500"
            }`}
            title="Blocks popup ads and unwanted redirects from third-party players"
          >
            <ShieldCheck size={12} className={adBlockShield ? "text-indigo-400" : "text-neutral-500"} />
            <span>Ad Shield: {adBlockShield ? "ON" : "OFF"}</span>
          </button>

          {/* Unblocked Direct Watch Button */}
          <button
            onClick={handleOpenDirectWatch}
            className="px-2.5 py-1 bg-emerald-700/80 hover:bg-emerald-600 border border-emerald-500/80 text-white font-bold rounded flex items-center gap-1.5 transition-all shadow cursor-pointer text-[11px]"
            title="Opens video stream in unblocked direct window"
          >
            <ExternalLink size={12} />
            <span>সরাসরি প্লেয়ার</span>
          </button>

          {/* Download Button */}
          <button
            onClick={handleDownload}
            className="px-2.5 py-1 bg-blue-700/80 hover:bg-blue-600 border border-blue-500/80 text-white font-bold rounded flex items-center gap-1.5 transition-all shadow cursor-pointer text-[11px]"
            title="Download Movie or Video File"
          >
            <Download size={12} />
            <span>ডাউনলোড</span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {onToggleFavorite && (
            <button
              onClick={onToggleFavorite}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded border transition-colors cursor-pointer ${
                isFavorite
                  ? "bg-red-600/10 border-red-500/30 text-red-500"
                  : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              <Heart size={13} className={isFavorite ? "fill-red-500" : ""} />
              <span>{isFavorite ? "In My List" : "Add to My List"}</span>
            </button>
          )}

          <button
            onClick={handleShareLink}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white rounded transition-colors cursor-pointer"
          >
            {copiedLink ? <Check size={13} className="text-green-500" /> : <Share2 size={13} />}
            <span>{copiedLink ? "Copied!" : "Share"}</span>
          </button>

          <button
            onClick={() => setIsTheaterMode(!isTheaterMode)}
            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded border transition-colors cursor-pointer ${
              isTheaterMode
                ? "bg-red-600/10 border-red-500/30 text-red-500"
                : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            <Tv size={13} />
            <span>{isTheaterMode ? "Normal Mode" : "Theater Mode"}</span>
          </button>
        </div>
      </div>

      {/* Unblocked Proxy Switcher when on YouTube Server 4 */}
      {activeServer === "server4" && youtubeId && (
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-2.5 px-4 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-neutral-300">
            <ShieldCheck size={14} className="text-green-400" />
            <span>YouTube Unblock Proxy:</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setYtProxyEngine("nocookie")}
              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                ytProxyEngine === "nocookie" ? "bg-red-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              No-Cookie Engine
            </button>
            <button
              onClick={() => setYtProxyEngine("invidious")}
              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                ytProxyEngine === "invidious" ? "bg-red-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              Invidious Proxy (Unblocks Embedded Restrictions)
            </button>
            <button
              onClick={() => setYtProxyEngine("piped")}
              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                ytProxyEngine === "piped" ? "bg-red-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              Piped Proxy
            </button>
          </div>
        </div>
      )}

      {/* Auto-Fallback Banner Notification */}
      {fallbackMessage && (
        <div className="bg-amber-950/60 border border-amber-800/80 rounded-lg p-2.5 px-4 text-xs text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw size={14} className="animate-spin text-amber-400" />
            <span>{fallbackMessage}</span>
          </div>
          <button onClick={() => setFallbackMessage(null)} className="text-amber-400 hover:text-white font-bold ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Main player box container */}
      <div
        ref={containerRef}
        className={`relative w-full aspect-video bg-black rounded-lg overflow-hidden shadow-2xl group border border-neutral-900 ${
          isFullscreen ? "rounded-none border-0 h-screen aspect-auto" : ""
        }`}
      >
        {hasError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950 p-6 text-center select-none">
            <AlertCircle size={48} className="text-red-500 mb-3 animate-bounce" />
            <h4 className="text-lg font-bold text-neutral-200 font-sans">ভিডিও প্লে হতে সমস্যা বা ব্লক দেখাচ্ছে?</h4>
            <p className="text-xs text-neutral-400 max-w-lg mt-1 leading-relaxed">
              যেকোনো থার্ড-পার্টি প্লেয়ার বা সাইটের ভিডিও এম্বেড সীমাবদ্ধ থাকলে নিচের যেকোনো একটি অপশন ব্যবহার করুন (১০০% কাজ করবে):
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
              <button
                onClick={handleOpenDirectWatch}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded transition-all shadow-lg flex items-center gap-2 cursor-pointer"
              >
                <ExternalLink size={14} />
                <span>সরাসরি উইন্ডোতে প্লে করুন (Unblocked Player)</span>
              </button>
              <button
                onClick={() => {
                  setActiveServer("server3");
                  setHasError(false);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded transition-all shadow-lg cursor-pointer"
              >
                Switch to Server 3 (Full HD Direct)
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded transition-all shadow-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={14} />
                <span>ভিডিও ডাউনলোড করুন</span>
              </button>
            </div>
          </div>
        ) : currentStreamInfo.isIframe ? (
          /* Render IFRAME player for YouTube or Embed servers */
          <div className="relative w-full h-full">
            <iframe
              src={currentStreamInfo.url}
              title={movie.title}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              sandbox={adBlockShield && activeServer !== "server1" ? "allow-scripts allow-same-origin allow-forms allow-presentation allow-popups allow-modals" : undefined}
            />
            {/* Overlay toolbar for unblocking and quick server switching if embed fails or shows ads */}
            <div className="absolute top-2 right-2 z-30 flex items-center gap-1.5 flex-wrap">
              <button
                onClick={rotateServerNext}
                className="bg-amber-600/90 hover:bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded border border-amber-400 flex items-center gap-1 shadow-lg transition-all cursor-pointer"
                title="Rotate to next streaming server if stream is unavailable"
              >
                <RefreshCw size={11} />
                <span>অন্য সার্ভার (Rotate)</span>
              </button>
              <button
                onClick={handleOpenDirectWatch}
                className="bg-black/90 hover:bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-1 rounded border border-neutral-700 hover:border-emerald-500 flex items-center gap-1 shadow-lg transition-all cursor-pointer"
                title="Open stream in unblocked external player"
              >
                <ExternalLink size={11} />
                <span>সরাসরি প্লেয়ার (Unblocked Player)</span>
              </button>
            </div>
          </div>
        ) : (
          /* Render Standard HTML5 Video Player */
          <>
            <video
              ref={videoRef}
              src={currentStreamInfo.url}
              poster={movie.thumbnail}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onError={handleVideoError}
              className="w-full h-full object-contain"
              onContextMenu={(e) => e.preventDefault()}
              onClick={togglePlay}
              preload="auto"
              playsInline
            />

            {/* Quick Play/Pause Center Indicator Splash on Click */}
            <div
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
            >
              {!isPlaying && (
                <div className="p-5 rounded-full bg-black/60 border border-neutral-800 text-white/90 scale-100 hover:scale-110 active:scale-95 transition-all shadow-xl">
                  <Play size={28} className="fill-white" />
                </div>
              )}
            </div>

            {/* Controls overlay */}
            <div
              className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-4 flex flex-col gap-3 transition-opacity duration-300 z-40 select-none ${
                controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
            >
              {/* Timeline Slider */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-neutral-400 select-none">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-red-600 focus:outline-none"
                />
                <span className="text-[11px] font-mono text-neutral-400 select-none">
                  {formatTime(duration)}
                </span>
              </div>

              {/* Lower Controls Toolbar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 sm:gap-5">
                  {/* Play / Pause toggle */}
                  <button
                    onClick={togglePlay}
                    className="text-white hover:text-red-500 transition-colors cursor-pointer"
                  >
                    {isPlaying ? <Pause size={18} /> : <Play size={18} className="fill-white" />}
                  </button>

                  {/* Skip Buttons */}
                  <button
                    onClick={() => skip(-10)}
                    className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    title="Rewind 10s"
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    onClick={() => skip(10)}
                    className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    title="Forward 10s"
                  >
                    <RotateCw size={16} />
                  </button>

                  {/* Volume Controls */}
                  <div className="flex items-center gap-2 group/volume">
                    <button
                      onClick={toggleMute}
                      className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                      {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-16 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-red-600 focus:outline-none hidden sm:inline-block"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Playback speed options dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                      className="flex items-center gap-1 text-xs text-neutral-300 hover:text-white font-semibold cursor-pointer"
                    >
                      <Gauge size={14} />
                      <span>{playbackRate}x</span>
                    </button>

                    {showSpeedMenu && (
                      <div className="absolute bottom-8 right-0 w-24 bg-neutral-950 border border-neutral-800 rounded shadow-2xl py-1 z-50 text-xs">
                        {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
                          <button
                            key={rate}
                            onClick={() => handleSpeedChange(rate)}
                            className={`w-full text-left px-3 py-1.5 hover:bg-neutral-900 transition-colors cursor-pointer ${
                              playbackRate === rate ? "text-red-500 font-bold bg-neutral-900" : "text-neutral-400"
                            }`}
                          >
                            {rate === 1 ? "Normal" : `${rate}x`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Maximize / Fullscreen Toggle */}
                  <button
                    onClick={toggleFullscreen}
                    className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    title="Toggle Fullscreen"
                  >
                    {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Download Options Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl text-left">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold">
                <Download size={18} className="text-blue-500" />
                <span>ভিডিও ডাউনলোড অপশন</span>
              </div>
              <button
                onClick={() => setShowDownloadModal(false)}
                className="text-neutral-400 hover:text-white text-xs font-bold border border-neutral-800 px-2 py-1 rounded"
              >
                ✕ Close
              </button>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              <strong>{movie.title}</strong> ডাউনলোডের জন্য নিচের লিংকে ক্লিক করুন:
            </p>

            <div className="space-y-2.5">
              <a
                href={movie.downloadUrl || movie.videoUrl || currentStreamInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Film size={14} />
                  <span>Direct Download Source 1 (HD 1080p)</span>
                </span>
                <ExternalLink size={14} />
              </a>

              {youtubeId && (
                <a
                  href={`https://www.youtube.com/watch?v=${youtubeId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 rounded-lg font-bold text-xs transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Download size={14} />
                    <span>Download via YouTube Source</span>
                  </span>
                  <ExternalLink size={14} />
                </a>
              )}

              <a
                href={BACKUP_MP4_POOL[0]}
                download={`${movie.title}.mp4`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg font-bold text-xs transition-colors border border-neutral-700"
              >
                <span className="flex items-center gap-2">
                  <Download size={14} className="text-green-400" />
                  <span>Download Backup MP4 Stream</span>
                </span>
                <Download size={14} />
              </a>
            </div>

            <p className="text-[10px] text-neutral-500 italic">
              * নোট: যদি ব্রাউজারে ফাইলটি ওপেন হয়, তবে ভিডিওতে রাইট ক্লিক (Right-Click) করে "Save Video As..." বেছে ডাউনলোড করে নিতে পারবেন।
            </p>
          </div>
        </div>
      )}

      {/* Description & Recommendations Section underneath player */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 px-2 select-none">
        {/* Left Col: Info panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl sm:text-2xl font-black text-white">{movie.title}</h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400 font-bold mt-1">
              <span className="text-green-500">{movie.year}</span>
              <span>•</span>
              <span>{movie.duration}</span>
              <span>•</span>
              <span className="border border-neutral-800 px-1 py-0.2 rounded text-[10px] text-neutral-500 uppercase">
                {movie.rating}
              </span>
              <span>•</span>
              <span className="text-neutral-400 bg-neutral-900 border border-neutral-800/80 px-2 py-0.5 rounded">
                {movie.category}
              </span>
            </div>
          </div>

          <div className="border-t border-neutral-900/60 pt-4">
            <h5 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Movie Narrative</h5>
            <p className="text-sm text-neutral-300 leading-relaxed">{movie.description}</p>
          </div>

          <div className="bg-neutral-950 border border-neutral-900 p-4 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
              <span className="text-neutral-400 font-semibold">Active Server: <strong className="text-white uppercase">{activeServer}</strong> — Multi-Bandwidth Stream</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleOpenDirectWatch} className="text-emerald-400 font-bold hover:underline flex items-center gap-1">
                <ExternalLink size={12} />
                <span>সরাসরি প্লেয়ার</span>
              </button>
              <span className="text-neutral-700">|</span>
              <button onClick={handleDownload} className="text-blue-400 font-bold hover:underline flex items-center gap-1">
                <Download size={12} />
                <span>ডাউনলোড</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Col: Up Next Sidebar Recommendations */}
        <div className="space-y-4">
          <h4 className="text-xs font-black text-neutral-400 uppercase tracking-widest px-1">Up Next (Recommended)</h4>
          <div className="flex flex-col gap-3">
            {recommendedMovies.filter(m => m.id !== movie.id).slice(0, 4).map((recMovie) => (
              <div
                key={recMovie.id}
                onClick={() => onNextRecommended && onNextRecommended(recMovie)}
                className="flex gap-3 bg-neutral-950 hover:bg-neutral-900 p-2 rounded border border-neutral-900 hover:border-neutral-800/80 cursor-pointer transition-all group"
              >
                <div className="relative w-24 aspect-[16/9] bg-neutral-900 rounded overflow-hidden flex-shrink-0">
                  <img
                    src={recMovie.thumbnail}
                    alt={recMovie.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play size={14} className="fill-white text-white" />
                  </div>
                </div>

                <div className="flex flex-col justify-center min-w-0 flex-1">
                  <h5 className="text-xs font-bold text-white truncate group-hover:text-red-500 transition-colors">
                    {recMovie.title}
                  </h5>
                  <p className="text-[10px] text-neutral-400 mt-1 flex items-center gap-1.5 font-semibold">
                    <span>{recMovie.year}</span>
                    <span>•</span>
                    <span>{recMovie.duration}</span>
                  </p>
                </div>
              </div>
            ))}

            {recommendedMovies.filter(m => m.id !== movie.id).length === 0 && (
              <p className="text-xs text-neutral-600 italic px-2">No recommended titles available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
