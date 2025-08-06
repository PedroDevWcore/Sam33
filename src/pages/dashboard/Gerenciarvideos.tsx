import React, { useState, useEffect } from 'react';
import { ChevronLeft, Upload, Play, Trash2, FolderPlus, Eye, Download, RefreshCw, HardDrive, AlertCircle, CheckCircle, X, Maximize, Minimize } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import UniversalVideoPlayer from '../../components/UniversalVideoPlayer';

interface Folder {
  id: number;
  nome: string;
}

interface Video {
  id: number;
  nome: string;
  url: string;
  duracao?: number;
  tamanho?: number;
  folder?: string;
  user?: string;
}

interface FolderUsage {
  used: number;
  total: number;
  percentage: number;
  available: number;
}

const GerenciarVideos: React.FC = () => {
  const { getToken, user } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderUsage, setFolderUsage] = useState<FolderUsage | null>(null);
  
  // Player modal state
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    if (selectedFolder) {
      loadVideos();
      loadFolderUsage();
    }
  }, [selectedFolder]);

  const loadFolders = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/folders', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setFolders(data);
      
      if (data.length > 0 && !selectedFolder) {
        setSelectedFolder(data[0].id.toString());
      }
    } catch (error) {
      toast.error('Erro ao carregar pastas');
    }
  };

  const loadVideos = async () => {
    if (!selectedFolder) return;
    
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`/api/videos?folder_id=${selectedFolder}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setVideos(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('Erro ao carregar vídeos');
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  const loadFolderUsage = async () => {
    if (!selectedFolder) return;
    
    try {
      const token = await getToken();
      const response = await fetch(`/api/videos-ssh/folders/${selectedFolder}/usage`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setFolderUsage(data.usage);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar uso da pasta:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedFolder) return;

    // Verificar se é um arquivo de vídeo
    const videoExtensions = [
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv',
      '.3gp', '.3g2', '.ts', '.mpg', '.mpeg', '.ogv', '.m4v', '.asf'
    ];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!videoExtensions.includes(fileExtension)) {
      toast.error(`Formato não suportado: ${fileExtension}. Use: ${videoExtensions.join(', ')}`);
      return;
    }

    // Verificar tamanho do arquivo
    const fileSizeMB = Math.ceil(file.size / (1024 * 1024));
    if (folderUsage && fileSizeMB > folderUsage.available) {
      toast.error(`Arquivo muito grande! Tamanho: ${fileSizeMB}MB, Disponível: ${folderUsage.available}MB`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('video', file);
      formData.append('duracao', '0'); // Será detectado automaticamente
      formData.append('tamanho', file.size.toString());

      const response = await fetch(`/api/videos/upload?folder_id=${selectedFolder}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`Vídeo "${result.nome}" enviado com sucesso!`);
        loadVideos();
        loadFolderUsage();
        
        // Reset input
        event.target.value = '';
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro no upload');
        
        if (errorData.spaceInfo) {
          console.log('Informações de espaço:', errorData.spaceInfo);
        }
      }
    } catch (error) {
      console.error('Erro no upload:', error);
      toast.error('Erro no upload do vídeo');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDeleteVideo = async (videoId: number, videoName: string) => {
    if (!confirm(`Deseja realmente excluir o vídeo "${videoName}"?`)) return;

    try {
      const token = await getToken();
      const response = await fetch(`/api/videos/${videoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('Vídeo excluído com sucesso!');
        loadVideos();
        loadFolderUsage();
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro ao excluir vídeo');
      }
    } catch (error) {
      toast.error('Erro ao excluir vídeo');
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error('Nome da pasta é obrigatório');
      return;
    }

    try {
      const token = await getToken();
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ nome: newFolderName })
      });

      if (response.ok) {
        const result = await response.json();
        toast.success('Pasta criada com sucesso!');
        setShowNewFolderModal(false);
        setNewFolderName('');
        loadFolders();
        setSelectedFolder(result.id.toString());
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro ao criar pasta');
      }
    } catch (error) {
      toast.error('Erro ao criar pasta');
    }
  };

  const openVideoPlayer = (video: Video) => {
    setCurrentVideo(video);
    setShowPlayerModal(true);
  };

  const closeVideoPlayer = () => {
    setShowPlayerModal(false);
    setCurrentVideo(null);
    setIsFullscreen(false);
  };

  const buildVideoUrl = (url: string) => {
    if (!url) return '';
    
    // Se já é uma URL completa, usar como está
    if (url.startsWith('http')) {
      return url;
    }
    
    // Para vídeos SSH, usar a URL diretamente
    if (url.includes('/api/videos-ssh/')) {
      return url;
    }

    // Para arquivos locais, construir URL HLS correta
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

  const openVideoInNewTab = (video: Video) => {
    const isProduction = window.location.hostname !== 'localhost';
    const wowzaHost = isProduction ? 'samhost.wcore.com.br' : '51.222.156.223';
    const wowzaUser = 'admin';
    const wowzaPassword = 'FK38Ca2SuE6jvJXed97VMn';
    
    if (video.url) {
      let externalUrl;
      
      // Para vídeos SSH, construir URL direta
      if (video.url.includes('/api/videos-ssh/')) {
        try {
          const videoId = video.url.split('/stream/')[1]?.split('?')[0];
          if (videoId) {
            const remotePath = Buffer.from(videoId, 'base64').toString('utf-8');
            const relativePath = remotePath.replace('/usr/local/WowzaStreamingEngine/content', '');
            externalUrl = `http://${wowzaUser}:${wowzaPassword}@${wowzaHost}:6980/content${relativePath}`;
          } else {
            externalUrl = video.url;
          }
        } catch (error) {
          externalUrl = video.url;
        }
      } else if (video.url.startsWith('/content')) {
        externalUrl = `http://${wowzaUser}:${wowzaPassword}@${wowzaHost}:6980${video.url}`;
      } else if (!video.url.startsWith('http')) {
        // Construir URL correta para vídeos locais
        const cleanPath = video.url.replace(/^\/+/, '');
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
          
          externalUrl = `http://${wowzaUser}:${wowzaPassword}@${wowzaHost}:6980/content/${userLogin}/${folderName}/${finalFileName}`;
        } else {
          externalUrl = `http://${wowzaUser}:${wowzaPassword}@${wowzaHost}:6980/content/${cleanPath}`;
        }
      } else {
        externalUrl = video.url;
      }
      
      window.open(externalUrl, '_blank');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const syncWithServer = async () => {
    if (!selectedFolder) return;
    
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch('/api/videos-ssh/sync-database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ folderId: selectedFolder })
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(result.message || 'Sincronização concluída!');
        loadVideos();
        loadFolderUsage();
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro na sincronização');
      }
    } catch (error) {
      console.error('Erro na sincronização:', error);
      toast.error('Erro na sincronização com servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center mb-6">
        <Link to="/dashboard" className="flex items-center text-primary-600 hover:text-primary-800">
          <ChevronLeft className="h-5 w-5 mr-1" />
          <span>Voltar ao Dashboard</span>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Upload className="h-8 w-8 text-primary-600" />
          <h1 className="text-3xl font-bold text-gray-900">Gerenciar Vídeos</h1>
        </div>
        
        <button
          onClick={() => setShowNewFolderModal(true)}
          className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 flex items-center"
        >
          <FolderPlus className="h-4 w-4 mr-2" />
          Nova Pasta
        </button>
      </div>

      {/* Seleção de Pasta e Informações de Uso */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="folder" className="block text-sm font-medium text-gray-700 mb-2">
              Selecionar Pasta
            </label>
            <select
              id="folder"
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Selecione uma pasta</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.nome}
                </option>
              ))}
            </select>
          </div>

          {folderUsage && (
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <HardDrive className="h-5 w-5 text-blue-600 mr-2" />
                  <span className="text-sm font-medium text-blue-800">Uso da Pasta</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  folderUsage.percentage > 90 ? 'bg-red-100 text-red-800' :
                  folderUsage.percentage > 70 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {folderUsage.percentage}%
                </span>
              </div>
              
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-blue-700">Usado:</span>
                  <span className="font-semibold text-blue-900">{folderUsage.used} MB</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      folderUsage.percentage > 90 ? 'bg-red-600' :
                      folderUsage.percentage > 70 ? 'bg-yellow-600' :
                      'bg-blue-600'
                    }`}
                    style={{ width: `${Math.min(100, folderUsage.percentage)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-blue-700">Disponível:</span>
                  <span className={`font-semibold ${
                    folderUsage.available > 100 ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {folderUsage.available} MB
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedFolder && (
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <label className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 cursor-pointer flex items-center">
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? `Enviando... ${uploadProgress}%` : 'Enviar Vídeo'}
                <input
                  type="file"
                  accept="video/*,.mp4,.avi,.mov,.wmv,.flv,.webm,.mkv,.3gp,.3g2,.ts,.mpg,.mpeg,.ogv,.m4v,.asf"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
              
              <button
                onClick={syncWithServer}
                disabled={loading}
                className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50 flex items-center"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Sincronizar
              </button>
            </div>

            <div className="text-sm text-gray-600">
              {videos.length} vídeo(s) na pasta
            </div>
          </div>
        )}
      </div>

      {/* Lista de Vídeos */}
      {selectedFolder && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Vídeos da Pasta: {folders.find(f => f.id.toString() === selectedFolder)?.nome}
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              <span className="ml-3 text-gray-600">Carregando vídeos...</span>
            </div>
          ) : videos.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Upload className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg mb-2">Nenhum vídeo nesta pasta</p>
              <p className="text-sm">Envie vídeos usando o botão "Enviar Vídeo" acima</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((video) => (
                <div key={video.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="aspect-video bg-gray-100 rounded-lg mb-3 overflow-hidden">
                    <video
                      src={buildVideoUrl(video.url)}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => openVideoPlayer(video)}
                      preload="metadata"
                      muted
                    />
                  </div>
                  
                  <h3 className="font-medium text-gray-900 mb-2 truncate" title={video.nome}>
                    {video.nome}
                  </h3>
                  
                  <div className="text-sm text-gray-600 space-y-1 mb-3">
                    {video.duracao && (
                      <p>Duração: {formatDuration(video.duracao)}</p>
                    )}
                    {video.tamanho && (
                      <p>Tamanho: {formatFileSize(video.tamanho)}</p>
                    )}
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => openVideoPlayer(video)}
                        className="text-primary-600 hover:text-primary-800"
                        title="Reproduzir"
                      >
                        <Play className="h-4 w-4" />
                      </button>
                      
                      <button
                        onClick={() => openVideoInNewTab(video)}
                        className="text-blue-600 hover:text-blue-800"
                        title="Abrir em nova aba"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      
                      <button
                        onClick={() => openVideoInNewTab(video)}
                        className="text-green-600 hover:text-green-800"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                    
                    <button
                      onClick={() => handleDeleteVideo(video.id, video.nome)}
                      className="text-red-600 hover:text-red-800"
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de Nova Pasta */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Nova Pasta</h3>
                <button
                  onClick={() => setShowNewFolderModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome da Pasta
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Digite o nome da pasta"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateFolder();
                    }
                  }}
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowNewFolderModal(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim()}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                >
                  Criar Pasta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal do Player */}
      {showPlayerModal && currentVideo && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeVideoPlayer();
            }
          }}
        >
          <div className={`bg-black rounded-lg relative ${
            isFullscreen ? 'w-screen h-screen' : 'max-w-4xl w-full h-[70vh]'
          }`}>
            {/* Controles do Modal */}
            <div className="absolute top-4 right-4 z-20 flex items-center space-x-2">
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="text-white bg-blue-600 hover:bg-blue-700 rounded-full p-3 transition-colors duration-200 shadow-lg"
                title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
              >
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </button>
              
              <button
                onClick={closeVideoPlayer}
                className="text-white bg-red-600 hover:bg-red-700 rounded-full p-3 transition-colors duration-200 shadow-lg"
                title="Fechar player"
              >
                <X size={20} />
              </button>
            </div>

            {/* Título do Vídeo */}
            <div className="absolute top-4 left-4 z-20 bg-black bg-opacity-60 text-white px-4 py-2 rounded-lg">
              <h3 className="font-medium">{currentVideo.nome}</h3>
              <p className="text-xs opacity-80">
                {currentVideo.duracao ? formatDuration(currentVideo.duracao) : ''} • 
                {currentVideo.tamanho ? formatFileSize(currentVideo.tamanho) : ''}
              </p>
            </div>

            {/* Player */}
            <div className={`w-full h-full ${isFullscreen ? 'p-0' : 'p-4 pt-16'}`}>
              <UniversalVideoPlayer
                src={buildVideoUrl(currentVideo.url)}
                title={currentVideo.nome}
                autoplay={true}
                controls={true}
                className="w-full h-full"
                onError={(error) => {
                  console.error('Erro no player:', error);
                  toast.error('Erro ao carregar vídeo. Tente abrir em nova aba.');
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Informações de Ajuda */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
          <div>
            <h3 className="text-blue-900 font-medium mb-2">Como usar</h3>
            <ul className="text-blue-800 text-sm space-y-1">
              <li>• Selecione uma pasta para organizar seus vídeos</li>
              <li>• Envie vídeos nos formatos: MP4, AVI, MOV, WMV, FLV, WebM, MKV, etc.</li>
              <li>• Vídeos são automaticamente convertidos para MP4 se necessário</li>
              <li>• Use "Sincronizar" para atualizar a lista com vídeos enviados via FTP</li>
              <li>• Clique no vídeo para reproduzir ou use os botões de ação</li>
              <li>• Monitore o uso de espaço para não exceder seu plano</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GerenciarVideos;