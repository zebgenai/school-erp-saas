import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { PreviewIdCardsDto } from './dto/preview-id-cards.dto';
import { IdCardsQueryDto } from './dto/id-cards-query.dto';
import { IdCardsService } from './id-cards.service';

const VIEW_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.TEACHER,
  UserRole.RECEPTIONIST,
  UserRole.ACCOUNTANT,
] as const;

const MANAGE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.RECEPTIONIST,
] as const;

@ApiTags('ID Cards')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('id-cards')
export class IdCardsController {
  constructor(private readonly idCardsService: IdCardsService) {}

  @ApiOperation({ summary: 'List built-in ID card templates' })
  @Roles(...VIEW_ROLES)
  @Get('templates')
  templates() {
    return this.idCardsService.listTemplates();
  }

  @ApiOperation({ summary: 'List issued active ID cards for the school' })
  @Roles(...VIEW_ROLES)
  @Get()
  findAll(@CurrentUserDecorator() user: CurrentUser, @Query() query: IdCardsQueryDto) {
    return this.idCardsService.findAll(user, query);
  }

  @ApiOperation({
    summary: 'Read-only preview of ID card layouts (does not mint QR tokens or create cards)',
  })
  @Roles(...VIEW_ROLES)
  @Post('preview')
  preview(@Body() dto: PreviewIdCardsDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.idCardsService.preview(dto, user);
  }

  @ApiOperation({
    summary: 'Bulk-generate active ID cards / QR tokens for selected students (manage only)',
  })
  @Roles(...MANAGE_ROLES)
  @Post('bulk-generate')
  bulkGenerate(@Body() dto: PreviewIdCardsDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.idCardsService.bulkGenerate(dto, user);
  }

  @ApiOperation({ summary: 'Get the current ID card for a student' })
  @Roles(...VIEW_ROLES)
  @Get('student/:studentId')
  getForStudent(
    @Param('studentId') studentId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.idCardsService.getForStudent(studentId, user, schoolId);
  }

  @ApiOperation({ summary: 'Issue an ID card if the student does not already have an active one' })
  @Roles(...MANAGE_ROLES)
  @Post('student/:studentId')
  issue(
    @Param('studentId') studentId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.idCardsService.issue(studentId, user, schoolId);
  }

  @ApiOperation({ summary: 'Revoke the current card and issue a new QR token' })
  @Roles(...MANAGE_ROLES)
  @Post('student/:studentId/reissue')
  reissue(
    @Param('studentId') studentId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.idCardsService.reissue(studentId, user, schoolId);
  }

  @ApiOperation({ summary: 'Revoke the active ID card without issuing a replacement' })
  @Roles(...MANAGE_ROLES)
  @Post('student/:studentId/revoke')
  revoke(
    @Param('studentId') studentId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.idCardsService.revoke(studentId, user, schoolId);
  }
}
