const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const db = require('../config/database');
const authMiddleware = require('../middlewares/authMiddleware');
const SSHManager = require('../config/SSHManager');
const wowzaService = require('../config/WowzaStreamingService');

const router = express.Router();

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const tempDir = '/tmp/video-uploads';
      await fs.mkdir(tempDir, { recursive: true });
      cb(null, tempDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const sanitizedName = file.originalname
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_');
    cb(null, `${Date.now()}_${sanitizedName}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    // Lista expandida de tipos MIME para vídeos
    const allowedTypes = [
      'video/mp4', 'video/avi', 'video/quicktime', 'video/x-msvideo', 
      'video/wmv', 'video/x-ms-wmv', 'video/flv', 'video/x-flv',
      'video/webm', 'video/mkv', 'video/x-matroska', 'video/3gpp',
      'video/3gpp2', 'video/mp2t', 'video/mpeg', 'video/ogg',
      'application/octet-stream' // Para arquivos que podem não ter MIME correto
    ];
    
    // Verificar também por extensão para todos os formatos
    const fileName = file.originalname.toLowerCase();
    const hasValidExtension = [
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', 
      '.3gp', '.3g2', '.ts', '.mpg', '.mpeg', '.ogv', '.m4v', '.asf'
    ].some(ext => 
      fileName.endsWith(ext)
    );
    
    if (allowedTypes.includes(file.mimetype) || hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não suportado: ${file.mimetype}. Extensões aceitas: .mp4, .avi, .mov, .wmv, .flv, .webm, .mkv, .3gp, .ts, .mpg, .ogv, .m4v`), false);
    }
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const folderId = req.query.folder_id;
    if (!folderId) {
      return res.status(400).json({ error: 'folder_id é obrigatório' });
    }

    const [folderRows] = await db.execute(
      'SELECT identificacao FROM streamings WHERE codigo = ? AND codigo_cliente = ?',
      [folderId, userId]
    );
    if (folderRows.length === 0) {
      return res.status(404).json({ error: 'Pasta não encontrada' });
    }

    const folderName = folderRows[0].identificacao;
    const userLogin = req.user.email.split('@')[0];
    const folderPath = `/${userLogin}/${folderName}/`;

    // Buscar vídeos da tabela videos (prioridade para vídeos SSH)
    const [videosRows] = await db.execute(
      `SELECT 
        id,
        nome,
        url,
        duracao,
        playlist_id,
        created_at
       FROM videos 
       WHERE (url LIKE ? OR url LIKE ?)
       ORDER BY created_at DESC`,
      [`%${userLogin}/${folderName}%`, `%/api/videos-ssh/stream/%`]
    );

    // Buscar também na tabela legacy (playlists_videos) para compatibilidade
    const [legacyRows] = await db.execute(
      `SELECT 
        codigo as id,
        video as nome,
        path_video as url,
        duracao_segundos as duracao,
        tamanho_arquivo as tamanho
       FROM playlists_videos 
       WHERE path_video LIKE ?
       ORDER BY codigo`,
      [`%${folderPath}%`]
    );

    console.log(`📁 Buscando vídeos na pasta: ${folderPath}`);
    console.log(`📊 Encontrados ${videosRows.length} vídeos na tabela videos e ${legacyRows.length} na tabela legacy`);

    // Filtrar vídeos da tabela videos que realmente pertencem à pasta atual
    const filteredVideosRows = videosRows.filter(video => {
      if (video.url.includes('/api/videos-ssh/stream/')) {
        // Para vídeos SSH, verificar se o nome da pasta está correto
        // Isso é uma verificação aproximada, idealmente teríamos metadata melhor
        return true; // Por enquanto, incluir todos os vídeos SSH
      } else {
        return video.url.includes(`${userLogin}/${folderName}`);
      }
    });

    // Combinar resultados das duas tabelas, priorizando a tabela videos
    const allVideos = [
      ...filteredVideosRows.map(video => ({
        id: video.id,
        nome: video.nome,
        url: video.url,
        duracao: video.duracao,
        tamanho: 0, // Não temos tamanho na nova tabela
        source: 'videos',
        playlist_id: video.playlist_id
      })),
      ...legacyRows.map(video => ({
        id: video.id,
        nome: video.nome,
        url: video.url,
        duracao: video.duracao,
        tamanho: video.tamanho,
        source: 'playlists_videos',
        playlist_id: 0
      }))
    ];

    // Remover duplicatas baseado no nome do arquivo
    const uniqueVideos = [];
    const seenNames = new Set();
    
    for (const video of allVideos) {
      const videoName = video.nome;
      if (!seenNames.has(videoName)) {
        seenNames.add(videoName);
        uniqueVideos.push(video);
      }
    }
    const videos = uniqueVideos.map(video => {
      // Para vídeos SSH, manter URL SSH. Para outros, usar formato /content
      let url = video.url;
      
      if (video.url.includes('/api/videos-ssh/stream/')) {
        // Vídeos SSH - manter URL SSH
        url = video.url;
      } else {
        // Vídeos legacy - converter para formato /content
        const cleanPath = video.url.replace(/^\/+/, '');
        url = `/content/${cleanPath}`;
      }
      
      console.log(`🎥 Vídeo: ${video.nome} -> URL: /content/${url} (fonte: ${video.source})`);
      
      return {
        id: video.id,
        nome: video.nome,
        url,
        duracao: video.duracao,
        tamanho: video.tamanho,
        originalPath: video.url,
        folder: folderName,
        user: userLogin,
        source: video.source,
        playlist_id: video.playlist_id
      };
    });

    console.log(`✅ Retornando ${videos.length} vídeos únicos processados`);
    res.json(videos);
  } catch (err) {
    console.error('Erro ao buscar vídeos:', err);
    res.status(500).json({ error: 'Erro ao buscar vídeos', details: err.message });
  }
});

router.post('/upload', authMiddleware, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const userId = req.user.id;
    const userLogin = req.user.email.split('@')[0];
    const folderId = req.query.folder_id || 'default';
    
    console.log(`📤 Upload iniciado - Usuário: ${userLogin}, Pasta: ${folderId}, Arquivo: ${req.file.originalname}`);
    console.log(`📋 Tipo MIME: ${req.file.mimetype}, Tamanho: ${req.file.size} bytes`);
    
    // Verificar se é um formato de vídeo válido
    const videoExtensions = [
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv',
      '.3gp', '.3g2', '.ts', '.mpg', '.mpeg', '.ogv', '.m4v', '.asf'
    ];
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    if (!videoExtensions.includes(fileExtension)) {
      console.log(`❌ Extensão não suportada: ${fileExtension}`);
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ 
        error: `Formato de arquivo não suportado: ${fileExtension}`,
        details: `Formatos aceitos: ${videoExtensions.join(', ')}`
      });
    }
    
    const duracao = parseInt(req.body.duracao) || 0;
    const tamanho = parseInt(req.body.tamanho) || req.file.size;

    const [userRows] = await db.execute(
      `SELECT 
        s.codigo_servidor, s.identificacao as folder_name,
        s.espaco, s.espaco_usado
       FROM streamings s 
       WHERE s.codigo = ? AND s.codigo_cliente = ?`,
      [folderId, userId]
    );
    if (userRows.length === 0) {
      console.log(`❌ Pasta ${folderId} não encontrada para usuário ${userId}`);
      return res.status(404).json({ error: 'Pasta não encontrada' });
    }

    const userData = userRows[0];
    const serverId = userData.codigo_servidor || 1;
    const folderName = userData.folder_name;
    
    console.log(`📁 Pasta encontrada: ${folderName}, Servidor: ${serverId}`);

    const spaceMB = Math.ceil(tamanho / (1024 * 1024));
    const availableSpace = userData.espaco - userData.espaco_usado;

    if (spaceMB > availableSpace) {
      console.log(`❌ Espaço insuficiente: ${spaceMB}MB necessário, ${availableSpace}MB disponível`);
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ 
        error: `Espaço insuficiente. Necessário: ${spaceMB}MB, Disponível: ${availableSpace}MB`,
        details: `Seu plano permite ${userData.espaco}MB de armazenamento. Atualmente você está usando ${userData.espaco_usado}MB. Para enviar este arquivo, você precisa de mais ${spaceMB - availableSpace}MB livres.`,
        spaceInfo: {
          required: spaceMB,
          available: availableSpace,
          total: userData.espaco,
          used: userData.espaco_usado,
          percentage: Math.round((userData.espaco_usado / userData.espaco) * 100)
        }
      });
    }

    await SSHManager.createUserDirectory(serverId, userLogin);
    await SSHManager.createUserFolder(serverId, userLogin, folderName);

    const remotePath = `/usr/local/WowzaStreamingEngine/content/${userLogin}/${folderName}/${req.file.filename}`;
    await SSHManager.uploadFile(serverId, req.file.path, remotePath);
    await fs.unlink(req.file.path);

    console.log(`✅ Arquivo enviado para: ${remotePath}`);

    // Construir URL relativa para salvar no banco
    const sshVideoUrl = `/api/videos-ssh/stream/${Buffer.from(remotePath).toString('base64')}`;
    console.log(`💾 Salvando no banco com path: ${relativePath}`);

    // Nome do vídeo para salvar no banco
    const videoTitle = req.file.originalname;

    // Buscar ou criar playlist padrão para a pasta
    let playlistId = await getOrCreateFolderPlaylist(userId, folderName);
    
    // Salvar na nova tabela videos
    const [result] = await db.execute(
      `INSERT INTO videos (nome, descricao, url, duracao, playlist_id, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [videoTitle, `Vídeo SSH enviado para a pasta ${folderName}`, sshVideoUrl, duracao, playlistId]
    );
    
    // Construir URL relativa para compatibilidade com tabela legacy
    const relativePath = `/${userLogin}/${folderName}/${req.file.filename}`;
    
    // Também salvar na tabela legacy para compatibilidade
    await db.execute(
      `INSERT INTO playlists_videos (
        codigo_playlist, path_video, video, width, height, 
        bitrate, duracao, duracao_segundos, tipo, ordem, tamanho_arquivo
      ) VALUES (0, ?, ?, 1920, 1080, 2500, ?, ?, 'video', 0, ?)`,
      [relativePath, videoTitle, formatDuration(duracao), duracao, tamanho]
    );

    await db.execute(
      'UPDATE streamings SET espaco_usado = espaco_usado + ? WHERE codigo = ?',
      [spaceMB, folderId]
    );

    console.log(`✅ Vídeo salvo no banco com ID: ${result.insertId}`);

    res.status(201).json({
      id: result.insertId,
      nome: videoTitle,
      url: sshVideoUrl,
      duracao,
      tamanho
    });
  } catch (err) {
    console.error('Erro no upload:', err);
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(500).json({ error: 'Erro no upload do vídeo', details: err.message });
  }
});

// Função para obter ou criar playlist padrão para uma pasta
async function getOrCreateFolderPlaylist(userId, folderName) {
  try {
    const playlistName = `Pasta - ${folderName}`;
    
    // Verificar se playlist já existe
    const [existingPlaylist] = await db.execute(
      'SELECT id FROM playlists WHERE nome = ? AND codigo_stm = ?',
      [playlistName, userId]
    );

    if (existingPlaylist.length > 0) {
      return existingPlaylist[0].id;
    }

    // Criar nova playlist
    const [result] = await db.execute(
      'INSERT INTO playlists (nome, codigo_stm, data_criacao) VALUES (?, ?, NOW())',
      [playlistName, userId]
    );

    console.log(`📁 Playlist criada para pasta: ${playlistName} (ID: ${result.insertId})`);
    return result.insertId;
  } catch (error) {
    console.error('Erro ao criar playlist para pasta:', error);
    return 1; // Fallback para playlist padrão
  }
}

// Função auxiliar para formatar duração
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Rota para testar acesso a vídeos
router.get('/test/:userId/:folder/:filename', authMiddleware, async (req, res) => {
  try {
    const { userId, folder, filename } = req.params;
    const userLogin = req.user.email.split('@')[0];
    
    // Verificar se arquivo existe no servidor via SSH
    const [serverRows] = await db.execute(
      'SELECT codigo_servidor FROM streamings WHERE codigo_cliente = ? LIMIT 1',
      [userId]
    );
    
    const serverId = serverRows.length > 0 ? serverRows[0].codigo_servidor : 1;
    const remotePath = `/usr/local/WowzaStreamingEngine/content/${userLogin}/${folder}/${filename}`;
    
    try {
      const fileInfo = await SSHManager.getFileInfo(serverId, remotePath);
      
      if (fileInfo.exists) {
        res.json({
          success: true,
          exists: true,
          path: remotePath,
          info: fileInfo,
          url: `/content/${userLogin}/${folder}/${filename}`
        });
      } else {
        res.json({
          success: false,
        url: `/content${relativePath}`,
          error: 'Arquivo não encontrado no servidor'
        });
      }
    } catch (sshError) {
      res.status(500).json({
        success: false,
        error: 'Erro ao verificar arquivo no servidor',
        details: sshError.message
      });
    }
  } catch (err) {
    console.error('Erro no teste de vídeo:', err);
    res.status(500).json({ error: 'Erro no teste de vídeo', details: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const videoId = req.params.id;
    const userId = req.user.id;
    const userLogin = req.user.email.split('@')[0];

    const [videoRows] = await db.execute(
      'SELECT path_video, video, tamanho_arquivo FROM playlists_videos WHERE codigo = ?',
      [videoId]
    );
    if (videoRows.length === 0) {
      return res.status(404).json({ error: 'Vídeo não encontrado' });
    }

    const video = videoRows[0];

    if (!video.path_video.includes(`/${userLogin}/`)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const [serverRows] = await db.execute(
      `SELECT s.codigo_servidor 
       FROM streamings s 
       WHERE s.codigo_cliente = ? 
       LIMIT 1`,
      [userId]
    );

    const serverId = serverRows.length > 0 ? serverRows[0].codigo_servidor : 1;

    // Obter informações do arquivo antes de deletar
    let fileSize = video.tamanho_arquivo || 0;
    try {
      const remotePath = `/usr/local/WowzaStreamingEngine/content${video.path_video}`;
      
      // Verificar tamanho real do arquivo se não estiver no banco
      if (!fileSize) {
        const fileInfo = await SSHManager.getFileInfo(serverId, remotePath);
        fileSize = fileInfo.exists ? fileInfo.size : 0;
      }
      
      await SSHManager.deleteFile(serverId, remotePath);
      console.log(`✅ Arquivo removido do servidor: ${remotePath}`);
    } catch (fileError) {
      console.warn('Erro ao remover arquivo físico:', fileError.message);
    }

    // Atualizar espaço usado baseado no tamanho real
    if (fileSize > 0) {
      const spaceMB = Math.ceil(fileSize / (1024 * 1024));
      await db.execute(
        'UPDATE streamings SET espaco_usado = GREATEST(espaco_usado - ?, 0) WHERE codigo_cliente = ?',
        [spaceMB, userId]
      );
      console.log(`📊 Espaço liberado: ${spaceMB}MB`);
    }

    await db.execute(
      'DELETE FROM playlists_videos WHERE codigo = ?',
      [videoId]
    );

    res.json({ success: true, message: 'Vídeo removido com sucesso' });
  } catch (err) {
    console.error('Erro ao remover vídeo:', err);
    res.status(500).json({ error: 'Erro ao remover vídeo', details: err.message });
  }
});

module.exports = router;
