import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';

/**
 * Names and emails only, readable by any signed-in user.
 *
 * The MOP form needs to offer real people for "Name of PM" and "Name of
 * Requester" rather than free text, but that must not open the admin-only user
 * management endpoints to PMs — hence a separate, deliberately thin route.
 */
@ApiTags('Directory')
@Controller('directory')
export class DirectoryController {
  constructor(private readonly users: UsersService) {}

  @Get('users')
  list() {
    return this.users.directory();
  }
}
