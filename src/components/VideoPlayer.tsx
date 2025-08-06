import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStream } from '../context/StreamContext';
import UniversalVideoPlayer from './UniversalVideoPlayer';

interface VideoPlayerProps {
  playlistVideo?: {
    id: number;
    nome: string;
    url: string;
    duracao?: number;
  };
  onVideoEnd?: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ playlistVideo, onVideoEnd }) => {
  const { user } = useAuth();
  const { streamData } = useStream();
  const [obsStreamActive, setObsStreamActive] = useState(false);
  const [obsStreamUrl, setObsStreamUrl] = useState<string>('');

  const userLogin = user?.email?.split('@')[0] || `user_${user?.id || 'usuario'}`;

  useEffect(() => {
    // Verificar se há stream OBS ativo
    checkOBSStream();
  }, []);

  const checkOBSStream = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await fetch('/api/streaming/obs-status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.obs_stream.is_live) {
          setObsStreamActive(true);
          // URL do stream OBS
          setObsStreamUrl(`http://samhost.wcore.com.br:1935/samhost/${userLogin}_live/playlist.m3u8`);
        } else {
          setObsStreamActive(false);
        }
      }
    } catch (error) {
      console.error('Erro ao verificar stream OBS:', error);
    }
  };
  
  // Função melhorada para construir URLs de vídeo
  const buildVideoUrl = (url: string) => {
    if (!url) return '';
    
    // Se já é uma URL completa, usar como está
    if (url.startsWith('http')) {
      return url;
    }
    
    // Para vídeos SSH, sempre usar URL direta do Wowza para melhor performance
    if (url.includes('/api/videos-ssh/stream/')) {
      // Extrair o videoId e construir URL direta do Wowza
      const videoId = url.split('/stream/')[1]?.split('?')[0];
      if (videoId) {
        try {
          const remotePath = Buffer.from(videoId, 'base64').toString('utf-8');
          const isProduction = window.location.hostname !== 'localhost';
          const wowzaHost = isProduction ? 'samhost.wcore.com.br' : '51.222.156.223';
          
          // Extrair informações do caminho
          const pathParts = remotePath.split('/');
          const userLogin = pathParts[pathParts.length - 3];
          const folderName = pathParts[pathParts.length - 2];
          const fileName = pathParts[pathParts.length - 1];
          
          // Verificar se é MP4 ou precisa de conversão
          const fileExtension = fileName.split('.').pop()?.toLowerCase();
          const needsConversion = !['mp4'].includes(fileExtension || '');
          
          // Nome do arquivo final (MP4)
          const finalFileName = needsConversion ? 
            fileName.replace(/\.[^/.]+$/, '.mp4') : fileName;
          
          // Construir URL HLS correta com formato Wowza
          return `http://${wowzaHost}:1935/vod/_definst_/mp4:${userLogin}/${folderName}/${finalFileName}/playlist.m3u8`;
        } catch (error) {
          console.warn('Erro ao decodificar videoId, usando URL original:', error);
          return url;
        }
      }
    }
    
    // Para arquivos locais, sempre usar o proxy /content do backend
    const cleanPath = url.replace(/^\/+/, ''); // Remove barras iniciais
    const pathParts = cleanPath.split('/');
    
    if (pathParts.length >= 3) {
      const userLogin = pathParts[0];
      const folderName = pathParts[1];
      const fileName = pathParts[2];
      
      // Verificar se é MP4 ou precisa de conversão
      const fileExtension = fileName.split('.').pop()?.toLowerCase();
      const needsConversion = !['mp4'].includes(fileExtension || '');
      
      // Nome do arquivo final (MP4)
      const finalFileName = needsConversion ? 
        fileName.replace(/\.[^/.]+$/, '.mp4') : fileName;
      
      // Construir URL HLS correta
      const isProduction = window.location.hostname !== 'localhost';
      const wowzaHost = isProduction ? 'samhost.wcore.com.br' : '51.222.156.223';
      return `http://${wowzaHost}:1935/vod/_definst_/mp4:${userLogin}/${folderName}/${finalFileName}/playlist.m3u8`;
    }
    
    return `/content/${cleanPath}`;
  };

  
  const videoSrc = playlistVideo?.url ? buildVideoUrl(playlistVideo.url) : 
    (streamData.isLive ? `http://samhost.wcore.com.br:1935/samhost/${userLogin}_live/playlist.m3u8` : 
     obsStreamActive ? obsStreamUrl : undefined);

  // Para vídeos de playlist, usar URL direta
  const finalVideoSrc = playlistVideo ? buildVideoUrl(playlistVideo.url || '') : videoSrc;
  const videoTitle = playlistVideo?.nome || 
    (streamData.isLive ? streamData.title || 'Transmissão ao Vivo' : 
     obsStreamActive ? 'Transmissão OBS ao Vivo' : undefined);

  const isLive = !playlistVideo && (streamData.isLive || obsStreamActive);

  return (
    <UniversalVideoPlayer
      src={finalVideoSrc}
      title={videoTitle}
      isLive={isLive}
      autoplay={!!playlistVideo}
      muted={false}
      controls={true}
      onEnded={onVideoEnd}
      streamStats={isLive ? {
        viewers: streamData.viewers + (obsStreamActive ? 0 : 0), // Evitar duplicação
        bitrate: streamData.isLive ? streamData.bitrate : 2500,
        uptime: streamData.isLive ? streamData.uptime : '00:00:00',
        quality: '1080p'
      } : undefined}
      className="w-full"
    />
  );
};

export default VideoPlayer;