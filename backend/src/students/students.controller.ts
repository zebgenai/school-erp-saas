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
import { CreateStudentDto } from './dto/create-student.dto';
import { StudentQueryDto } from './dto/student-query.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsService } from './students.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER, UserRole.RECEPTIONIST)
  @Get()
  findAll(@CurrentUserDecorator() user: CurrentUser, @Query() query: StudentQueryDto) {
    return this.studentsService.findAll(user, query);
  }

  @Roles(UserRole.STUDENT)
  @Get('my-portal')
  getMyPortal(@CurrentUserDecorator() user: CurrentUser) {
    return this.studentsService.getMyPortal(user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER, UserRole.RECEPTIONIST, UserRole.PARENT)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.studentsService.findOne(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST)
  @Post()
  create(@Body() dto: CreateStudentDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.studentsService.create(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.studentsService.update(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.studentsService.remove(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete(':id/permanent')
  permanentDelete(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.studentsService.permanentDelete(id, user);
  }
}
