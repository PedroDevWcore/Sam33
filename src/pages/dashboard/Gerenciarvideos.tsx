import React, { useState, useEffect } from 'react';
import { ChevronLeft, Upload, Play, Trash2, FolderPlus, Eye, Download, RefreshCw, HardDrive, AlertCircle, CheckCircle, X, Maximize, Minimize, Edit2, ChevronDown, ChevronRight, Folder, Video, Save } from 'lucide-react';
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
  const [videosByFolder, setVideosByFolder] = useState<Record<number, Video[]>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderUsages, setFolderUsages] = useState<Record<number, FolderUsage>>({});
  
  // Player modal state
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Edit video state
  const [editingVideo, setEditingVideo] = useState<{ id: number; nome: string } | null>(null);
  const [newVideoName, setNewVideoName] = useState('');

  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/folders', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setFolders(data);
      
      // Carregar vídeos para cada pasta
      for (const folder of data) {
        await loadVideosForFolder(folder.id);
        await loadFolderUsage(folder.id);
      }
    } catch (error) {
      toast.error('Erro ao carregar pastas');
    }
  };

  const loadVideosForFolder = async (folderId: number) => {
    try {
      const token = await getToken();
      const response = await fetch(`/api/videos?folder_id=${folderId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setVideosByFolder(prev => ({
        ...prev,
        [folderId]: Array.isArray(data) ? data : []
      }));
    } catch (error) {
      console.error(`Erro ao carregar vídeos da pasta ${folderId}:`, error);
      setVideosByFolder(prev => ({
        ...prev,
        [folderId]: []
      }));
    }
  };

  const loadFolderUsage = async (folderId: number) => {
    try {
      const token = await getToken();
      const response = await fetch(`/api/videos-ssh/folders/${folderId}/usage`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setFolderUsages(prev => ({
            ...prev,
            [folderId]: data.usage
          }));
        }
      }
    } catch (error) {
      console.error(`Erro ao carregar uso da pasta ${folderId}:`, error);
    }
  };

  const toggleFolder = (folderId: number) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, folderId: number) => {
    const file = event.target.files?.[0];
    if (!file) return;

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
    const folderUsage = folderUsages[folderId];
    if (folderUsage && fileSizeMB > folderUsage.available) {
      toast.error(`Arquivo muito grande! Tamanho: ${fileSizeMB}MB, Disponível: ${folderUsage.available}MB`);
      return;
    }

    setUploading(true);

    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('video', file);
      formData.append('duracao', '0');
      formData.append('tamanho', file.size.toString());

      const response = await fetch(`/api/videos/upload?folder_id=${folderId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`Vídeo "${result.nome}" enviado com sucesso!`);
        await loadVideosForFolder(folderId);
        await loadFolderUsage(folderId);
        
        // Reset input
        event.target.value = '';
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro no upload');
      }
    } catch (error) {
      console.error('Erro no upload:', error);
      toast.error('Erro no upload do vídeo');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteVideo = async (videoId: number, videoName: string, folderId: number) => {
    if (!confirm(`Deseja realmente excluir o vídeo "${videoName}"?`)) return;

    try {
      const token = await getToken();
      const response = await fetch(`/api/videos/${videoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('Vídeo excluído com sucesso!');
        await loadVideosForFolder(folderId);
        await loadFolderUsage(folderId);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro ao excluir vídeo');
      }
    } catch (error) {
      toast.error('Erro ao excluir vídeo');
    }
  };

  const handleEditVideo = (video: Video) => {
    setEditingVideo({ id: video.id, nome: video.nome });
    setNewVideoName(video.nome);
  };

  const saveVideoName = async () => {
    if (!editingVideo || !newVideoName.trim()) return;

    try {
      const token = await getToken();
      const videoId = Buffer.from(editingVideo.id.toString()).toString('base64');
      
      const response = await fetch(`/api/videos-ssh/${videoId}/rename`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ novo_nome: newVideoName.trim() })
      });

      if (response.ok) {
        toast.success('Nome do vídeo atualizado com sucesso!');
        setEditingVideo(null);
        setNewVideoName('');
        // Recarregar vídeos de todas as pastas
        for (const folder of folders) {
          await loadVideosForFolder(folder.id);
        }
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro ao renomear vídeo');
      }
    } catch (error) {
      console.error('Erro ao renomear vídeo:', error);
      toast.error('Erro ao renomear vídeo');
    }
  };

  const cancelEdit = () => {
    setEditingVideo(null);
    setNewVideoName('');
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

    // Para arquivos locais, sempre usar o proxy /content do backend
    const cleanPath = url.replace(/^\/+/, '');
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
            const relativePath = remotePath.replace('/usr/local/WowzaStreamingEngine/content/', '');
            externalUrl = `http://${wowzaUser}:${wowzaPassword}@${wowzaHost}:6980/content/${relativePath}`;
          } else {
            externalUrl = video.url;
          }
        } catch (error) {
          externalUrl = video.url;
        }
      } else if (video.url.startsWith('/content')) {
        externalUrl = `http://${wowzaUser}:${wowzaPassword}@${wowzaHost}:6980${video.url}`;
      } else if (!video.url.startsWith('http')) {
        const cleanPath = video.url.replace(/^\/+/, '');
        externalUrl = `http://${wowzaUser}:${wowzaPassword}@${wowzaHost}:6980/content/${cleanPath}`;
      } else {
        externalUrl = video.url;
      }
      
      window.open(externalUrl, '_blank');
    }
  };

  const syncFolder = async (folderId: number) => {
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch('/api/videos-ssh/sync-database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ folderId })
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(result.message || 'Sincronização concluída!');
        await loadVideosForFolder(folderId);
        await loadFolderUsage(folderId);
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

      {/* Lista de Pastas e Vídeos */}
      <div className="bg-white rounded-lg shadow-sm">
        {folders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Folder className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg mb-2">Nenhuma pasta criada</p>
            <p className="text-sm">Crie uma pasta para organizar seus vídeos</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {folders.map((folder) => {
              const isExpanded = expandedFolders[folder.id];
              const videos = videosByFolder[folder.id] || [];
              const usage = folderUsages[folder.id];

              return (
                <div key={folder.id} className="p-6">
                  {/* Cabeçalho da Pasta */}
                  <div className="flex items-center justify-between mb-4">
                    <div 
                      className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors"
                      onClick={() => toggleFolder(folder.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-gray-600" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-600" />
                      )}
                      <Folder className="h-6 w-6 text-blue-600" />
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{folder.nome}</h3>
                        <p className="text-sm text-gray-500">
                          {videos.length} vídeo(s)
                          {usage && ` • ${usage.used}MB / ${usage.total}MB (${usage.percentage}%)`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      {/* Indicador de uso de espaço */}
                      {usage && (
                        <div className="flex items-center space-x-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all duration-300 ${
                                usage.percentage > 90 ? 'bg-red-600' :
                                usage.percentage > 70 ? 'bg-yellow-600' :
                                'bg-green-600'
                              }`}
                              style={{ width: `${Math.min(100, usage.percentage)}%` }}
                            ></div>
                          </div>
                          <span className={`text-xs font-medium ${
                            usage.percentage > 90 ? 'text-red-600' :
                            usage.percentage > 70 ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>
                            {usage.percentage}%
                          </span>
                        </div>
                      )}

                      <label className="bg-primary-600 text-white px-3 py-2 rounded-md hover:bg-primary-700 cursor-pointer flex items-center text-sm">
                        <Upload className="h-4 w-4 mr-2" />
                        {uploading ? 'Enviando...' : 'Enviar'}
                        <input
                          type="file"
                          accept="video/*,.mp4,.avi,.mov,.wmv,.flv,.webm,.mkv,.3gp,.3g2,.ts,.mpg,.mpeg,.ogv,.m4v,.asf"
                          onChange={(e) => handleFileUpload(e, folder.id)}
                          className="hidden"
                          disabled={uploading}
                        />
                      </label>
                      
                      <button
                        onClick={() => syncFolder(folder.id)}
                        disabled={loading}
                        className="bg-gray-600 text-white px-3 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50 flex items-center text-sm"
                        title="Sincronizar com servidor"
                      >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Lista de Vídeos (expandível) */}
                  {isExpanded && (
                    <div className="ml-8 space-y-3">
                      {videos.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <Video className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                          <p className="text-sm">Nenhum vídeo nesta pasta</p>
                          <p className="text-xs">Use o botão "Enviar" para adicionar vídeos</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3">
                          {videos.map((video) => (
                            <div key={video.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-4 flex-1">
                                  {/* Thumbnail */}
                                  <div className="w-16 h-12 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                                    <video
                                      src={buildVideoUrl(video.url)}
                                      className="w-full h-full object-cover cursor-pointer"
                                      onClick={() => openVideoPlayer(video)}
                                      preload="metadata"
                                      muted
                                    />
                                  </div>
                                  
                                  {/* Informações do vídeo */}
                                  <div className="flex-1 min-w-0">
                                    {editingVideo?.id === video.id ? (
                                      <div className="flex items-center space-x-2">
                                        <input
                                          type="text"
                                          value={newVideoName}
                                          onChange={(e) => setNewVideoName(e.target.value)}
                                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                          onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                              saveVideoName();
                                            } else if (e.key === 'Escape') {
                                              cancelEdit();
                                            }
                                          }}
                                          autoFocus
                                        />
                                        <button
                                          onClick={saveVideoName}
                                          className="text-green-600 hover:text-green-800"
                                          title="Salvar"
                                        >
                                          <Save className="h-4 w-4" />
                                        </button>
                                        <button
                                          onClick={cancelEdit}
                                          className="text-gray-600 hover:text-gray-800"
                                          title="Cancelar"
                                        >
                                          <X className="h-4 w-4" />
                                        </button>
                                      </div>
                                    ) : (
                                      <h4 className="font-medium text-gray-900 truncate" title={video.nome}>
                                        {video.nome}
                                      </h4>
                                    )}
                                    
                                    <div className="text-sm text-gray-600 mt-1">
                                      {video.duracao && (
                                        <span className="mr-4">Duração: {formatDuration(video.duracao)}</span>
                                      )}
                                      {video.tamanho && (
                                        <span>Tamanho: {formatFileSize(video.tamanho)}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Ações do vídeo */}
                                <div className="flex items-center space-x-2 ml-4">
                                  <button
                                    onClick={() => openVideoPlayer(video)}
                                    className="text-primary-600 hover:text-primary-800 p-2 rounded-md hover:bg-primary-50"
                                    title="Reproduzir no player"
                                  >
                                    <Play className="h-4 w-4" />
                                  </button>
                                  
                                  <button
                                    onClick={() => openVideoInNewTab(video)}
                                    className="text-blue-600 hover:text-blue-800 p-2 rounded-md hover:bg-blue-50"
                                    title="Abrir em nova aba"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                  
                                  <button
                                    onClick={() => handleEditVideo(video)}
                                    className="text-orange-600 hover:text-orange-800 p-2 rounded-md hover:bg-orange-50"
                                    title="Editar nome"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </button>
                                  
                                  <button
                                    onClick={() => openVideoInNewTab(video)}
                                    className="text-green-600 hover:text-green-800 p-2 rounded-md hover:bg-green-50"
                                    title="Download"
                                  >
                                    <Download className="h-4 w-4" />
                                  </button>
                                  
                                  <button
                                    onClick={() => handleDeleteVideo(video.id, video.nome, folder.id)}
                                    className="text-red-600 hover:text-red-800 p-2 rounded-md hover:bg-red-50"
                                    title="Excluir"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

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
              <li>• Clique na seta ao lado da pasta para expandir e ver os vídeos</li>
              <li>• Use os botões de ação para reproduzir, editar, visualizar ou excluir vídeos</li>
              <li>• Envie vídeos nos formatos: MP4, AVI, MOV, WMV, FLV, WebM, MKV, etc.</li>
              <li>• Vídeos são automaticamente convertidos para MP4 se necessário</li>
              <li>• Use "Sincronizar" para atualizar a lista com vídeos enviados via FTP</li>
              <li>• Monitore o uso de espaço para não exceder seu plano</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GerenciarVideos;