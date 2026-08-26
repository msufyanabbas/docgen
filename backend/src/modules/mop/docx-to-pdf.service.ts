import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const run = promisify(execFile);

/**
 * Converts the filled .docx to PDF with LibreOffice.
 *
 * The PDF has to match the Word document exactly — same cover art, same table,
 * same fonts. Re-rendering the layout in HTML (as the BOQ/WO/PAC side does)
 * would drift from the .docx the moment either changed, and Tawal receives both
 * files for the same MOP. Converting the artefact we just produced is the only
 * way they stay in step.
 */
@Injectable()
export class DocxToPdfService {
  private readonly logger = new Logger(DocxToPdfService.name);
  private readonly soffice = process.env.SOFFICE_PATH || 'soffice';

  /** A queue of one: LibreOffice shares a user profile and corrupts it if two
   *  conversions run at once. */
  private chain: Promise<unknown> = Promise.resolve();

  async convert(docx: Buffer, stem: string): Promise<Buffer> {
    const task = () => this.convertNow(docx, stem);
    const result = this.chain.then(task, task);
    // Keep the chain alive even when a conversion rejects.
    this.chain = result.catch(() => undefined);
    return result;
  }

  private async convertNow(docx: Buffer, stem: string): Promise<Buffer> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mop-pdf-'));
    const inFile = path.join(dir, `${stem}.docx`);
    const outFile = path.join(dir, `${stem}.pdf`);

    try {
      await fs.writeFile(inFile, docx);

      await run(
        this.soffice,
        [
          '--headless',
          '--norestore',
          '--invisible',
          '--nodefault',
          '--nolockcheck',
          '--nologo',
          // Isolated profile per run, so concurrent workers can't clash.
          `-env:UserInstallation=file://${path.join(dir, 'profile')}`,
          '--convert-to',
          'pdf:writer_pdf_Export',
          '--outdir',
          dir,
          inFile,
        ],
        { timeout: 120_000, maxBuffer: 32 * 1024 * 1024 },
      );

      return await fs.readFile(outFile);
    } catch (e: any) {
      this.logger.error(`PDF conversion failed for ${stem}: ${e.message}`);
      throw new Error(
        'Could not convert the document to PDF. Check that LibreOffice is installed in the backend image.',
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Used by the health endpoint so a missing LibreOffice surfaces early. */
  async available(): Promise<boolean> {
    try {
      await run(this.soffice, ['--version'], { timeout: 20_000 });
      return true;
    } catch {
      return false;
    }
  }
}
