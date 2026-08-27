import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { DirectoryController } from './directory.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, DirectoryController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
