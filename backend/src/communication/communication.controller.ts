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
import { CommunicationService } from './communication.service';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { NoticeQueryDto } from './dto/notice-query.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('communication')
export class CommunicationController {
  constructor(private readonly communicationService: CommunicationService) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER, UserRole.RECEPTIONIST)
  @Get('stats')
  getStats(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.communicationService.getStats(user, schoolId);
  }

  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.TEACHER,
    UserRole.RECEPTIONIST,
    UserRole.PARENT,
    UserRole.STUDENT,
  )
  @Get()
  findAll(@CurrentUserDecorator() user: CurrentUser, @Query() query: NoticeQueryDto) {
    return this.communicationService.findAll(user, query);
  }

  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.TEACHER,
    UserRole.RECEPTIONIST,
    UserRole.PARENT,
    UserRole.STUDENT,
  )
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.communicationService.findOne(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Post()
  create(@Body() dto: CreateNoticeDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.communicationService.create(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNoticeDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.communicationService.update(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Patch(':id/publish')
  publish(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.communicationService.publish(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Patch(':id/unpublish')
  unpublish(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.communicationService.unpublish(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.communicationService.remove(id, user);
  }
}
