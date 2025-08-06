const express = require('express');
const db = require('../config/database');
const authMiddleware = require('../middlewares/authMiddleware');
const VideoSSHManager = require('../config/VideoSSHManager');
const SSHManager = require('../config/SSHManager');
const fs = require('fs').promises;
const path = require('path');
const WowzaStreamingService = require('../config/WowzaStreamingService');

const router = express.Router();

// GET /api/videos-ssh/proxy-stream/:videoId - Stream direto via proxy (otimizado)
router.get('/proxy-stream/:videoId', async (req, res) => {
  try {
    const videoId = req.params.videoId;
    
    // Verificar autenticação
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    if (!token && req.query.token) {
      token = req.query.token;
    }
    
    if (!token) {
      return res.status(401).json({ error: 'Token de acesso requerido' });
    }

    // Verificar e decodificar token
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_super_segura_aqui';
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Decodificar videoId
    let remotePath;
    try {
      remotePath = Buffer.from(videoId, 'base64').toString('utf-8');
    } catch (decodeError) {
      return res.status(400).json({ error: 'ID de vídeo inválido' });
    }

    // Verificar se o caminho pertence ao usuário
    const userLogin = decoded.email ? decoded.email.split('@')[0] : `user_${decoded.userId}`;
    if (!remotePath.includes(`/${userLogin}/`)) {
      return res.status(403).json({ error: 'Acesso negado ao vídeo' });
    }

    // Buscar servidor do usuário
    const [serverRows] = await db.execute(
      'SELECT codigo_servidor FROM streamings WHERE codigo_cliente = ? LIMIT 1',
      [decoded.userId]
    );
    const serverId = serverRows.length > 0 ? serverRows[0].codigo_servidor : 1;

    // Configurar headers otimizados para streaming
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Authorization');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Connection', 'keep-alive');
    
    // Definir Content-Type
    const extension = path.extname(remotePath).toLowerCase();
    switch (extension) {
      case '.mp4': res.setHeader('Content-Type', 'video/mp4'); break;
      case '.avi': res.setHeader('Content-Type', 'video/x-msvideo'); break;
      case '.mov': res.setHeader('Content-Type', 'video/quicktime'); break;
      case '.wmv': res.setHeader('Content-Type', 'video/x-ms-wmv'); break;
      case '.webm': res.setHeader('Content-Type', 'video/webm'); break;
      case '.mkv': res.setHeader('Content-Type', 'video/x-matroska'); break;
      default: res.setHeader('Content-Type', 'video/mp4');
    }
    

    // Otimização: Para arquivos pequenos, usar cache. Para grandes, stream direto
    const { conn } = await SSHManager.getConnection(serverId);
    
    // Obter tamanho do arquivo
    const sizeCommand = `stat -c%s "${remotePath}" 2>/dev/null || echo "0"`;
    const sizeResult = await SSHManager.executeCommand(serverId, sizeCommand);
    const fileSize = parseInt(sizeResult.stdout.trim()) || 0;
    
    if (fileSize === 0) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }

    // Para arquivos muito grandes (>500MB), usar streaming otimizado
    const isLargeFile = fileSize > 500 * 1024 * 1024;
    
    // Suporte a Range requests
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunksize);
      
      // Stream otimizado com range
      const command = isLargeFile ? 
        `dd if="${remotePath}" bs=64k skip=${Math.floor(start/65536)} count=${Math.ceil(chunksize/65536)} 2>/dev/null | dd bs=1 skip=${start%65536} count=${chunksize} 2>/dev/null` :
        `dd if="${remotePath}" bs=1 skip=${start} count=${chunksize} 2>/dev/null`;
        
      conn.exec(command, (err, stream) => {
        if (err) {
          return res.status(500).json({ error: 'Erro ao acessar arquivo' });
        }
        
        // Configurar timeout para streams grandes
        if (isLargeFile) {
          stream.setTimeout(60000); // 60 segundos para arquivos grandes
        }
        
        stream.pipe(res);
        
        stream.on('error', (streamErr) => {
          console.error('Erro no stream:', streamErr);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Erro durante streaming' });
          }
        });
      });
    } else {
      // Stream completo
      res.setHeader('Content-Length', fileSize);
      
      // Para arquivos grandes, usar comando otimizado
      const command = isLargeFile ? `dd if="${remotePath}" bs=64k 2>/dev/null` : `cat "${remotePath}"`;
      
      conn.exec(command, (err, stream) => {
        if (err) {
          return res.status(500).json({ error: 'Erro ao acessar arquivo' });
        }
        
        // Configurar timeout
        if (isLargeFile) {
          stream.setTimeout(120000); // 2 minutos para arquivos grandes
        }
        
        stream.pipe(res);
        
        stream.on('error', (streamErr) => {
          console.error('Erro no stream:', streamErr);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Erro durante streaming' });
          }
        });
      });
    }

  } catch (error) {
    console.error('❌ Erro no proxy stream:', error);
    return res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
});

// GET /api/videos-ssh/list - Lista vídeos do servidor via SSH
router.get('/list', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userLogin = req.user.email ? req.user.email.split('@')[0] : `user_${userId}`;
    const folderName = req.query.folder;

    if (!folderName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nome da pasta é obrigatório' 
      });
    }

    // Buscar servidor do usuário
    const [serverRows] = await db.execute(
      'SELECT codigo_servidor FROM streamings WHERE codigo_cliente = ? LIMIT 1',
      [userId]
    );

    const serverId = serverRows.length > 0 ? serverRows[0].codigo_servidor : 1;

    // Listar vídeos via SSH
    const videos = await VideoSSHManager.listVideosFromServer(serverId, userLogin, folderName);

    // Sincronizar vídeos com a tabela videos
    await syncVideosToDatabase(videos, userLogin, folderName, userId);

    res.json({
      success: true,
      videos: videos,
      folder: folderName,
      server_id: serverId
    });
  } catch (error) {
    console.error('Erro ao listar vídeos SSH:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao listar vídeos do servidor',
      details: error.message 
    });
  }
});

// GET /api/videos-ssh/stream/:videoId - Stream de vídeo via SSH
router.get('/stream/:videoId', async (req, res) => {
  try {
    const videoId = req.params.videoId;
    
    // Verificar autenticação via token no query parameter ou header
    let token = null;
    
    // Verificar token no header Authorization
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    // Verificar token no query parameter (para nova aba)
    if (!token && req.query.token) {
      token = req.query.token;
    }
    
    if (!token) {
      console.log('❌ Token de acesso não fornecido para vídeo SSH:', {
        path: req.path,
        method: req.method,
        headers: Object.keys(req.headers),
        query: Object.keys(req.query)
      });
      return res.status(401).json({ error: 'Token de acesso requerido' });
    }

    // Verificar e decodificar token
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_super_segura_aqui';
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      console.error('Erro de autenticação no vídeo SSH:', jwtError.message);
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Buscar dados do usuário
    let userRows = [];
    if (decoded.tipo === 'revenda') {
      [userRows] = await db.execute(
        'SELECT codigo, nome, email FROM revendas WHERE codigo = ? AND status = 1',
        [decoded.userId]
      );
    } else {
      [userRows] = await db.execute(
        'SELECT codigo, identificacao as nome, email FROM streamings WHERE codigo = ? AND status = 1',
        [decoded.userId]
      );
    }

    if (userRows.length === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    const user = userRows[0];
    const userLogin = user.email ? user.email.split('@')[0] : `user_${user.codigo}`;

    // Decodificar videoId (base64)
    let remotePath;
    try {
      remotePath = Buffer.from(videoId, 'base64').toString('utf-8');
    } catch (decodeError) {
      return res.status(400).json({ error: 'ID de vídeo inválido' });
    }

    console.log(`🎥 Solicitação de stream SSH: ${remotePath} para usuário ${userLogin}`);

    // Verificar se o caminho pertence ao usuário
    if (!remotePath.includes(`/${userLogin}/`)) {
      return res.status(403).json({ error: 'Acesso negado ao vídeo' });
    }

    // Buscar servidor do usuário
    const [serverRows] = await db.execute(
      'SELECT codigo_servidor FROM streamings WHERE codigo_cliente = ? LIMIT 1',
      [user.codigo]
    );

    const serverId = serverRows.length > 0 ? serverRows[0].codigo_servidor : 1;

    // Verificar se arquivo existe no servidor
    const availability = await VideoSSHManager.checkVideoAvailability(serverId, remotePath);
    
    if (!availability.available) {
      return res.status(404).json({ 
        error: 'Vídeo não encontrado',
        details: availability.reason 
      });
    }

    // Configurar headers para streaming de vídeo
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Authorization');
    res.setHeader('Accept-Ranges', 'bytes');
    
    // Definir Content-Type baseado na extensão
    const extension = path.extname(remotePath).toLowerCase();
    switch (extension) {
      case '.mp4':
        res.setHeader('Content-Type', 'video/mp4');
        break;
      case '.avi':
        res.setHeader('Content-Type', 'video/x-msvideo');
        break;
      case '.mov':
        res.setHeader('Content-Type', 'video/quicktime');
        break;
      case '.wmv':
        res.setHeader('Content-Type', 'video/x-ms-wmv');
        break;
      case '.flv':
        res.setHeader('Content-Type', 'video/x-flv');
        break;
      case '.webm':
        res.setHeader('Content-Type', 'video/webm');
        break;
      case '.mkv':
        res.setHeader('Content-Type', 'video/x-matroska');
        break;
      case '.3gp':
        res.setHeader('Content-Type', 'video/3gpp');
        break;
      case '.3g2':
        res.setHeader('Content-Type', 'video/3gpp2');
        break;
      case '.ts':
        res.setHeader('Content-Type', 'video/mp2t');
        break;
      case '.mpg':
      case '.mpeg':
        res.setHeader('Content-Type', 'video/mpeg');
        break;
      case '.ogv':
        res.setHeader('Content-Type', 'video/ogg');
        break;
      case '.m4v':
        res.setHeader('Content-Type', 'video/mp4');
        break;
      case '.asf':
        res.setHeader('Content-Type', 'video/x-ms-asf');
        break;
      default:
        res.setHeader('Content-Type', 'video/mp4');
    }
    
    // Cache para vídeos
    res.setHeader('Cache-Control', 'public, max-age=3600');

    try {
      // Obter stream do vídeo via SSH
      const streamResult = await VideoSSHManager.getVideoStream(serverId, remotePath, videoId);
      
      if (!streamResult.success) {
        throw new Error('Falha ao obter stream do vídeo');
      }

      if (streamResult.type === 'local') {
        // Vídeo foi baixado para cache local, servir arquivo local
        const localPath = streamResult.path;
        
        // Verificar se arquivo local existe
        try {
          const stats = await fs.stat(localPath);
          const fileSize = stats.size;
          
          // Suporte a Range requests para streaming
          const range = req.headers.range;
          if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Content-Length', chunksize);
            
            // Criar stream do arquivo
            const readStream = require('fs').createReadStream(localPath, { start, end });
            readStream.pipe(res);
          } else {
            // Servir arquivo completo
            res.setHeader('Content-Length', fileSize);
            const readStream = require('fs').createReadStream(localPath);
            readStream.pipe(res);
          }
          
          console.log(`✅ Servindo vídeo SSH via cache local: ${path.basename(remotePath)}`);
        } catch (fileError) {
          console.error('Erro ao acessar arquivo local:', fileError);
          return res.status(500).json({ error: 'Erro ao acessar arquivo de vídeo' });
        }
      } else if (streamResult.type === 'proxy') {
        // Usar proxy direto para arquivos grandes
        const proxyUrl = `/api/videos-ssh/proxy-stream/${videoId}?token=${encodeURIComponent(token)}`;
        console.log(`🔄 Redirecionando para proxy direto: ${proxyUrl}`);
        res.redirect(proxyUrl);
      } else {
        // Fallback: redirecionar para URL externa do Wowza
        const isProduction = process.env.NODE_ENV === 'production';
        const wowzaHost = isProduction ? 'samhost.wcore.com.br' : '51.222.156.223';
        const wowzaUser = 'admin';
        const wowzaPassword = 'FK38Ca2SuE6jvJXed97VMn';
        
        // Construir caminho relativo para o Wowza
        const relativePath = remotePath.replace('/usr/local/WowzaStreamingEngine/content', '');
        const externalUrl = `http://${wowzaUser}:${wowzaPassword}@${wowzaHost}:6980/content${relativePath}`;
        
        console.log(`🔄 Redirecionando para Wowza externo: ${externalUrl}`);
        res.redirect(externalUrl);
      }
    } catch (streamError) {
      console.error('Erro ao obter stream SSH:', streamError);
      return res.status(500).json({ 
        error: 'Erro ao acessar vídeo no servidor',
        details: streamError.message 
      });
    }
  } catch (error) {
    console.error('❌ Erro no stream SSH:', error);
    return res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
});

// GET /api/videos-ssh/info/:videoId - Informações do vídeo
router.get('/info/:videoId', authMiddleware, async (req, res) => {
  try {
    const videoId = req.params.videoId;
    const userId = req.user.id;
    const userLogin = req.user.email ? req.user.email.split('@')[0] : `user_${userId}`;

    // Decodificar videoId
    let remotePath;
    try {
      remotePath = Buffer.from(videoId, 'base64').toString('utf-8');
    } catch (decodeError) {
      return res.status(400).json({ error: 'ID de vídeo inválido' });
    }

    // Verificar se o caminho pertence ao usuário
    if (!remotePath.includes(`/${userLogin}/`)) {
      return res.status(403).json({ error: 'Acesso negado ao vídeo' });
    }

    // Buscar servidor do usuário
    const [serverRows] = await db.execute(
      'SELECT codigo_servidor FROM streamings WHERE codigo_cliente = ? LIMIT 1',
      [userId]
    );

    const serverId = serverRows.length > 0 ? serverRows[0].codigo_servidor : 1;

    // Obter informações do vídeo
    const videoInfo = await VideoSSHManager.getVideoInfo(serverId, remotePath);

    if (!videoInfo) {
      return res.status(404).json({ 
        success: false, 
        error: 'Vídeo não encontrado' 
      });
    }

    res.json({
      success: true,
      video_info: videoInfo
    });
  } catch (error) {
    console.error('Erro ao obter informações do vídeo:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao obter informações do vídeo',
      details: error.message 
    });
  }
});

// DELETE /api/videos-ssh/:videoId - Remove vídeo do servidor
router.delete('/:videoId', authMiddleware, async (req, res) => {
  try {
    const videoId = req.params.videoId;
    const userId = req.user.id;
    const userLogin = req.user.email ? req.user.email.split('@')[0] : `user_${userId}`;

    // Decodificar videoId
    let remotePath;
    try {
      remotePath = Buffer.from(videoId, 'base64').toString('utf-8');
    } catch (decodeError) {
      return res.status(400).json({ error: 'ID de vídeo inválido' });
    }

    // Verificar se o caminho pertence ao usuário
    if (!remotePath.includes(`/${userLogin}/`)) {
      return res.status(403).json({ error: 'Acesso negado ao vídeo' });
    }

    // Buscar servidor do usuário
    const [serverRows] = await db.execute(
      'SELECT codigo_servidor FROM streamings WHERE codigo_cliente = ? LIMIT 1',
      [userId]
    );

    const serverId = serverRows.length > 0 ? serverRows[0].codigo_servidor : 1;

    // Remover vídeo do servidor
    const result = await VideoSSHManager.deleteVideoFromServer(serverId, remotePath);

    if (result.success) {
      // Também remover do banco de dados se existir
      try {
        await db.execute(
          'DELETE FROM playlists_videos WHERE path_video LIKE ?',
          [`%${path.basename(remotePath)}`]
        );
      } catch (dbError) {
        console.warn('Aviso: Erro ao remover do banco:', dbError.message);
      }

      res.json({
        success: true,
        message: 'Vídeo removido com sucesso do servidor'
      });
    } else {
      throw new Error('Falha ao remover vídeo do servidor');
    }
  } catch (error) {
    console.error('Erro ao remover vídeo SSH:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao remover vídeo do servidor',
      details: error.message 
    });
  }
});

// PUT /api/videos-ssh/:videoId/rename - Renomear vídeo no servidor
router.put('/:videoId/rename', authMiddleware, async (req, res) => {
  try {
    const videoId = req.params.videoId;
    const { novo_nome } = req.body;
    const userId = req.user.id;
    const userLogin = req.user.email ? req.user.email.split('@')[0] : `user_${userId}`;

    if (!novo_nome) {
      return res.status(400).json({ error: 'Novo nome é obrigatório' });
    }

    // Decodificar videoId
    let remotePath;
    try {
      remotePath = Buffer.from(videoId, 'base64').toString('utf-8');
    } catch (decodeError) {
      return res.status(400).json({ error: 'ID de vídeo inválido' });
    }

    // Verificar se o caminho pertence ao usuário
    if (!remotePath.includes(`/${userLogin}/`)) {
      return res.status(403).json({ error: 'Acesso negado ao vídeo' });
    }

    // Buscar servidor do usuário
    const [serverRows] = await db.execute(
      'SELECT codigo_servidor FROM streamings WHERE codigo_cliente = ? LIMIT 1',
      [userId]
    );

    const serverId = serverRows.length > 0 ? serverRows[0].codigo_servidor : 1;

    // Construir novo caminho
    const directory = path.dirname(remotePath);
    const extension = path.extname(remotePath);
    const newRemotePath = path.join(directory, `${novo_nome}${extension}`);

    // Renomear arquivo no servidor
    const command = `mv "${remotePath}" "${newRemotePath}"`;
    await SSHManager.executeCommand(serverId, command);

    console.log(`✅ Vídeo renomeado: ${remotePath} -> ${newRemotePath}`);

    res.json({
      success: true,
      message: 'Vídeo renomeado com sucesso',
      new_path: newRemotePath
    });
  } catch (error) {
    console.error('Erro ao renomear vídeo SSH:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao renomear vídeo no servidor',
      details: error.message 
    });
  }
});

// GET /api/videos-ssh/cache/status - Status do cache
router.get('/cache/status', authMiddleware, async (req, res) => {
  try {
    const cacheStatus = await VideoSSHManager.getCacheStatus();
    
    res.json({
      success: true,
      cache: cacheStatus
    });
  } catch (error) {
    console.error('Erro ao obter status do cache:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao obter status do cache',
      details: error.message 
    });
  }
});

// POST /api/videos-ssh/cache/clear - Limpar cache
router.post('/cache/clear', authMiddleware, async (req, res) => {
  try {
    const result = await VideoSSHManager.clearCache();
    
    res.json({
      success: true,
      message: `Cache limpo: ${result.removedFiles} arquivos removidos`,
      removed_files: result.removedFiles
    });
  } catch (error) {
    console.error('Erro ao limpar cache:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao limpar cache',
      details: error.message 
    });
  }
});

// GET /api/videos-ssh/folders/:folderId/usage - Uso da pasta
router.get('/folders/:folderId/usage', authMiddleware, async (req, res) => {
  try {
    const folderId = req.params.folderId;
    const userId = req.user.id;

    // Buscar dados da pasta
    const [folderRows] = await db.execute(
      'SELECT identificacao, espaco, espaco_usado, codigo_servidor FROM streamings WHERE codigo = ? AND codigo_cliente = ?',
      [folderId, userId]
    );

    if (folderRows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Pasta não encontrada' 
      });
    }

    const folder = folderRows[0];
    
    // Recalcular uso real baseado nos vídeos no banco
    const [videoUsageRows] = await db.execute(
      `SELECT COALESCE(SUM(CEIL(tamanho_arquivo / (1024 * 1024))), 0) as real_used_mb
       FROM playlists_videos 
       WHERE path_video LIKE ?`,
      [`%/${folder.identificacao}/%`]
    );
    
    const realUsedMB = videoUsageRows[0]?.real_used_mb || 0;
    const databaseUsedMB = folder.espaco_usado || 0;
    const totalMB = folder.espaco || 1000;
    
    // Usar o maior valor entre banco e cálculo real
    const usedMB = Math.max(realUsedMB, databaseUsedMB);
    const percentage = Math.round((usedMB / totalMB) * 100);
    const availableMB = totalMB - usedMB;
    
    // Atualizar banco com valor correto se houver diferença significativa
    if (Math.abs(usedMB - databaseUsedMB) > 5) {
      await db.execute(
        'UPDATE streamings SET espaco_usado = ? WHERE codigo = ?',
        [usedMB, folderId]
      );
      console.log(`📊 Uso de espaço atualizado para pasta ${folder.identificacao}: ${usedMB}MB`);
    }

    res.json({
      success: true,
      usage: {
        used: usedMB,
        total: totalMB,
        percentage: percentage,
        available: availableMB,
        database_used: databaseUsedMB,
        real_used: realUsedMB,
        last_updated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Erro ao obter uso da pasta:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao obter uso da pasta',
      details: error.message 
    });
  }
});

// POST /api/videos-ssh/folders/:folderId/sync - Sincronizar pasta com servidor
router.post('/folders/:folderId/sync', authMiddleware, async (req, res) => {
  try {
    const folderId = req.params.folderId;
    const userId = req.user.id;
    const userLogin = req.user.email ? req.user.email.split('@')[0] : `user_${userId}`;

    // Buscar dados da pasta
    const [folderRows] = await db.execute(
      'SELECT identificacao, codigo_servidor FROM streamings WHERE codigo = ? AND codigo_cliente = ?',
      [folderId, userId]
    );

    if (folderRows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Pasta não encontrada' 
      });
    }

    const folder = folderRows[0];
    const serverId = folder.codigo_servidor || 1;
    const folderName = folder.identificacao;

    // Listar vídeos do servidor
    const sshVideos = await VideoSSHManager.listVideosFromServer(serverId, userLogin, folderName);
    
    // Sincronizar com a tabela videos
    await syncVideosToDatabase(sshVideos, userLogin, folderName, userId);
    
    // Limpar arquivos órfãos
    const cleanupResult = await VideoSSHManager.cleanupOrphanedFiles(serverId, userLogin);
    
    // Garantir que diretório existe
    await SSHManager.createUserDirectory(serverId, userLogin);
    await SSHManager.createUserFolder(serverId, userLogin, folderName);

    res.json({
      success: true,
      message: `Pasta ${folderName} sincronizada com sucesso. ${sshVideos.length} vídeo(s) processado(s).`,
      videos_synced: sshVideos.length,
      cleanup: cleanupResult
    });
  } catch (error) {
    console.error('Erro ao sincronizar pasta:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao sincronizar pasta com servidor',
      details: error.message 
    });
  }
});

// Função para sincronizar vídeos SSH com a tabela videos
async function syncVideosToDatabase(sshVideos, userLogin, folderName, userId) {
  try {
    console.log(`🔄 Sincronizando ${sshVideos.length} vídeos SSH com o banco de dados...`);
    
    for (const video of sshVideos) {
      try {
        // Verificar se o vídeo já existe na tabela videos
        const [existingRows] = await db.execute(
          'SELECT id FROM videos WHERE nome = ? AND url LIKE ?',
          [video.nome, `%${userLogin}/${folderName}%`]
        );

        if (existingRows.length === 0) {
          // Construir URL correta para o banco
          const videoUrl = `/content/${userLogin}/${folderName}/${video.nome}`;
          
          // Buscar ou criar playlist padrão para vídeos SSH
          let playlistId = await getOrCreateSSHPlaylist(userId, folderName);
          
          // Inserir vídeo na tabela videos
          await db.execute(
            `INSERT INTO videos (nome, descricao, url, duracao, playlist_id, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              video.nome,
              `Vídeo sincronizado via SSH da pasta ${folderName}`,
              videoUrl,
              video.duration || 0,
              playlistId
            ]
          );
          
          console.log(`✅ Vídeo ${video.nome} sincronizado com o banco`);
        }
      } catch (videoError) {
        console.error(`Erro ao sincronizar vídeo ${video.nome}:`, videoError);
      }
    }
    
    console.log(`✅ Sincronização concluída para pasta ${folderName}`);
  } catch (error) {
    console.error('Erro na sincronização com banco:', error);
  }
}

// Função para obter ou criar playlist padrão para vídeos SSH
async function getOrCreateSSHPlaylist(userId, folderName) {
  try {
    const playlistName = `SSH - ${folderName}`;
    
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

    console.log(`📁 Playlist SSH criada: ${playlistName} (ID: ${result.insertId})`);
    return result.insertId;
  } catch (error) {
    console.error('Erro ao criar playlist SSH:', error);
    return 1; // Fallback para playlist padrão
  }
}

module.exports = router;