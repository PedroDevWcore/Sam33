import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { toast } from "react-toastify";
import { Play, Trash2, RefreshCw, HardDrive, Download, Eye, Edit2, Save } from "lucide-react";
import UniversalVideoPlayer from "../../components/UniversalVideoPlayer";
import { Maximize, Minimize, X, Activity } from "lucide-react";

type Folder = {
  id: number;
  nome: string;
};

type Video = {
  id: number;
  nome: string;
  path?: string;
  fullPath?: string;
  folder?: string;
  duracao?: number;
  tamanho?: number;
  url?: string;
  serverId?: number;
  userLogin?: string;
  lastModified?: string;
  permissions?: string;
};

type SSHVideo = {
  id: string;
  nome: string;
  path: string;
  fullPath: string;
  folder: string;
  size: number;
  duration: number;
  permissions: string;
  lastModified: string;
  serverId: number;
  userLogin: string;
};

type EditingVideo = {
  id: string;
  nome: string;
  originalNome: string;
};

type CacheStatus = {
  totalFiles: number;
  totalSize: number;
  maxSize: number;
  usagePercentage: number;
  files: Array<{
    name: string;
    size: number;
    lastAccessed: string;
    age: number;
  }>;
};

type FolderUsage = {
  used: number;
  total: number;
  percentage: number;
  available: number;
  database_used: number;
  real_used: number;
};

function formatarDuracao(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  } else {
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
}

function formatarTamanho(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function ModalVideo({
  aberto,
  onFechar,
  videoAtual,
  playlist,
}: {
  aberto: boolean;
  onFechar: () => void;
  videoAtual?: Video | null;
  playlist?: Video[];
}) {
  const [indexAtual, setIndexAtual] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (playlist && playlist.length > 0) setIndexAtual(0);
  }, [playlist]);

  useEffect(() => {
    setIndexAtual(0);
  }, [videoAtual]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onFechar();
      }
    };

    if (aberto) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const videos = playlist && playlist.length > 0 ? playlist : videoAtual ? [videoAtual] : [];
  const video = videos[indexAtual];

  const proximoVideo = () => {
    if (indexAtual < videos.length - 1) {
      setIndexAtual(indexAtual + 1);
    } else {
      setIndexAtual(0);
    }
  };

  const goToPreviousVideo = () => {
    if (indexAtual > 0) {
      setIndexAtual(indexAtual - 1);
    }
  };

  const goToNextVideo = () => {
    if (indexAtual < videos.length - 1) {
      setIndexAtual(indexAtual + 1);
    }
  };

  const buildVideoUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.includes('/api/videos-ssh/')) return url;
    const cleanPath = url.replace(/^\/+/, '');
    return `/content/${cleanPath}`;
  };

  const closePreview = () => {
    setIndexAtual(0);
    onFechar();
  };

  const toggleFullscreen = () => {
    setIsFullscreen(prev => !prev);
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-95 flex justify-center items-center z-50 p-2 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closePreview();
        }
      }}
    >
      <div className={`bg-black rounded-lg relative ${
        isFullscreen ? 'w-screen h-screen' : 'max-w-[75vw] max-h-[70vh] w-full min-h-[400px]'
        }`}>
        

        {/* Controles do Modal */}
        <div className="absolute top-2 right-2 z-30 flex items-center space-x-1">
          <button
            onClick={toggleFullscreen}
            className="text-white bg-blue-600 hover:bg-blue-700 rounded-full p-2 transition-colors duration-200 shadow-lg"
            title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>

          <button
            onClick={closePreview}
            className="text-white bg-red-600 hover:bg-red-700 rounded-full p-2 transition-colors duration-200 shadow-lg"
            title="Fechar player"
          >
            <X size={16} />
          </button>
        </div>

        {/* Título do Vídeo */}
        <div className="absolute top-2 left-2 z-30 bg-black bg-opacity-60 text-white px-3 py-1 rounded-lg">
          <h3 className="font-medium text-sm">{video?.nome || 'Visualização'}</h3>
          {videos.length > 1 && (
            <p className="text-xs opacity-80">Playlist: {indexAtual + 1}/{videos.length}</p>
          )}
        </div>

        {video ? (
          <div className={`w-full h-full ${isFullscreen ? 'p-0' : 'p-4 pt-12'}`}>
            <UniversalVideoPlayer
              src={buildVideoUrl(video.url || '')}
              title={video.nome}
              autoplay={true}
              controls={true}
              onEnded={proximoVideo}
              onReady={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                toast.error('Erro ao carregar vídeo. Tentando método alternativo...');
              }}
              className="w-full h-full"
            />

            {/* Controles da playlist */}
            {videos.length > 1 && (
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-80 text-white px-4 py-2 rounded-lg shadow-lg">
                <div className="flex items-center justify-between space-x-4">
                  <button
                    onClick={goToPreviousVideo}
                    disabled={indexAtual === 0}
                    className="px-3 py-1 bg-gray-700 rounded disabled:opacity-50 hover:bg-gray-600 transition-colors duration-200 text-xs font-medium"
                  >
                    ← Anterior
                  </button>

                  <div className="text-center">
                    <div className="text-xs font-medium">
                      {indexAtual + 1} / {videos.length}
                    </div>
                    <div className="text-xs text-gray-300 max-w-32 truncate">
                      {video.nome}
                    </div>
                  </div>

                  <button
                    onClick={goToNextVideo}
                    disabled={indexAtual === videos.length - 1}
                    className="px-3 py-1 bg-gray-700 rounded disabled:opacity-50 hover:bg-gray-600 transition-colors duration-200 text-xs font-medium"
                  >
                    Próximo →
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-white">
            <p>Nenhum vídeo para reproduzir</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Modal de confirmação personalizado
function ModalConfirmacao({
  aberto,
  onFechar,
  onConfirmar,
  titulo,
  mensagem,
  detalhes,
}: {
  aberto: boolean;
  onFechar: () => void;
  onConfirmar: () => void;
  titulo: string;
  mensagem: string;
  detalhes?: string;
}) {
  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{titulo}</h3>
        <p className="text-gray-700 mb-4">{mensagem}</p>
        {detalhes && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
            <p className="text-sm text-yellow-800">{detalhes}</p>
          </div>
        )}
        <div className="flex justify-end space-x-3">
          <button
            onClick={onFechar}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            Confirmar Exclusão
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GerenciarVideos() {
  const { getToken, user } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderSelecionada, setFolderSelecionada] = useState<Folder | null>(null);
  const [novoFolderNome, setNovoFolderNome] = useState("");
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [modalAberta, setModalAberta] = useState(false);
  const [videoModalAtual, setVideoModalAtual] = useState<Video | null>(null);
  const [playlistModal, setPlaylistModal] = useState<Video[] | null>(null);
  // Função otimizada para vídeos SSH
  const buildOptimizedSSHUrl = (videoId: string) => {
    const token = localStorage.getItem('auth_token');
    // Usar proxy direto para melhor performance
    return `/api/videos-ssh/proxy-stream/${videoId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  };
  
  // Estados para SSH
  const [sshVideos, setSSHVideos] = useState<SSHVideo[]>([]);
  const [loadingSSH, setLoadingSSH] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [editingVideo, setEditingVideo] = useState<EditingVideo | null>(null);
  const [folderUsage, setFolderUsage] = useState<FolderUsage | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [uploadError, setUploadError] = useState<string>('');
  const [spaceWarning, setSpaceWarning] = useState<string>('');

  // Estado para sincronização
  const [syncing, setSyncing] = useState(false);
  // Estados para confirmação
  const [modalConfirmacao, setModalConfirmacao] = useState({
    aberto: false,
    tipo: '' as 'video' | 'folder',
    item: null as any,
    titulo: '',
    mensagem: '',
    detalhes: ''
  });

  // Função para construir URL do vídeo
  const buildVideoUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.includes('/api/videos-ssh/')) return url;
    const cleanPath = url.replace(/^\/+/, '');
    return `/content/${cleanPath}`;
  };

  // Função para construir URL HLS otimizada
  const buildHLSUrl = (video: SSHVideo) => {
    const isProduction = window.location.hostname !== 'localhost';
    const wowzaHost = isProduction ? 'samhost.wcore.com.br' : '51.222.156.223';
    
    // Construir URL HLS para melhor performance
    return `http://${wowzaHost}:1935/vod/${video.userLogin}/${video.folder}/${video.nome}/playlist.m3u8`;
  };
  // Função para construir URL HLS para vídeos SSH
  const buildHLSVideoUrl = (video: SSHVideo) => {
    // Usar URL HLS direta para melhor performance
    return buildHLSUrl(video);
  };

  useEffect(() => {
    fetchFolders();
    loadCacheStatus();
  }, []);

  useEffect(() => {
    if (folderSelecionada) {
      fetchSSHVideos(folderSelecionada.nome);
      loadFolderUsage(folderSelecionada.id);
      setUploadError('');
      setSpaceWarning('');
    } else {
      setSSHVideos([]);
      setFolderUsage(null);
      setUploadError('');
      setSpaceWarning('');
    }
  }, [folderSelecionada]);

  const fetchFolders = async () => {
    try {
      const token = await getToken();
      const response = await fetch("/api/folders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setFolders(data);
      if (data.length > 0) setFolderSelecionada(data[0]);
    } catch {
      toast.error("Erro ao carregar pastas");
    }
  };

  const fetchSSHVideos = async (folderName: string) => {
    setLoadingSSH(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error('Token de autenticação não encontrado');
        return;
      }
      
      const response = await fetch(`/api/videos-ssh/list?folder=${encodeURIComponent(folderName)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Erro ao carregar vídeos do servidor');
      
      const data = await response.json();
      if (data.success) {
        setSSHVideos(data.videos);
        console.log(`📹 Carregados ${data.videos.length} vídeos via SSH`);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Erro ao carregar vídeos SSH:', error);
      toast.error("Erro ao carregar vídeos do servidor");
      setSSHVideos([]);
    } finally {
      setLoadingSSH(false);
    }
  };

  const loadCacheStatus = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/videos-ssh/cache/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCacheStatus(data.cache);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar status do cache:', error);
    }
  };

  const loadFolderUsage = async (folderId: number) => {
    setLoadingUsage(true);
    setSpaceWarning('');
    try {
      const token = await getToken();
      const response = await fetch(`/api/videos-ssh/folders/${folderId}/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setFolderUsage(data.usage);
          
          // Verificar se está próximo do limite
          if (data.usage.percentage > 90) {
            setSpaceWarning('Atenção: Espaço quase esgotado! Considere excluir vídeos antigos.');
          } else if (data.usage.percentage > 75) {
            setSpaceWarning('Aviso: Mais de 75% do espaço utilizado.');
          }
        }
      }
    } catch (error) {
      console.error('Erro ao carregar uso da pasta:', error);
    } finally {
      setLoadingUsage(false);
    }
  };

  const syncFolderWithServer = async () => {
    if (!folderSelecionada) return;
    
    if (!confirm('Deseja sincronizar esta pasta com o servidor e banco de dados? Isso pode levar alguns minutos.')) {
      return;
    }
    
    setSyncing(true);
    try {
      const token = await getToken();
      
      // Primeiro, sincronizar com servidor
      const serverSyncResponse = await fetch(`/api/videos-ssh/folders/${folderSelecionada.id}/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const serverSyncData = await serverSyncResponse.json();
      if (!serverSyncData.success) {
        throw new Error(serverSyncData.error);
      }
      
      // Depois, sincronizar com banco de dados
      const dbSyncResponse = await fetch('/api/videos-ssh/sync-database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          folderId: folderSelecionada.id
        })
      });
      
      const dbSyncData = await dbSyncResponse.json();
      if (dbSyncData.success) {
        toast.success(`Sincronização completa: ${dbSyncData.videos_count} vídeos, ${dbSyncData.total_size_mb}MB`);
        fetchSSHVideos(folderSelecionada.nome);
        loadFolderUsage(folderSelecionada.id);
        // Recarregar lista de vídeos para refletir mudanças
        setTimeout(() => {
          fetchSSHVideos(folderSelecionada.nome);
        }, 1000);
      } else {
        toast.error(dbSyncData.error);
      }
    } catch (error) {
      console.error('Erro na sincronização:', error);
      toast.error('Erro na sincronização com servidor');
    } finally {
      setSyncing(false);
    }
  };

  const clearCache = async () => {
    if (!confirm('Deseja limpar o cache de vídeos? Isso pode afetar a reprodução de vídeos em andamento.')) {
      return;
    }
    
    try {
      const token = await getToken();
      const response = await fetch('/api/videos-ssh/cache/clear', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const data = await response.json();
      if (data.success) {
        toast.success(data.message);
        loadCacheStatus();
      } else {
        toast.error(data.error);
      }
    } catch (error) {
      console.error('Erro ao limpar cache:', error);
      toast.error('Erro ao limpar cache');
    }
  };

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const videosOnly = Array.from(files).filter(f => f.type.startsWith("video/"));
    if (videosOnly.length !== files.length) {
      toast.error("Apenas arquivos de vídeo são permitidos");
      e.target.value = "";
      setUploadFiles(null);
      return;
    }
    const MAX_SIZE = 2 * 1024 * 1024 * 1024;
    const oversizedFiles = videosOnly.filter(f => f.size > MAX_SIZE);
    if (oversizedFiles.length > 0) {
      toast.error(`Arquivos muito grandes: ${oversizedFiles.map(f => f.name).join(", ")}`);
      e.target.value = "";
      setUploadFiles(null);
      return;
    }
    setUploadFiles(files);
  };

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = url;
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(video.duration);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
    });
  };

  const uploadVideos = async () => {
    if (!folderSelecionada || !uploadFiles || uploadFiles.length === 0) {
      toast.error("Selecione uma pasta e ao menos um arquivo para upload");
      return;
    }
    
    setUploadError('');
    setUploading(true);
    setUploadProgress(0);
    
    try {
      const token = await getToken();
      let successCount = 0;
      let errorCount = 0;
      
      for (const file of Array.from(uploadFiles)) {
        const formData = new FormData();
        formData.append("video", file);
        const duracao = await getVideoDuration(file);
        formData.append("duracao", duracao.toString());
        formData.append("tamanho", file.size.toString());

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `/api/videos/upload?folder_id=${folderSelecionada.id.toString()}`);
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const progressoAtual = (e.loaded / e.total) * 100;
              setUploadProgress(progressoAtual);
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              const videoData = JSON.parse(xhr.responseText);
              toast.success(`${file.name} enviado com sucesso!`);
              successCount++;
              if (folderSelecionada) {
                fetchSSHVideos(folderSelecionada.nome);
                // Atualizar uso da pasta após upload bem-sucedido
                loadFolderUsage(folderSelecionada.id);
              }
              resolve();
            } else {
              const errorData = JSON.parse(xhr.responseText);
              const errorMessage = errorData.error || `Erro ao enviar ${file.name}`;
              
              // Verificar se é erro de espaço
              if (errorMessage.includes('Espaço insuficiente') || errorMessage.includes('espaço')) {
                setUploadError(`❌ ${errorMessage}`);
                toast.error(errorMessage);
              } else if (errorMessage.includes('Formato') || errorMessage.includes('suportado')) {
                setUploadError(`❌ ${errorMessage}`);
                toast.error(errorMessage);
              } else {
                toast.error(errorMessage);
              }
              
              errorCount++;
              reject();
            }
          };
          xhr.onerror = () => {
            const errorMsg = `Erro de conexão ao enviar ${file.name}`;
            toast.error(errorMsg);
            errorCount++;
            reject();
          };
          xhr.send(formData);
        });
      }
      
      // Mostrar resumo final
      if (successCount > 0 && errorCount === 0) {
        toast.success(`✅ Todos os ${successCount} vídeo(s) enviados com sucesso!`);
      } else if (successCount > 0 && errorCount > 0) {
        toast.warning(`⚠️ ${successCount} vídeo(s) enviados, ${errorCount} falharam`);
      }
      
    } catch {
      toast.error("Erro no upload de vídeos");
    } finally {
      setUploading(false);
      setUploadFiles(null);
      setUploadProgress(0);
      setUploadError('');
      const inputFile = document.getElementById("input-upload-videos") as HTMLInputElement;
      if (inputFile) inputFile.value = "";
    }
  };

  const criarFolder = async () => {
    if (!novoFolderNome.trim()) return;
    try {
      const token = await getToken();
      const response = await fetch("/api/folders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ nome: novoFolderNome.trim() })
      });
      if (!response.ok) throw new Error();
      const novaFolder = await response.json();
      setFolders(prev => [...prev, novaFolder]);
      setNovoFolderNome("");
      toast.success("Pasta criada com sucesso!");
    } catch {
      toast.error("Erro ao criar pasta");
    }
  };

  const confirmarDeletarFolder = (folder: Folder) => {
    setModalConfirmacao({
      aberto: true,
      tipo: 'folder',
      item: folder,
      titulo: 'Confirmar Exclusão da Pasta',
      mensagem: `Deseja realmente excluir a pasta "${folder.nome}"?`,
      detalhes: 'Esta ação não pode ser desfeita. Certifique-se de que a pasta não contém vídeos importantes.'
    });
  };

  const confirmarDeletarSSHVideo = (video: SSHVideo) => {
    setModalConfirmacao({
      aberto: true,
      tipo: 'video',
      item: video,
      titulo: 'Confirmar Exclusão do Vídeo',
      mensagem: `Deseja realmente excluir o vídeo "${video.nome}" do servidor?`,
      detalhes: 'Esta ação não pode ser desfeita e o arquivo será removido permanentemente do servidor Wowza.'
    });
  };

  const executarDelecao = async () => {
    const { tipo, item } = modalConfirmacao;

    try {
      const token = await getToken();

      if (tipo === 'folder') {
        const response = await fetch(`/api/folders/${item.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          const errorData = await response.json();
          toast.error(errorData.details || errorData.error || "Erro ao excluir pasta");
          return;
        }

        setFolders(prev => prev.filter(f => f.id !== item.id));
        if (folderSelecionada?.id === item.id) {
          setFolderSelecionada(null);
          setSSHVideos([]);
        }
        toast.success("Pasta excluída com sucesso!");

      } else if (tipo === 'video' && item.id && typeof item.id === 'string') {
        const response = await fetch(`/api/videos-ssh/${item.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          const errorData = await response.json();
          toast.error(errorData.details || errorData.error || "Erro ao excluir vídeo");
          return;
        }

        setSSHVideos(prev => prev.filter(v => v.id !== item.id));
        toast.success("Vídeo excluído com sucesso do servidor!");
        
        // Atualizar uso da pasta após exclusão
        if (folderSelecionada) {
          loadFolderUsage(folderSelecionada.id);
        }
      }
    } catch (error) {
      toast.error("Erro ao excluir item");
      console.error('Erro na exclusão:', error);
    } finally {
      setModalConfirmacao({
        aberto: false,
        tipo: '' as any,
        item: null,
        titulo: '',
        mensagem: '',
        detalhes: ''
      });
    }
  };

  const startEditingVideo = (video: SSHVideo) => {
    setEditingVideo({
      id: video.id,
      nome: video.nome,
      originalNome: video.nome
    });
  };

  const saveVideoEdit = async () => {
    if (!editingVideo) return;

    try {
      const token = await getToken();
      const response = await fetch(`/api/videos-ssh/${editingVideo.id}/rename`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          novo_nome: editingVideo.nome
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro ao renomear vídeo');
        return;
      }

      toast.success('Vídeo renomeado com sucesso!');
      setEditingVideo(null);
      
      if (folderSelecionada) {
        fetchSSHVideos(folderSelecionada.nome);
      }
    } catch (error) {
      console.error('Erro ao renomear vídeo:', error);
      toast.error('Erro ao renomear vídeo');
    }
  };

  const cancelEdit = () => {
    setEditingVideo(null);
  };

  const abrirModalVideo = (video: Video) => {
    console.log('Abrindo modal para vídeo:', video);
    
    // Verificar se há token antes de abrir o vídeo
    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast.error('Token de autenticação não encontrado. Faça login novamente.');
      return;
    }
    
    // Para vídeos SSH, usar URL HLS para melhor performance e evitar travamentos
    let videoUrl = video.url || '';
    if (videoUrl.includes('/api/videos-ssh/')) {
      const videoId = videoUrl.split('/stream/')[1]?.split('?')[0];
      if (videoId) {
        try {
          // Construir URL HLS do Wowza para melhor performance
          const remotePath = Buffer.from(videoId, 'base64').toString('utf-8');
          const isProduction = window.location.hostname !== 'localhost';
          const wowzaHost = isProduction ? 'samhost.wcore.com.br' : '51.222.156.223';
          
          // Extrair informações do caminho
          const pathParts = remotePath.split('/');
          const userLogin = pathParts[pathParts.length - 3];
          const folderName = pathParts[pathParts.length - 2];
          const fileName = pathParts[pathParts.length - 1];
          
          // URL HLS para streaming fluido
          videoUrl = `http://${wowzaHost}:1935/vod/${userLogin}/${folderName}/${fileName}/playlist.m3u8`;
        } catch (error) {
          console.warn('Erro ao construir URL HLS, usando otimizada:', error);
          videoUrl = buildOptimizedSSHUrl(videoId);
        }
      }
    } else if (!videoUrl.startsWith('http')) {
      // Para outros vídeos, tentar construir URL HLS também
      const cleanPath = videoUrl.replace(/^\/+/, '');
      const pathParts = cleanPath.split('/');
      
      if (pathParts.length >= 3) {
        const userLogin = pathParts[0];
        const folderName = pathParts[1];
        const fileName = pathParts[2];
        
        const isProduction = window.location.hostname !== 'localhost';
        const wowzaHost = isProduction ? 'samhost.wcore.com.br' : '51.222.156.223';
        videoUrl = `http://${wowzaHost}:1935/vod/${userLogin}/${folderName}/${fileName}/playlist.m3u8`;
      }
    }
    
    const videoWithUrl = {
      ...video,
      url: videoUrl
    };
    
    setVideoModalAtual(videoWithUrl);
    setPlaylistModal(null);
    setModalAberta(true);
  };

  const abrirModalPlaylist = () => {
    if (!folderSelecionada) return;
    
    // Verificar se há token antes de abrir a playlist
    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast.error('Token de autenticação não encontrado. Faça login novamente.');
      return;
    }
    
    const videosParaPlaylist = sshVideos.map(v => {      
      // Construir URL HLS do Wowza para playlist (melhor performance e sem travamentos)
      let videoUrl;
      try {
        const isProduction = window.location.hostname !== 'localhost';
        const wowzaHost = isProduction ? 'samhost.wcore.com.br' : '51.222.156.223';
        
        // URL HLS para reprodução fluida sem travamentos
        videoUrl = `http://${wowzaHost}:1935/vod/${v.userLogin}/${v.folder}/${v.nome}/playlist.m3u8`;
      } catch (error) {
        console.warn('Erro ao construir URL HLS, usando proxy:', error);
        videoUrl = `/content/${v.userLogin}/${v.folder}/${v.nome}`;
      }
      
      return {
      id: 0,
      nome: v.nome,
        url: videoUrl,
      duracao: v.duration,
      tamanho: v.size
      };
    });
    
    console.log('Abrindo playlist modal com vídeos:', videosParaPlaylist);
    setPlaylistModal(videosParaPlaylist);
    setVideoModalAtual(null);
    setModalAberta(true);
  };

  const openVideoInNewTab = (video: SSHVideo) => {
    // Abrir vídeo SSH em nova aba usando URL otimizada
    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast.error('Token de autenticação não encontrado. Faça login novamente.');
      return;
    }
    
    // Para nova aba, usar URL HLS do Wowza para melhor performance
    try {
      const isProduction = window.location.hostname !== 'localhost';
      const wowzaHost = isProduction ? 'samhost.wcore.com.br' : '51.222.156.223';
      
      // URL HLS para melhor performance em nova aba (sem travamentos)
      const streamUrl = `http://${wowzaHost}:1935/vod/${video.userLogin}/${video.folder}/${video.nome}/playlist.m3u8`;
      
      window.open(streamUrl, '_blank');
    } catch (error) {
      console.warn('Erro ao construir URL direta, usando fallback:', error);
      const streamUrl = buildOptimizedSSHUrl(video.id);
      window.open(streamUrl, '_blank');
    }
  };

  const checkVideoIntegrity = async (video: SSHVideo) => {
    try {
      const token = await getToken();
      if (!token) {
        toast.error('Token de autenticação não encontrado');
        return;
      }
      
      const response = await fetch(`/api/videos-ssh/info/${video.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.video_info) {
          const info = data.video_info;
          toast.success(`Vídeo íntegro: ${info.duration}s, ${info.codec}, ${info.width}x${info.height}`);
        } else {
          toast.warning('Não foi possível verificar a integridade do vídeo');
        }
      }
    } catch (error) {
      console.error('Erro ao verificar integridade:', error);
      toast.error('Erro ao verificar integridade do vídeo');
    }
  };

  return (
    <>
      <div className="w-full max-w-full p-4 sm:p-6 flex flex-col lg:flex-row gap-6 min-h-[700px] overflow-x-hidden">
        {/* Seção das Pastas */}
        <section className="w-full lg:w-1/3 bg-gray-50 p-4 sm:p-6 rounded-lg shadow-md flex flex-col min-h-[500px] border border-gray-300">
          <h2 className="text-2xl font-semibold mb-5 text-gray-900 flex justify-between items-center">
            Pastas
          </h2>
          <ul className="flex-grow overflow-auto max-h-[300px] sm:max-h-[450px] space-y-2">
            {folders.map((folder) => (
              <li
                key={folder.id}
                className={`cursor-pointer p-2 rounded flex justify-between items-center ${folderSelecionada?.id === folder.id
                  ? "bg-blue-100 font-semibold text-blue-800"
                  : "hover:bg-blue-50 text-gray-800"
                  }`}
                onClick={() => setFolderSelecionada(folder)}
                title={`Selecionar pasta ${folder.nome}`}
              >
                <span className="truncate flex-1 mr-2">{folder.nome}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirModalPlaylist();
                    }}
                    title={`Assistir todos os vídeos da pasta ${folder.nome} (SSH)`}
                    className="text-blue-600 hover:text-blue-800 transition-colors duration-200"
                    disabled={sshVideos.length === 0}
                  >
                    <Play size={16} />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (sshVideos.length > 0) {
                        openVideoInNewTab(sshVideos[0]);
                      }
                    }}
                    title={`Abrir primeiro vídeo da pasta em nova aba`}
                    className="text-green-600 hover:text-green-800 transition-colors duration-200"
                    disabled={sshVideos.length === 0}
                  >
                    <Eye size={16} />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      confirmarDeletarFolder(folder);
                    }}
                    className="text-red-600 hover:text-red-800 transition-colors duration-200"
                    title="Excluir pasta"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          
          <div className="mt-4 flex flex-col sm:flex-row gap-2 max-w-full">
            <input
              type="text"
              value={novoFolderNome}
              onChange={(e) => setNovoFolderNome(e.target.value)}
              className="w-full sm:flex-grow min-w-0 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Nova pasta"
            />
            <button
              onClick={criarFolder}
              className="w-full sm:w-auto bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700 whitespace-nowrap transition-colors duration-200"
            >
              Criar
            </button>
          </div>
        </section>

        {/* Seção dos Vídeos */}
        <section className="w-full lg:w-2/3 bg-gray-50 p-4 sm:p-6 rounded-lg shadow-md flex flex-col min-h-[500px] border border-gray-300">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-semibold text-gray-900">
              Vídeos {folderSelecionada ? ` - ${folderSelecionada.nome}` : ""}
              <span className="text-blue-600 text-sm ml-2">(SSH)</span>
            </h2>
            
            {/* Controles compactos */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => folderSelecionada && fetchSSHVideos(folderSelecionada.nome)}
                disabled={loadingSSH}
                className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 text-sm px-2 py-1 rounded border border-blue-300 hover:bg-blue-50"
              >
                <RefreshCw className={`h-3 w-3 ${loadingSSH ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Atualizar</span>
              </button>
              
              {folderSelecionada && (
                <button
                  onClick={syncFolderWithServer}
                  disabled={syncing}
                  className="flex items-center space-x-1 text-green-600 hover:text-green-800 text-sm px-2 py-1 rounded border border-green-300 hover:bg-green-50"
                >
                  <Download className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">{syncing ? 'Sincronizando...' : 'Sync DB'}</span>
                </button>
              )}
              
              {folderSelecionada && (
                <button
                  onClick={() => {
                    if (confirm('Deseja recalcular o espaço usado desta pasta baseado nos vídeos atuais?')) {
                      loadFolderUsage(folderSelecionada.id);
                    }
                  }}
                  disabled={loadingUsage}
                  className="flex items-center space-x-1 text-purple-600 hover:text-purple-800 text-sm px-2 py-1 rounded border border-purple-300 hover:bg-purple-50"
                >
                  <Activity className={`h-3 w-3 ${loadingUsage ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Recalc</span>
                </button>
              )}
              
              {cacheStatus && (
                <button
                  onClick={clearCache}
                  className="flex items-center space-x-1 text-red-600 hover:text-red-800 text-sm px-2 py-1 rounded border border-red-300 hover:bg-red-50"
                >
                  <X className="h-3 w-3" />
                  <span className="hidden sm:inline">Cache</span>
                </button>
              )}
            </div>
          </div>

          {/* Informações compactas da pasta */}
          {folderSelecionada && folderUsage && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md space-y-2">
              {spaceWarning && (
                <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                  ⚠️ {spaceWarning}
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-blue-900">{sshVideos.length} vídeo(s)</span>
                  <span className="text-blue-700 ml-2">
                    • {formatarTamanho(folderUsage.used * 1024 * 1024)} / {formatarTamanho(folderUsage.total * 1024 * 1024)}
                  </span>
                  {folderUsage.last_updated && (
                    <span className="text-blue-600 text-xs ml-2">
                      (atualizado: {new Date(folderUsage.last_updated).toLocaleTimeString()})
                    </span>
                  )}
                  {folderUsage.database_used !== folderUsage.real_used && (
                    <span className="text-orange-600 text-xs ml-2">
                      (BD: {formatarTamanho(folderUsage.database_used * 1024 * 1024)} | Real: {formatarTamanho(folderUsage.real_used * 1024 * 1024)})
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className={`font-medium ${
                    folderUsage.percentage > 90 ? 'text-red-600' :
                    folderUsage.percentage > 70 ? 'text-yellow-600' : 'text-green-600'
                  }`}>
                    {folderUsage.percentage}%
                  </span>
                  <div className="text-xs text-gray-500">
                    {formatarTamanho((folderUsage.total - folderUsage.used) * 1024 * 1024)} livres
                  </div>
                </div>
              </div>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
                <div
                  className={`h-1 rounded-full transition-all ${
                    folderUsage.percentage > 90 ? 'bg-red-600' :
                    folderUsage.percentage > 70 ? 'bg-yellow-600' : 'bg-green-600'
                  }`}
                  style={{ width: `${Math.min(folderUsage.percentage, 100)}%` }}
                ></div>
              </div>
              {folderUsage.percentage > 95 && (
                <div className="text-xs text-red-600 font-medium">
                  🚨 Espaço crítico! Exclua vídeos para continuar enviando arquivos.
                </div>
              )}
              {Math.abs(folderUsage.database_used - folderUsage.real_used) > 5 && (
                <div className="text-xs text-orange-600 font-medium">
                  ⚠️ Diferença detectada entre banco e servidor. Use "Sync DB" para corrigir.
                </div>
              )}
            </div>
          )}
          
          {/* Mensagens de erro de upload */}
          {uploadError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800 text-sm">{uploadError}</p>
              <p className="text-red-600 text-xs mt-1">
                💡 Dica: Exclua vídeos antigos para liberar espaço ou entre em contato para aumentar seu limite.
              </p>
            </div>
          )}
          
          <input
            type="file"
            id="input-upload-videos"
            multiple
            accept="video/*"
            onChange={handleFilesChange}
            disabled={!folderSelecionada || uploading}
            className="mb-3"
          />
          {uploading && (
            <div className="w-full bg-gray-200 rounded h-4 mb-4 overflow-hidden">
              <div
                className="bg-blue-600 h-4 transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
          <button
            onClick={uploadVideos}
            disabled={!uploadFiles || uploadFiles.length === 0 || uploading || !folderSelecionada}
            className="w-full sm:w-auto bg-blue-600 text-white px-5 py-3 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors duration-200"
          >
            {uploading ? "Enviando..." : "Enviar"}
          </button>

          <div className="mt-8 flex-grow overflow-auto max-h-[400px] sm:max-h-[450px]">
            {loadingSSH && (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-blue-600 mr-2" />
                <span className="text-gray-600">Carregando vídeos do servidor...</span>
              </div>
            )}
            
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="py-2 px-4">Nome</th>
                  <th className="py-2 px-4 w-20 sm:w-28">Duração</th>
                  <th className="py-2 px-4 w-20 sm:w-28">Tamanho</th>
                  <th className="py-2 px-4 w-24 sm:w-32 hidden sm:table-cell">Pasta</th>
                  <th className="py-2 px-4 w-16 sm:w-24">Assistir</th>
                  <th className="py-2 px-4 w-32 sm:w-40">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sshVideos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-gray-500 text-xs sm:text-sm">
                      {loadingSSH ? 'Carregando...' : 'Nenhum vídeo encontrado no servidor'}
                    </td>
                  </tr>
                ) : (
                  sshVideos.map((video) => (
                    <tr
                      key={video.id}
                      className="border-b border-gray-200 hover:bg-blue-50"
                    >
                      <td className="py-2 px-2 sm:px-4 truncate max-w-[120px] sm:max-w-xs">
                        {editingVideo?.id === video.id ? (
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={editingVideo.nome}
                              onChange={(e) => setEditingVideo(prev => prev ? {...prev, nome: e.target.value} : null)}
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs sm:text-sm"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveVideoEdit();
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              autoFocus
                            />
                            <button
                              onClick={saveVideoEdit}
                              className="text-green-600 hover:text-green-800"
                              title="Salvar"
                            >
                              <Save size={14} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="text-red-600 hover:text-red-800"
                              title="Cancelar"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className="truncate">{video.nome}</span>
                            <div className="flex items-center space-x-1 ml-2">
                              {video.size > 0 ? (
                                <div className="w-2 h-2 bg-green-500 rounded-full" title="Arquivo válido" />
                              ) : (
                                <div className="w-2 h-2 bg-red-500 rounded-full" title="Arquivo pode estar corrompido" />
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2 sm:px-4 text-xs sm:text-sm">{video.duration ? formatarDuracao(video.duration) : "--"}</td>
                      <td className="py-2 px-2 sm:px-4 text-xs sm:text-sm">{video.size ? formatarTamanho(video.size) : "--"}</td>
                      <td className="py-2 px-2 sm:px-4 text-xs text-gray-500 hidden sm:table-cell">{video.folder}</td>
                      <td className="py-2 px-2 sm:px-4 text-blue-600 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Para modal, usar URL otimizada para melhor UX
                            abrirModalVideo({
                              id: Number(video.id),
                              nome: video.nome,
                              url: buildHLSUrl(video), // Usar URL HLS direta
                              duracao: video.duration,
                              tamanho: video.size
                            } as Video);
                          }}
                          title="Assistir vídeo no modal"
                          className="hover:text-blue-800 transition-colors duration-200"
                        >
                          <Play size={16} />
                        </button>
                      </td>
                      <td className="py-2 px-2 sm:px-4 text-center">
                        <div className="flex items-center justify-center space-x-1 flex-wrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Para nova aba, usar URL direta para melhor performance
                              openVideoInNewTab(video);
                            }}
                            title="Abrir vídeo em nova aba (URL direta)"
                            className="text-green-600 hover:text-green-800 transition-colors duration-200"
                          >
                            <Eye size={12} />
                          </button>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              checkVideoIntegrity(video);
                            }}
                            title="Verificar integridade do vídeo"
                            className="text-purple-600 hover:text-purple-800 transition-colors duration-200"
                          >
                            <Activity size={12} />
                          </button>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingVideo(video);
                            }}
                            title="Editar nome do vídeo"
                            className="text-blue-600 hover:text-blue-800 transition-colors duration-200"
                            disabled={editingVideo?.id === video.id}
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmarDeletarSSHVideo(video);
                            }}
                            title="Excluir vídeo do servidor"
                            className="text-red-600 hover:text-red-800 transition-colors duration-200"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {/* Modal de vídeo com controles integrados */}
      <ModalVideo
        aberto={modalAberta}
        onFechar={() => setModalAberta(false)}
        videoAtual={videoModalAtual}
        playlist={playlistModal ?? undefined}
      />

      {/* Modal de confirmação */}
      <ModalConfirmacao
        aberto={modalConfirmacao.aberto}
        onFechar={() => setModalConfirmacao(prev => ({ ...prev, aberto: false }))}
        onConfirmar={executarDelecao}
        titulo={modalConfirmacao.titulo}
        mensagem={modalConfirmacao.mensagem}
        detalhes={modalConfirmacao.detalhes}
      />
    </>
  );
}