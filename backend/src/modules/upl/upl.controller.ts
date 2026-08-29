import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/permissions.guard';
import { UplService } from './upl.service';
import { QueryUplDto, UpsertUplItemDto } from './upl.dto';

@ApiTags('UPL')
@Controller('upl')
export class UplController {
  constructor(private readonly upl: UplService) {}

  @RequirePermission('priceList', 'view')
  @Get()
  list(@Query() q: QueryUplDto) {
    return this.upl.list(q);
  }

  @RequirePermission('priceList', 'view')
  @Get('versions')
  versions() {
    return this.upl.versions();
  }

  @RequirePermission('priceList', 'create')
  @Post()
  create(@Body() dto: UpsertUplItemDto) {
    return this.upl.upsert(dto);
  }

  @RequirePermission('priceList', 'edit')
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpsertUplItemDto) {
    return this.upl.upsert(dto);
  }

  @RequirePermission('priceList', 'delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.upl.remove(id);
  }

  @RequirePermission('priceList', 'create')
  @Post('import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  import(@UploadedFile() file: Express.Multer.File, @Body('version') version?: string) {
    if (!file) throw new BadRequestException('No file uploaded (field name must be "file").');
    if (!/\.xlsx?$/i.test(file.originalname)) {
      throw new BadRequestException('Upload an .xlsx or .xls workbook.');
    }
    return this.upl.importWorkbook(file.buffer, version || 'v1');
  }
}
