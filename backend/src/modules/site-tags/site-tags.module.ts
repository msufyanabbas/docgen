import { Global, Module } from '@nestjs/common';
import { SiteTagsService } from './site-tags.service';

@Global()
@Module({
  providers: [SiteTagsService],
  exports: [SiteTagsService],
})
export class SiteTagsModule {}
