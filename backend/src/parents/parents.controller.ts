import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { CreateParentDto } from './dto/create-parent.dto';
import { ParentQueryDto } from './dto/parent-query.dto';
import { UpdateParentDto } from './dto/update-parent.dto';
import { ParentsService } from './parents.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('parents')
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @Roles(UserRole.PARENT)
  @Get('my-portal')
  getMyPortal(@CurrentUserDecorator() user: CurrentUser) {
    return this.parentsService.getMyPortal(user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER, UserRole.RECEPTIONIST)
  @Get()
  findAll(@CurrentUserDecorator() user: CurrentUser, @Query() query: ParentQueryDto) {
    return this.parentsService.findAll(user, query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER, UserRole.RECEPTIONIST)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.parentsService.findOne(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST)
  @Post()
  create(@Body() dto: CreateParentDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.parentsService.create(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateParentDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.parentsService.update(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.parentsService.remove(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete(':id/permanent')
  permanentDelete(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.parentsService.permanentDelete(id, user);
  }
}
