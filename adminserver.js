const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const os = require('os');
const { execSync } = require('child_process');

// ============================================================
// 路径配置
// ============================================================
const PROJECT_ROOT = __dirname;
const CONTENT_DIR = path.join(PROJECT_ROOT, 'content');
const ADMIN_PUBLIC_DIR = path.join(PROJECT_ROOT, 'adminpublic');
const ADMIN_CONFIG_PATH = path.join(PROJECT_ROOT, 'adminconfig.json');
const MEMORY_CACHE_PATH = path.join(PROJECT_ROOT, 'memorycache.json');
const LOG_DIR = path.join(PROJECT_ROOT, 'logs');
const ADMIN_PUB_KEY_PATH = path.join(PROJECT_ROOT, 'admin.pub');

// 确保必要目录存在
if (!fs.existsSync(CONTENT_DIR)) {
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
}
if (!fs.existsSync(ADMIN_PUBLIC_DIR)) {
  fs.mkdirSync(ADMIN_PUBLIC_DIR, { recursive: true });
}
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ============================================================
// 日志函数
// ============================================================
function adminLog(message, type = 'INFO') {
  const timestamp = new Date().toLocaleString('zh-CN', { hour12: false });
  console.log(`[${timestamp}] [ADMIN] [${type}] ${message}`);
}

// ============================================================
// 读取后台配置
// ============================================================
function getAdminConfig() {
  try {
    if (!fs.existsSync(ADMIN_CONFIG_PATH)) {
      const defaultConfig = {
        background: null,
        adminPort: 3002,
        https: { enabled: 'auto', keyPath: 'sslkey/privkey.pem', certPath: 'sslkey/fullchain.pem' },
        session: { timeout: 604800 },
        title: '博客管理后台',
        version: 'MinecraftSniper 20260825 EOL'
      };
      fs.writeFileSync(ADMIN_CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      adminLog('adminconfig.json 已自动创建默认配置', 'INFO');
      return defaultConfig;
    }
    const raw = fs.readFileSync(ADMIN_CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    adminLog('读取 adminconfig.json 失败: ' + err.message, 'ERROR');
    return null;
  }
}

function isValidPort(port) {
  return Number.isInteger(port) && port > 0 && port < 65536;
}

// ============================================================
// 缓存配置读取
// ============================================================
function getMemoryCacheConfig() {
  try {
    const raw = fs.readFileSync(MEMORY_CACHE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { enable: 'auto', maxMemoryMB: 50 };
  }
}

function saveMemoryCacheConfig(config) {
  fs.writeFileSync(MEMORY_CACHE_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

// ============================================================
// Markdown 文件工具（列出文件，无需编码转换，直接使用原始文件名）
// ============================================================
function listMdFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const fullPath = path.join(dirPath, f);
      let content = '';
      try {
        content = fs.readFileSync(fullPath, 'utf-8');
      } catch (e) {
        adminLog(`读取文件 ${f} 失败: ${e.message}`, 'WARN');
        return null;
      }

      const id = f.replace('.md', '');
      let title = id;
      let draft = false;
      let date = '';
      let words = 0;

      if (content.startsWith('---')) {
        const endIdx = content.indexOf('---', 3);
        if (endIdx > 0) {
          const fm = content.substring(3, endIdx).trim();
          const titleMatch = fm.match(/title:\s*(.+)/);
          if (titleMatch) title = titleMatch[1].trim();
          const draftMatch = fm.match(/draft:\s*(true|false)/);
          if (draftMatch) draft = draftMatch[1] === 'true';
        }
      }

      const dateMatch = id.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) date = dateMatch[1];

      const textLength = content.replace(/\n/g, ' ').length;
      words = Math.round(textLength / 100) / 10 + 'k';

      return {
        id: id,
        title: title,
        date: date,
        words: words,
        draft: draft,
        filename: f
      };
    })
    .filter(item => item !== null)
    .reverse();
}

// ============================================================
// 公钥管理
// ============================================================
function getPublicKey() {
  try {
    if (fs.existsSync(ADMIN_PUB_KEY_PATH)) {
      return fs.readFileSync(ADMIN_PUB_KEY_PATH, 'utf-8').trim();
    }
    return null;
  } catch {
    return null;
  }
}

function savePublicKey(pubKey) {
  fs.writeFileSync(ADMIN_PUB_KEY_PATH, pubKey, 'utf-8');
}

function getKeyFingerprint(pubKey) {
  const hash = crypto.createHash('sha256').update(pubKey).digest('hex');
  return 'SHA256:' + hash.match(/.{2}/g).join(':');
}

function verifyPrivateKey(privateKey) {
  const pubKey = getPublicKey();
  if (!pubKey) return false;
  try {
    const testData = Buffer.from('MinecraftSniperAuthTest');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(testData);
    sign.end();
    const signature = sign.sign(privateKey, 'base64');
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(testData);
    verify.end();
    return verify.verify(pubKey, signature, 'base64');
  } catch {
    return false;
  }
}

function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return { publicKey, privateKey };
}

// ============================================================
// JWT 认证
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET || 'minecraft-sniper-blog-secret-key-2026';

function generateToken(expiry) {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + expiry,
    iat: Math.floor(Date.now() / 1000)
  };
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payloadEncoded}`)
    .digest('base64url');
  return `${header}.${payloadEncoded}.${signature}`;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payloadEncoded, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${payloadEncoded}`)
      .digest('base64url');
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!token) {
    return res.status(401).json({ error: '未提供认证 Token' });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(403).json({ error: 'Token 无效或已过期' });
  }
  next();
}

// ============================================================
// 使用 multer 处理文件上传
// ============================================================
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // 只允许 .md 文件
    if (file.originalname.endsWith('.md')) {
      cb(null, true);
    } else {
      cb(new Error('只支持 .md 文件'), false);
    }
  }
});

// ============================================================
// 通用上传处理（修复中文文件名：latin1 → UTF-8）
// ============================================================
function handleMulterUpload(req, res, targetDir) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      adminLog('multer 错误: ' + err.message, 'ERROR');
      return res.status(400).json({ success: false, message: err.message });
    }
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: '未上传文件' });
    }

    // ★★★ 核心修复：将 originalname 从 latin1 解码为 UTF-8 ★★★
    let filename = Buffer.from(file.originalname, 'latin1').toString('utf8');
    // 过滤非法字符
    filename = filename.replace(/[\/\\:*?"<>|]/g, '_');

    if (!filename.endsWith('.md')) {
      return res.status(400).json({ success: false, message: '只支持 .md 文件' });
    }

    const targetPath = path.join(targetDir, filename);
    try {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(targetPath, file.buffer);
      adminLog(`文件上传成功: ${filename} (字节: ${file.buffer.length})`, 'INFO');
      return res.json({ success: true, filename });
    } catch (writeErr) {
      adminLog('保存文件失败: ' + writeErr.message, 'ERROR');
      return res.status(500).json({ success: false, message: '保存文件失败: ' + writeErr.message });
    }
  });
}

// ============================================================
// 系统监控数据采集（跨平台，CPU 采用时间采样法）
// ============================================================

let lastCpuTimes = null;
let lastCpuTimestamp = null;

function getCpuUsage() {
  try {
    const cpus = os.cpus();
    if (!cpus || cpus.length === 0) {
      const loadAvg = os.loadavg();
      return {
        usage: Math.min(100, Math.round((loadAvg[0] / 1) * 100)) || 0,
        loadavg: loadAvg.map(v => v.toFixed(2))
      };
    }

    let totalUser = 0, totalSys = 0, totalIdle = 0, totalNice = 0, totalIrq = 0;
    for (const cpu of cpus) {
      totalUser += cpu.times.user;
      totalSys += cpu.times.sys;
      totalIdle += cpu.times.idle;
      totalNice += cpu.times.nice || 0;
      totalIrq += cpu.times.irq || 0;
    }
    const total = totalUser + totalSys + totalIdle + totalNice + totalIrq;
    const idle = totalIdle;

    const now = Date.now();

    if (lastCpuTimes === null) {
      lastCpuTimes = { total, idle };
      lastCpuTimestamp = now;
      return { usage: 0, loadavg: os.loadavg().map(v => v.toFixed(2)) };
    }

    const deltaTotal = total - lastCpuTimes.total;
    const deltaIdle = idle - lastCpuTimes.idle;
    const deltaUsage = deltaTotal - deltaIdle;
    const usage = deltaTotal > 0 ? Math.round((deltaUsage / deltaTotal) * 100) : 0;

    lastCpuTimes = { total, idle };
    lastCpuTimestamp = now;

    return {
      usage: Math.min(100, Math.max(0, usage)),
      loadavg: os.loadavg().map(v => v.toFixed(2))
    };
  } catch (err) {
    adminLog('获取 CPU 信息失败: ' + err.message, 'WARN');
    return { usage: 0, loadavg: ['0.00', '0.00', '0.00'] };
  }
}

function getDiskUsage() {
    try {
        // 使用 __dirname 确保统计的是 adminserver.js 所在的磁盘分区
        const stats = fs.statfsSync(__dirname);
        const total = stats.blocks * stats.bsize;
        const free = stats.bfree * stats.bsize;
        const used = total - free;

        // 防止除以零或非法值
        if (total === 0) {
            throw new Error('无法获取磁盘信息（total = 0）');
        }

        return {
            totalGB: (total / 1024 / 1024 / 1024).toFixed(1),
            usedGB: (used / 1024 / 1024 / 1024).toFixed(1),
            usedPercent: Math.round((used / total) * 100)
        };
    } catch (err) {
        adminLog('获取磁盘信息失败（statfs）: ' + err.message, 'WARN');
        // 降级返回占位数据，避免前端显示异常
        return {
            totalGB: '--',
            usedGB: '--',
            usedPercent: 0
        };
    }
}

let networkSnapshot = null;
let networkSampleTime = null;

function getNetworkUsage() {
  try {
    let totalRx = 0, totalTx = 0;
    if (process.platform === 'linux') {
      const netDev = fs.readFileSync('/proc/net/dev', 'utf-8');
      const lines = netDev.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*(\w+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
        if (match) {
          const iface = match[1];
          if (iface === 'lo' || iface === 'docker0' || iface.startsWith('veth')) continue;
          totalRx += parseInt(match[2]) || 0;
          totalTx += parseInt(match[3]) || 0;
        }
      }
    } else if (process.platform === 'win32') {
      try {
        const output = execSync('powershell -Command "Get-NetAdapterStatistics | Where-Object {$_.Name -notlike \'*Loopback*\'} | Select-Object ReceivedBytes, SentBytes"', { encoding: 'utf8', timeout: 3000 });
        const lines = output.trim().split('\n').filter(l => l.trim() && !l.startsWith('Received'));
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2) {
            const rx = parseFloat(parts[0]) || 0;
            const tx = parseFloat(parts[1]) || 0;
            totalRx += rx;
            totalTx += tx;
          }
        }
      } catch (e) {
        try {
          const output = execSync('netstat -e', { encoding: 'utf8', timeout: 3000 });
          const lines = output.split('\n');
          for (const line of lines) {
            if (line.includes('Bytes')) {
              const nums = line.match(/(\d+)/g);
              if (nums && nums.length >= 2) {
                totalRx = parseInt(nums[0]) || 0;
                totalTx = parseInt(nums[1]) || 0;
                break;
              }
            }
          }
        } catch (e2) {}
      }
    } else {
      return { speed: 0, rx: 0, tx: 0 };
    }

    const now = Date.now();
    let speed = 0, rx = 0, tx = 0;
    if (networkSnapshot !== null && networkSampleTime !== null) {
      const timeDiff = (now - networkSampleTime) / 1000;
      if (timeDiff > 0) {
        const rxDiff = totalRx - networkSnapshot.rx;
        const txDiff = totalTx - networkSnapshot.tx;
        rx = (rxDiff / timeDiff) * 8 / 1024 / 1024;
        tx = (txDiff / timeDiff) * 8 / 1024 / 1024;
        speed = Math.max(rx, tx);
        if (speed < 0.01) speed = 0;
        if (speed > 10000) speed = 10000;
      }
    }
    networkSnapshot = { rx: totalRx, tx: totalTx };
    networkSampleTime = now;
    return {
      speed: Math.round(speed * 10) / 10,
      rx: Math.round(rx * 10) / 10,
      tx: Math.round(tx * 10) / 10
    };
  } catch (err) {
    adminLog('获取网络信息失败: ' + err.message, 'WARN');
    return { speed: 0, rx: 0, tx: 0 };
  }
}

function calculateCacheSize() {
  try {
    const postsDir = path.join(CONTENT_DIR, 'posts');
    const momentsDir = path.join(CONTENT_DIR, 'moments');
    let totalSize = 0;
    if (fs.existsSync(postsDir)) {
      const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));
      files.forEach(f => {
        const stat = fs.statSync(path.join(postsDir, f));
        totalSize += stat.size;
      });
    }
    if (fs.existsSync(momentsDir)) {
      const files = fs.readdirSync(momentsDir).filter(f => f.endsWith('.md'));
      files.forEach(f => {
        const stat = fs.statSync(path.join(momentsDir, f));
        totalSize += stat.size;
      });
    }
    return Math.round(totalSize / 1024 / 1024 * 100) / 100;
  } catch {
    return 0;
  }
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
}

// ============================================================
// HTTPS 启动决策
// ============================================================
function resolveHttpsMode(adminConfig) {
  const httpsConfig = adminConfig.https || {};
  const mode = httpsConfig.enabled || 'auto';
  const keyFile = httpsConfig.keyPath || 'sslkey/privkey.pem';
  const certFile = httpsConfig.certPath || 'sslkey/fullchain.pem';
  const keyPath = path.join(PROJECT_ROOT, keyFile);
  const certPath = path.join(PROJECT_ROOT, certFile);

  const keyExists = fs.existsSync(keyPath);
  const certExists = fs.existsSync(certPath);
  const bothExist = keyExists && certExists;

  if (mode === 'true') {
    if (!bothExist) {
      adminLog('HTTPS 强制启用但证书文件缺失', 'ERROR');
      adminLog('  私钥: ' + keyPath + (keyExists ? ' ✅' : ' ❌ 不存在'), 'ERROR');
      adminLog('  证书: ' + certPath + (certExists ? ' ✅' : ' ❌ 不存在'), 'ERROR');
      return { enabled: false, error: true };
    }
    adminLog('HTTPS 强制启用，证书文件已加载', 'INFO');
    return { enabled: true, keyPath, certPath };
  }

  if (mode === 'false') {
    adminLog('HTTPS 已禁用（用户配置）', 'INFO');
    return { enabled: false };
  }

  if (bothExist) {
    adminLog('HTTPS Auto 模式：检测到证书文件，启用 HTTPS', 'INFO');
    adminLog('  私钥: ' + keyPath, 'INFO');
    adminLog('  证书: ' + certPath, 'INFO');
    return { enabled: true, keyPath, certPath };
  } else {
    adminLog('HTTPS Auto 模式：未检测到完整证书，降级为 HTTP', 'WARN');
    if (!keyExists) adminLog('  缺失: ' + keyFile, 'WARN');
    if (!certExists) adminLog('  缺失: ' + certFile, 'WARN');
    return { enabled: false };
  }
}

// ============================================================
// 创建管理服务
// ============================================================
function createAdminServer() {
  const adminConfig = getAdminConfig();
  if (!adminConfig) {
    adminLog('adminconfig.json 读取失败，管理服务无法启动', 'ERROR');
    return null;
  }

  const adminPort = adminConfig.adminPort;
  if (!isValidPort(adminPort)) {
    adminLog('adminconfig.json 中 adminPort 无效或未配置，管理服务不启动', 'WARN');
    return null;
  }

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const httpsDecision = resolveHttpsMode(adminConfig);
  if (httpsDecision.error) {
    adminLog('HTTPS 配置错误，管理服务不启动', 'ERROR');
    return null;
  }

  // HTTPS 强制跳转（仅 API 路由）
  app.use((req, res, next) => {
    if (httpsDecision.enabled) {
      const forwardedProto = req.headers['x-forwarded-proto'];
      const isHttps = forwardedProto === 'https' || req.protocol === 'https';
      if (!isHttps) {
        if (req.path.startsWith('/api/admin')) {
          return res.status(403).json({ error: 'HTTPS Required' });
        }
        // 静态资源放行（或可重定向）
      }
    }
    next();
  });

  app.get('/', (req, res) => {
    res.redirect('/login.html');
  });

  // ============================================================
  // 公共接口（无需认证）
  // ============================================================
  app.get('/api/admin/config', (req, res) => {
    try {
      const config = getAdminConfig();
      res.json({
        background: config.background || null,
        title: config.title || '博客管理后台',
        version: config.version || '1.0'
      });
    } catch (err) {
      adminLog('GET /api/admin/config 错误: ' + err.message, 'ERROR');
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/verify', (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
      if (!token) return res.json({ valid: false });
      const payload = verifyToken(token);
      res.json({ valid: !!payload });
    } catch (err) {
      adminLog('GET /api/admin/verify 错误: ' + err.message, 'ERROR');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/auth', (req, res) => {
    try {
      const { privateKey } = req.body;
      if (!privateKey) {
        return res.status(400).json({ success: false, message: '未提供私钥' });
      }
      const isValid = verifyPrivateKey(privateKey);
      if (!isValid) {
        return res.status(401).json({ success: false, message: '私钥验证失败' });
      }
      const expiry = adminConfig.session?.timeout || 604800;
      const token = generateToken(expiry);
      adminLog('管理员登录成功', 'INFO');
      res.json({ success: true, token });
    } catch (err) {
      adminLog('POST /api/admin/auth 错误: ' + err.message, 'ERROR');
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/admin/key/status', (req, res) => {
    try {
      const pubKey = getPublicKey();
      if (pubKey) {
        res.json({ configured: true, fingerprint: getKeyFingerprint(pubKey) });
      } else {
        res.json({ configured: false });
      }
    } catch (err) {
      adminLog('GET /api/admin/key/status 错误: ' + err.message, 'ERROR');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/key/generate', (req, res) => {
    const pubKey = getPublicKey();
    if (pubKey) {
      return authenticateToken(req, res, () => {
        try {
          const { publicKey, privateKey } = generateKeyPair();
          savePublicKey(publicKey);
          adminLog('新密钥对已生成（认证用户）', 'INFO');
          res.json({
            success: true,
            publicKey: publicKey,
            privateKey: privateKey,
            fingerprint: getKeyFingerprint(publicKey)
          });
        } catch (err) {
          adminLog('生成密钥失败: ' + err.message, 'ERROR');
          res.status(500).json({ success: false, message: err.message });
        }
      });
    } else {
      try {
        const { publicKey, privateKey } = generateKeyPair();
        savePublicKey(publicKey);
        adminLog('首次初始化，新密钥对已生成', 'INFO');
        res.json({
          success: true,
          publicKey: publicKey,
          privateKey: privateKey,
          fingerprint: getKeyFingerprint(publicKey)
        });
      } catch (err) {
        adminLog('首次生成密钥失败: ' + err.message, 'ERROR');
        res.status(500).json({ success: false, message: err.message });
      }
    }
  });

  // ============================================================
  // 需要认证的接口
  // ============================================================
  const POSTS_DIR = path.join(CONTENT_DIR, 'posts');
  if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });

  app.get('/api/admin/posts', authenticateToken, (req, res) => {
    try {
      const posts = listMdFiles(POSTS_DIR);
      res.json({ posts });
    } catch (err) {
      adminLog('GET /api/admin/posts 错误: ' + err.message, 'ERROR');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/posts/upload', authenticateToken, (req, res) => {
    handleMulterUpload(req, res, POSTS_DIR);
  });

  app.get('/api/admin/posts/:id/download', authenticateToken, (req, res) => {
    try {
      const { id } = req.params;
      const filename = id + '.md';
      const filePath = path.join(POSTS_DIR, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '文章不存在' });
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      res.json({ content, filename });
    } catch (err) {
      adminLog('GET /api/admin/posts/:id/download 错误: ' + err.message, 'ERROR');
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/admin/posts/:id', authenticateToken, (req, res) => {
    try {
      const { id } = req.params;
      const filename = id + '.md';
      const filePath = path.join(POSTS_DIR, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '文章不存在' });
      }
      fs.unlinkSync(filePath);
      adminLog('文章删除成功: ' + filename, 'INFO');
      res.json({ success: true });
    } catch (err) {
      adminLog('DELETE /api/admin/posts/:id 错误: ' + err.message, 'ERROR');
      res.status(500).json({ error: err.message });
    }
  });

  const MOMENTS_DIR = path.join(CONTENT_DIR, 'moments');
  if (!fs.existsSync(MOMENTS_DIR)) fs.mkdirSync(MOMENTS_DIR, { recursive: true });

  app.get('/api/admin/moments', authenticateToken, (req, res) => {
    try {
      const moments = listMdFiles(MOMENTS_DIR).map(m => ({ ...m, content: m.title }));
      res.json({ moments });
    } catch (err) {
      adminLog('GET /api/admin/moments 错误: ' + err.message, 'ERROR');
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/moments/upload', authenticateToken, (req, res) => {
    handleMulterUpload(req, res, MOMENTS_DIR);
  });

  app.get('/api/admin/moments/:id/download', authenticateToken, (req, res) => {
    try {
      const { id } = req.params;
      const filename = id + '.md';
      const filePath = path.join(MOMENTS_DIR, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '动态不存在' });
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      res.json({ content, filename });
    } catch (err) {
      adminLog('GET /api/admin/moments/:id/download 错误: ' + err.message, 'ERROR');
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/admin/moments/:id', authenticateToken, (req, res) => {
    try {
      const { id } = req.params;
      const filename = id + '.md';
      const filePath = path.join(MOMENTS_DIR, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '动态不存在' });
      }
      fs.unlinkSync(filePath);
      adminLog('动态删除成功: ' + filename, 'INFO');
      res.json({ success: true });
    } catch (err) {
      adminLog('DELETE /api/admin/moments/:id 错误: ' + err.message, 'ERROR');
      res.status(500).json({ error: err.message });
    }
  });

  // ---- 内存缓存管理 ----
  app.get('/api/admin/cache', authenticateToken, (req, res) => {
    try {
      const config = getMemoryCacheConfig();
      const memManager = require('./memorycache');
      const decision = memManager.getCacheDecision();
      const size = memManager.calculateCacheSize({
        config: {},
        home: '',
        about: '',
        posts: [],
        moments: []
      });
      res.json({
        config: config,
        runtime: {
          enabled: decision.useCache,
          limit: decision.limitMB,
          size: size,
          mode: decision.mode
        }
      });
    } catch (err) {
      adminLog('GET /api/admin/cache 错误: ' + err.message, 'ERROR');
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/admin/cache', authenticateToken, (req, res) => {
    try {
      const { enable, maxMemoryMB } = req.body;
      if (!['true', 'false', 'auto'].includes(enable)) {
        return res.status(400).json({ success: false, message: 'enable 必须是 true/false/auto' });
      }
      const config = getMemoryCacheConfig();
      config.enable = enable;
      if (enable === 'true' && maxMemoryMB !== undefined) {
        config.maxMemoryMB = parseInt(maxMemoryMB) || 50;
      }
      saveMemoryCacheConfig(config);
      adminLog('缓存配置已更新', 'INFO');
      res.json({ success: true });
    } catch (err) {
      adminLog('PUT /api/admin/cache 错误: ' + err.message, 'ERROR');
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ---- 性能监控 ----
  app.get('/api/admin/status', authenticateToken, (req, res) => {
    try {
      const data = getStatusData();
      res.json(data);
    } catch (err) {
      adminLog('GET /api/admin/status 错误: ' + err.message, 'ERROR');
      adminLog('堆栈: ' + err.stack, 'DEBUG');
      res.status(500).json({ error: err.message });
    }
  });

  // ---- SSE 实时推送 ----
  app.get('/api/admin/status/stream', (req, res) => {
    const token = req.query.token;
    if (!token) {
      return res.status(401).json({ error: '未提供 Token' });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return res.status(403).json({ error: 'Token 无效或已过期' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const intervalId = setInterval(() => {
      try {
        const data = getStatusData();
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (err) {
        adminLog('SSE 推送错误: ' + err.message, 'ERROR');
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(intervalId);
      res.end();
    });
  });

  // ---- 辅助函数 ----
  function getStatusData() {
    const memManager = require('./memorycache');
    const memInfo = memManager.getSystemMemory();
    const decision = memManager.getCacheDecision();
    const config = getMemoryCacheConfig();

    const cpuData = getCpuUsage();
    const diskData = getDiskUsage();
    const networkData = getNetworkUsage();

    let recentLogs = [];
    try {
      const logFiles = fs.readdirSync(LOG_DIR)
        .filter(f => f.startsWith('app-') && f.endsWith('.log'))
        .sort()
        .reverse();
      if (logFiles.length > 0) {
        const logContent = fs.readFileSync(path.join(LOG_DIR, logFiles[0]), 'utf-8');
        const lines = logContent.split('\n').filter(l => l.trim());
        recentLogs = lines.slice(-10).map(l => l.substring(19));
      }
    } catch {}

    const posts = listMdFiles(POSTS_DIR);
    const moments = listMdFiles(MOMENTS_DIR);
    const totalWords = posts.reduce((sum, p) => sum + parseInt(p.words), 0) || 0;
    const uptimeSeconds = process.uptime();
    const cacheSize = calculateCacheSize();

    return {
      cpu: {
        usage: cpuData.usage,
        loadavg: cpuData.loadavg
      },
      systemMemory: {
        totalGB: (memInfo.totalMem / 1024 / 1024 / 1024).toFixed(1),
        usedGB: ((memInfo.totalMem - memInfo.freeMem) / 1024 / 1024 / 1024).toFixed(1),
        usedPercent: Math.round(memInfo.usedPercent)
      },
      nodeMemory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      cache: {
        enabled: decision.useCache,
        limit: Math.round(decision.limitMB || 0),
        size: cacheSize,
        mode: config.enable || 'auto'
      },
      disk: {
        totalGB: diskData.totalGB,
        usedGB: diskData.usedGB,
        usedPercent: diskData.usedPercent
      },
      network: {
        speed: networkData.speed,
        rx: networkData.rx,
        tx: networkData.tx
      },
      content: {
        posts: posts.length,
        moments: moments.length,
        totalWords: Math.round(totalWords / 1000 * 10) / 10
      },
      uptime: {
        human: formatUptime(uptimeSeconds),
        started: new Date(Date.now() - uptimeSeconds * 1000).toLocaleString()
      },
      logs: recentLogs
    };
  }

  // ---- 系统信息 ----
  app.get('/api/admin/system', authenticateToken, (req, res) => {
    try {
      res.json({
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime: formatUptime(process.uptime())
      });
    } catch (err) {
      adminLog('GET /api/admin/system 错误: ' + err.message, 'ERROR');
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // 静态资源托管
  // ============================================================
  app.use(express.static(ADMIN_PUBLIC_DIR));

  // 404 处理
  app.use((req, res) => {
    res.status(404).json({ error: 'API 不存在' });
  });

  app.use((err, req, res, next) => {
    adminLog('全局错误: ' + err.message, 'ERROR');
    res.status(500).json({ error: '服务器内部错误' });
  });

  // ============================================================
  // 启动服务
  // ============================================================
  try {
    let server;
    if (httpsDecision.enabled) {
      const https = require('https');
      const options = {
        key: fs.readFileSync(httpsDecision.keyPath),
        cert: fs.readFileSync(httpsDecision.certPath)
      };
      server = https.createServer(options, app);
    } else {
      server = app;
    }
    server.listen(adminPort, '0.0.0.0', () => {
      const protocol = httpsDecision.enabled ? 'https' : 'http';
      adminLog(`🔐 ${protocol.toUpperCase()} 管理后台已启动: ${protocol}://localhost:${adminPort}`, 'INFO');
      adminLog('📁 管理配置: ' + ADMIN_CONFIG_PATH, 'INFO');
      adminLog(`👉 访问: ${protocol}://localhost:${adminPort}/login.html`, 'INFO');
      adminLog(`📡 SSE 端点: ${protocol}://localhost:${adminPort}/api/admin/status/stream?token=<token>`, 'INFO');
    });
    server.on('error', (err) => {
      adminLog('服务启动错误: ' + err.message, 'ERROR');
    });
    return app;
  } catch (err) {
    adminLog('管理服务启动失败: ' + err.message, 'ERROR');
    return null;
  }
}

module.exports = { createAdminServer };