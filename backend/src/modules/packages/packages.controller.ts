import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PackagesService } from './packages.service';
import { QueryPackagesDto, UpdatePackageDto } from './packages.dto';

@ApiTags('Packages')
@Controller('packages')
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get()
  findAll(@Query() q: QueryPackagesDto) {
    return this.packages.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.packages.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePackageDto) {
    return this.packages.update(id, dto);
  }

  @Post(':id/reprice')
  reprice(@Param('id') id: string) {
    return this.packages.reprice(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.packages.remove(id);
  }
}
