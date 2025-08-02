import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Створює тимчасову директорію.
 * @returns Шлях до тимчасової директорії.
 */
export async function createTmpDir(): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), `quiver-test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  return tmpDir;
}

/**
 * Створює файл у вказаній директорії.
 * @param dir Шлях до директорії.
 * @param filename Ім'я файлу.
 * @param content Вміст файлу.
 */
export async function createFile(dir: string, filename: string, content: string | Buffer = ''): Promise<void> {
  const filePath = path.join(dir, filename);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

/**
 * Створює дерево файлів та директорій.
 * @param baseDir Базова директорія.
 * @param structure Об'єкт, що описує структуру файлів/директорій.
 */
export async function createFsStructure(baseDir: string, structure: Record<string, string | Buffer | Record<string, any>>): Promise<void> {
  for (const key in structure) {
    const fullPath = path.join(baseDir, key);
    const value = structure[key];

    if (typeof value === 'string' || Buffer.isBuffer(value)) {
      await createFile(baseDir, key, value);
    } else if (typeof value === 'object' && value !== null) {
      await fs.mkdir(fullPath, { recursive: true });
      await createFsStructure(fullPath, value);
    }
  }
}

/**
 * Змінює час модифікації файлу.
 * @param filePath Шлях до файлу.
 * @param mtime Час модифікації (Date або число).
 */
export async function changeMtime(filePath: string, mtime: Date | number): Promise<void> {
  await fs.utimes(filePath, mtime, mtime);
}

/**
 * Створює символічне посилання.
 * @param target Шлях, на який вказує симлінк.
 * @param linkPath Шлях, де буде створено симлінк.
 * @returns true, якщо симлінк створено, false, якщо не підтримується (наприклад, на Windows без прав).
 */
export async function createSymlink(target: string, linkPath: string): Promise<boolean> {
  if (process.platform === 'win32') {
    try {
      // На Windows створення симлінків може вимагати адміністративних прав
      // Або бути відключеним. Спробуємо створити, якщо не вийде - повернемо false.
      await fs.symlink(target, linkPath, 'file'); // 'file' або 'dir'
      return true;
    } catch (e: any) {
      if (e.code === 'EPERM' || e.code === 'UNKNOWN') { // EPERM - недостатньо прав, UNKNOWN - може бути, якщо відключено
        console.warn(`Попередження: Не вдалося створити симлінк на Windows. Можливо, потрібні адміністративні права або функція відключена. (${e.message})`);
        return false;
      }
      throw e; // Інші помилки прокидаємо
    }
  } else {
    await fs.symlink(target, linkPath);
    return true;
  }
}

/**
 * Видаляє директорію та її вміст.
 * @param dirPath Шлях до директорії.
 */
export async function removeDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}
