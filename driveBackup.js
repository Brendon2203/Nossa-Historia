const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');
const { google } = require('googleapis');

const DEFAULT_FOLDER_ID = '1g0LxsS7Shd3-xWLE-F6kzEHj4FpO2iAX';
const DEFAULT_BACKUP_FILENAME = 'nossa-historia-backup.zip';
const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];

function getFolderId() {
  return process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
}

function getBackupFilename() {
  return process.env.GOOGLE_DRIVE_BACKUP_FILENAME || DEFAULT_BACKUP_FILENAME;
}

function getServiceAccountCredentials() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (json) {
    return JSON.parse(json);
  }

  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile && fs.existsSync(keyFile)) {
    return keyFile;
  }

  return null;
}

function hasDriveUploadCredentials() {
  return Boolean(getServiceAccountCredentials());
}

async function getDriveClient() {
  const credentials = getServiceAccountCredentials();
  if (!credentials) {
    throw new Error(
      'Credenciais do Google Drive não configuradas. Defina GOOGLE_SERVICE_ACCOUNT_JSON no Render.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials: typeof credentials === 'string' ? undefined : credentials,
    keyFile: typeof credentials === 'string' ? credentials : undefined,
    scopes: DRIVE_SCOPES,
  });

  return google.drive({ version: 'v3', auth });
}

function createBackupZipBuffer({ memories, uploadsDir }) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks = [];

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    archive.append(JSON.stringify(memories, null, 2), { name: 'memories.json' });

    const readme = `BACKUP COMPLETO - Nossa História
Data: ${new Date().toISOString()}

Conteúdo:
- memories.json: lista de memórias
- uploads/: fotos enviadas

Este arquivo é atualizado automaticamente pelo site Nossa História.`;
    archive.append(readme, { name: 'README.txt' });

    if (fs.existsSync(uploadsDir)) {
      fs.readdirSync(uploadsDir).forEach((file) => {
        const filePath = path.join(uploadsDir, file);
        if (fs.statSync(filePath).isFile()) {
          archive.file(filePath, { name: `uploads/${file}` });
        }
      });
    }

    archive.finalize();
  });
}

async function listZipFilesViaServiceAccount(folderId) {
  const drive = await getDriveClient();
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,modifiedTime,mimeType)',
    orderBy: 'modifiedTime desc',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return (response.data.files || []).filter((file) => {
    const name = (file.name || '').toLowerCase();
    return name.endsWith('.zip') || file.mimeType === 'application/zip';
  });
}

async function listZipFilesInFolder(folderId, apiKey) {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent('files(id,name,modifiedTime,mimeType)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime desc&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Drive API: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const files = (data.files || []).filter((file) => {
    const name = (file.name || '').toLowerCase();
    return name.endsWith('.zip') || file.mimeType === 'application/zip';
  });

  if (files.length === 0) {
    throw new Error('Nenhum arquivo .zip encontrado na pasta do Drive.');
  }

  return files;
}

async function listZipFilesFromPublicFolder(folderId) {
  const url = `https://drive.google.com/embeddedfolderview?id=${folderId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Não foi possível ler a pasta pública do Drive (${response.status}).`);
  }

  const html = await response.text();
  const files = [];
  const parts = html.split('class="flip-entry"');

  for (let index = 1; index < parts.length; index += 1) {
    const block = parts[index];
    const isZip = block.includes('application/zip') || block.toLowerCase().includes('.zip');
    if (!isZip) continue;

    const idMatch = block.match(/id="entry-([a-zA-Z0-9_-]+)"/) || block.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//);
    const titleMatch = block.match(/flip-entry-title[^>]*>([^<]+)</);
    const dateMatch = block.match(/flip-entry-last-modified[^>]*>([^<]+)</);

    if (idMatch) {
      files.push({
        id: idMatch[1],
        name: titleMatch?.[1]?.trim() || `${idMatch[1]}.zip`,
        modifiedTime: dateMatch?.[1]?.trim() || '',
      });
    }
  }

  if (files.length === 0) {
    throw new Error('Nenhum arquivo .zip encontrado na pasta pública do Drive.');
  }

  files.sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
  return files;
}

async function downloadDriveFilePublic(fileId) {
  const baseUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  let response = await fetch(baseUrl, { redirect: 'follow' });
  let buffer = Buffer.from(await response.arrayBuffer());

  const preview = buffer.slice(0, 512).toString('utf8').toLowerCase();
  if (preview.includes('<!doctype html') || preview.includes('<html')) {
    const html = buffer.toString('utf8');
    const confirmMatch = html.match(/confirm=([0-9A-Za-z_-]+)/);
    if (confirmMatch) {
      const confirmUrl = `${baseUrl}&confirm=${confirmMatch[1]}`;
      response = await fetch(confirmUrl, { redirect: 'follow' });
      buffer = Buffer.from(await response.arrayBuffer());
    }
  }

  const header = buffer.slice(0, 512).toString('utf8').toLowerCase();
  if (header.includes('<!doctype html') || header.includes('<html')) {
    throw new Error('Download do Drive retornou HTML em vez do arquivo ZIP. Verifique se o arquivo está público.');
  }

  return buffer;
}

async function downloadDriveFileViaApi(fileId) {
  const drive = await getDriveClient();
  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(response.data);
}

async function downloadDriveFile(fileId) {
  if (hasDriveUploadCredentials()) {
    return downloadDriveFileViaApi(fileId);
  }
  return downloadDriveFilePublic(fileId);
}

async function resolveBackupFileId(options = {}) {
  const folderId = options.folderId || getFolderId();
  const fileId = options.fileId || process.env.GOOGLE_DRIVE_BACKUP_FILE_ID;
  const apiKey = options.apiKey || process.env.GOOGLE_DRIVE_API_KEY;

  if (fileId) {
    return { id: fileId, name: 'backup configurado' };
  }

  if (hasDriveUploadCredentials()) {
    const zipFiles = await listZipFilesViaServiceAccount(folderId);
    if (zipFiles.length === 0) {
      throw new Error('Nenhum arquivo .zip encontrado na pasta do Drive.');
    }
    return zipFiles[0];
  }

  if (apiKey) {
    const zipFiles = await listZipFilesInFolder(folderId, apiKey);
    return zipFiles[0];
  }

  const zipFiles = await listZipFilesFromPublicFolder(folderId);
  return zipFiles[0];
}

async function deleteOtherZipBackups(folderId, keepFileId) {
  const drive = await getDriveClient();
  const zipFiles = await listZipFilesViaServiceAccount(folderId);

  await Promise.all(
    zipFiles
      .filter((file) => file.id !== keepFileId)
      .map((file) =>
        drive.files.delete({ fileId: file.id, supportsAllDrives: true }).catch((error) => {
          console.warn(`[Drive] Não foi possível remover backup antigo ${file.name}:`, error.message);
        })
      )
  );
}

async function uploadBackupToDrive(buffer, fileName) {
  const drive = await getDriveClient();
  const folderId = getFolderId();
  const existing = await listZipFilesViaServiceAccount(folderId);
  const sameName = existing.find((file) => file.name === fileName);

  if (sameName) {
    const response = await drive.files.update({
      fileId: sameName.id,
      media: {
        mimeType: 'application/zip',
        body: buffer,
      },
      fields: 'id,name,modifiedTime',
      supportsAllDrives: true,
    });

    if (process.env.KEEP_OLD_DRIVE_BACKUPS !== 'true') {
      await deleteOtherZipBackups(folderId, response.data.id);
    }

    return response.data;
  }

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: 'application/zip',
      body: buffer,
    },
    fields: 'id,name,modifiedTime',
    supportsAllDrives: true,
  });

  if (process.env.KEEP_OLD_DRIVE_BACKUPS !== 'true') {
    await deleteOtherZipBackups(folderId, response.data.id);
  }

  return response.data;
}

async function restoreFromZipBuffer(buffer, {
  dataFile,
  uploadsDir,
  rootDir,
  readMemories,
  writeMemories,
  deleteLocalImage,
  generateId,
}) {
  const tempZipPath = path.join(rootDir, `temp-startup-${Date.now()}.zip`);
  const tempDir = path.join(rootDir, `temp-restore-startup-${Date.now()}`);

  try {
    fs.writeFileSync(tempZipPath, buffer);

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    await new Promise((resolve, reject) => {
      fs.createReadStream(tempZipPath)
        .pipe(unzipper.Extract({ path: tempDir }))
        .on('finish', resolve)
        .on('error', reject);
    });

    const memoriesPath = path.join(tempDir, 'memories.json');
    if (!fs.existsSync(memoriesPath)) {
      throw new Error('Arquivo memories.json não encontrado no ZIP.');
    }

    const imported = JSON.parse(fs.readFileSync(memoriesPath, 'utf8'));
    if (!Array.isArray(imported)) {
      throw new Error('memories.json deve conter um array.');
    }

    const current = readMemories();
    current.forEach((memory) => deleteLocalImage(memory.image));

    const uploadsSource = path.join(tempDir, 'uploads');
    if (fs.existsSync(uploadsSource)) {
      fs.readdirSync(uploadsSource).forEach((file) => {
        const srcFile = path.join(uploadsSource, file);
        const destFile = path.join(uploadsDir, file);
        if (fs.statSync(srcFile).isFile()) {
          fs.copyFileSync(srcFile, destFile);
        }
      });
    }

    const cleaned = imported.map((memory) => ({
      id: memory.id || generateId(),
      label: memory.label?.trim() || '',
      title: memory.title?.trim() || '',
      description: memory.description?.trim() || '',
      image: memory.image || '',
      spotifyEmbed: memory.spotifyEmbed || '',
      lat: Number(memory.lat),
      lng: Number(memory.lng),
    }));

    writeMemories(cleaned);

    return {
      totalMemories: cleaned.length,
      memoriesWithImages: cleaned.filter((memory) => memory.image.startsWith('/uploads/')).length,
    };
  } finally {
    if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
  }
}

async function syncBackupFromDrive(restoreContext) {
  const backupFile = await resolveBackupFileId();
  console.log(`[Drive] Baixando backup mais recente: ${backupFile.name} (${backupFile.id})`);

  const buffer = await downloadDriveFile(backupFile.id);
  const result = await restoreFromZipBuffer(buffer, restoreContext);

  console.log(
    `[Drive] Backup restaurado: ${result.totalMemories} memória(s), ${result.memoriesWithImages} com imagem local.`
  );

  return {
    fileName: backupFile.name,
    fileId: backupFile.id,
    ...result,
  };
}

async function saveBackupToDrive({ readMemories, uploadsDir }) {
  const memories = readMemories();
  const fileName = getBackupFilename();
  const buffer = await createBackupZipBuffer({ memories, uploadsDir });
  const uploaded = await uploadBackupToDrive(buffer, fileName);

  console.log(`[Drive] Backup enviado: ${uploaded.name} (${uploaded.id})`);

  return {
    fileName: uploaded.name,
    fileId: uploaded.id,
    modifiedTime: uploaded.modifiedTime,
    totalMemories: memories.length,
    memoriesWithImages: memories.filter((memory) => memory.image?.startsWith('/uploads/')).length,
  };
}

module.exports = {
  DEFAULT_FOLDER_ID,
  DEFAULT_BACKUP_FILENAME,
  hasDriveUploadCredentials,
  createBackupZipBuffer,
  syncBackupFromDrive,
  saveBackupToDrive,
  restoreFromZipBuffer,
};
