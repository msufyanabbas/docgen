import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService implements OnModuleInit {
  private root: string;

  constructor(private readonly config: ConfigService) {
    this.root = path.resolve(this.config.get<string>('storageRoot') || './storage');
  }

  async onModuleInit() {
    await fs.mkdir(path.join(this.root, 'uploads'), { recursive: true });
    await fs.mkdir(path.join(this.root, 'documents'), { recursive: true });
  }

  /** Filesystem-safe slug for WO numbers, which contain dashes only — but be defensive. */
  static slug(value: string) {
    return value.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120);
  }

  async saveUpload(buffer: Buffer, originalName: string) {
    const dir = path.join(this.root, 'uploads');
    const fileName = `${Date.now()}-${StorageService.slug(originalName)}`;
    const filePath = path.join(dir, fileName);
    await fs.writeFile(filePath, buffer);
    return { fileName, filePath };
  }

  async saveDocument(packageId: string, fileName: string, data: Buffer) {
    const dir = path.join(this.root, 'documents', packageId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, StorageService.slug(fileName));
    await fs.writeFile(filePath, data);
    const stat = await fs.stat(filePath);
    return { filePath, sizeBytes: stat.size };
  }

  documentDir(packageId: string) {
    return path.join(this.root, 'documents', packageId);
  }

  stream(filePath: string) {
    return createReadStream(filePath);
  }

  /**
   * Deletes a stored file. Silent when it is already gone — the caller is
   * removing the record either way, and a missing file must not block that.
   */
  async remove(filePath: string) {
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async exists(filePath: string) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async read(filePath: string) {
    return fs.readFile(filePath);
  }
}
