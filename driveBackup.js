const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');

const DEFAULT_FOLDER_ID = '1g0LxsS7Shd3-xWLE-F6kzEHj4FpO2iAX';

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

    if (idMatch) {
      files.push({
        id: idMatch[1],
        name: titleMatch?.[1]?.trim() || `${idMatch[1]}.zip`,
      });
    }
  }

  if (files.length === 0) {
    throw new Error('Nenhum arquivo .zip encontrado na pasta pública do Drive.');
  }

  return files;
}

async function downloadDriveFile(fileId) {
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

async function resolveBackupFileId(options) {
  const {
    folderId = DEFAULT_FOLDER_ID,
    fileId,
    apiKey,
  } = options;

  if (fileId) {
    return { id: fileId, name: 'backup configurado' };
  }

  const zipFiles = apiKey
    ? await listZipFilesInFolder(folderId, apiKey)
    : await listZipFilesFromPublicFolder(folderId);

  return zipFiles[0];
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
      const files = fs.readdirSync(uploadsSource);
      files.forEach((file) => {
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
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
  const fileId = process.env.GOOGLE_DRIVE_BACKUP_FILE_ID;
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;

  const backupFile = await resolveBackupFileId({ folderId, fileId, apiKey });
  console.log(`[Drive] Baixando backup: ${backupFile.name} (${backupFile.id})`);

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

module.exports = {
  DEFAULT_FOLDER_ID,
  syncBackupFromDrive,
  restoreFromZipBuffer,
};
